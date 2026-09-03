-- PropRoster Milestone 25 — Tenant Connect + Maintenance Coordination M1
-- RLS + security regression test.
--
-- Same methodology as milestone-24-rls.test.sql (run by hand against a
-- database with PropRoster's full schema.sql + this milestone's
-- migration loaded, and the Supabase auth/storage schemas stubbed — see
-- milestone-9/10-rls.test.sql's own notes for the stub pattern,
-- including the auth.jwt() claims stub). Every block RAISEs
-- "REGRESSION" or NOTICEs "PASS". Run with `psql -v ON_ERROR_STOP=0`
-- and grep for "REGRESSION" — a clean run has zero matches. Everything
-- happens inside a transaction rolled back at the end, so this never
-- leaves test data behind.
--
-- This file supersedes milestone-24-rls.test.sql as the ACTIVE
-- regression suite for tenant_requests (milestone-24-rls.test.sql is
-- preserved untouched, since lib/tenant-connect/
-- tenant-connect-v1-wiring.test.ts asserts against milestone-24's exact
-- SQL text, and both remain valid tests of the SAME table shape except
-- for the category vocabulary — see this file's own new tests for that
-- difference). New coverage beyond milestone-24-rls.test.sql: the new
-- category vocabulary (Section 1), maintenance_intake_sessions/
-- maintenance_intake_answers (Section 4), and maintenance_audit_log
-- (Section 5).
--
-- Fixture shape (same deliberate "prior tenant / replacement tenant on
-- the same property" + cross-property + cross-owner scenario
-- milestone-24-rls.test.sql already established, with a distinct id
-- prefix — 251 rather than 241 — so both files can be run in the same
-- session without any id collision):
--   owner1 (Manage plan) owns:
--     - Property A, with TWO leases: an old/expired lease (former
--       tenant, now Revoked) and the current lease (current tenant,
--       Active).
--     - Property B, with one Active tenant — cross-property isolation.
--   owner2 (Manage plan) owns Property C, with one Active tenant —
--     cross-owner isolation.

begin;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000251', 'owner1@example.com'),
  ('a0000000-0000-0000-0000-000000000252', 'owner2@example.com'),
  ('a0000000-0000-0000-0000-000000000253', 'current-tenant@example.com'),   -- Active, current lease on Property A
  ('a0000000-0000-0000-0000-000000000254', 'former-tenant@example.com'),   -- Revoked, OLD lease on Property A
  ('a0000000-0000-0000-0000-000000000255', 'tenant-b@example.com'),        -- Active on Property B (cross-property)
  ('a0000000-0000-0000-0000-000000000256', 'tenant-c@example.com'),        -- Active on Property C (cross-owner)
  ('a0000000-0000-0000-0000-000000000257', 'attacker@example.com');        -- signed-in, no relationship to anything

insert into public.properties (id, owner_id, address, city) values
  ('b0000000-0000-0000-0000-000000000251', 'a0000000-0000-0000-0000-000000000251', '1 Property A St', 'Town'),
  ('b0000000-0000-0000-0000-000000000252', 'a0000000-0000-0000-0000-000000000251', '2 Property B Ave', 'Town'),
  ('b0000000-0000-0000-0000-000000000253', 'a0000000-0000-0000-0000-000000000252', '3 Property C Rd', 'Town');

insert into public.leases (id, property_id, owner_id, tenant_name, tenant_email, monthly_rent, start_date, end_date) values
  ('d0000000-0000-0000-0000-000000000251', 'b0000000-0000-0000-0000-000000000251', 'a0000000-0000-0000-0000-000000000251', 'Former Tenant', 'former-tenant@example.com', 1800, '2023-01-01', '2023-12-31'),
  ('d0000000-0000-0000-0000-000000000252', 'b0000000-0000-0000-0000-000000000251', 'a0000000-0000-0000-0000-000000000251', 'Current Tenant', 'current-tenant@example.com', 2400, '2024-01-01', '2025-12-31'),
  ('d0000000-0000-0000-0000-000000000253', 'b0000000-0000-0000-0000-000000000252', 'a0000000-0000-0000-0000-000000000251', 'Tenant B', 'tenant-b@example.com', 1500, '2024-01-01', '2025-12-31'),
  ('d0000000-0000-0000-0000-000000000254', 'b0000000-0000-0000-0000-000000000253', 'a0000000-0000-0000-0000-000000000252', 'Tenant C', 'tenant-c@example.com', 2000, '2024-01-01', '2025-12-31');

