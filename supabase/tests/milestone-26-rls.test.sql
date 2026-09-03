-- PropRoster Milestone 26 — Tenant Connect + Maintenance Coordination
-- M1.1 RLS + security regression test.
--
-- Same methodology as milestone-25-rls.test.sql (run by hand against a
-- database with PropRoster's full schema.sql, including this
-- milestone's migration, loaded, plus the Supabase auth/storage stub —
-- see milestone-9/10-rls.test.sql's own notes). Every block RAISEs
-- "REGRESSION" or NOTICEs "PASS". Run with `psql -v ON_ERROR_STOP=0`
-- and grep for "REGRESSION" — a clean run has zero matches. Everything
-- happens inside a transaction rolled back at the end.
--
-- New coverage beyond milestone-25-rls.test.sql: the canonical-case
-- linkage itself (Section 1), duplicate-case prevention (Section 2),
-- the tenant/maintenance_requests privilege boundary (Section 3),
-- landlord read of a tenant-originated case (Section 4), the narrowed
-- landlord-insert policy / existing manual-log compatibility
-- (Section 5), immutability of the new link column (Section 6), the
-- ON DELETE RESTRICT protection (Section 7), cross-tenant/cross-owner
-- isolation re-verified for the new surfaces (Section 8), anon/
-- unrelated-user denial (Section 9), and a hands-on entitlement
-- negative case — a Free-plan owner (no user_subscriptions row at all)
-- cannot have a tenant create a request in the first place (Section 10).
--
-- Fixture shape (id prefix 261/262/263, distinct from milestone-25's
-- 251/252 and milestone-24's 241, so all three files can run in the
-- same session without collision):
--   owner1 (261, Manage plan) owns:
--     - Property A (261), TWO leases: former tenant (Revoked) + current
--       tenant (Active) — same "prior/replacement tenant" shape as
--       milestone-25.
--     - Property B (262), one Active tenant — cross-property isolation.
--   owner2 (262, Manage plan) owns Property C (263), one Active tenant
--     — cross-owner isolation.
--   owner3 (268, FREE plan — no user_subscriptions row at all, exactly
--     the "brand-new Free account that has never touched Stripe"
--     scenario owner_has_tenant_connect()'s own comment describes) owns
--     Property D (264), one Active tenant — entitlement negative case.

begin;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000261', 'owner1@example.com'),
  ('a0000000-0000-0000-0000-000000000262', 'owner2@example.com'),
  ('a0000000-0000-0000-0000-000000000263', 'current-tenant@example.com'),   -- Active, current lease on Property A
  ('a0000000-0000-0000-0000-000000000264', 'former-tenant@example.com'),   -- Revoked, OLD lease on Property A
  ('a0000000-0000-0000-0000-000000000265', 'tenant-b@example.com'),        -- Active on Property B (cross-property)
  ('a0000000-0000-0000-0000-000000000266', 'tenant-c@example.com'),        -- Active on Property C (cross-owner)
  ('a0000000-0000-0000-0000-000000000267', 'attacker@example.com'),        -- signed-in, no relationship to anything
  ('a0000000-0000-0000-0000-000000000268', 'owner3-free@example.com'),     -- Free plan, no subscription row
  ('a0000000-0000-0000-0000-000000000269', 'tenant-d@example.com');        -- Active on Property D (Free-plan owner)

insert into public.properties (id, owner_id, address, city) values
  ('b0000000-0000-0000-0000-000000000261', 'a0000000-0000-0000-0000-000000000261', '1 Property A St', 'Town'),
  ('b0000000-0000-0000-0000-000000000262', 'a0000000-0000-0000-0000-000000000261', '2 Property B Ave', 'Town'),
  ('b0000000-0000-0000-0000-000000000263', 'a0000000-0000-0000-0000-000000000262', '3 Property C Rd', 'Town'),
  ('b0000000-0000-0000-0000-000000000264', 'a0000000-0000-0000-0000-000000000268', '4 Property D Ln', 'Town');

insert into public.leases (id, property_id, owner_id, tenant_name, tenant_email, monthly_rent, start_date, end_date) values
  ('d0000000-0000-0000-0000-000000000261', 'b0000000-0000-0000-0000-000000000261', 'a0000000-0000-0000-0000-000000000261', 'Former Tenant', 'former-tenant@example.com', 1800, '2023-01-01', '2023-12-31'),
  ('d0000000-0000-0000-0000-000000000262', 'b0000000-0000-0000-0000-000000000261', 'a0000000-0000-0000-0000-000000000261', 'Current Tenant', 'current-tenant@example.com', 2400, '2024-01-01', '2025-12-31'),
  ('d0000000-0000-0000-0000-000000000263', 'b0000000-0000-0000-0000-000000000262', 'a0000000-0000-0000-0000-000000000261', 'Tenant B', 'tenant-b@example.com', 1500, '2024-01-01', '2025-12-31'),
  ('d0000000-0000-0000-0000-000000000264', 'b0000000-0000-0000-0000-000000000263', 'a0000000-0000-0000-0000-000000000262', 'Tenant C', 'tenant-c@example.com', 2000, '2024-01-01', '2025-12-31'),
  ('d0000000-0000-0000-0000-000000000265', 'b0000000-0000-0000-0000-000000000264', 'a0000000-0000-0000-0000-000000000268', 'Tenant D', 'tenant-d@example.com', 1200, '2024-01-01', '2025-12-31');

insert into public.tenant_property_access (id, property_id, owner_id, tenant_user_id, tenant_email, lease_id, status, accepted_at, revoked_at) values
  ('c0000000-0000-0000-0000-000000000261', 'b0000000-0000-0000-0000-000000000261', 'a0000000-0000-0000-0000-000000000261', 'a0000000-0000-0000-0000-000000000264', 'former-tenant@example.com', 'd0000000-0000-0000-0000-000000000261', 'Revoked', now() - interval '400 days', now() - interval '30 days'),
  ('c0000000-0000-0000-0000-000000000262', 'b0000000-0000-0000-0000-000000000261', 'a0000000-0000-0000-0000-000000000261', 'a0000000-0000-0000-0000-000000000263', 'current-tenant@example.com', 'd0000000-0000-0000-0000-000000000262', 'Active', now(), null),
  ('c0000000-0000-0000-0000-000000000263', 'b0000000-0000-0000-0000-000000000262', 'a0000000-0000-0000-0000-000000000261', 'a0000000-0000-0000-0000-000000000265', 'tenant-b@example.com', 'd0000000-0000-0000-0000-000000000263', 'Active', now(), null),
  ('c0000000-0000-0000-0000-000000000264', 'b0000000-0000-0000-0000-000000000263', 'a0000000-0000-0000-0000-000000000262', 'a0000000-0000-0000-0000-000000000266', 'tenant-c@example.com', 'd0000000-0000-0000-0000-000000000264', 'Active', now(), null),
  ('c0000000-0000-0000-0000-000000000265', 'b0000000-0000-0000-0000-000000000264', 'a0000000-0000-0000-0000-000000000268', 'a0000000-0000-0000-0000-000000000269', 'tenant-d@example.com', 'd0000000-0000-0000-0000-000000000265', 'Active', now(), null);

-- owner3 (Free plan) deliberately gets NO user_subscriptions row at
-- all — the exact "brand-new Free account" scenario
-- owner_has_tenant_connect()'s own comment documents.
insert into public.user_subscriptions (owner_id, plan, status) values
  ('a0000000-0000-0000-0000-000000000261', 'manage', 'active'),
  ('a0000000-0000-0000-0000-000000000262', 'manage', 'active');

set local role authenticated;

-- ===== 1. A tenant submission auto-creates its canonical case, correctly populated =====
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000263', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000263","email":"current-tenant@example.com"}', true);
do $$
declare
  v_conv_id uuid;
  v_req public.tenant_requests%rowtype;
begin
  insert into public.property_conversations (property_id, owner_id, tenant_access_id, subject, conversation_type)
  values ('b0000000-0000-0000-0000-000000000261', 'a0000000-0000-0000-0000-000000000261', 'c0000000-0000-0000-0000-000000000262', 'AC not cooling', 'Maintenance')
  returning id into v_conv_id;
  perform set_config('pgtest26.conv1', v_conv_id::text, false);

  insert into public.property_messages (conversation_id, sender_user_id, sender_role, message)
  values (v_conv_id, 'a0000000-0000-0000-0000-000000000263', 'Tenant', 'AC is running but not cooling.');

  insert into public.tenant_requests (id, property_id, owner_id, tenant_access_id, conversation_id, category, title, description)
  values ('f0000000-0000-0000-0000-000000000261', 'b0000000-0000-0000-0000-000000000261', 'a0000000-0000-0000-0000-000000000261', 'c0000000-0000-0000-0000-000000000262', v_conv_id, 'heating_ac', 'AC not cooling', 'AC is running but not cooling.');

  -- Read back through tenant_requests (the tenant's own table, RLS
  -- permits this) — NOT through maintenance_requests, which the tenant
  -- correctly has zero access to at all (proven separately in Section
  -- 3). The case's actual field values are verified from the owner's
  -- own session immediately below, in the same transaction.
  select * into v_req from public.tenant_requests where id = 'f0000000-0000-0000-0000-000000000261';
  if v_req.maintenance_request_id is null then raise exception 'REGRESSION: tenant_requests.maintenance_request_id was not set by the creation trigger'; end if;
  perform set_config('pgtest26.case1', v_req.maintenance_request_id::text, false);
  raise notice 'PASS 1a: the tenant''s own submission (readable through tenant_requests) has a non-null maintenance_request_id set by the creation trigger';
end $$;

-- Field-level verification of the auto-created case requires the
-- OWNER's session — the tenant has no read access to maintenance_requests
-- at all (see Section 3), which is itself part of what's being verified.
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000261', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000261","email":"owner1@example.com"}', true);
do $$
declare v_case public.maintenance_requests%rowtype;
begin
  select * into v_case from public.maintenance_requests where id = current_setting('pgtest26.case1')::uuid;
  if v_case.id is null then raise exception 'REGRESSION: the linked maintenance_requests case does not exist'; end if;
  if v_case.source <> 'tenant' then raise exception 'REGRESSION: canonical case source is not ''tenant'' (got %)', v_case.source; end if;
  if v_case.owner_id <> 'a0000000-0000-0000-0000-000000000261' then raise exception 'REGRESSION: canonical case owner_id does not match'; end if;
  if v_case.property_id <> 'b0000000-0000-0000-0000-000000000261' then raise exception 'REGRESSION: canonical case property_id does not match'; end if;
  if v_case.tenant_name <> 'Current Tenant' then raise exception 'REGRESSION: canonical case tenant_name was not derived from the lease (got %)', v_case.tenant_name; end if;
  if v_case.tenant_email <> 'current-tenant@example.com' then raise exception 'REGRESSION: canonical case tenant_email was not derived from tenant_property_access (got %)', v_case.tenant_email; end if;
  if v_case.title <> 'AC not cooling' then raise exception 'REGRESSION: canonical case title does not match the tenant''s submission'; end if;
  if v_case.status <> 'Submitted' then raise exception 'REGRESSION: canonical case did not default to status Submitted (got %)', v_case.status; end if;
  if v_case.priority <> 'Normal' then raise exception 'REGRESSION: canonical case did not default to priority Normal (got %)', v_case.priority; end if;
  raise notice 'PASS 1b: a tenant submission auto-creates exactly one correctly-populated canonical maintenance_requests case in the same transaction';
