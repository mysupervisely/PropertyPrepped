-- PropRoster Milestone 26 — Tenant Connect + Maintenance Coordination,
-- M1.1: Canonical maintenance case + safe production integration.
--
-- NOT YET APPLIED TO PRODUCTION as of this file's authoring — see
-- docs/tenant-connect-maintenance-m1-foundation.md's M1.1 addendum for
-- the full decision record, migration safety review, and the exact
-- deployment sequence this file assumes (short version: apply together
-- with milestone-25-maintenance-coordination-foundation.sql, in the
-- same operation — see "DEPLOYMENT SEQUENCING" below for why).
--
-- ===================================================================
-- PRODUCT-OWNER DECISION THIS FILE IMPLEMENTS
-- ===================================================================
-- M1 left public.maintenance_requests (Milestone 6, landlord-logged,
-- may hold real production rows) and public.tenant_requests
-- (Milestone 25/M1, tenant-submitted, zero production rows) as two
-- separate canonical concepts, explicitly flagged as a pending
-- product-owner decision. That decision has now been made: a broken
-- AC is ONE maintenance case regardless of who reported it. The
-- SOURCE of a request is metadata, not a reason to run two permanent
-- maintenance coordination engines.
--
-- CHOSEN ARCHITECTURE (repository-audit-driven, not naming
-- preference): public.maintenance_requests becomes the single
-- canonical maintenance case. It already has everything a "case"
-- needs to anchor future work — a priority field, a
-- Submitted/Scheduled/In Progress/Completed lifecycle, and (since
-- Milestone 11) assigned_contact_id, a nullable FK to
-- public.property_contacts (PropCrew) that is EXACTLY the future
-- provider-assignment hook this architecture needs and already
-- exists, unused, waiting for this. public.tenant_requests becomes
-- the tenant's own intake/submission record — the tenant-safe,
-- conversation-backed, immutable-after-insert artifact of what a
-- tenant actually reported — linked 1:1 to the canonical case it
-- creates. This is the exact "acceptable and likely preferable"
-- transitional shape the M1.1 brief itself described, confirmed (not
-- assumed) by this audit.
--
-- No third maintenance entity was introduced. No giant unified table
-- was built. No giant status enum was built — tenant_requests.status
-- (tenant-facing: New/In Progress/Resolved) and maintenance_requests
-- .status (case lifecycle: Submitted/Scheduled/In Progress/Completed)
-- remain two separate, narrow state machines, per M0's own principle,
-- re-affirmed by this milestone's brief. Whether/how they should ever
-- sync (e.g. a case marked Completed flips the tenant's own request to
-- Resolved) is an open product question for whichever milestone builds
-- the landlord-review experience — not decided or implemented here.
--
-- ===================================================================
-- WHY MAINTENANCE_REQUESTS, NOT TENANT_REQUESTS, IS THE CASE
-- ===================================================================
-- This was determined from repository evidence, not preference:
--   1. maintenance_requests already carries a real case lifecycle
--      (priority, a 4-state status machine) that predates this
--      milestone and is already read/written by the landlord
--      dashboard (app/page.tsx) today.
--   2. maintenance_requests.assigned_contact_id (Milestone 11) is
--      already a live, working FK to property_contacts (PropCrew) —
--      the exact "future provider assignment" anchor this milestone's
--      brief asks about. tenant_requests has no equivalent, and adding
--      one there would duplicate what already exists here.
--   3. maintenance_requests may already hold real production data (it
--      has been live since Milestone 6); tenant_requests has zero rows
--      anywhere. Making the already-populated, already-featured table
--      canonical, and pointing the empty new table AT it, is strictly
--      lower-risk than the reverse.
--   4. The landlord's EXISTING maintenance list/UI (app/page.tsx)
--      already queries every maintenance_requests row it owns. Once a
--      tenant-originated case is a real maintenance_requests row, it
--      appears in that existing list automatically — zero new landlord
--      UI required in this milestone, and the "landlord retains the
--      full maintenance record" requirement is satisfied by
--      construction, not by anything built here.
--
-- ===================================================================
-- HOW A TENANT SUBMISSION BECOMES A CANONICAL CASE
-- ===================================================================
-- tenant_requests gains a new maintenance_request_id column, set
-- EXCLUSIVELY by a new BEFORE INSERT trigger
-- (tenant_requests_create_maintenance_case, Section C below) — never
-- client-supplied, never editable after insert (locked by the same
-- immutable-fields trigger milestone-25 already established, extended
-- here to cover this column too). The trigger creates exactly one new
-- maintenance_requests row (source = 'tenant', tenant_name/tenant_email
-- derived server-side from the caller's own active tenancy — never
-- client-supplied) in the SAME transaction as the tenant_requests
-- insert, which is what makes this transactional/race-safe: a single
-- client INSERT statement either produces one tenant_requests row with
-- a guaranteed, real, freshly-created maintenance_requests row behind
-- it, or the whole statement fails and neither exists. There is no
-- separate RPC, no multi-step client sequencing, and no way for two
-- maintenance_requests rows to ever result from one tenant submission
-- (the trigger fires exactly once per INSERT statement; the FK plus a
-- unique index on tenant_requests.maintenance_request_id make a
-- duplicate physically impossible, not just discouraged).
--
-- The tenant NEVER gets an INSERT/SELECT/UPDATE policy on
-- maintenance_requests itself — they never touch that table directly,
-- at any privilege level. Every tenant-driven write to it happens
-- exclusively inside this SECURITY DEFINER trigger, which is the same
-- privilege-boundary pattern milestone-25's maintenance_audit_log
-- already established (a client can request the effect but never
-- perform the write itself). This is what keeps landlord-only
-- maintenance_requests columns (there are none today, but the pattern
-- generalizes to anything added later) safe from tenant access by
-- construction, not by convention.
--
-- ===================================================================
-- WHERE FUTURE CONCEPTS ATTACH (documented now, none built here)
-- ===================================================================
-- Anchored to the canonical case (maintenance_requests.id), because
-- these are lifecycle concerns independent of who reported the issue:
--   - future provider assignment: maintenance_requests.assigned_contact_id
--     (already exists, Milestone 11 — nothing to add)
--   - future appointments, quotes, owner authorizations, Service
--     Thread provider-participation events: each its own future table
--     with a maintenance_request_id FK to this table — never columns
--     bolted onto maintenance_requests itself, and never one shared
--     status enum across them (M0's principle, unchanged)
--   - future maintenance history: public.maintenance_records already
--     exists (Milestone 6) as the property's durable, completed-service
--     ledger — a separate, already-built concept from the active case.
--     The M1 documentation's "(A) vs (B)" question (should closure
--     generate/reference a separate durable record) is answered by
--     this existing table's mere existence: (B) — closure of a
--     maintenance_requests case should eventually generate/reference a
--     maintenance_records row, not treat the case row itself as the
--     permanent historical artifact. Not implemented here — no code
--     writes that linkage yet, and maintenance_records gains no new
--     column in this file — flagged for whichever milestone actually
--     builds request-closure behavior.
--
-- Anchored to the tenant's OWN intake record (tenant_requests.id),
-- because these are source-specific, tenant-only concepts a
-- landlord-reported case will never have:
--   - guided-intake sessions/answers: already anchored here
--     (public.maintenance_intake_sessions.request_id, Milestone 25 —
--     unchanged by this file)
--   - future tenant-provided availability (maintenance_access_windows,
--     still not created — no structural need yet, same reasoning as
--     M1): should key off tenant_requests.id / tenant_access_id when
--     it's eventually built, reachable from the case only transitively
--     through tenant_requests.maintenance_request_id, exactly like
--     guided intake already is.
--
-- ===================================================================
-- REVISION HISTORY (this file)
-- ===================================================================
-- v1 (this version): initial M1.1 canonical-case integration, additive
-- on top of milestone-25-maintenance-coordination-foundation.sql (which
-- itself remains unmodified by this file).
--
-- ===================================================================
-- ROLLBACK
-- ===================================================================
-- Run, in this order (safe even if only some of the below was applied):
--   drop trigger if exists tenant_requests_lock_immutable_fields on public.tenant_requests;
--   -- then re-apply milestone-25's ORIGINAL tenant_requests_lock_immutable_fields()
--   -- body (without the maintenance_request_id line) and re-create the trigger,
--   -- OR simply leave Section D's replacement applied — it is a strict
--   -- superset of the original (locks one more column) and is safe to
--   -- keep even if Sections A-C are rolled back, AS LONG AS the column
--   -- it references still exists. If dropping the column (below), drop
--   -- this trigger/function replacement FIRST.
--   drop trigger if exists tenant_requests_create_maintenance_case on public.tenant_requests;
--   drop function if exists public.tenant_requests_create_maintenance_case();
--   drop index if exists tenant_requests_maintenance_request_unique;
--   alter table public.tenant_requests drop column if exists maintenance_request_id;
--   drop policy if exists "maintenance_requests_insert_own" on public.maintenance_requests;
--   -- then re-create it with the original with-check (owner_id = auth.uid() only),
--   -- OR leave it — the added "and source = 'landlord'" clause is a strict
--   -- narrowing that only rejects a hand-crafted client insert explicitly
--   -- claiming source='tenant', which no shipped UI ever sends.
--   alter table public.maintenance_requests drop column if exists source;
-- This does not touch tenant_requests, property_conversations,
-- property_messages, property_contacts, property_contact_links, or any
-- pre-existing maintenance_requests row — no column added here is
-- removed from any row, and no existing column's meaning changes.

