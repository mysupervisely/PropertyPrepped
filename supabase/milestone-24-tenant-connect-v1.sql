-- PropRoster Milestone 24 — Tenant Connect V1.
-- Run once in the Supabase SQL Editor. Additive only — does not drop or
-- rewrite any existing table, column, policy, function, trigger, or
-- property/tenant data from earlier milestones (including Milestone 10's
-- Tenant Connect foundation, supabase/milestone-10-tenant-connect.sql,
-- which this migration builds on top of rather than replacing).
--
-- MIGRATION NOT APPLIED TO PRODUCTION — revised in place after the
-- Round 6 final safety review (production fixture check confirmed this
-- migration had never successfully run — public.tenant_requests still
-- does not exist there — so this file is revised in place rather than
-- layered under a second corrective migration; see REVISION HISTORY).
--
-- ===================================================================
-- REVISION HISTORY
-- ===================================================================
-- This migration originally shipped with three issues, all found and
-- fixed BEFORE ever being applied to production:
--
--   1. tenant_requests_update_owner (the owner UPDATE policy) had no
--      column-level restriction — RLS is row-level only, so the policy
--      as originally written let an owner rewrite ANY column of a
--      request, including the tenant's original title/description/
--      category, contradicting this file's own "never edited after
--      submission" design intent. FIXED by adding a BEFORE UPDATE
--      trigger, tenant_requests_lock_immutable_fields(), that force-
--      pins every column except status/updated_at back to its prior
--      value — enforced at the database level, not just left to the
--      application UI.
--
--   2. properties_select_active_tenant / leases_select_active_tenant
--      (the two new tenant read policies) granted a tenant the ENTIRE
--      row on properties/leases once matched — RLS restricts which
--      ROWS a role sees, never which COLUMNS, so a tenant issuing a
--      direct `select=*` against either base table could retrieve
--      landlord-only financial/valuation/private fields (estimated_
--      value, mortgage_balance, purchase_price, monthly_expenses,
--      purchase_date, property_tax_annual, hoa_monthly,
--      financing_status, leases.notes) that the shipped tenant portal
--      UI never selects but that RLS never actually blocked either.
--      FIXED by removing tenant SELECT access to the base tables
--      entirely and replacing it with two narrow, column-limited views
--      — public.tenant_property_view / public.tenant_lease_view — that
--      a tenant reads instead. See "TENANT-FACING VIEWS" below for the
--      exact column lists and why a view (not a column-level GRANT) is
--      the correct mechanism here.
--
--   3. tenant_requests.tenant_access_id / conversation_id were declared
--      `on delete cascade`, which is defense-in-depth-inconsistent with
--      Section 12's "never delete request history" intent even though
--      no code path in this repo ever physically deletes a
--      tenant_property_access or property_conversations row today
--      (both are retired via a status column, never DELETEd — verified
--      by a repo-wide grep of every `.delete(` call). FIXED by changing
--      both FKs to `on delete restrict`, so a future direct-delete
--      regression on either parent table would be blocked by the
--      database rather than silently cascading away request history.
--      property_id / owner_id remain `on delete cascade`, consistent
--      with the repo-wide convention that deleting a whole property (or
--      account) already cascades away every other child table
--      (leases, mortgages, insurance, documents, photos, contacts,
--      etc.) — narrowing just these two FKs here would make property
--      deletion inconsistent/fail without fixing the underlying
--      pattern anywhere else it already exists.
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
-- 2. Two narrow, read-only, column-limited views — public.
--    tenant_property_view and public.tenant_lease_view — so an ACTIVE
--    tenant can read exactly their own property's address/city and
--    exactly the ONE lease their tenant_property_access row is tied to
--    (via its existing lease_id column), and NOTHING else on either
--    table. The tenant portal (app/tenant/page.tsx) reads from these
--    views, never from public.properties/public.leases directly.
--    Owner access to the base tables (properties_select_own,
--    leases_select_own, both pre-existing and untouched) is completely
--    unaffected — owners keep full-row access exactly as before.
--
-- ===================================================================
-- THREAT MODEL (same rigor as milestone-10-tenant-connect.sql)
-- ===================================================================
-- - A tenant can read/write ONLY tenant_requests tied to their own
--   ACTIVE tenant_property_access row — never another tenant's, never
--   a revoked one.
-- - A tenant can read, through tenant_property_view/tenant_lease_view
--   ONLY, ONLY the property/lease named by their own ACTIVE
--   tenant_property_access row (via property_id / lease_id
--   respectively) — never another property, never a different tenant's
--   lease on the SAME property (e.g. a prior or future tenant's
--   lease), even though both leases share the same property_id — and
--   never any column beyond the narrow, explicitly-listed safe set
--   below. A tenant querying public.properties or public.leases
--   directly (base tables) gets ZERO rows: no tenant-facing policy
--   exists on either table any more.
-- - Revoking access (tenant_property_access.status = 'Revoked') removes
--   ALL of the above immediately — every policy/view predicate below
--   re-checks status = 'Active' on every read, exactly like every M10
--   policy already does.
-- - Only the tenant may INSERT a tenant_requests row (the landlord's own
--   request-logging path is, and remains, maintenance_requests) — and
--   only for a conversation that actually belongs to their own access
--   grant, was actually created under that grant, and is a Maintenance-
--   type conversation. Only the owner may UPDATE a tenant_requests row,
--   and even then ONLY its status column — every other column is
--   force-pinned to its original value by a database trigger,
--   regardless of what the UPDATE statement supplies.
--
-- ===================================================================
-- ROLLBACK
-- ===================================================================
-- Run, in this order (safe even if only some of the below was applied):
--   drop view if exists public.tenant_lease_view;
--   drop view if exists public.tenant_property_view;
--   drop function if exists public.is_active_tenant_of_lease(uuid);
--   drop function if exists public.is_active_tenant_of_property(uuid);
--   drop policy if exists "tenant_requests_update_owner" on public.tenant_requests;
--   drop trigger if exists tenant_requests_lock_immutable_fields on public.tenant_requests;
--   drop function if exists public.tenant_requests_lock_immutable_fields();
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
  -- tenant_access_id / conversation_id are `on delete restrict`, not
  -- cascade — see REVISION HISTORY #3. Neither tenant_property_access
  -- nor property_conversations rows are ever physically deleted by any
  -- code path in this repo today (both are retired via a status
  -- column), so this is defense-in-depth against a future regression,
  -- not a change to any current behavior.
  tenant_access_id uuid not null references public.tenant_property_access(id) on delete restrict,
  -- One conversation backs exactly one request (enforced by the unique
  -- index below) — the request's "conversation" (Section 8) is this
  -- SAME property_conversations row's message thread, never a second,
  -- parallel one.
  conversation_id uuid not null references public.property_conversations(id) on delete restrict,
  category text not null check (category in ('Plumbing', 'Electrical', 'HVAC', 'Appliance', 'General Maintenance', 'Other')),
  title text not null check (length(btrim(title)) > 0),
  -- The tenant's original description, stored once here (never edited
  -- after submission) — the SAME text is also posted as the first
  -- message in the linked conversation for natural thread continuity;
  -- this column is the stable "what was originally reported" record.
  -- Enforced as immutable-after-insert by
  -- tenant_requests_lock_immutable_fields() below, not just by this
  -- comment/convention.
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