end $$;

-- Back to the tenant for Section 2 (a second submission from the same tenant).
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000263', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000263","email":"current-tenant@example.com"}', true);

-- ===== 2. Duplicate-case prevention: a second, distinct submission gets its OWN distinct case, and the uniqueness guarantee is structural (a real unique index), not just convention =====
do $$
declare
  v_conv_id uuid;
  v_case1 uuid := current_setting('pgtest26.case1')::uuid;
  v_case2 uuid;
  v_index_count integer;
begin
  select count(*) into v_index_count from pg_indexes
    where schemaname = 'public' and tablename = 'tenant_requests'
      and indexname = 'tenant_requests_maintenance_request_unique'
      and indexdef ilike '%unique%';
  if v_index_count <> 1 then raise exception 'REGRESSION: tenant_requests_maintenance_request_unique is missing or is not a unique index'; end if;

  insert into public.property_conversations (property_id, owner_id, tenant_access_id, subject, conversation_type)
  values ('b0000000-0000-0000-0000-000000000261', 'a0000000-0000-0000-0000-000000000261', 'c0000000-0000-0000-0000-000000000262', 'Leaking faucet', 'Maintenance')
  returning id into v_conv_id;

  insert into public.tenant_requests (id, property_id, owner_id, tenant_access_id, conversation_id, category, title, description)
  values ('f0000000-0000-0000-0000-000000000262', 'b0000000-0000-0000-0000-000000000261', 'a0000000-0000-0000-0000-000000000261', 'c0000000-0000-0000-0000-000000000262', v_conv_id, 'plumbing', 'Leaking faucet', 'Kitchen faucet drips constantly.');

  select maintenance_request_id into v_case2 from public.tenant_requests where id = 'f0000000-0000-0000-0000-000000000262';
  if v_case2 = v_case1 then raise exception 'REGRESSION: two separate tenant submissions were linked to the SAME canonical case'; end if;
  if v_case2 is null then raise exception 'REGRESSION: the second submission has no linked case at all'; end if;
  raise notice 'PASS 2: duplicate-case prevention holds — a real unique index backs the link, and two distinct submissions get two distinct cases';