-- ===================================================================
-- SECTION A — maintenance_requests: request origin/source
-- ===================================================================
-- Additive, NOT NULL with a default — every existing production row
-- (all landlord-logged, since tenant_requests never existed until this
-- migration pair) is automatically and correctly backfilled to
-- 'landlord' by the column default itself; no UPDATE statement touches
-- any existing row's data.
alter table public.maintenance_requests add column if not exists source text not null default 'landlord';

-- Idempotent correction pattern, matching every other CHECK constraint
-- in this schema. Deliberately narrow (tenant/landlord only) — no
-- speculative 'provider'/'system' value added ahead of an actual
-- feature that would set it (Milestone 5's provider work, not this
-- one). Widening this CHECK later is a compatible, additive change.
alter table public.maintenance_requests drop constraint if exists maintenance_requests_source_check;
alter table public.maintenance_requests add constraint maintenance_requests_source_check
  check (source in ('tenant', 'landlord'));

create index if not exists maintenance_requests_source_idx on public.maintenance_requests(source);

-- Defense-in-depth narrowing of the EXISTING owner-insert policy: a
-- direct client insert (the landlord's own "log a request" form,
-- app/page.tsx) may only ever create a 'landlord'-sourced row. The only
-- path that can ever produce a 'tenant'-sourced row is
-- tenant_requests_create_maintenance_case() below, a SECURITY DEFINER
-- trigger function whose internal insert bypasses this policy
-- entirely (the same privilege boundary every other SECURITY DEFINER
-- writer in this schema relies on) — so this change cannot break that
-- path, and cannot affect any existing caller, since no shipped UI has
-- ever sent an explicit `source` value (the column didn't exist before
-- this file).
drop policy if exists "maintenance_requests_insert_own" on public.maintenance_requests;
create policy "maintenance_requests_insert_own" on public.maintenance_requests for insert to authenticated with check (
  (select auth.uid()) = owner_id
  and source = 'landlord'
);

