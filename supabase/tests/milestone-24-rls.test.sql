-- PropRoster Milestone 24 — Tenant Connect V1 RLS + security regression test.
--
-- Same methodology as milestone-10-rls.test.sql (run by hand against a
-- database with PropRoster's full schema.sql + milestone-10-tenant-
-- connect.sql + this milestone's migration loaded, and the Supabase
-- auth/storage schemas stubbed — see milestone-9/10-rls.test.sql's own
-- notes for the stub pattern, including the auth.jwt() claims stub).
-- Every block RAISEs "REGRESSION" or NOTICEs "PASS". Run with
-- `psql -v ON_ERROR_STOP=0` and grep for "REGRESSION" — a clean run has
-- zero matches. Everything happens inside a transaction rolled back at
-- the end, so this never leaves test data behind.
--
-- Fixture shape (deliberately mirrors the real-world scenario Section 12
-- calls out — "do not allow an old tenant to gain access to a future
-- tenant's information"):
--   owner1 (Portfolio plan) owns:
--     - Property A, with TWO leases: an old/expired lease (former
--       tenant, now Revoked) and the current lease (current tenant,
--       Active) — the exact "prior tenant / replacement tenant on the
--       same property" scenario.
--     - Property B, with one Active tenant — cross-property isolation.
--   owner2 (Portfolio plan) owns Property C, with one Active tenant —
--     cross-owner isolation.

begin;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000241', 'owner1@example.com'),
  ('a0000000-0000-0000-0000-000000000242', 'owner2@example.com'),
  ('a0000000-0000-0000-0000-000000000243', 'current-tenant@example.com'),   -- Active, current lease on Property A
  ('a0000000-0000-0000-0000-000000000244', 'former-tenant@example.com'),   -- Revoked, OLD lease on Property A
  ('a0000000-0000-0000-0000-000000000245', 'tenant-b@example.com'),        -- Active on Property B (cross-property)
  ('a0000000-0000-0000-0000-000000000246', 'tenant-c@example.com'),        -- Active on Property C (cross-owner)
  ('a0000000-0000-0000-0000-000000000247', 'attacker@example.com');        -- signed-in, no relationship to anything

insert into public.properties (id, owner_id, address, city) values
  ('b0000000-0000-0000-0000-000000000241', 'a0000000-0000-0000-0000-000000000241', '1 Property A St', 'Town'),
  ('b0000000-0000-0000-0000-000000000242', 'a0000000-0000-0000-0000-000000000241', '2 Property B Ave', 'Town'),
  ('b0000000-0000-0000-0000-000000000243', 'a0000000-0000-0000-0000-000000000242', '3 Property C Rd', 'Town');

insert into public.leases (id, property_id, owner_id, tenant_name, tenant_email, monthly_rent, start_date, end_date) values
  ('d0000000-0000-0000-0000-000000000241', 'b0000000-0000-0000-0000-000000000241', 'a0000000-0000-0000-0000-000000000241', 'Former Tenant', 'former-tenant@example.com', 1800, '2023-01-01', '2023-12-31'),
  ('d0000000-0000-0000-0000-000000000242', 'b0000000-0000-0000-0000-000000000241', 'a0000000-0000-0000-0000-000000000241', 'Current Tenant', 'current-tenant@example.com', 2400, '2024-01-01', '2025-12-31'),
  ('d0000000-0000-0000-0000-000000000243', 'b0000000-0000-0000-0000-000000000242', 'a0000000-0000-0000-0000-000000000241', 'Tenant B', 'tenant-b@example.com', 1500, '2024-01-01', '2025-12-31'),
  ('d0000000-0000-0000-0000-000000000244', 'b0000000-0000-0000-0000-000000000243', 'a0000000-0000-0000-0000-000000000242', 'Tenant C', 'tenant-c@example.com', 2000, '2024-01-01', '2025-12-31');

insert into public.tenant_property_access (id, property_id, owner_id, tenant_user_id, tenant_email, lease_id, status, accepted_at, revoked_at) values
  ('c0000000-0000-0000-0000-000000000241', 'b0000000-0000-0000-0000-000000000241', 'a0000000-0000-0000-0000-000000000241', 'a0000000-0000-0000-0000-000000000244', 'former-tenant@example.com', 'd0000000-0000-0000-0000-000000000241', 'Revoked', now() - interval '400 days', now() - interval '30 days'),
  ('c0000000-0000-0000-0000-000000000242', 'b0000000-0000-0000-0000-000000000241', 'a0000000-0000-0000-0000-000000000241', 'a0000000-0000-0000-0000-000000000243', 'current-tenant@example.com', 'd0000000-0000-0000-0000-000000000242', 'Active', now(), null),
  ('c0000000-0000-0000-0000-000000000243', 'b0000000-0000-0000-0000-000000000242', 'a0000000-0000-0000-0000-000000000241', 'a0000000-0000-0000-0000-000000000245', 'tenant-b@example.com', 'd0000000-0000-0000-0000-000000000243', 'Active', now(), null),
  ('c0000000-0000-0000-0000-000000000244', 'b0000000-0000-0000-0000-000000000243', 'a0000000-0000-0000-0000-000000000242', 'a0000000-0000-0000-0000-000000000246', 'tenant-c@example.com', 'd0000000-0000-0000-0000-000000000244', 'Active', now(), null);

insert into public.user_subscriptions (owner_id, plan, status) values
  ('a0000000-0000-0000-0000-000000000241', 'portfolio', 'active'),
  ('a0000000-0000-0000-0000-000000000242', 'portfolio', 'active');

set local role authenticated;

-- ===== 1. Owner can read their own property/lease/tenant_requests rows =====
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000241', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000241","email":"owner1@example.com"}', true);
do $$
begin
  perform 1 from public.properties where id = 'b0000000-0000-0000-0000-000000000241';
  if not found then raise exception 'REGRESSION: owner cannot read their own property'; end if;
  perform 1 from public.leases where id = 'd0000000-0000-0000-0000-000000000242';
  if not found then raise exception 'REGRESSION: owner cannot read their own lease'; end if;
  raise notice 'PASS 1: owner reads their own property/lease normally (existing owner policies untouched)';