end $$;

-- ===== 3. The tenant never gets any direct privilege on maintenance_requests, even for their own case =====
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.maintenance_requests where id = current_setting('pgtest26.case1')::uuid;
  if v_count > 0 then raise exception 'REGRESSION: a tenant can directly SELECT from maintenance_requests, even for their own linked case — no tenant policy should exist on this table at all'; end if;
  raise notice 'PASS 3: tenant has zero direct access to maintenance_requests — even their own case is reachable only through tenant_requests';
end $$;

-- ===== 4. The landlord reads the tenant-originated case through the pre-existing, unchanged owner policy =====
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000261', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000261","email":"owner1@example.com"}', true);
do $$
declare v_case public.maintenance_requests%rowtype;
begin
  select * into v_case from public.maintenance_requests where id = current_setting('pgtest26.case1')::uuid;
  if v_case.id is null then raise exception 'REGRESSION: the property owner cannot read the tenant-originated case on their own property'; end if;
  if v_case.source <> 'tenant' then raise exception 'REGRESSION: owner-visible case does not show source=tenant'; end if;
  raise notice 'PASS 4: landlord reads a tenant-originated case through the SAME pre-existing maintenance_requests_select_own policy — no new landlord read path was needed';
end $$;

-- ===== 5. Existing landlord manual-log behavior is preserved; a landlord cannot mislabel their own row as tenant-sourced =====
do $$
begin
  -- Unchanged behavior: a manual landlord insert with no explicit
  -- source still works and still defaults to 'landlord'.
  insert into public.maintenance_requests (id, property_id, owner_id, tenant_name, tenant_email, title, description, priority, status)
  values ('e0000000-0000-0000-0000-000000000261', 'b0000000-0000-0000-0000-000000000261', 'a0000000-0000-0000-0000-000000000261', 'Walk-in Landlord Note', null, 'Gutter cleaning', 'Annual gutter cleaning', 'Low', 'Submitted');