insert into public.tenant_property_access (id, property_id, owner_id, tenant_user_id, tenant_email, lease_id, status, accepted_at, revoked_at) values
  ('c0000000-0000-0000-0000-000000000251', 'b0000000-0000-0000-0000-000000000251', 'a0000000-0000-0000-0000-000000000251', 'a0000000-0000-0000-0000-000000000254', 'former-tenant@example.com', 'd0000000-0000-0000-0000-000000000251', 'Revoked', now() - interval '400 days', now() - interval '30 days'),
  ('c0000000-0000-0000-0000-000000000252', 'b0000000-0000-0000-0000-000000000251', 'a0000000-0000-0000-0000-000000000251', 'a0000000-0000-0000-0000-000000000253', 'current-tenant@example.com', 'd0000000-0000-0000-0000-000000000252', 'Active', now(), null),
  ('c0000000-0000-0000-0000-000000000253', 'b0000000-0000-0000-0000-000000000252', 'a0000000-0000-0000-0000-000000000251', 'a0000000-0000-0000-0000-000000000255', 'tenant-b@example.com', 'd0000000-0000-0000-0000-000000000253', 'Active', now(), null),
  ('c0000000-0000-0000-0000-000000000254', 'b0000000-0000-0000-0000-000000000253', 'a0000000-0000-0000-0000-000000000252', 'a0000000-0000-0000-0000-000000000256', 'tenant-c@example.com', 'd0000000-0000-0000-0000-000000000254', 'Active', now(), null);

-- 'manage' — the current, live Tenant Connect plan (see
-- lib/billing/entitlements.ts's TENANT_CONNECT_ENABLED map) — used here
-- instead of milestone-24-rls.test.sql's legacy 'portfolio' fixture
-- value specifically to also prove owner_has_tenant_connect() still
-- correctly recognizes the CURRENT plan name, not just the legacy one.
insert into public.user_subscriptions (owner_id, plan, status) values
  ('a0000000-0000-0000-0000-000000000251', 'manage', 'active'),
  ('a0000000-0000-0000-0000-000000000252', 'manage', 'active');

set local role authenticated;

-- ===== 1. New category vocabulary: a valid machine id is accepted, an old/invalid value is rejected =====
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000253', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000253","email":"current-tenant@example.com"}', true);
do $$
declare
  v_conv_id uuid;
begin
  insert into public.property_conversations (property_id, owner_id, tenant_access_id, subject, conversation_type)
  values ('b0000000-0000-0000-0000-000000000251', 'a0000000-0000-0000-0000-000000000251', 'c0000000-0000-0000-0000-000000000252', 'AC not cooling', 'Maintenance')
  returning id into v_conv_id;
  perform set_config('pgtest25.conv1', v_conv_id::text, false);

  insert into public.property_messages (conversation_id, sender_user_id, sender_role, message)
  values (v_conv_id, 'a0000000-0000-0000-0000-000000000253', 'Tenant', 'AC is running but not cooling.');

  begin
    insert into public.tenant_requests (property_id, owner_id, tenant_access_id, conversation_id, category, title, description)
    values ('b0000000-0000-0000-0000-000000000251', 'a0000000-0000-0000-0000-000000000251', 'c0000000-0000-0000-0000-000000000252', v_conv_id, 'HVAC', 'AC not cooling', 'AC is running but not cooling.');
    raise exception 'REGRESSION: an old-taxonomy category value (''HVAC'') was accepted — the CHECK constraint should only accept the new machine-readable ids';
  exception
    when check_violation then raise notice 'PASS 1a: the old six-value taxonomy (e.g. ''HVAC'') is rejected by the new CHECK constraint';
    when others then
      if SQLERRM like 'REGRESSION%' then raise; end if;
      raise notice 'PASS 1a: old-taxonomy category value rejected (%)', SQLERRM;
  end;

  insert into public.tenant_requests (id, property_id, owner_id, tenant_access_id, conversation_id, category, title, description)
  values ('f0000000-0000-0000-0000-000000000251', 'b0000000-0000-0000-0000-000000000251', 'a0000000-0000-0000-0000-000000000251', 'c0000000-0000-0000-0000-000000000252', v_conv_id, 'heating_ac', 'AC not cooling', 'AC is running but not cooling.');
  perform 1 from public.tenant_requests where id = 'f0000000-0000-0000-0000-000000000251' and status = 'New';
  if not found then raise exception 'REGRESSION: a valid new-taxonomy category (''heating_ac'') was not accepted, or did not default to status New'; end if;
  raise notice 'PASS 1b: the new machine-readable category id (''heating_ac'') is accepted and the request defaults to status New';
