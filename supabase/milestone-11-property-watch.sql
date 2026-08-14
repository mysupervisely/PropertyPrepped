-- PropRoster Milestone 11 upgrade — Property Watch.
-- Run once in the Supabase SQL Editor. Additive only — does not drop or
-- rewrite any existing table, column, policy, or data from earlier
-- milestones.
--
-- ONE centralized table for every kind of reminder PropRoster generates —
-- lease expirations, insurance renewals, property-tax/HOA increases,
-- mortgage dates, warranty/license/permit tracking, maintenance recurrence
-- signals, AI-document-derived dates, and manual reminders. See
-- lib/property-watch/ for the deterministic generation logic; this file is
-- the storage + security layer only.
--
-- DEDUPLICATION (Section 2 of the milestone spec): identity is
-- (owner_id, source_type, source_id, event_key) — see lib/property-watch/
-- identity.ts for the full strategy writeup. The unique constraint below
-- is the database-level backstop for that strategy; source_id is NULL for
-- manually-created reminders, and Postgres treats every NULL as distinct
-- from every other NULL in a unique constraint, so manual reminders never
-- collide with each other while every source-backed category still
-- dedupes correctly.

create table if not exists public.property_watch_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,

  -- Technical provenance — which system produced this item. Not a foreign
  -- key: source_id's target table depends on source_type (a lease id, a
  -- mortgage id, an insurance_policies id, a property_documents id, the
  -- property's own id for ledger-derived/maintenance-recurrence items, or
  -- null for manual items) — Postgres has no single-column polymorphic FK,
  -- so integrity here is enforced by the INSERT/UPDATE RLS policies below
  -- (property_watch_source_is_valid), the same way document_analyses
  -- enforces its own cross-row ownership checks in milestone-8 rather than
  -- relying solely on a FK.
  source_type text not null check (source_type in ('lease', 'mortgage', 'insurance_policy', 'ledger', 'maintenance_record', 'document', 'manual')),
  source_id uuid,
  event_key text not null,

  category text not null check (category in ('Lease', 'Insurance', 'Property Tax', 'Mortgage', 'HOA', 'Warranty', 'Maintenance', 'Inspection', 'License', 'Permit', 'Utility', 'Document', 'Other')),
  title text not null,
  description text not null default '',
  event_date date,
  warning_date date,
  priority text not null default 'Normal' check (priority in ('Low', 'Normal', 'High', 'Urgent')),
  status text not null default 'Upcoming' check (status in ('Upcoming', 'Needs Attention', 'Completed', 'Dismissed')),
  action_type text not null default 'Review' check (action_type in ('Review', 'Review Policy', 'Review Assessment', 'Review Maintenance History', 'Confirm', 'Other')),

  -- Provenance/context: e.g. {tenantName}, {premiumChange:{...}},
  -- {documentId, analysisId, confidence, needsConfirmation},
  -- {manuallyCreated: true}. Never a place for secrets or data not already
  -- visible to the owner elsewhere in PropRoster.
  metadata jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- The deduplication backstop described above.
  unique (owner_id, source_type, source_id, event_key)
);

create index if not exists property_watch_items_owner_idx on public.property_watch_items(owner_id);
create index if not exists property_watch_items_property_idx on public.property_watch_items(property_id);
create index if not exists property_watch_items_owner_status_idx on public.property_watch_items(owner_id, status);
create index if not exists property_watch_items_source_idx on public.property_watch_items(source_type, source_id);

alter table public.property_watch_items enable row level security;

-- Section 20 (RLS/security): every policy is owner-scoped, exactly like
-- every other per-owner table in this schema. Section 19 (privacy /
-- Tenant Connect): there is deliberately NO policy here referencing
-- tenant_property_access or granting any tenant-side role read access —
-- a tenant is just another `auth.users` row with its own uid, so the
-- plain owner_id = auth.uid() check below already excludes them
-- structurally. If a future milestone ever lets an owner explicitly share
-- one Watch item with a tenant, that needs its own new policy and its own
-- explicit-consent design — never an implicit widening of these policies.

drop policy if exists "property_watch_items_select_own" on public.property_watch_items;
create policy "property_watch_items_select_own" on public.property_watch_items for select to authenticated using ((select auth.uid()) = owner_id);

-- INSERT/UPDATE prove, inside the database, that:
--   1. owner_id is the caller
--   2. property_id is a properties row the caller owns
--   3. IF source_id is present, it actually belongs to the caller in the
--      table implied by source_type, AND that source row's own
--      property_id matches this row's property_id — closing the same
--      "reference someone else's row while owner_id = me" gap that
--      milestone-8's document_analyses policies close, and additionally
--      preventing a forged cross-property source relationship within the
--      caller's OWN properties (Section 20's fourth required test).
-- Manual items (source_id null) skip step 3 entirely — there's nothing to
-- validate.
create or replace function public.property_watch_source_is_valid(p_source_type text, p_source_id uuid, p_property_id uuid, p_owner_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select case
    when p_source_id is null then true
    when p_source_type = 'lease' then exists (
      select 1 from public.leases s where s.id = p_source_id and s.owner_id = p_owner_id and s.property_id = p_property_id
    )
    when p_source_type = 'mortgage' then exists (
      select 1 from public.mortgages s where s.id = p_source_id and s.owner_id = p_owner_id and s.property_id = p_property_id
    )
    when p_source_type = 'insurance_policy' then exists (
      select 1 from public.insurance_policies s where s.id = p_source_id and s.owner_id = p_owner_id and s.property_id = p_property_id
    )
    when p_source_type = 'document' then exists (
      select 1 from public.property_documents s where s.id = p_source_id and s.owner_id = p_owner_id and s.property_id = p_property_id
    )
    -- 'ledger' and 'maintenance_record' use the property's own id as
    -- source_id (lib/property-watch/identity.ts point 5 — there's no
    -- single source row to point at), so validity is just "this property
    -- id, which was already checked against p_property_id".
    when p_source_type in ('ledger', 'maintenance_record') then p_source_id = p_property_id
    else false
  end
$$;

drop policy if exists "property_watch_items_insert_own" on public.property_watch_items;
create policy "property_watch_items_insert_own" on public.property_watch_items for insert to authenticated with check (
  (select auth.uid()) = owner_id
  and exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid()))
  and public.property_watch_source_is_valid(source_type, source_id, property_id, owner_id)
);

drop policy if exists "property_watch_items_update_own" on public.property_watch_items;
create policy "property_watch_items_update_own" on public.property_watch_items for update to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid()))
  and public.property_watch_source_is_valid(source_type, source_id, property_id, owner_id)
);

drop policy if exists "property_watch_items_delete_own" on public.property_watch_items;
create policy "property_watch_items_delete_own" on public.property_watch_items for delete to authenticated using ((select auth.uid()) = owner_id);

create or replace function public.property_watch_items_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists property_watch_items_touch_updated_at on public.property_watch_items;
create trigger property_watch_items_touch_updated_at
  before update on public.property_watch_items
  for each row
  execute function public.property_watch_items_set_updated_at();