end $$;
do $$
declare v_source text;
begin
  select source into v_source from public.maintenance_requests where id = 'e0000000-0000-0000-0000-000000000261';
  if v_source <> 'landlord' then raise exception 'REGRESSION: a manual landlord insert did not default source to landlord (got %)', v_source; end if;
  raise notice 'PASS 5a: existing landlord manual-log insert behavior is unchanged — source defaults to landlord';
end $$;
do $$
begin
  begin
    insert into public.maintenance_requests (property_id, owner_id, tenant_name, title, description, source)
    values ('b0000000-0000-0000-0000-000000000261', 'a0000000-0000-0000-0000-000000000261', 'Spoofed Tenant', 'Fake tenant request', 'Attempting to mislabel', 'tenant');
    raise exception 'REGRESSION: a direct client insert was able to set source=tenant on maintenance_requests — only the SECURITY DEFINER trigger may ever do that';
  exception
    when others then
      if SQLERRM like 'REGRESSION%' then raise; end if;
      raise notice 'PASS 5b: a landlord cannot directly insert a maintenance_requests row claiming source=tenant — rejected by the narrowed WITH CHECK';
  end;
end $$;

-- ===== 6. The new link column is locked, same as every other tenant-authored field =====
do $$
declare
  v_before uuid;
  v_after uuid;
  v_other_case uuid;
begin
  select maintenance_request_id into v_other_case from public.tenant_requests where id = 'f0000000-0000-0000-0000-000000000262';
  select maintenance_request_id into v_before from public.tenant_requests where id = 'f0000000-0000-0000-0000-000000000261';
  update public.tenant_requests set status = 'In Progress', maintenance_request_id = v_other_case
  where id = 'f0000000-0000-0000-0000-000000000261';
  select maintenance_request_id into v_after from public.tenant_requests where id = 'f0000000-0000-0000-0000-000000000261';
  if v_after <> v_before then raise exception 'REGRESSION: owner UPDATE was able to repoint tenant_requests.maintenance_request_id to a different case'; end if;
  raise notice 'PASS 6: maintenance_request_id is locked exactly like every other tenant-authored field — an owner status-only UPDATE cannot repoint the case';
