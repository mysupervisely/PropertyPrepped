-- PropRoster — Property + Attention Usability V1, Part 3: persistent
-- Needs Your Attention dismissal.
--
-- NOT YET APPLIED TO PRODUCTION. Review before running.
--
-- One small additive table so clearing an attention item on the
-- Dashboard persists across refresh, navigation, and signing in again
-- (a client-only store like localStorage cannot satisfy that last one).
-- Dismissal is PRESENTATION FILTERING ONLY — this table never affects,
-- and is never read by, any canonical status/urgency calculation
-- (lib/dashboard/attention.ts, lib/rent-ledger/ledger.ts, lib/tenant-
-- connect/requests.ts are all untouched by this migration and by the
-- application code that reads this table).
--
-- SCHEMA: matches the exact shape approved for this milestone, no
-- deviation. property_id is nullable (not every future dismissible
-- type is guaranteed to have exactly one property — kept optional per
-- the approved shape) but every dismissal this app writes today does
-- populate it, since every current dismissible attention type
-- (Rent/Lease/Insurance/Mortgage/System/Maintenance/TenantRequest/
-- Vacancy) has exactly one property.
--
-- DISMISSAL KEY: `${attention_type}:${canonical_item_id}:${relevant_date}`
-- (see lib/dashboard/attention-dismissal.ts for the exact, tested
-- construction per type) — built entirely from each item's own already-
-- canonical id/date, never a mutable display label, so a lease renewal,
-- a new rent period, or a new lease ending after an old one all
-- naturally produce a NEW key rather than colliding with an old
-- dismissal of a different instance of the same attention_type.
--
-- Mirrors the established owner-scoped table pattern used throughout
-- this schema (see e.g. property_notes/property_systems): a plain
-- owner_id + RLS + an ownership-verifying insert check on the
-- referenced property_id.

create table if not exists public.attention_dismissals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  attention_type text not null,
  dismissal_key text not null,
  dismissed_at timestamptz not null default now(),
  unique (owner_id, dismissal_key)
);

-- The owner's own eligible-dismissals scan (fetched once per Dashboard
-- load, filtered client-side against the current attention list) reads
-- by owner_id alone — the unique constraint above already provides an
-- index on (owner_id, dismissal_key), but a plain owner_id index serves
-- the "give me every dismissal for this owner" query more directly as
-- the account's dismissal count grows.
create index if not exists attention_dismissals_owner_idx on public.attention_dismissals(owner_id);

alter table public.attention_dismissals enable row level security;

drop policy if exists "attention_dismissals_select_own" on public.attention_dismissals;
create policy "attention_dismissals_select_own" on public.attention_dismissals for select to authenticated using ((select auth.uid()) = owner_id);

-- SECURITY: owner_id is never trusted from the client beyond this check
-- (never spoofable — a landlord cannot insert a dismissal attributed to
-- another owner), and when property_id is present it must belong to
-- the SAME authenticated owner (the same "insert/update also verify the
-- referenced property_id belongs to the same owner" pattern already
-- used by property_notes/property_systems/property_ownership above) —
-- otherwise a forged property_id could relate a dismissal row to
-- another owner's property (never exposing that property's data, since
-- every read is itself owner_id-scoped, but a real integrity gap this
-- closes proactively rather than leaving as a "lower severity, not
-- implicated" note like a few of this schema's older tables).
drop policy if exists "attention_dismissals_insert_own" on public.attention_dismissals;
create policy "attention_dismissals_insert_own" on public.attention_dismissals for insert to authenticated with check (
  (select auth.uid()) = owner_id
  and (property_id is null or exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid())))
);

drop policy if exists "attention_dismissals_delete_own" on public.attention_dismissals;
create policy "attention_dismissals_delete_own" on public.attention_dismissals for delete to authenticated using ((select auth.uid()) = owner_id);

-- Deliberately no update policy: a dismissal is a simple presence/
-- absence fact (an issue instance is dismissed or it isn't) — there is
-- no product need to edit one in place, only to create it (insert) or
-- remove it (delete, not currently exposed in the UI either, but kept
-- available for a future "undo"/support-cleanup path, matching this
-- schema's own precedent of tables carrying full CRUD policies before
-- every one of them has UI to match).