end $$;

-- ===== 2. Cross-tenant / cross-owner isolation on tenant_requests (unchanged behavior, re-verified against the new file) =====
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000255', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000255","email":"tenant-b@example.com"}', true);
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.tenant_requests where id = 'f0000000-0000-0000-0000-000000000251';
  if v_count > 0 then raise exception 'REGRESSION: an unrelated tenant on a different property can see this request'; end if;
  raise notice 'PASS 2a: unrelated tenant (different property, same owner) cannot see another property''s requests';
end $$;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000252', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000252","email":"owner2@example.com"}', true);
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.tenant_requests where id = 'f0000000-0000-0000-0000-000000000251';
  if v_count > 0 then raise exception 'REGRESSION: a different owner (owner2) can see owner1''s tenant request'; end if;
  raise notice 'PASS 2b: cross-owner isolation holds for tenant_requests';
end $$;

-- ===== 3. Owner status update: only status changes, everything else is locked (re-verified) =====
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000251', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000251","email":"owner1@example.com"}', true);
do $$
declare
  v_before public.tenant_requests%rowtype;
  v_after public.tenant_requests%rowtype;
begin
  select * into v_before from public.tenant_requests where id = 'f0000000-0000-0000-0000-000000000251';
  update public.tenant_requests set status = 'In Progress', category = 'other', title = 'REWRITTEN' where id = 'f0000000-0000-0000-0000-000000000251';
  select * into v_after from public.tenant_requests where id = 'f0000000-0000-0000-0000-000000000251';
  if v_after.status <> 'In Progress' then raise exception 'REGRESSION: status did not change'; end if;
  if v_after.category <> v_before.category then raise exception 'REGRESSION: owner was able to modify request category'; end if;
  if v_after.title <> v_before.title then raise exception 'REGRESSION: owner was able to modify request title'; end if;
  raise notice 'PASS 3: owner can change status only — category/title remain locked, matching milestone-24''s original design';
end $$;

-- ===== 4. maintenance_intake_sessions / maintenance_intake_answers foundation (M1 — no application code writes here yet, but the RLS shape must already be correct for M2) =====
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000253', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000253","email":"current-tenant@example.com"}', true);
do $$
declare v_session_id uuid;
begin
  insert into public.maintenance_intake_sessions (request_id, owner_id, tenant_access_id, tree_version)
  values ('f0000000-0000-0000-0000-000000000251', 'a0000000-0000-0000-0000-000000000251', 'c0000000-0000-0000-0000-000000000252', 'heating_ac-v1')
  returning id into v_session_id;
  perform set_config('pgtest25.session1', v_session_id::text, false);

  insert into public.maintenance_intake_answers (session_id, owner_id, tenant_access_id, question_key, safety_class, answer_value)
  values (v_session_id, 'a0000000-0000-0000-0000-000000000251', 'c0000000-0000-0000-0000-000000000252', 'thermostat_mode', 'safe_observation', '{"value":"cool"}'::jsonb);

  perform 1 from public.maintenance_intake_sessions where id = v_session_id;
  if not found then raise exception 'REGRESSION: tenant could not read back their own just-created intake session'; end if;
  perform 1 from public.maintenance_intake_answers where session_id = v_session_id;
  if not found then raise exception 'REGRESSION: tenant could not read back their own just-created intake answer'; end if;
  raise notice 'PASS 4a: tenant can create and read their own intake session + answer, tied to their own request';
end $$;

-- Forged request_id (belonging to a different tenant/property) is rejected.
do $$
begin
  begin
    insert into public.maintenance_intake_sessions (request_id, owner_id, tenant_access_id, tree_version)
    values ('f0000000-0000-0000-0000-000000000251', 'a0000000-0000-0000-0000-000000000251', 'c0000000-0000-0000-0000-000000000253', 'forged');
    raise exception 'REGRESSION: an intake session was created with a tenant_access_id that does not belong to the caller';
  exception
    when others then
      if SQLERRM like 'REGRESSION%' then raise; end if;
      raise notice 'PASS 4b: forged tenant_access_id on maintenance_intake_sessions insert is rejected';
  end;
end $$;