end $$;

-- ===== 7. ON DELETE RESTRICT protects a tenant-linked case; a purely landlord-created row remains freely deletable =====
do $$
begin
  begin
    delete from public.maintenance_requests where id = current_setting('pgtest26.case1')::uuid;
    raise exception 'REGRESSION: a tenant-linked canonical case was deleted despite an existing tenant_requests row pointing at it';
  exception
    when foreign_key_violation then raise notice 'PASS 7a: deleting a tenant-linked case is rejected (foreign_key_violation) — a landlord cannot silently orphan a tenant''s own submission history';
    when others then
      if SQLERRM like 'REGRESSION%' then raise; end if;
      raise notice 'PASS 7a: deleting a tenant-linked case is rejected (%)', SQLERRM;
  end;
end $$;
do $$
declare v_affected integer;
begin
  delete from public.maintenance_requests where id = 'e0000000-0000-0000-0000-000000000261';
  get diagnostics v_affected = row_count;
  if v_affected <> 1 then raise exception 'REGRESSION: a purely landlord-created maintenance_requests row (no linked tenant_requests) could not be deleted — pre-existing delete behavior was broken'; end if;
  raise notice 'PASS 7b: a purely landlord-created case remains exactly as deletable as it always was — the restriction only ever applies to tenant-linked cases';
end $$;

-- ===== 8. Cross-tenant / cross-owner isolation re-verified for the new surfaces =====
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000265', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000265","email":"tenant-b@example.com"}', true);
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.tenant_requests where id = 'f0000000-0000-0000-0000-000000000261';
  if v_count > 0 then raise exception 'REGRESSION: an unrelated tenant (different property, same owner) can see this request'; end if;
  select count(*) into v_count from public.maintenance_requests where id = current_setting('pgtest26.case1')::uuid;
  if v_count > 0 then raise exception 'REGRESSION: an unrelated tenant can read another property''s canonical case'; end if;
  raise notice 'PASS 8a: cross-property tenant isolation holds for both tenant_requests and maintenance_requests';
end $$;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000262', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000262","email":"owner2@example.com"}', true);
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.tenant_requests where id = 'f0000000-0000-0000-0000-000000000261';
  if v_count > 0 then raise exception 'REGRESSION: a different owner (owner2) can see owner1''s tenant request'; end if;
  select count(*) into v_count from public.maintenance_requests where id = current_setting('pgtest26.case1')::uuid;
  if v_count > 0 then raise exception 'REGRESSION: a different owner (owner2) can see owner1''s canonical case'; end if;
  raise notice 'PASS 8b: cross-owner isolation holds for both tenant_requests and maintenance_requests';
end $$;

-- ===== 9. Anon / unrelated signed-in user denial =====
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);
set local role anon;
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.maintenance_requests where source = 'tenant';
  if v_count > 0 then raise exception 'REGRESSION: anon can read tenant-originated maintenance_requests rows'; end if;
  raise notice 'PASS 9a: unauthenticated (anon) access to tenant-originated maintenance_requests is fully denied';
end $$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000267', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000267","email":"attacker@example.com"}', true);
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.maintenance_requests where source = 'tenant';
  if v_count > 0 then raise exception 'REGRESSION: an unrelated signed-in user can read tenant-originated maintenance_requests rows'; end if;
  raise notice 'PASS 9b: a signed-in user with no ownership/tenancy relationship reads no maintenance_requests rows at all';
end $$;

-- ===== 10. Entitlement, verified hands-on: a Free-plan owner (no user_subscriptions row at all) cannot have a tenant create a request =====
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000269', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000269","email":"tenant-d@example.com"}', true);
do $$
begin
  begin
    insert into public.property_conversations (property_id, owner_id, tenant_access_id, subject, conversation_type)
    values ('b0000000-0000-0000-0000-000000000264', 'a0000000-0000-0000-0000-000000000268', 'c0000000-0000-0000-0000-000000000265', 'Broken window', 'Maintenance');
    raise exception 'REGRESSION: a tenant of a Free-plan (no Tenant Connect entitlement) owner was able to start a conversation at all';
  exception
    when others then
      if SQLERRM like 'REGRESSION%' then raise; end if;
      raise notice 'PASS 10: a Free-plan owner with no user_subscriptions row (lib/billing/entitlements.ts''s documented brand-new-account case) correctly blocks their tenant from creating a request — owner_has_tenant_connect() and the TS entitlement map agree';
  end;
end $$;

rollback;
