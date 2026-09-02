-- PropRoster Milestone 25 — Tenant Connect + Maintenance Coordination,
-- M1: Foundation repair + unified maintenance schema foundation.
--
-- NOT APPLIED TO PRODUCTION. Written on branch
-- claude/tenant-connect-maintenance-m1-foundation, reviewed but not run
-- against any live database as part of this milestone. See
-- docs/tenant-connect-maintenance-m1-foundation.md for the full
-- remediation decision, migration safety review, and deployment
-- sequencing notes this file assumes.
--
-- ===================================================================
-- WHY THIS FILE EXISTS (read this before running anything)
-- ===================================================================
-- supabase/milestone-24-tenant-connect-v1.sql was written, reviewed
-- (through a "Round 6" safety pass), and given a full RLS regression
-- suite (supabase/tests/milestone-24-rls.test.sql) — but per that
-- file's own header comment, it was NEVER SUCCESSFULLY APPLIED TO
-- PRODUCTION, even though the application code that depends on its
-- public.tenant_requests table (components/tenant-connect/
-- TenantRequestsPanel.tsx, app/tenant/page.tsx, app/api/tenant-connect/
-- notify/route.ts, app/page.tsx) has been shipping and querying that
-- table unconditionally the whole time.
--
-- This file does NOT simply re-run milestone-24-tenant-connect-v1.sql
-- verbatim. milestone-24-tenant-connect-v1.sql is preserved byte-for-
-- byte, untouched, as the historical record of that design (and
-- because lib/tenant-connect/tenant-connect-v1-wiring.test.ts asserts
-- directly against its exact content) — this file is a NEW, reconciled,
-- forward-only migration that:
--
--   1. Creates the SAME public.tenant_requests table and the SAME two
--      tenant-facing views/SECURITY DEFINER functions milestone-24
--      designed, re-verified line-by-line against the CURRENT
--      supabase/schema.sql (confirmed non-stale — every column/table it
--      depends on, e.g. leases.rent_due_day, user_subscriptions.plan's
--      'portfolio'/'portfolio_pro' values, still exists unchanged).
--      This part is content-IDENTICAL to milestone-24's design intent.
--
--   2. Uses a DIFFERENT, FINAL category vocabulary for
--      tenant_requests.category — stable, machine-readable identifiers
--      (heating_ac/plumbing/toilet/electrical/appliance/lock_door/
--      leak_water/other; see lib/maintenance/categories.ts) instead of
--      milestone-24's original six display-string values. This is safe
--      to change here, and ONLY here, because public.tenant_requests
--      has never held a single row of real data in production — this is
--      the one and only moment this column's vocabulary can be set
--      without a live-data migration.
--
--   3. Adds new, additive-only foundation for the next milestone (M2 —
--      Guided Maintenance Intake) to build on, per the M1 brief's
--      explicit "make room to store" list: maintenance_intake_sessions
--      / maintenance_intake_answers (Section C below). No application
--      code writes to either table yet — M1 ships zero intake UI.
--
--   4. Adds a minimal, trigger-driven, append-only maintenance audit
--      log (Section D below) covering the two real actions M1 itself
--      re-enables (a tenant submitting a request, an owner changing its
--      status) — not a general-purpose future audit system, just the
--      foundation for one, following the exact "no client-facing
--      INSERT/UPDATE/DELETE policy" immutability convention
--      public.ai_usage_events already established in this schema.
--
--   5. Fixes a real, PRE-EXISTING, currently-live production bug in
--      public.owner_has_tenant_connect() (Section E below), discovered
--      during this milestone's own hands-on RLS verification, not
--      invented scope. See Section E's header for the full finding.
--
-- Explicitly NOT done here (deferred to their own future milestones —
-- see docs/tenant-connect-maintenance-m1-foundation.md's "deferred"
-- section): no maintenance_access_windows table (no structural need to
-- create it before M2 actually consumes it — creating it now would not
-- reduce future migration risk), no appointment/quote/authorization
-- tables (M6/M7 territory, no M1 application behavior needs them), no
-- provider-token table (M5), no changes whatsoever to the pre-existing,
-- separate public.maintenance_requests table (the landlord's own manual
-- log — a different actor, a different workflow, untouched), no changes
-- to public.property_contacts / public.property_contact_links (M4).
--
-- ===================================================================
-- CANONICAL MAINTENANCE-REQUEST MODEL DECISION (Phase 1F)
-- ===================================================================
-- Neither existing table "becomes canonical" over the other in M1.
-- public.maintenance_requests (owner-only manual log, live since
-- Milestone 6, may already hold real production rows) and
-- public.tenant_requests (tenant-submitted, backed by a
-- property_conversations thread, ZERO production rows because it has
-- never existed) represent two genuinely different origins — exactly
-- the distinction milestone-24's own original header comment already
-- drew ("This is DELIBERATELY SEPARATE from the pre-existing
-- maintenance_requests table... a different actor, a different
-- workflow"). Forcing them into one physical table in M1 would mean
-- either (a) an in-place schema rewrite of a table that may hold real
-- landlord data, for zero M1 application benefit, or (b) inventing a
-- new unified table no M1 UI reads or writes, purely speculatively.
-- Both fail "minimal migration risk" and "smallest coherent
-- foundation." tenant_requests is the safe, additive, already-shipped-
-- application-code-compatible interim canonical entity for
-- TENANT-SUBMITTED requests; maintenance_requests remains canonical for
-- LANDLORD-LOGGED requests. Whether/how a future milestone (M3's
-- landlord command center is the natural candidate) presents these as
-- one unified inbox — via a read-time view/union, or a genuine later
-- physical unification once real usage patterns are known — is
-- explicitly left open and documented as a product-owner decision in
-- docs/tenant-connect-maintenance-m1-foundation.md, not decided here.
--
-- ===================================================================
-- REVISION HISTORY (this file)
-- ===================================================================
-- v1 (this version): initial M1 foundation-repair migration, plus a
-- same-milestone fix to public.owner_has_tenant_connect() (Section E)
-- found via this migration's own local RLS test run — see Section E.
--
-- ===================================================================
-- ROLLBACK
-- ===================================================================
-- Section E (the owner_has_tenant_connect() plan-list fix) is
-- deliberately NOT included below. It corrects an already-live
-- Milestone 10 function to match the already-live TS entitlement map;
-- rolling it back would re-introduce a real production bug (current
-- Manage/Automate-plan owners silently unable to write
-- property_conversations/property_messages), not undo new M1 scope.
-- If this file is fully rolled back for some other reason, leave
-- Section E's CREATE OR REPLACE applied on its own.
--
-- Run, in this order (safe even if only some of the below was applied):
--   drop trigger if exists tenant_requests_write_audit_log on public.tenant_requests;
--   drop function if exists public.maintenance_audit_log_write();
--   drop policy if exists "maintenance_audit_log_select" on public.maintenance_audit_log;
--   drop table if exists public.maintenance_audit_log;
--   drop policy if exists "maintenance_intake_answers_select" on public.maintenance_intake_answers;
--   drop policy if exists "maintenance_intake_answers_insert_tenant" on public.maintenance_intake_answers;
--   drop table if exists public.maintenance_intake_answers;
--   drop policy if exists "maintenance_intake_sessions_select" on public.maintenance_intake_sessions;
--   drop policy if exists "maintenance_intake_sessions_insert_tenant" on public.maintenance_intake_sessions;
--   drop policy if exists "maintenance_intake_sessions_update_tenant" on public.maintenance_intake_sessions;
--   drop table if exists public.maintenance_intake_sessions;
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
-- property_conversations, property_messages, property_contacts,
-- property_contact_links, or any earlier milestone's objects — none of
-- those are created or altered by this migration.

-- ===================================================================
-- SECTION A — tenant_requests (reconciled milestone-24 design, new
-- category vocabulary)
-- ===================================================================
create table if not exists public.tenant_requests (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  -- on delete restrict, not cascade — neither tenant_property_access nor
  -- property_conversations rows are ever physically deleted by any code
  -- path in this repo (both are retired via a status column), so this
  -- is defense-in-depth against a future regression, matching
  -- milestone-24's own Round 6 fix.
  tenant_access_id uuid not null references public.tenant_property_access(id) on delete restrict,
  conversation_id uuid not null references public.property_conversations(id) on delete restrict,
  -- Stable, machine-readable category identifiers — see
  -- lib/maintenance/categories.ts for the id -> display-label mapping
  -- every consumer (the tenant portal's category picker, the landlord
  -- Requests inbox, the new-request notification email) uses. This is
  -- the ONE column whose vocabulary differs from milestone-24's
  -- original design — see this file's header for why that's safe here.
  category text not null check (category in ('heating_ac', 'plumbing', 'toilet', 'electrical', 'appliance', 'lock_door', 'leak_water', 'other')),
  title text not null check (length(btrim(title)) > 0),
  -- The tenant's original description ("tenant-reported symptom" in the
  -- M0 architecture's vocabulary) — stored once, immutable after
  -- insert (enforced below, not just by convention). The SAME text is
  -- also posted as the first message in the linked conversation.
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

-- Idempotent correction, matching the repo-wide "drop constraint if
-- exists / add constraint" convention, in case this file is re-run
-- against a database that already has an earlier version of it.
alter table public.tenant_requests drop constraint if exists tenant_requests_tenant_access_id_fkey;
alter table public.tenant_requests add constraint tenant_requests_tenant_access_id_fkey
  foreign key (tenant_access_id) references public.tenant_property_access(id) on delete restrict;

alter table public.tenant_requests drop constraint if exists tenant_requests_conversation_id_fkey;
alter table public.tenant_requests add constraint tenant_requests_conversation_id_fkey
  foreign key (conversation_id) references public.property_conversations(id) on delete restrict;

-- Idempotent correction for the category vocabulary specifically (in
-- case an earlier run of THIS file, or a hand-applied milestone-24, is
-- already present with the old six-value check) — re-runnable safely
-- either way.
alter table public.tenant_requests drop constraint if exists tenant_requests_category_check;
alter table public.tenant_requests add constraint tenant_requests_category_check
  check (category in ('heating_ac', 'plumbing', 'toilet', 'electrical', 'appliance', 'lock_door', 'leak_water', 'other'));

alter table public.tenant_requests enable row level security;

-- SELECT: owner of the property, or the active tenant on the specific
-- access row this request belongs to — identical membership rule to
-- property_conversations_select (M10).
drop policy if exists "tenant_requests_select" on public.tenant_requests;
create policy "tenant_requests_select" on public.tenant_requests for select to authenticated using (
  (select auth.uid()) = owner_id
  or exists (
    select 1 from public.tenant_property_access tpa
    where tpa.id = tenant_access_id and tpa.status = 'Active' and tpa.tenant_user_id = (select auth.uid())
  )
);

-- INSERT: only the active tenant on tenant_access_id — never the owner
-- (the owner's own request-logging path is maintenance_requests, a
-- completely separate table/policy, untouched by this migration).
-- Scalar-subquery equalities (not EXISTS-with-bare-column-names) for
-- every column name that also exists on tenant_property_access /
-- property_conversations — see milestone-24's own comment on this
-- exact policy for the full "why," unchanged here. NEW in this file
-- (milestone-24's original design omitted this): also re-checks
-- owner_has_tenant_connect(owner_id), the same downgrade-safety re-check
-- property_messages_insert already does on every write — a tenant
-- request is conversation-backed (it can only exist tied to a
-- 'Maintenance' conversation, enforced below), so if the owner's plan
-- no longer includes Tenant Connect, new requests should stop the same
-- way new messages already do, not just new invites.
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
  and public.owner_has_tenant_connect(owner_id)
);

-- UPDATE: owner only, status (+ auto-maintained updated_at) only —
-- enforced by the trigger below, not just this policy.
drop policy if exists "tenant_requests_update_owner" on public.tenant_requests;
create policy "tenant_requests_update_owner" on public.tenant_requests for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);
-- No DELETE policy — a request is retired via status = 'Resolved', never removed.

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

-- Row-level RLS cannot restrict which COLUMNS an UPDATE touches, so
-- without this trigger an owner UPDATE matching the policy above could
-- rewrite ANY column, including the tenant's original title/
-- description/category, or reassign the request entirely by rewriting
-- its foreign keys. This is the actual enforcement of "owners may only
-- change status" — unchanged from milestone-24's own design.
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

-- ===================================================================
-- SECTION B — tenant-facing views (unchanged from milestone-24's
-- design; re-verified column-for-column against the current leases/
-- properties table shape in supabase/schema.sql)
-- ===================================================================
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

-- Column lists are deliberately minimal — exactly what
-- app/tenant/page.tsx already selects. A tenant querying
-- public.properties/public.leases directly gets zero rows: neither base
-- table has any tenant-facing SELECT policy any more (see below).
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

-- Defensive idempotent cleanup — in case an earlier, different version
-- of a tenant-facing base-table policy was ever separately applied.
-- properties_select_own / leases_select_own (owner-only, pre-existing,
-- untouched) remain the ONLY select policies on the base tables.
drop policy if exists "properties_select_active_tenant" on public.properties;
drop policy if exists "leases_select_active_tenant" on public.leases;

-- ===================================================================
-- SECTION C — Guided Maintenance Intake foundation (M2 compatibility
-- only; NO application code reads or writes either table in M1 — see
-- this file's header). Kept as two separate, append-only-shaped tables
-- rather than columns on tenant_requests itself, so the question-tree
-- content/schema can evolve across many answers per session without
-- ever touching the request row, and so a request's own top-level
-- shape stays exactly what M1's application code already expects.
-- ===================================================================
create table if not exists public.maintenance_intake_sessions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.tenant_requests(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  tenant_access_id uuid not null references public.tenant_property_access(id) on delete restrict,
  tree_version text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  -- 'resolved_in_intake' / 'escalated_urgent' are this file's concrete
  -- answer to the M1 brief's "make room to store... resolved-during-
  -- intake outcome" and "...urgent/safety escalation outcome" — the
  -- session record is where BOTH facts live; tenant_requests.status
  -- itself is deliberately left unchanged (still New/In Progress/
  -- Resolved only) since no M1 code path sets a new status value and
  -- adding one nothing writes yet would be exactly the "prematurely
  -- build" the M1 brief warns against. See
  -- docs/tenant-connect-maintenance-m1-foundation.md for the full
  -- reasoning.
  outcome text check (outcome in ('resolved_in_intake', 'escalated_to_dispatch', 'escalated_urgent', 'abandoned')),
  created_at timestamptz not null default now()
);
create index if not exists maintenance_intake_sessions_request_idx on public.maintenance_intake_sessions(request_id);
create index if not exists maintenance_intake_sessions_owner_idx on public.maintenance_intake_sessions(owner_id);
create index if not exists maintenance_intake_sessions_tenant_access_idx on public.maintenance_intake_sessions(tenant_access_id);

alter table public.maintenance_intake_sessions enable row level security;

drop policy if exists "maintenance_intake_sessions_select" on public.maintenance_intake_sessions;
create policy "maintenance_intake_sessions_select" on public.maintenance_intake_sessions for select to authenticated using (
  (select auth.uid()) = owner_id
  or exists (
    select 1 from public.tenant_property_access tpa
    where tpa.id = tenant_access_id and tpa.status = 'Active' and tpa.tenant_user_id = (select auth.uid())
  )
);

-- INSERT/UPDATE: tenant-only (M2's future intake flow), same
-- forged-FK-rejection shape as tenant_requests_insert_tenant above —
-- request_id must actually belong to a request tied to the caller's own
-- active tenant_access_id, never a different tenant's request.
-- Same owner_has_tenant_connect() re-check as tenant_requests_insert_tenant
-- above, for internal consistency — a session can only ever be created
-- under a request whose owner already has Tenant Connect (since the
-- request itself couldn't have been created otherwise), but re-checking
-- here directly guards against the owner's plan having lapsed between
-- the request's creation and this insert, same downgrade-safety
-- rationale as every other re-check in this file.
drop policy if exists "maintenance_intake_sessions_insert_tenant" on public.maintenance_intake_sessions;
create policy "maintenance_intake_sessions_insert_tenant" on public.maintenance_intake_sessions for insert to authenticated with check (
  owner_id = (select tr.owner_id from public.tenant_requests tr where tr.id = request_id)
  and tenant_access_id = (select tr.tenant_access_id from public.tenant_requests tr where tr.id = request_id)
  and exists (
    select 1 from public.tenant_property_access tpa
    where tpa.id = tenant_access_id and tpa.status = 'Active' and tpa.tenant_user_id = (select auth.uid())
  )
  and public.owner_has_tenant_connect(owner_id)
);

-- UPDATE is intentionally narrow in scope (the caller must still be the
-- session's own active tenant) but NOT column-locked by a trigger the
-- way tenant_requests is — no code writes here yet in M1, so there is
-- no live behavior to lock down. M2 should add an immutable-fields
-- trigger here (locking everything except completed_at/outcome) before
-- shipping the real intake UI — flagged explicitly in
-- docs/tenant-connect-maintenance-m1-foundation.md as required M2
-- hardening, not assumed to be needed defensively today.
drop policy if exists "maintenance_intake_sessions_update_tenant" on public.maintenance_intake_sessions;
create policy "maintenance_intake_sessions_update_tenant" on public.maintenance_intake_sessions for update to authenticated
using (
  exists (
    select 1 from public.tenant_property_access tpa
    where tpa.id = tenant_access_id and tpa.status = 'Active' and tpa.tenant_user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.tenant_property_access tpa
    where tpa.id = tenant_access_id and tpa.status = 'Active' and tpa.tenant_user_id = (select auth.uid())
  )
);
-- No DELETE policy — matches every other retire-never-delete table here.

create table if not exists public.maintenance_intake_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.maintenance_intake_sessions(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  tenant_access_id uuid not null references public.tenant_property_access(id) on delete restrict,
  question_key text not null,
  -- Mirrors the M0 architecture's four-way safety classification exactly
  -- (§6.1/§7 of docs/tenant-connect-maintenance-coordination-m0.md) —
  -- stored per-answer so a future audit of "did we ever ask a tenant to
  -- do something unsafe" is a real, queryable question, not a guess.
  safety_class text not null check (safety_class in ('safe_observation', 'safe_simple_action', 'professional_diagnosis_required', 'urgent_escalation')),
  answer_value jsonb not null default '{}'::jsonb,
  answered_at timestamptz not null default now()
);
create index if not exists maintenance_intake_answers_session_idx on public.maintenance_intake_answers(session_id);
create index if not exists maintenance_intake_answers_owner_idx on public.maintenance_intake_answers(owner_id);

alter table public.maintenance_intake_answers enable row level security;

drop policy if exists "maintenance_intake_answers_select" on public.maintenance_intake_answers;
create policy "maintenance_intake_answers_select" on public.maintenance_intake_answers for select to authenticated using (
  (select auth.uid()) = owner_id
  or exists (
    select 1 from public.tenant_property_access tpa
    where tpa.id = tenant_access_id and tpa.status = 'Active' and tpa.tenant_user_id = (select auth.uid())
  )
);

-- INSERT-only (append-only, no UPDATE/DELETE policy at all) — an
-- answer, once given, is a historical fact; a corrected answer is a NEW
-- row, never an edit. session_id must belong to a session the caller's
-- own active tenant_access_id actually owns.
-- Same re-check, one hop further down the chain (session -> request's
-- owner) — see maintenance_intake_sessions_insert_tenant's comment above.
drop policy if exists "maintenance_intake_answers_insert_tenant" on public.maintenance_intake_answers;
create policy "maintenance_intake_answers_insert_tenant" on public.maintenance_intake_answers for insert to authenticated with check (
  owner_id = (select mis.owner_id from public.maintenance_intake_sessions mis where mis.id = session_id)
  and tenant_access_id = (select mis.tenant_access_id from public.maintenance_intake_sessions mis where mis.id = session_id)
  and exists (
    select 1 from public.tenant_property_access tpa
    where tpa.id = tenant_access_id and tpa.status = 'Active' and tpa.tenant_user_id = (select auth.uid())
  )
  and public.owner_has_tenant_connect(owner_id)
);

-- ===================================================================
-- SECTION D — maintenance audit log (append-only; foundation only,
-- covers exactly the two actions M1 itself re-enables: a tenant
-- submitting a request, an owner changing its status)
-- ===================================================================
-- Same immutability convention as public.ai_usage_events: no
-- INSERT/UPDATE/DELETE policy for `authenticated` AT ALL — RLS denies
-- all three by default with no policy present. Unlike ai_usage_events
-- (which the application itself inserts into after a successful AI
-- call), every row here is written EXCLUSIVELY by the SECURITY DEFINER
-- trigger function below, which runs with the function owner's
-- privileges and so bypasses this table's RLS the same way
-- owner_has_tenant_connect() already does for its own cross-table read.
-- Nobody — not even the request's own owner or tenant — can directly
-- insert, forge, or alter an audit row through the API; every entry is
-- a true, server-derived record of an action that actually happened.
create table if not exists public.maintenance_audit_log (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.tenant_requests(id) on delete cascade,
  actor_kind text not null check (actor_kind in ('landlord', 'tenant', 'system')),
  actor_id uuid,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists maintenance_audit_log_request_idx on public.maintenance_audit_log(request_id, created_at);

alter table public.maintenance_audit_log enable row level security;

drop policy if exists "maintenance_audit_log_select" on public.maintenance_audit_log;
create policy "maintenance_audit_log_select" on public.maintenance_audit_log for select to authenticated using (
  exists (
    select 1 from public.tenant_requests tr
    where tr.id = request_id
      and (
        tr.owner_id = (select auth.uid())
        or exists (
          select 1 from public.tenant_property_access tpa
          where tpa.id = tr.tenant_access_id and tpa.status = 'Active' and tpa.tenant_user_id = (select auth.uid())
        )
      )
  )
);
-- No INSERT/UPDATE/DELETE policy for `authenticated` — see comment above.

create or replace function public.maintenance_audit_log_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    insert into public.maintenance_audit_log (request_id, actor_kind, actor_id, action, detail)
    values (new.id, 'tenant', auth.uid(), 'request_submitted', jsonb_build_object('category', new.category, 'status', new.status));
  elsif TG_OP = 'UPDATE' then
    insert into public.maintenance_audit_log (request_id, actor_kind, actor_id, action, detail)
    values (new.id, 'landlord', auth.uid(), 'status_changed', jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  return new;
end;
$$;

-- AFTER, not BEFORE — this must see the FINAL row (post the
-- tenant_requests_lock_immutable_fields BEFORE UPDATE trigger already
-- having force-restored every locked column), so an audit row can never
-- record a value the database itself then overwrote.
drop trigger if exists tenant_requests_write_audit_log on public.tenant_requests;
create trigger tenant_requests_write_audit_log
  after insert or update on public.tenant_requests
  for each row
  execute function public.maintenance_audit_log_write();

-- ===================================================================
-- SECTION E — owner_has_tenant_connect() plan-list fix (pre-existing,
-- currently-live production bug, discovered during this milestone's own
-- hands-on RLS verification — NOT part of the tenant_requests gap this
-- migration otherwise exists to close)
-- ===================================================================
-- FINDING: public.owner_has_tenant_connect(uuid) (defined at Milestone
-- 10, presumed live in production since that table/policy set predates
-- the tenant_requests gap entirely) only recognizes the LEGACY plan
-- names ('portfolio', 'portfolio_pro', 'owner'). lib/billing/
-- entitlements.ts's TENANT_CONNECT_ENABLED map — the single TypeScript
-- source of truth this SQL function is supposed to mirror exactly (see
-- its own Milestone 10 header comment) — has since been extended to
-- also grant Tenant Connect to the CURRENT Launch Pricing top-tier plan
-- names, 'manage' and 'automate'. The TS map was updated when those
-- plans were introduced; this SQL function was not.
--
-- IMPACT (real, today, independent of this migration): a landlord on
-- the current, live "Manage" or "Automate" plan sees Tenant Connect
-- enabled in the UI (the frontend gate reads entitlementsFor(), which is
-- correct) — but every actual database write gated by
-- owner_has_tenant_connect() is silently rejected by RLS:
-- tenant_access_insert_owner (inviting a tenant),
-- property_conversations_insert (starting a conversation),
-- property_messages_insert (posting a message). A Manage/Automate-plan
-- owner today cannot actually use Tenant Connect at all, despite the app
-- telling them they can.
--
-- HOW THIS WAS FOUND: supabase/tests/milestone-25-rls.test.sql's own
-- fixture deliberately uses plan = 'manage' (the real, current plan)
-- rather than copying milestone-24-rls.test.sql's fixture, which
-- happens to use the legacy 'portfolio' value — masking this exact bug.
-- Running the new test against a real local Postgres instance (loaded
-- from the full supabase/schema.sql) reproduced the failure directly:
-- "new row violates row-level security policy for table
-- property_conversations" on a plan the application itself already
-- treats as fully entitled.
--
-- WHY THIS BELONGS IN THIS MIGRATION, NOT A SEPARATE ONE: this is a
-- one-line CREATE OR REPLACE FUNCTION correcting an already-live
-- function to match an already-live, unchanged TS map — it grants
-- nothing new (Manage/Automate owners are already told, and already
-- billed, as Tenant Connect-entitled by the existing TS layer; this
-- only makes the database agree). It is not a new entitlement, not a
-- new paid plan, and not new M1 scope — it is exactly the "reuse the
-- existing Tenant Connect entitlement/gating architecture unless the
-- audit demonstrates a concrete technical reason not to" case the M1
-- brief itself anticipates, with the concrete technical reason being a
-- reproducible, currently-live RLS test failure. Fixing it here (rather
-- than filing it for a separate, later milestone) also lets Section A's
-- new owner_has_tenant_connect() re-checks be verified against correct
-- behavior in the same test run, instead of verifying against a
-- function already known to be wrong.
create or replace function public.owner_has_tenant_connect(p_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_subscriptions us
    where us.owner_id = p_owner_id
      and us.status in ('active', 'trialing', 'past_due')
      and us.plan in ('portfolio', 'portfolio_pro', 'owner', 'manage', 'automate')
  );
$$;