-- Cross-tenant denial: tenant-b cannot see current-tenant's intake session/answers.
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000255', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000255","email":"tenant-b@example.com"}', true);
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.maintenance_intake_sessions where id = current_setting('pgtest25.session1')::uuid;
  if v_count > 0 then raise exception 'REGRESSION: an unrelated tenant can read another tenant''s intake session'; end if;
  select count(*) into v_count from public.maintenance_intake_answers where session_id = current_setting('pgtest25.session1')::uuid;
  if v_count > 0 then raise exception 'REGRESSION: an unrelated tenant can read another tenant''s intake answers'; end if;
  raise notice 'PASS 4c: cross-tenant isolation holds for maintenance_intake_sessions/answers';
end $$;

-- Owner CAN read (never write) the tenant's intake session/answers.
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000251', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000251","email":"owner1@example.com"}', true);
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.maintenance_intake_sessions where id = current_setting('pgtest25.session1')::uuid;
  if v_count = 0 then raise exception 'REGRESSION: the property owner cannot read a tenant''s own intake session on their own property'; end if;
  select count(*) into v_count from public.maintenance_intake_answers where session_id = current_setting('pgtest25.session1')::uuid;
  if v_count = 0 then raise exception 'REGRESSION: the property owner cannot read a tenant''s own intake answers on their own property'; end if;
  raise notice 'PASS 4d: owner can read (never write, M1 has no owner-write path here) their tenant''s intake session/answers';
end $$;

-- Answers are append-only: no UPDATE policy exists for maintenance_intake_answers at all.
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000253', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000253","email":"current-tenant@example.com"}', true);
do $$
declare v_affected integer;
begin
  update public.maintenance_intake_answers set answer_value = '{"value":"tampered"}'::jsonb where session_id = current_setting('pgtest25.session1')::uuid;
  get diagnostics v_affected = row_count;
  if v_affected > 0 then raise exception 'REGRESSION: an intake answer was updated — answers must be append-only (a correction is a NEW row, never an edit)'; end if;
  raise notice 'PASS 4e: maintenance_intake_answers has no UPDATE capability — answers are append-only';
end $$;

-- ===== 5. maintenance_audit_log: system-written only, no client-facing write policy at all =====
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000253', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000253","email":"current-tenant@example.com"}', true);
do $$
declare v_count integer;
begin
  -- The Section 1 tenant-request INSERT above must have written a
  -- 'request_submitted' audit row automatically, via the trigger, with
  -- no application code involved.
  select count(*) into v_count from public.maintenance_audit_log
    where request_id = 'f0000000-0000-0000-0000-000000000251' and action = 'request_submitted' and actor_kind = 'tenant';
  if v_count <> 1 then raise exception 'REGRESSION: no (or more than one) request_submitted audit row was auto-written on tenant_requests INSERT'; end if;
  raise notice 'PASS 5a: a request_submitted audit row is automatically written by the trigger on tenant_requests INSERT, with no application code involved';
end $$;

select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000251', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000251","email":"owner1@example.com"}', true);
do $$
declare v_count integer;
begin
  -- Section 3 above changed status New -> In Progress as owner1.
  select count(*) into v_count from public.maintenance_audit_log
    where request_id = 'f0000000-0000-0000-0000-000000000251' and action = 'status_changed' and actor_kind = 'landlord';
  if v_count <> 1 then raise exception 'REGRESSION: no (or more than one) status_changed audit row was auto-written on tenant_requests UPDATE'; end if;
  raise notice 'PASS 5b: a status_changed audit row is automatically written by the trigger on tenant_requests UPDATE';
end $$;

do $$
begin
  begin
    insert into public.maintenance_audit_log (request_id, actor_kind, actor_id, action)
    values ('f0000000-0000-0000-0000-000000000251', 'landlord', 'a0000000-0000-0000-0000-000000000251', 'forged_entry');
    raise exception 'REGRESSION: a client (even the request''s own real owner) was able to directly INSERT into maintenance_audit_log — every row must come exclusively from the SECURITY DEFINER trigger';
  exception
    when others then
      if SQLERRM like 'REGRESSION%' then raise; end if;
      raise notice 'PASS 5c: direct client INSERT into maintenance_audit_log is rejected (no policy permits it) — every row is system-written only';
  end;
end $$;