end $$;

-- ===== 2. Active tenant (current lease) reads exactly their own property =====
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000243', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000243","email":"current-tenant@example.com"}', true);
do $$
begin
  perform 1 from public.properties where id = 'b0000000-0000-0000-0000-000000000241';
  if not found then raise exception 'REGRESSION: active tenant cannot read their own property'; end if;
  raise notice 'PASS 2: active tenant can read their own property (new additive policy)';
end $$;

-- ===== 3. Active tenant reads exactly their OWN lease, not the old lease on the same property =====
do $$
declare v_count integer;
begin
  perform 1 from public.leases where id = 'd0000000-0000-0000-0000-000000000242';
  if not found then raise exception 'REGRESSION: active tenant cannot read their own lease'; end if;
  select count(*) into v_count from public.leases where id = 'd0000000-0000-0000-0000-000000000241';
  if v_count > 0 then raise exception 'REGRESSION: current tenant can read the OLD lease on the same property'; end if;
  raise notice 'PASS 3: active tenant reads exactly their own lease, never a different lease on the same property';
end $$;

-- ===== 4. Revoked (former) tenant reads NOTHING — not the property, not even their own former lease =====
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000244', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000244","email":"former-tenant@example.com"}', true);
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.properties where id = 'b0000000-0000-0000-0000-000000000241';
  if v_count > 0 then raise exception 'REGRESSION: revoked former tenant can still read the property'; end if;
  select count(*) into v_count from public.leases where id = 'd0000000-0000-0000-0000-000000000241';
  if v_count > 0 then raise exception 'REGRESSION: revoked former tenant can still read their own former lease'; end if;
  select count(*) into v_count from public.leases where id = 'd0000000-0000-0000-0000-000000000242';
  if v_count > 0 then raise exception 'REGRESSION: revoked former tenant can read the NEW (replacement) tenant''s lease'; end if;
  raise notice 'PASS 4: revoked/expired tenant reads nothing — not the property, not their own former lease, not the replacement tenant''s lease';
end $$;