-- Idempotent correction for a database where this table was already
-- created by an earlier run of this file with the original `on delete
-- cascade` FKs (production itself is confirmed clean/never applied —
-- see REVISION HISTORY — but this keeps the file safely re-runnable
-- against any environment, matching the repo's existing
-- "drop constraint if exists / add constraint" idiom, e.g.
-- milestone-13-financing-status.sql / milestone-17-tenant-lease-v2.sql).
alter table public.tenant_requests drop constraint if exists tenant_requests_tenant_access_id_fkey;
alter table public.tenant_requests add constraint tenant_requests_tenant_access_id_fkey
  foreign key (tenant_access_id) references public.tenant_property_access(id) on delete restrict;

alter table public.tenant_requests drop constraint if exists tenant_requests_conversation_id_fkey;
alter table public.tenant_requests add constraint tenant_requests_conversation_id_fkey
  foreign key (conversation_id) references public.property_conversations(id) on delete restrict;

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

-- UPDATE: owner only, and — enforced by the trigger below, not just
-- this policy — status (and the auto-maintained updated_at) only.
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

-- tenant_requests_update_owner (above) is row-level only — Postgres RLS
-- has no concept of column-level restriction, so without this trigger
-- an owner UPDATE matching the policy could rewrite ANY column,
-- including the tenant's original title/description/category, or even
-- reassign the request to a different property/lease/tenant/owner by
-- rewriting its foreign keys. This trigger is the actual enforcement of
-- "owners may only change status" (Round 6, Concern 1) — it runs
-- unconditionally on every UPDATE (regardless of who or what policy let
-- it through) and silently force-restores every column except status/
-- updated_at to its prior value, the same force-overwrite idiom
-- Milestone 10's derive_message_sender_role() trigger already uses for
-- "server-derived, never client-settable" fields. Because there is no
-- tenant-facing UPDATE policy on this table at all (only owner has one,
-- above), this trigger only NARROWS what's already possible — it never
-- creates any new tenant-edit capability.
create or replace function public.tenant_requests_lock_immutable_fields()
returns trigger
language plpgsql
as $$
begin
  new.property_id := old.property_id;
  new.owner_id := old.owner_id;
  new.tenant_access_id := old.tenant_access_id;
  new.conversation_id := old.conversation_id;
  new.category := old.category;
  new.title := old.title;
  new.description := old.description;
  new.created_at := old.created_at;
  return new;
end;
$$;

drop trigger if exists tenant_requests_lock_immutable_fields on public.tenant_requests;
create trigger tenant_requests_lock_immutable_fields
  before update on public.tenant_requests
  for each row
  execute function public.tenant_requests_lock_immutable_fields();