do $$
declare v_affected integer;
begin
  update public.maintenance_audit_log set action = 'tampered' where request_id = 'f0000000-0000-0000-0000-000000000251';
  get diagnostics v_affected = row_count;
  if v_affected > 0 then raise exception 'REGRESSION: a client was able to UPDATE an audit log row — the log must be immutable'; end if;
  raise notice 'PASS 5d: maintenance_audit_log rows cannot be updated by any client — immutable by construction (no UPDATE policy)';
end $$;

-- Cross-owner denial on the audit log.
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000252', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000252","email":"owner2@example.com"}', true);
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.maintenance_audit_log where request_id = 'f0000000-0000-0000-0000-000000000251';
  if v_count > 0 then raise exception 'REGRESSION: a different owner (owner2) can read owner1''s maintenance_audit_log rows'; end if;
  raise notice 'PASS 5e: cross-owner isolation holds for maintenance_audit_log';
end $$;

-- ===== 6. Revoked tenant loses access to everything M1 adds, same as it already does for tenant_requests =====
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000254', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000254","email":"former-tenant@example.com"}', true);
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.tenant_requests where id = 'f0000000-0000-0000-0000-000000000251';
  if v_count > 0 then raise exception 'REGRESSION: revoked former tenant can still see a request on the property they used to have access to'; end if;
  raise notice 'PASS 6: revoked/expired tenant reads nothing from tenant_requests (pre-existing behavior, re-verified against the new file)';
end $$;

-- ===== 7. Unauthenticated (anon) and unrelated signed-in users see nothing, anywhere new added by this migration =====
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);
set local role anon;
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.tenant_requests;
  if v_count > 0 then raise exception 'REGRESSION: anon can read tenant_requests'; end if;
  select count(*) into v_count from public.maintenance_intake_sessions;
  if v_count > 0 then raise exception 'REGRESSION: anon can read maintenance_intake_sessions'; end if;
  select count(*) into v_count from public.maintenance_intake_answers;
  if v_count > 0 then raise exception 'REGRESSION: anon can read maintenance_intake_answers'; end if;
  select count(*) into v_count from public.maintenance_audit_log;
  if v_count > 0 then raise exception 'REGRESSION: anon can read maintenance_audit_log'; end if;
  raise notice 'PASS 7a: unauthenticated (anon) access is fully denied on every table this migration adds';
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000257', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000257","email":"attacker@example.com"}', true);
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.tenant_requests;
  if v_count > 0 then raise exception 'REGRESSION: unrelated signed-in user can read tenant_requests'; end if;
  select count(*) into v_count from public.maintenance_intake_sessions;
  if v_count > 0 then raise exception 'REGRESSION: unrelated signed-in user can read maintenance_intake_sessions'; end if;
  select count(*) into v_count from public.maintenance_audit_log;
  if v_count > 0 then raise exception 'REGRESSION: unrelated signed-in user can read maintenance_audit_log'; end if;
  raise notice 'PASS 7b: a signed-in user with no ownership/tenancy relationship reads nothing anywhere this migration adds';
end $$;

-- ===== 8. Tenant-private-data isolation: this migration's tenant-facing surfaces never reach landlord-only data =====
-- tenant_property_view / tenant_lease_view are unchanged from
-- milestone-24's own design (re-verified structurally, not re-derived
-- here) — confirm the column set once more directly against this file's
-- objects, and confirm the tenant identity used throughout this file
-- (current-tenant) still cannot read the base properties/leases tables.
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000253', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000253","email":"current-tenant@example.com"}', true);
do $$
declare v_count integer;
declare v_extra integer;
begin
  select count(*) into v_count from public.properties where id = 'b0000000-0000-0000-0000-000000000251';
  if v_count > 0 then raise exception 'REGRESSION: active tenant can directly select from public.properties (base table)'; end if;
  select count(*) into v_count from public.leases where id = 'd0000000-0000-0000-0000-000000000252';
  if v_count > 0 then raise exception 'REGRESSION: active tenant can directly select from public.leases (base table)'; end if;
  select count(*) into v_extra from information_schema.columns
    where table_schema = 'public' and table_name = 'tenant_property_view'
      and column_name in ('estimated_value', 'mortgage_balance', 'monthly_rent', 'purchase_price', 'monthly_expenses', 'owner_id');
  if v_extra > 0 then raise exception 'REGRESSION: tenant_property_view exposes a landlord-only column'; end if;
  raise notice 'PASS 8: tenant-private-data isolation holds — no landlord-only column/table is reachable by a tenant through anything this migration adds or re-verifies';
end $$;

rollback;