-- ===== 5. Cross-property isolation: Property B's tenant cannot read Property A's data =====
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000245', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000245","email":"tenant-b@example.com"}', true);
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.properties where id = 'b0000000-0000-0000-0000-000000000241';
  if v_count > 0 then raise exception 'REGRESSION: Property B''s tenant can read Property A'; end if;
  select count(*) into v_count from public.leases where id = 'd0000000-0000-0000-0000-000000000242';
  if v_count > 0 then raise exception 'REGRESSION: Property B''s tenant can read Property A''s lease'; end if;
  raise notice 'PASS 5: cross-property isolation holds for the new tenant-read policies';
end $$;

-- ===== 6. Unauthenticated access is fully denied =====
reset role;
set local role anon;
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.properties where id = 'b0000000-0000-0000-0000-000000000241';
  if v_count > 0 then raise exception 'REGRESSION: unauthenticated (anon) role can read a property'; end if;
  select count(*) into v_count from public.leases where id = 'd0000000-0000-0000-0000-000000000242';
  if v_count > 0 then raise exception 'REGRESSION: unauthenticated (anon) role can read a lease'; end if;
  raise notice 'PASS 6: unauthenticated access is fully denied (policies are "to authenticated" only)';
end $$;
reset role;
set local role authenticated;

-- ===== 7. Tenant creates a tenant_request tied to a conversation they legitimately created =====
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000243', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000243","email":"current-tenant@example.com"}', true);
do $$
declare
  v_conv_id uuid;
  v_req_id uuid;
begin
  insert into public.property_conversations (property_id, owner_id, tenant_access_id, subject, conversation_type)
  values ('b0000000-0000-0000-0000-000000000241', 'a0000000-0000-0000-0000-000000000241', 'c0000000-0000-0000-0000-000000000242', 'Kitchen sink leaking', 'Maintenance')
  returning id into v_conv_id;
  perform set_config('pgtest.tc_conv', v_conv_id::text, false);

  insert into public.property_messages (conversation_id, sender_user_id, sender_role, message)
  values (v_conv_id, 'a0000000-0000-0000-0000-000000000243', 'Tenant', 'The kitchen sink is leaking under the cabinet.');

  insert into public.tenant_requests (property_id, owner_id, tenant_access_id, conversation_id, category, title, description)
  values ('b0000000-0000-0000-0000-000000000241', 'a0000000-0000-0000-0000-000000000241', 'c0000000-0000-0000-0000-000000000242', v_conv_id, 'Plumbing', 'Kitchen sink leaking', 'The kitchen sink is leaking under the cabinet.')
  returning id into v_req_id;
  perform set_config('pgtest.tc_req', v_req_id::text, false);

  perform 1 from public.tenant_requests where id = v_req_id and status = 'New';
  if not found then raise exception 'REGRESSION: tenant request was not created with default status New'; end if;
  raise notice 'PASS 7: tenant can create a request tied to their own conversation, defaulting to status New';
end $$;

-- ===== 8. tenant_requests.conversation_id is 1:1 — a second request cannot reuse the same conversation =====
do $$
begin
  begin
    insert into public.tenant_requests (property_id, owner_id, tenant_access_id, conversation_id, category, title, description)
    values ('b0000000-0000-0000-0000-000000000241', 'a0000000-0000-0000-0000-000000000241', 'c0000000-0000-0000-0000-000000000242', current_setting('pgtest.tc_conv')::uuid, 'Other', 'Duplicate', 'Duplicate');
    raise exception 'REGRESSION: a second tenant_requests row reused the same conversation_id';
  exception
    when unique_violation then raise notice 'PASS 8: conversation_id is enforced 1:1 (unique constraint)';
  end;
end $$;

-- ===== 9. Forged property_id on insert is rejected =====
do $$
declare v_conv_id uuid;
begin
  insert into public.property_conversations (property_id, owner_id, tenant_access_id, subject, conversation_type)
  values ('b0000000-0000-0000-0000-000000000241', 'a0000000-0000-0000-0000-000000000241', 'c0000000-0000-0000-0000-000000000242', 'Second request', 'Maintenance')
  returning id into v_conv_id;
  begin
    insert into public.tenant_requests (property_id, owner_id, tenant_access_id, conversation_id, category, title, description)
    values ('b0000000-0000-0000-0000-000000000242', 'a0000000-0000-0000-0000-000000000241', 'c0000000-0000-0000-0000-000000000242', v_conv_id, 'Other', 'Forged property', 'Forged property');
    raise exception 'REGRESSION: tenant created a request with a forged property_id (different from their own access row''s property)';
  exception
    when others then
      if SQLERRM like 'REGRESSION%' then raise; end if;
      raise notice 'PASS 9: forged property_id on tenant_requests insert is rejected';
  end;
