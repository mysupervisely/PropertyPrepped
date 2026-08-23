-- PropRoster Milestone 24 — Tenant Connect V1.
-- Run once in the Supabase SQL Editor. Additive only — does not drop or
-- rewrite any existing table, column, policy, function, trigger, or
-- property/tenant data from earlier milestones (including Milestone 10's
-- Tenant Connect foundation, supabase/milestone-10-tenant-connect.sql,
-- which this migration builds on top of rather than replacing).
--
-- MIGRATION NOT APPLIED TO PRODUCTION — for review only.
--
-- ===================================================================
-- WHAT THIS ADDS
-- ===================================================================
-- 1. tenant_requests — a tenant-submitted request (category/title/
--    description/status), one row per request, linking to a
--    property_conversations row (M10) that carries its actual message
--    thread. Reuses 100% of M10's conversation/message/attachment
--    infrastructure (property_conversations, property_messages,
--    property_message_attachments, the tenant-connect-attachments
--    storage bucket, the sender-role-derivation trigger) — this table
--    is thin metadata (category + a request-specific status vocabulary
--    distinct from the general Open/Closed conversation status) sitting
--    beside a conversation, never a parallel messaging system.
--
--    This is DELIBERATELY SEPARATE from the pre-existing
--    maintenance_requests table (supabase/schema.sql) — that table is
--    the LANDLORD's own manual log of requests received by phone/email/
--    in person (owner-only INSERT policy, no tenant write path at all,
--    untouched by this migration) — a different actor, a different
--    workflow. tenant_requests is specifically for a request the
--    tenant submits themselves through their own Tenant Connect access.
--
-- 2. Two new, narrowly-scoped, ADDITIVE read policies — one on
--    properties, one on leases — so an ACTIVE tenant can read exactly
--    their own property's address and exactly the ONE lease their
--    tenant_property_access row is tied to (via its existing lease_id
--    column). Per Section 13's explicit instruction, these are NEW
--    policies alongside the existing owner-only ones (Postgres unions
--    multiple permissive policies automatically) — the existing
--    properties_select_own / leases_select_own policies are not
--    touched, renamed, or widened to "owner OR tenant" in any way.
--    Nothing else on either table (mortgage_balance, estimated_value,
--    financial data, etc. lives on OTHER tables already inaccessible
--    to a tenant) becomes newly readable — a tenant reading `leases`
--    only ever sees the one row their own access grant names.
--
-- ===================================================================
-- THREAT MODEL (same rigor as milestone-10-tenant-connect.sql)
-- ===================================================================
-- - A tenant can read/write ONLY tenant_requests tied to their own
--   ACTIVE tenant_property_access row — never another tenant's, never
--   a revoked one.
-- - A tenant can read ONLY the property/lease named by their own ACTIVE
--   tenant_property_access row (via property_id / lease_id respectively)
--   — never another property, never a different tenant's lease on the
--   SAME property (e.g. a prior or future tenant's lease), even though
--   both leases share the same property_id.
-- - Revoking access (tenant_property_access.status = 'Revoked') removes
--   ALL of the above immediately — every new policy below re-checks
--   status = 'Active' on every read, exactly like every M10 policy
--   already does.
-- - Only the tenant may INSERT a tenant_requests row (the landlord's own
--   request-logging path is, and remains, maintenance_requests) — and
--   only for a conversation that actually belongs to their own access
--   grant, was actually created under that grant, and is a Maintenance-
--   type conversation. Only the owner may UPDATE (status changes).
--
-- ===================================================================
-- ROLLBACK
-- ===================================================================
-- Run, in this order (safe even if only some of the below was applied):
--   drop policy if exists "leases_select_active_tenant" on public.leases;
--   drop policy if exists "properties_select_active_tenant" on public.properties;
--   drop function if exists public.is_active_tenant_of_lease(uuid);
--   drop function if exists public.is_active_tenant_of_property(uuid);
--   drop policy if exists "tenant_requests_update_owner" on public.tenant_requests;
--   drop policy if exists "tenant_requests_insert_tenant" on public.tenant_requests;
--   drop policy if exists "tenant_requests_select" on public.tenant_requests;
--   drop trigger if exists tenant_requests_touch_updated_at on public.tenant_requests;
--   drop function if exists public.tenant_requests_set_updated_at();
--   drop table if exists public.tenant_requests;
-- This does not touch maintenance_requests, tenant_property_access,
-- property_conversations, property_messages, or any Milestone 10 object
-- — none of those are created or altered by this migration.

-- ==================================================================
-- tenant_requests
-- ==================================================================
create table if not exists public.tenant_requests (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  tenant_access_id uuid not null references public.tenant_property_access(id) on delete cascade,
  -- One conversation backs exactly one request (enforced by the unique
  -- index below) — the request's "conversation" (Section 8) is this
  -- SAME property_conversations row's message thread, never a second,
  -- parallel one.
  conversation_id uuid not null references public.property_conversations(id) on delete cascade,
  category text not null check (category in ('Plumbing', 'Electrical', 'HVAC', 'Appliance', 'General Maintenance', 'Other')),
  title text not null check (length(btrim(title)) > 0),
  -- The tenant's original description, stored once here (never edited
  -- after submission) — the SAME text is also posted as the first
  -- message in the linked conversation for natural thread continuity;
  -- this column is the stable "what was originally reported" record.
  description text not null check (length(btrim(description)) > 0),
  status text not null default 'New' check (status in ('New', 'In Progress', 'Resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists tenant_requests_conversation_unique on public.tenant_requests(conversation_id);
create index if not exists tenant_requests_property_idx on public.tenant_requests(property_id, created_at desc);
create index if not exists tenant_requests_owner_idx on public.tenant_requests(owner_id);
create index if not exists tenant_requests_tenant_access_idx on public.tenant_requests(tenant_access_id);
create index if not exists tenant_requests_status_idx on public.tenant_requests(status);

alter table public.tenant_requests enable row level security;

-- SELECT: owner of the property, or the active tenant on the specific
-- access row this request belongs to — identical membership rule to
-- property_conversations_select (M10), applied to this table.
drop policy if exists "tenant_requests_select" on public.tenant_requests;
create policy "tenant_requests_select" on public.tenant_requests for select to authenticated using (
  (select auth.uid()) = owner_id
  or exists (
    select 1 from public.tenant_property_access tpa
    where tpa.id = tenant_access_id and tpa.status = 'Active' and tpa.tenant_user_id = (select auth.uid())
  )
);

-- INSERT: only the active tenant on tenant_access_id (never the owner —
-- the owner's own request-logging path is maintenance_requests, a
-- completely separate table/policy, untouched by this migration).
-- owner_id/property_id must match tenant_access_id's real values (never
-- caller-supplied free values — same scalar-subquery pattern
-- property_conversations_insert already uses in milestone-10), AND
-- conversation_id must reference a REAL Maintenance-type conversation
-- that already belongs to this exact tenant_access_id — this is what
-- stops a tenant from attaching request metadata to a conversation that
-- isn't theirs, and from forging a request against another property/
-- tenant/owner by supplying mismatched foreign keys.
--
-- Deliberately written as scalar-subquery equalities
-- (`outer_col = (select qualified_col from t where t.pk = outer_col)`)
-- rather than `exists (... where t.col = outer_col)` for any column
-- name that ALSO exists on the table being queried (property_id,
-- owner_id, tenant_access_id all exist on both tenant_property_access
-- and property_conversations) — an unqualified reference to one of
-- those names inside such a subquery resolves to that subquery's OWN
-- column (the nearest FROM-clause match), not to this policy's new row,
-- silently turning the comparison into an always-true tautology (e.g.
-- `tpa.property_id = property_id` really means
-- `tpa.property_id = tpa.property_id`). Every comparison below instead
-- keeps the new-row reference on the OUTER side of a top-level `=`,
-- where it cannot be shadowed, and only ever reaches into a same-named
-- inner column via an explicit `pc.`/`tpa.` qualifier.
drop policy if exists "tenant_requests_insert_tenant" on public.tenant_requests;
create policy "tenant_requests_insert_tenant" on public.tenant_requests for insert to authenticated with check (
  owner_id = (select tpa.owner_id from public.tenant_property_access tpa where tpa.id = tenant_access_id)
  and property_id = (select tpa.property_id from public.tenant_property_access tpa where tpa.id = tenant_access_id)
  and exists (
    select 1 from public.tenant_property_access tpa
    where tpa.id = tenant_access_id
      and tpa.status = 'Active'
      and tpa.tenant_user_id = (select auth.uid())
  )
  and tenant_access_id = (
    select pc.tenant_access_id from public.property_conversations pc
    where pc.id = conversation_id and pc.conversation_type = 'Maintenance'
  )
);

-- UPDATE: owner only (status changes — New / In Progress / Resolved).
-- Tenants never update a request row directly; they only see status
-- and reply via property_messages (M10's own insert policy already
-- covers that, unchanged).
drop policy if exists "tenant_requests_update_owner" on public.tenant_requests;
create policy "tenant_requests_update_owner" on public.tenant_requests for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);
-- No DELETE policy — Section 12: "Do not automatically delete request
-- history when access is revoked." A request is retired via
-- status = 'Resolved', never removed.

create or replace function public.tenant_requests_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tenant_requests_touch_updated_at on public.tenant_requests;
create trigger tenant_requests_touch_updated_at
  before update on public.tenant_requests
  for each row
  execute function public.tenant_requests_set_updated_at();

-- ==================================================================
-- Additive tenant read access to properties / leases (Section 5:
-- Tenant Home needs the property address and this tenant's own lease
-- terms). NEW policies only — properties_select_own / leases_select_own
-- (owner-only) are not modified in any way; Postgres unions multiple
-- permissive policies on the same table automatically, so this only
-- ADDS a narrow tenant-visible slice, never widens the owner policy's
-- own wording or reach.
--
-- These two policies MUST reach tenant_property_access through a
-- SECURITY DEFINER function, not an inline EXISTS subquery — confirmed
-- by actually running this migration against a live Postgres instance
-- (see the completion report): tenant_property_access's own EXISTING
-- INSERT policy (milestone-10, "tenant_access_insert_owner") already
-- queries `properties` (to confirm the owner owns the target property).
-- An inline `properties` policy that queries back into
-- tenant_property_access closes that into a real two-table RLS cycle —
-- Postgres detects it and raises "infinite recursion detected in
-- policy for relation tenant_property_access" the moment an owner next
-- tries to invite a tenant (INSERT into tenant_property_access), which
-- would have been a genuine regression against Milestone 10's own,
-- already-shipped invite flow. Routing the check through a SECURITY
-- DEFINER function breaks the cycle the exact same way
-- owner_has_tenant_connect() (M10) already does: the function's own
-- internal query runs as the function's owner and bypasses RLS
-- entirely, so it never re-triggers `properties`' policies while
-- `properties`' policy is itself mid-evaluation. Each function still
-- only ever returns a boolean, and still fully re-derives auth.uid()
-- itself — the elevated read is never a broader grant than "is the
-- CALLER an active tenant of this one property/lease."
create or replace function public.is_active_tenant_of_property(p_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tenant_property_access tpa
    where tpa.property_id = p_property_id
      and tpa.status = 'Active'
      and tpa.tenant_user_id = auth.uid()
  );
$$;

create or replace function public.is_active_tenant_of_lease(p_lease_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tenant_property_access tpa
    where tpa.lease_id = p_lease_id
      and tpa.status = 'Active'
      and tpa.tenant_user_id = auth.uid()
  );
$$;

-- A tenant may read a property row ONLY when they have an ACTIVE access
-- grant for that exact property_id. Nothing else about the property
-- (mortgage/insurance/tax/financial data) is exposed by this policy —
-- those live in entirely separate tables this migration never touches,
-- and none of them have any tenant-facing policy at all.
drop policy if exists "properties_select_active_tenant" on public.properties;
create policy "properties_select_active_tenant" on public.properties for select to authenticated using (
  public.is_active_tenant_of_property(properties.id)
);

-- A tenant may read a lease row ONLY when it is the EXACT lease their
-- own ACTIVE access grant names (tenant_property_access.lease_id) — NOT
-- "any lease on this property." This is the specific guard against
-- Section 12's requirement: a prior or future tenant's lease on the
-- SAME property is a different lease row with a different id, so it
-- never matches this tenant's own tpa.lease_id and stays invisible to
-- them, even though both leases share a property_id this tenant CAN
-- read via the policy above.
drop policy if exists "leases_select_active_tenant" on public.leases;
create policy "leases_select_active_tenant" on public.leases for select to authenticated using (
  public.is_active_tenant_of_lease(leases.id)
);