-- ===================================================================
-- SECTION B — tenant_requests: link to its canonical case
-- ===================================================================
-- Deliberately NULLABLE at the DB level, despite being logically
-- required for every row inserted through the normal path (Section C's
-- trigger always sets it). This is a conservative deployment-safety
-- choice, not an oversight: if this file is ever applied some time
-- after milestone-25 rather than in the same operation (see
-- "DEPLOYMENT SEQUENCING" in this file's header), any tenant_requests
-- row created in that gap would predate this column's trigger and
-- would otherwise make a NOT NULL constraint fail the whole migration.
-- A UNIQUE index (below) still fully prevents two tenant_requests rows
-- from ever sharing one case — Postgres unique indexes permit multiple
-- NULLs, so that guarantee holds regardless.
alter table public.tenant_requests add column if not exists maintenance_request_id uuid references public.maintenance_requests(id) on delete restrict;
-- on delete restrict (not cascade/set null), matching this table's own
-- established pattern for its other FKs: a landlord cannot silently
-- orphan a tenant's own submission record by deleting the linked case
-- via the pre-existing maintenance_requests_delete_own policy. A
-- purely landlord-logged case (no linked tenant_requests row) remains
-- exactly as deletable as it always was — this only ever restricts
-- deletion of a case that a tenant's own history still points to.

create unique index if not exists tenant_requests_maintenance_request_unique on public.tenant_requests(maintenance_request_id);
create index if not exists tenant_requests_maintenance_request_idx on public.tenant_requests(maintenance_request_id);

-- ===================================================================
-- SECTION C — the linkage trigger
-- ===================================================================
-- SECURITY DEFINER so it can write into maintenance_requests on the
-- tenant's behalf without ever granting the tenant their own policy on
-- that table — same privilege-boundary pattern as
-- maintenance_audit_log_write() (Milestone 25) and
-- is_active_tenant_of_property()/accept_tenant_invite() (Milestone 10).
-- BEFORE INSERT (not AFTER) specifically so it can set
-- NEW.maintenance_request_id and have that value actually persist as
-- part of the SAME row/statement — no follow-up UPDATE, no window
-- where a tenant_requests row exists without its case.
--
-- tenant_name/tenant_email are derived here, server-side, from the
-- caller's own active tenant_property_access row (already re-verified
-- by tenant_requests_insert_tenant's WITH CHECK before this trigger
-- ever runs) — never taken from client input, so a tenant can never
-- spoof another tenant's name/email into a maintenance_requests row.
create or replace function public.tenant_requests_create_maintenance_case()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_name text;
  v_tenant_email text;
  v_case_id uuid;