-- ==================================================================
-- is_active_tenant_of_property / is_active_tenant_of_lease
-- ==================================================================
-- SECURITY DEFINER helper functions used both by the views below and
-- (previously) by inline policies on properties/leases — confirmed by
-- actually running this migration against a live Postgres instance
-- (see the completion report): tenant_property_access's own EXISTING
-- INSERT policy (milestone-10, "tenant_access_insert_owner") already
-- queries `properties` (to confirm the owner owns the target property).
-- Anything on `properties`/`leases` that queries back into
-- tenant_property_access inline closes that into a real two-table RLS
-- cycle — Postgres detects it and raises "infinite recursion detected
-- in policy for relation tenant_property_access" the moment an owner
-- next tries to invite a tenant (INSERT into tenant_property_access),
-- which would have been a genuine regression against Milestone 10's
-- own, already-shipped invite flow. Routing the check through a
-- SECURITY DEFINER function breaks the cycle the exact same way
-- owner_has_tenant_connect() (M10) already does: the function's own
-- internal query runs as the function's owner and bypasses RLS
-- entirely, so it never re-triggers `properties`'/`leases`' policies
-- while those policies are themselves mid-evaluation. Each function
-- still only ever returns a boolean, and still fully re-derives
-- auth.uid() itself — the elevated read is never a broader grant than
-- "is the CALLER an active tenant of this one property/lease."
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

-- ==================================================================
-- TENANT-FACING VIEWS — replaces the original properties/leases
-- tenant SELECT policies (Round 6, Concern 2)
-- ==================================================================
-- RLS is row-level only: a `using (...)` policy on properties/leases
-- can restrict WHICH ROW a tenant sees, but once a row matches, the
-- tenant receives EVERY column on it — there is no way for an RLS
-- policy to also restrict which columns a matched row exposes. Both
-- properties and leases carry landlord-only financial/valuation/
-- private columns (properties: estimated_value, mortgage_balance,
-- monthly_rent, purchase_price, monthly_expenses, purchase_date,
-- property_tax_annual, hoa_monthly, financing_status; leases: notes)
-- that must never reach a tenant, per the original Tenant Connect V1
-- spec's explicit prohibition on exposing financials, mortgage, or
-- property value/equity data. A tenant-facing RLS policy directly on
-- either base table cannot make that guarantee, no matter how it's
-- written — only limiting the SELECTED COLUMNS themselves does, which
-- is what these two views exist to do.
--
-- These are NOT security_invoker views. They intentionally run with
-- their OWNER's privileges (the role that executes this migration,
-- which owns properties/leases and therefore bypasses those tables'
-- RLS the same way a SECURITY DEFINER function's body does) and
-- enforce row-level tenant scoping themselves, in their own WHERE
-- clause, via the exact same is_active_tenant_of_property() /
-- is_active_tenant_of_lease() SECURITY DEFINER functions already used
-- above — the identical "is the CALLER an active tenant of this one
-- property/lease" boolean check, re-derived from auth.uid() every time,
-- never a broader grant. A column-level GRANT/REVOKE on the base tables
-- was considered and rejected: Postgres column privileges are granted
-- per ROLE, and both owners and tenants query as the same `authenticated`
-- role, so a column grant restrictive enough for tenants would also
-- block owners from their own full-row access — only a separate,
-- explicitly column-limited view can give the two actors different
-- column visibility on the same role.
--
-- Column lists below are deliberately minimal — exactly what the
-- shipped tenant portal (app/tenant/page.tsx) already selects, nothing
-- added "for later." property_type/beds/baths/cover_photo_path/etc,
-- and lease notes/security_deposit/document_id/owner_id, are
-- deliberately NOT included even though they're not sensitive per se —
-- they're simply not used by any tenant-facing feature yet.
drop view if exists public.tenant_property_view;
create view public.tenant_property_view as
select
  p.id,
  p.address,
  p.city
from public.properties p
where public.is_active_tenant_of_property(p.id);

drop view if exists public.tenant_lease_view;
create view public.tenant_lease_view as
select
  l.id,
  l.tenant_name,
  l.monthly_rent,
  l.start_date,
  l.end_date,
  l.rent_due_day
from public.leases l
where public.is_active_tenant_of_lease(l.id);

grant select on public.tenant_property_view to authenticated;
grant select on public.tenant_lease_view to authenticated;

-- Base-table tenant access is intentionally NOT re-added here.
-- properties_select_own / leases_select_own (owner-only, pre-existing,
-- untouched) remain the ONLY select policies on the base tables — a
-- tenant issuing `select * from public.properties` (or `.leases`)
-- directly, including via a raw PostgREST call, now matches no policy
-- at all and receives zero rows. The two policies this migration
-- originally added here (properties_select_active_tenant,
-- leases_select_active_tenant) are dropped below in case this file is
-- being re-run against a database that already has an earlier version
-- of this migration applied.
drop policy if exists "properties_select_active_tenant" on public.properties;
drop policy if exists "leases_select_active_tenant" on public.leases;