end $$;

-- ===== 10. Forged tenant_access_id (someone else's access row) is rejected =====
do $$
declare v_conv_id uuid;
begin
  insert into public.property_conversations (property_id, owner_id, tenant_access_id, subject, conversation_type)
  values ('b0000000-0000-0000-0000-000000000241', 'a0000000-0000-0000-0000-000000000241', 'c0000000-0000-0000-0000-000000000242', 'Third request', 'Maintenance')
  returning id into v_conv_id;
  begin
    insert into public.tenant_requests (property_id, owner_id, tenant_access_id, conversation_id, category, title, description)
    values ('b0000000-0000-0000-0000-000000000241', 'a0000000-0000-0000-0000-000000000241', 'c0000000-0000-0000-0000-000000000243', v_conv_id, 'Other', 'Forged access row', 'Forged access row');
    raise exception 'REGRESSION: tenant created a request using a DIFFERENT (not their own) tenant_access_id';
  exception
    when others then
      if SQLERRM like 'REGRESSION%' then raise; end if;
      raise notice 'PASS 10: forged tenant_access_id (belonging to another tenant) is rejected';
  end;
end $$;

-- ===== 11. Forged conversation_id (a conversation that isn't theirs) is rejected =====
-- A conversation that legitimately belongs to tenant-b on Property B —
-- inserted as the owner (bypassing the tenant-side "own conversation
-- only" question entirely) so this scenario isolates exactly one thing:
-- can a DIFFERENT tenant attach a tenant_requests row to a real
-- conversation that simply isn't theirs.
reset role;
insert into public.property_conversations (id, property_id, owner_id, tenant_access_id, subject, conversation_type)
values ('e0000000-0000-0000-0000-000000000241', 'b0000000-0000-0000-0000-000000000242', 'a0000000-0000-0000-0000-000000000241', 'c0000000-0000-0000-0000-000000000243', 'Not yours', 'Maintenance');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000243', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000243","email":"current-tenant@example.com"}', true);
do $$
begin
  begin
    insert into public.tenant_requests (property_id, owner_id, tenant_access_id, conversation_id, category, title, description)
    values ('b0000000-0000-0000-0000-000000000241', 'a0000000-0000-0000-0000-000000000241', 'c0000000-0000-0000-0000-000000000242', 'e0000000-0000-0000-0000-000000000241', 'Other', 'Hijack conversation', 'Hijack conversation');
    raise exception 'REGRESSION: tenant attached a request to a conversation that belongs to a different tenant/property';
  exception
    when others then
      if SQLERRM like 'REGRESSION%' then raise; end if;
      raise notice 'PASS 11: forged conversation_id (belonging to a different tenant/property) is rejected';
  end;
end $$;

-- ===== 12. Owner (not a tenant) cannot INSERT a tenant_requests row — that path is tenant-only =====
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000241', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000241","email":"owner1@example.com"}', true);
do $$
begin
  begin
    insert into public.tenant_requests (property_id, owner_id, tenant_access_id, conversation_id, category, title, description)
    values ('b0000000-0000-0000-0000-000000000241', 'a0000000-0000-0000-0000-000000000241', 'c0000000-0000-0000-0000-000000000242', current_setting('pgtest.tc_conv')::uuid, 'Other', 'Owner-created', 'Owner-created');
    raise exception 'REGRESSION: owner was able to INSERT a tenant_requests row (should be tenant-only)';
  exception
    when others then
      if SQLERRM like 'REGRESSION%' then raise; end if;
      raise notice 'PASS 12: owner cannot create a tenant_requests row — only the active tenant can (the owner''s own log stays maintenance_requests)';
  end;
end $$;

-- ===== 13. Owner CAN update status; tenant CANNOT update status =====
do $$
begin
  update public.tenant_requests set status = 'In Progress' where id = current_setting('pgtest.tc_req')::uuid;
  if not found then raise exception 'REGRESSION: owner could not update request status'; end if;
  raise notice 'PASS 13a: owner can update request status';
end $$;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000243', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000243","email":"current-tenant@example.com"}', true);
do $$
declare v_affected integer;
begin
  update public.tenant_requests set status = 'Resolved' where id = current_setting('pgtest.tc_req')::uuid;
  get diagnostics v_affected = row_count;
  if v_affected > 0 then raise exception 'REGRESSION: tenant updated their own request''s status'; end if;
  raise notice 'PASS 13b: tenant cannot update request status (0 rows affected)';