begin
  select tpa.tenant_email, coalesce(l.tenant_name, tpa.tenant_email)
    into v_tenant_email, v_tenant_name
  from public.tenant_property_access tpa
  left join public.leases l on l.id = tpa.lease_id
  where tpa.id = new.tenant_access_id;

  insert into public.maintenance_requests (
    property_id, owner_id, tenant_name, tenant_email, title, description, priority, status, source
  ) values (
    new.property_id, new.owner_id, v_tenant_name, v_tenant_email, new.title, new.description, 'Normal', 'Submitted', 'tenant'
  )
  returning id into v_case_id;

  new.maintenance_request_id := v_case_id;
  return new;
end;
$$;

drop trigger if exists tenant_requests_create_maintenance_case on public.tenant_requests;
create trigger tenant_requests_create_maintenance_case
  before insert on public.tenant_requests
  for each row
  execute function public.tenant_requests_create_maintenance_case();

-- ===================================================================
-- SECTION D — lock the new link column the same way every other
-- tenant-authored field on tenant_requests is already locked
-- ===================================================================
-- create or replace of milestone-25's own function — a strict superset
-- (one more column force-restored on UPDATE), same body otherwise.
-- Without this, an owner's status-only UPDATE (permitted by
-- tenant_requests_update_owner) could otherwise repoint a request at a
-- different maintenance_requests row, since RLS alone cannot restrict
-- which columns an UPDATE touches.
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
  new.maintenance_request_id := old.maintenance_request_id;
  return new;
end;
$$;
-- Trigger itself is unchanged (still fires before update, same
-- function name) — no drop/re-create needed for the trigger object,
-- only the function body, which create or replace already updated.