end $$;

-- ===== 14. Cross-tenant / cross-owner isolation on tenant_requests =====
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000245', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000245","email":"tenant-b@example.com"}', true);
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.tenant_requests where id = current_setting('pgtest.tc_req')::uuid;
  if v_count > 0 then raise exception 'REGRESSION: an unrelated tenant on a different property can see this request';
  end if;
  raise notice 'PASS 14a: unrelated tenant (different property, same owner) cannot see another property''s requests';
end $$;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000242', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000242","email":"owner2@example.com"}', true);
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.tenant_requests where id = current_setting('pgtest.tc_req')::uuid;
  if v_count > 0 then raise exception 'REGRESSION: a different owner (owner2) can see owner1''s tenant request'; end if;
  raise notice 'PASS 14b: cross-owner isolation holds for tenant_requests';
end $$;

-- ===== 15. Revoked (former) tenant cannot see any tenant_requests, even a request tied to their own former access row =====
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000241', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000241","email":"owner1@example.com"}', true);
do $$
declare v_conv_id uuid;
begin
  insert into public.property_conversations (property_id, owner_id, tenant_access_id, subject, conversation_type)
  values ('b0000000-0000-0000-0000-000000000241', 'a0000000-0000-0000-0000-000000000241', 'c0000000-0000-0000-0000-000000000241', 'Old request', 'Maintenance')
  returning id into v_conv_id;
  perform set_config('pgtest.former_conv', v_conv_id::text, false);
end $$;
reset role;
insert into public.tenant_requests (id, property_id, owner_id, tenant_access_id, conversation_id, category, title, description, status)
values ('f0000000-0000-0000-0000-000000000241', 'b0000000-0000-0000-0000-000000000241', 'a0000000-0000-0000-0000-000000000241', 'c0000000-0000-0000-0000-000000000241', current_setting('pgtest.former_conv')::uuid, 'Other', 'Old, now the tenant is revoked', 'Old, now the tenant is revoked', 'Resolved');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000244', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000244","email":"former-tenant@example.com"}', true);
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.tenant_requests where id = 'f0000000-0000-0000-0000-000000000241';
  if v_count > 0 then raise exception 'REGRESSION: revoked former tenant can still see their own old request history'; end if;
  raise notice 'PASS 15: revoked/expired tenant loses access to their own request history (access is retired, not narrowly preserved, per the conservative default in Section 12)';
end $$;

-- Request history itself is NOT deleted by revocation — the owner still has it.
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000241', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000241","email":"owner1@example.com"}', true);
do $$
begin
  perform 1 from public.tenant_requests where id = 'f0000000-0000-0000-0000-000000000241';
  if not found then raise exception 'REGRESSION: request history was deleted when the tenant was revoked — it must be retained'; end if;
  raise notice 'PASS 16: request history is retained (never auto-deleted) after the tenant''s access is revoked';
end $$;

-- ===== 17. A signed-in user with no relationship to anything gets nothing =====
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000247', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000247","email":"attacker@example.com"}', true);
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.properties where id in ('b0000000-0000-0000-0000-000000000241', 'b0000000-0000-0000-0000-000000000242', 'b0000000-0000-0000-0000-000000000243');
  if v_count > 0 then raise exception 'REGRESSION: unrelated signed-in user can read a property'; end if;
  select count(*) into v_count from public.tenant_requests;
  if v_count > 0 then raise exception 'REGRESSION: unrelated signed-in user can read any tenant_requests row'; end if;
  raise notice 'PASS 17: a signed-in user with no ownership/tenancy relationship reads nothing';
end $$;

rollback;
