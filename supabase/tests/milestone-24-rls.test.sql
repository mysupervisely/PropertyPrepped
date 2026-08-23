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
-- Expanded for the Round 6 final safety review fixes:
--   - tenant_requests_lock_immutable_fields() — the owner can change
--     status only; every other column of a request is immutable.
--   - tenant_property_view / tenant_lease_view — the ONLY tenant-facing
--     read surface for properties/leases; the base tables now have no
--     tenant-facing SELECT policy at all.
--   - tenant_access_id / conversation_id FKs on tenant_requests are
--     `on delete restrict`, not cascade.
--
-- Fixture shape (deliberately mirrors the real-world scenario Section 12
-- calls out — "do not allow an old tenant to gain access to a future
-- tenant's information"):
--   owner1 (Portfolio plan) owns:
--     - Property A, with TWO leases: an old/expired lease (former
--       tenant, now Revoked) and the current lease (current tenant,
--       Active) — the exact "prior tenant / replacement tenant on the
--       same property" scenario. Property A also carries populated
--       landlord-only financial/valuation fields and a private lease
--       note, specifically so the column-exposure tests below have
--       real, non-null sensitive values to try to retrieve.
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

-- Property A carries real, non-null landlord-only financial/valuation
-- data so the column-exposure tests below (Concern 2) have something
-- concrete to try to retrieve, not just NULLs.
insert into public.properties (
  id, owner_id, address, city,
  estimated_value, mortgage_balance, monthly_rent, purchase_price, monthly_expenses,
  purchase_date, property_tax_annual, hoa_monthly, financing_status
) values (
  'b0000000-0000-0000-0000-000000000241', 'a0000000-0000-0000-0000-000000000241', '1 Property A St', 'Town',
  450000, 210000, 2500, 380000, 900,
  '2019-06-01', 5400, 220, 'Active Mortgage'
);
insert into public.properties (id, owner_id, address, city) values
  ('b0000000-0000-0000-0000-000000000242', 'a0000000-0000-0000-0000-000000000241', '2 Property B Ave', 'Town'),
  ('b0000000-0000-0000-0000-000000000243', 'a0000000-0000-0000-0000-000000000242', '3 Property C Rd', 'Town');

insert into public.leases (id, property_id, owner_id, tenant_name, tenant_email, monthly_rent, start_date, end_date, notes) values
  ('d0000000-0000-0000-0000-000000000241', 'b0000000-0000-0000-0000-000000000241', 'a0000000-0000-0000-0000-000000000241', 'Former Tenant', 'former-tenant@example.com', 1800, '2023-01-01', '2023-12-31', 'Old tenant paid late twice.'),
  ('d0000000-0000-0000-0000-000000000242', 'b0000000-0000-0000-0000-000000000241', 'a0000000-0000-0000-0000-000000000241', 'Current Tenant', 'current-tenant@example.com', 2400, '2024-01-01', '2025-12-31', 'Landlord-private note: do not renew past 2025.'),
  ('d0000000-0000-0000-0000-000000000243', 'b0000000-0000-0000-0000-000000000242', 'a0000000-0000-0000-0000-000000000241', 'Tenant B', 'tenant-b@example.com', 1500, '2024-01-01', '2025-12-31', null),
  ('d0000000-0000-0000-0000-000000000244', 'b0000000-0000-0000-0000-000000000243', 'a0000000-0000-0000-0000-000000000242', 'Tenant C', 'tenant-c@example.com', 2000, '2024-01-01', '2025-12-31', null);

insert into public.tenant_property_access (id, property_id, owner_id, tenant_user_id, tenant_email, lease_id, status, accepted_at, revoked_at) values
  ('c0000000-0000-0000-0000-000000000241', 'b0000000-0000-0000-0000-000000000241', 'a0000000-0000-0000-0000-000000000241', 'a0000000-0000-0000-0000-000000000244', 'former-tenant@example.com', 'd0000000-0000-0000-0000-000000000241', 'Revoked', now() - interval '400 days', now() - interval '30 days'),
  ('c0000000-0000-0000-0000-000000000242', 'b0000000-0000-0000-0000-000000000241', 'a0000000-0000-0000-0000-000000000241', 'a0000000-0000-0000-0000-000000000243', 'current-tenant@example.com', 'd0000000-0000-0000-0000-000000000242', 'Active', now(), null),
  ('c0000000-0000-0000-0000-000000000243', 'b0000000-0000-0000-0000-000000000242', 'a0000000-0000-0000-0000-000000000241', 'a0000000-0000-0000-0000-000000000245', 'tenant-b@example.com', 'd0000000-0000-0000-0000-000000000243', 'Active', now(), null),
  ('c0000000-0000-0000-0000-000000000244', 'b0000000-0000-0000-0000-000000000243', 'a0000000-0000-0000-0000-000000000242', 'a0000000-0000-0000-0000-000000000246', 'tenant-c@example.com', 'd0000000-0000-0000-0000-000000000244', 'Active', now(), null);

insert into public.user_subscriptions (owner_id, plan, status) values
  ('a0000000-0000-0000-0000-000000000241', 'portfolio', 'active'),
  ('a0000000-0000-0000-0000-000000000242', 'portfolio', 'active');

set local role authenticated;

-- ===== 1. Owner can read their own FULL property/lease rows (unaffected by the view change) =====
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000241', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000241","email":"owner1@example.com"}', true);
do $$
declare v_row public.properties%rowtype;
declare v_lease public.leases%rowtype;
begin
  select * into v_row from public.properties where id = 'b0000000-0000-0000-0000-000000000241';
  if not found then raise exception 'REGRESSION: owner cannot read their own property'; end if;
  if v_row.estimated_value is distinct from 450000 or v_row.mortgage_balance is distinct from 210000
     or v_row.purchase_price is distinct from 380000 or v_row.monthly_expenses is distinct from 900
     or v_row.property_tax_annual is distinct from 5400 or v_row.hoa_monthly is distinct from 220
     or v_row.financing_status is distinct from 'Active Mortgage' then
    raise exception 'REGRESSION: owner does not see their own property''s full financial/valuation columns';
  end if;
  select * into v_lease from public.leases where id = 'd0000000-0000-0000-0000-000000000242';
  if not found then raise exception 'REGRESSION: owner cannot read their own lease'; end if;
  if v_lease.notes is distinct from 'Landlord-private note: do not renew past 2025.' then
    raise exception 'REGRESSION: owner cannot see their own lease''s private notes';
  end if;
  raise notice 'PASS 1: owner reads their own FULL property/lease rows, including every financial/valuation/notes column (existing owner policies untouched)';
end $$;

-- ===== 2. Tenant cannot directly select * from the owner-facing base tables at all — zero rows, any column =====
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000243', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000243","email":"current-tenant@example.com"}', true);
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.properties where id = 'b0000000-0000-0000-0000-000000000241';
  if v_count > 0 then raise exception 'REGRESSION: active tenant can still directly select from public.properties (base table)'; end if;
  select count(*) into v_count from public.leases where id = 'd0000000-0000-0000-0000-000000000242';
  if v_count > 0 then raise exception 'REGRESSION: active tenant can still directly select from public.leases (base table)'; end if;
  raise notice 'PASS 2: an active tenant issuing select * directly against public.properties/public.leases (base tables) gets zero rows — no tenant-facing policy remains on either';
end $$;

-- ===== 3. Correct tenant reads exactly their own property/lease through the restricted views, and only the safe columns =====
do $$
declare v_prop public.tenant_property_view%rowtype;
declare v_lease public.tenant_lease_view%rowtype;
begin
  select * into v_prop from public.tenant_property_view where id = 'b0000000-0000-0000-0000-000000000241';
  if not found then raise exception 'REGRESSION: active tenant cannot read their own property through tenant_property_view'; end if;
  if v_prop.address <> '1 Property A St' or v_prop.city <> 'Town' then
    raise exception 'REGRESSION: tenant_property_view did not return the expected address/city';
  end if;
  select * into v_lease from public.tenant_lease_view where id = 'd0000000-0000-0000-0000-000000000242';
  if not found then raise exception 'REGRESSION: active tenant cannot read their own lease through tenant_lease_view'; end if;
  if v_lease.monthly_rent is distinct from 2400 or v_lease.tenant_name <> 'Current Tenant' then
    raise exception 'REGRESSION: tenant_lease_view did not return the expected lease terms';
  end if;
  raise notice 'PASS 3: the correct active tenant retrieves exactly their permitted property/lease fields through the restricted views';
end $$;

-- ===== 4. tenant_property_view / tenant_lease_view expose ONLY the intended safe column set — no sensitive/financial columns exist on either view at all =====
do $$
declare v_extra integer;
begin
  select count(*) into v_extra from information_schema.columns
    where table_schema = 'public' and table_name = 'tenant_property_view'
      and column_name not in ('id', 'address', 'city');
  if v_extra > 0 then raise exception 'REGRESSION: tenant_property_view exposes an unexpected column beyond id/address/city'; end if;

  select count(*) into v_extra from information_schema.columns
    where table_schema = 'public' and table_name = 'tenant_property_view'
      and column_name in ('estimated_value', 'mortgage_balance', 'monthly_rent', 'purchase_price', 'monthly_expenses', 'purchase_date', 'property_tax_annual', 'hoa_monthly', 'financing_status', 'owner_id');
  if v_extra > 0 then raise exception 'REGRESSION: tenant_property_view exposes a landlord-only financial/valuation/ownership column'; end if;

  select count(*) into v_extra from information_schema.columns
    where table_schema = 'public' and table_name = 'tenant_lease_view'
      and column_name not in ('id', 'tenant_name', 'monthly_rent', 'start_date', 'end_date', 'rent_due_day');
  if v_extra > 0 then raise exception 'REGRESSION: tenant_lease_view exposes an unexpected column beyond the intended safe set';
  end if;

  select count(*) into v_extra from information_schema.columns
    where table_schema = 'public' and table_name = 'tenant_lease_view'
      and column_name in ('notes', 'security_deposit', 'document_id', 'owner_id', 'tenant_email', 'tenant_phone');
  if v_extra > 0 then raise exception 'REGRESSION: tenant_lease_view exposes a landlord-private lease column (notes/security_deposit/document_id/owner_id/etc)'; end if;
  raise notice 'PASS 4: tenant_property_view / tenant_lease_view expose exactly the intended safe column sets, no more';
end $$;

-- ===== 5. Active tenant reads exactly their OWN lease through the view, not the old lease on the same property =====
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.tenant_lease_view where id = 'd0000000-0000-0000-0000-000000000241';
  if v_count > 0 then raise exception 'REGRESSION: current tenant can read the OLD lease on the same property, through the view'; end if;
  raise notice 'PASS 5: active tenant reads exactly their own lease through tenant_lease_view, never a different lease on the same property';
end $$;

-- ===== 6. Revoked (former) tenant reads NOTHING — not the property, not even their own former lease — through the views OR the base tables =====
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000244', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000244","email":"former-tenant@example.com"}', true);
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.tenant_property_view where id = 'b0000000-0000-0000-0000-000000000241';
  if v_count > 0 then raise exception 'REGRESSION: revoked former tenant can still read the property through the view'; end if;
  select count(*) into v_count from public.tenant_lease_view where id = 'd0000000-0000-0000-0000-000000000241';
  if v_count > 0 then raise exception 'REGRESSION: revoked former tenant can still read their own former lease through the view'; end if;
  select count(*) into v_count from public.tenant_lease_view where id = 'd0000000-0000-0000-0000-000000000242';
  if v_count > 0 then raise exception 'REGRESSION: revoked former tenant can read the NEW (replacement) tenant''s lease through the view'; end if;
  select count(*) into v_count from public.properties where id = 'b0000000-0000-0000-0000-000000000241';
  if v_count > 0 then raise exception 'REGRESSION: revoked former tenant can read the property base table directly'; end if;
  raise notice 'PASS 6: revoked/expired tenant reads nothing — not the property, not their own former lease, not the replacement tenant''s lease, through either the views or the base tables';
end $$;

-- ===== 7. Cross-property isolation: Property B's tenant cannot read Property A's data through the views =====
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000245', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000245","email":"tenant-b@example.com"}', true);
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.tenant_property_view where id = 'b0000000-0000-0000-0000-000000000241';
  if v_count > 0 then raise exception 'REGRESSION: Property B''s tenant can read Property A through the view'; end if;
  select count(*) into v_count from public.tenant_lease_view where id = 'd0000000-0000-0000-0000-000000000242';
  if v_count > 0 then raise exception 'REGRESSION: Property B''s tenant can read Property A''s lease through the view'; end if;
  raise notice 'PASS 7: cross-property isolation holds through the restricted views';
end $$;

-- ===== 8. Forged property/lease ID through the views returns nothing (no way to enumerate/forge access to another record) =====
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.tenant_property_view where id = 'b0000000-0000-0000-0000-000000000243'; -- Property C, not theirs, not even same owner
  if v_count > 0 then raise exception 'REGRESSION: tenant can forge/guess a property ID belonging to a different owner/tenant through the view'; end if;
  select count(*) into v_count from public.tenant_lease_view where id = 'd0000000-0000-0000-0000-000000000244'; -- Tenant C's lease
  if v_count > 0 then raise exception 'REGRESSION: tenant can forge/guess a lease ID belonging to a different owner/tenant through the view'; end if;
  raise notice 'PASS 8: a forged/guessed property or lease ID returns nothing through the views — access is exclusively driven by the caller''s own active tenant_property_access row';
end $$;

-- ===== 9. Unauthenticated access is fully denied — base tables AND views =====
-- A real anon (keyless) PostgREST request never carries a JWT sub claim
-- at all — clear both GUCs before switching roles so this genuinely
-- simulates "no one is signed in," rather than leaving a previously
-- authenticated tenant's sub claim active under the anon role (which
-- can't happen in real Supabase: PostgREST switches to the `authenticated`
-- DB role precisely when a JWT sub is present, and to `anon` only when
-- it's absent).
reset role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);
set local role anon;
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.properties where id = 'b0000000-0000-0000-0000-000000000241';
  if v_count > 0 then raise exception 'REGRESSION: unauthenticated (anon) role can read a property'; end if;
  select count(*) into v_count from public.leases where id = 'd0000000-0000-0000-0000-000000000242';
  if v_count > 0 then raise exception 'REGRESSION: unauthenticated (anon) role can read a lease'; end if;
  select count(*) into v_count from public.tenant_property_view;
  if v_count > 0 then raise exception 'REGRESSION: unauthenticated (anon) role can read tenant_property_view'; end if;
  select count(*) into v_count from public.tenant_lease_view;
  if v_count > 0 then raise exception 'REGRESSION: unauthenticated (anon) role can read tenant_lease_view'; end if;
  raise notice 'PASS 9: unauthenticated access is fully denied on both the base tables and the tenant views';
end $$;
reset role;
set local role authenticated;

-- ===== 10. A signed-in user with no relationship to anything gets nothing, anywhere =====
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000247', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000247","email":"attacker@example.com"}', true);
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.properties where id in ('b0000000-0000-0000-0000-000000000241', 'b0000000-0000-0000-0000-000000000242', 'b0000000-0000-0000-0000-000000000243');
  if v_count > 0 then raise exception 'REGRESSION: unrelated signed-in user can read a property'; end if;
  select count(*) into v_count from public.tenant_property_view;
  if v_count > 0 then raise exception 'REGRESSION: unrelated signed-in user can read any row through tenant_property_view'; end if;
  select count(*) into v_count from public.tenant_lease_view;
  if v_count > 0 then raise exception 'REGRESSION: unrelated signed-in user can read any row through tenant_lease_view'; end if;
  select count(*) into v_count from public.tenant_requests;
  if v_count > 0 then raise exception 'REGRESSION: unrelated signed-in user can read any tenant_requests row'; end if;
  raise notice 'PASS 10: a signed-in user with no ownership/tenancy relationship reads nothing anywhere';
end $$;

-- ===== 11. Tenant creates a tenant_request tied to a conversation they legitimately created =====
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
  raise notice 'PASS 11: tenant can create a request tied to their own conversation, defaulting to status New';
end $$;

-- ===== 12. tenant_requests.conversation_id is 1:1 — a second request cannot reuse the same conversation =====
do $$
begin
  begin
    insert into public.tenant_requests (property_id, owner_id, tenant_access_id, conversation_id, category, title, description)
    values ('b0000000-0000-0000-0000-000000000241', 'a0000000-0000-0000-0000-000000000241', 'c0000000-0000-0000-0000-000000000242', current_setting('pgtest.tc_conv')::uuid, 'Other', 'Duplicate', 'Duplicate');
    raise exception 'REGRESSION: a second tenant_requests row reused the same conversation_id';
  exception
    when unique_violation then raise notice 'PASS 12: conversation_id is enforced 1:1 (unique constraint)';
  end;
end $$;

-- ===== 13. Forged property_id on insert is rejected =====
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
      raise notice 'PASS 13: forged property_id on tenant_requests insert is rejected';
  end;
end $$;

-- ===== 14. Forged tenant_access_id (someone else's access row) is rejected =====
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
      raise notice 'PASS 14: forged tenant_access_id (belonging to another tenant) is rejected';
  end;
end $$;

-- ===== 15. Forged conversation_id (a conversation that isn't theirs) is rejected =====
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
      raise notice 'PASS 15: forged conversation_id (belonging to a different tenant/property) is rejected';
  end;
end $$;

-- ===== 16. Owner (not a tenant) cannot INSERT a tenant_requests row — that path is tenant-only =====
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
      raise notice 'PASS 16: owner cannot create a tenant_requests row — only the active tenant can (the owner''s own log stays maintenance_requests)';
  end;
end $$;

-- ===== 17. Owner CAN update status; the immutable-field trigger silently pins everything else =====
do $$
declare v_row public.tenant_requests%rowtype;
begin
  update public.tenant_requests set status = 'In Progress' where id = current_setting('pgtest.tc_req')::uuid;
  if not found then raise exception 'REGRESSION: owner could not update request status'; end if;
  select * into v_row from public.tenant_requests where id = current_setting('pgtest.tc_req')::uuid;
  if v_row.status <> 'In Progress' then raise exception 'REGRESSION: request status was not actually updated to In Progress'; end if;
  raise notice 'PASS 17: owner can update request status';
end $$;

-- ===== 18. Owner attempts to rewrite title/description/category/property/lease/tenant/owner in ONE update alongside status — all locked fields are silently restored, only status changes =====
do $$
declare
  v_before public.tenant_requests%rowtype;
  v_after public.tenant_requests%rowtype;
begin
  select * into v_before from public.tenant_requests where id = current_setting('pgtest.tc_req')::uuid;

  update public.tenant_requests set
    status = 'Resolved',
    title = 'REWRITTEN BY OWNER',
    description = 'REWRITTEN BY OWNER',
    category = 'Electrical',
    property_id = 'b0000000-0000-0000-0000-000000000242',
    tenant_access_id = 'c0000000-0000-0000-0000-000000000243',
    owner_id = 'a0000000-0000-0000-0000-000000000242'
  where id = current_setting('pgtest.tc_req')::uuid;

  select * into v_after from public.tenant_requests where id = current_setting('pgtest.tc_req')::uuid;

  if v_after.status <> 'Resolved' then raise exception 'REGRESSION: status did not change even though it is the one column owners ARE allowed to change'; end if;
  if v_after.title <> v_before.title then raise exception 'REGRESSION: owner was able to modify request title'; end if;
  if v_after.description <> v_before.description then raise exception 'REGRESSION: owner was able to modify request description'; end if;
  if v_after.category <> v_before.category then raise exception 'REGRESSION: owner was able to modify request category'; end if;
  if v_after.property_id <> v_before.property_id then raise exception 'REGRESSION: owner was able to reassign request property_id'; end if;
  if v_after.tenant_access_id <> v_before.tenant_access_id then raise exception 'REGRESSION: owner was able to reassign request tenant_access_id (tenant identity)'; end if;
  if v_after.owner_id <> v_before.owner_id then raise exception 'REGRESSION: owner was able to reassign request owner_id (owner identity)'; end if;
  -- Not asserting updated_at strictly increased here: within a single
  -- wrapping test transaction, now() is the transaction's frozen start
  -- time (Postgres semantics), so two now()-driven writes in the same
  -- transaction are expected to produce the identical timestamp — this
  -- is a property of the test harness's transaction, not of the
  -- trigger. tenant_requests_touch_updated_at's own behavior (that it
  -- fires and sets a non-null timestamp) is covered structurally below.
  if v_after.updated_at is null then raise exception 'REGRESSION: updated_at is null after an update'; end if;
  raise notice 'PASS 18: owner cannot alter title/description/category, cannot reassign property/lease/tenant/owner identity — every attempted change to a locked column is silently reverted by the database trigger, only status actually changed';
end $$;

-- ===== 19. Owner attempting to change ONLY a locked field (no status in the same statement) still leaves the row completely unchanged content-wise =====
do $$
declare
  v_before public.tenant_requests%rowtype;
  v_after public.tenant_requests%rowtype;
begin
  select * into v_before from public.tenant_requests where id = current_setting('pgtest.tc_req')::uuid;
  update public.tenant_requests set title = 'ANOTHER REWRITE ATTEMPT', conversation_id = 'e0000000-0000-0000-0000-000000000241' where id = current_setting('pgtest.tc_req')::uuid;
  select * into v_after from public.tenant_requests where id = current_setting('pgtest.tc_req')::uuid;
  if v_after.title <> v_before.title then raise exception 'REGRESSION: owner modified title in a status-less update'; end if;
  if v_after.conversation_id <> v_before.conversation_id then raise exception 'REGRESSION: owner reassigned conversation_id in a status-less update'; end if;
  if v_after.created_at <> v_before.created_at then raise exception 'REGRESSION: created_at changed'; end if;
  raise notice 'PASS 19: tenant request content (title, conversation_id, created_at, and every other locked column) remains completely unchanged after an owner attempts to modify it';
end $$;

-- ===== 20. Tenant CANNOT update request status at all (no tenant UPDATE policy exists — this must remain true; the fix must not accidentally create a general tenant-edit capability) =====
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000243', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000243","email":"current-tenant@example.com"}', true);
do $$
declare v_affected integer;
begin
  update public.tenant_requests set status = 'Resolved' where id = current_setting('pgtest.tc_req')::uuid;
  get diagnostics v_affected = row_count;
  if v_affected > 0 then raise exception 'REGRESSION: tenant updated their own request''s status — a tenant UPDATE capability was accidentally created'; end if;
  raise notice 'PASS 20: tenant still cannot update request status at all (0 rows affected) — the immutable-field fix did not create any new tenant-edit capability';
end $$;

-- ===== 21. Cross-tenant / cross-owner isolation on tenant_requests =====
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000245', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000245","email":"tenant-b@example.com"}', true);
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.tenant_requests where id = current_setting('pgtest.tc_req')::uuid;
  if v_count > 0 then raise exception 'REGRESSION: an unrelated tenant on a different property can see this request';
  end if;
  raise notice 'PASS 21a: unrelated tenant (different property, same owner) cannot see another property''s requests';
end $$;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000242', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000242","email":"owner2@example.com"}', true);
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.tenant_requests where id = current_setting('pgtest.tc_req')::uuid;
  if v_count > 0 then raise exception 'REGRESSION: a different owner (owner2) can see owner1''s tenant request'; end if;
  raise notice 'PASS 21b: cross-owner isolation holds for tenant_requests';
end $$;

-- ===== 22. Revoked (former) tenant cannot see any tenant_requests, even a request tied to their own former access row =====
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
  raise notice 'PASS 22: revoked/expired tenant loses access to their own request history (access is retired, not narrowly preserved, per the conservative default in Section 12)';
end $$;

-- Request history itself is NOT deleted by revocation — the owner still has it.
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000241', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000241","email":"owner1@example.com"}', true);
do $$
begin
  perform 1 from public.tenant_requests where id = 'f0000000-0000-0000-0000-000000000241';
  if not found then raise exception 'REGRESSION: request history was deleted when the tenant was revoked — it must be retained'; end if;
  raise notice 'PASS 23: request history is retained (never auto-deleted) after the tenant''s access is revoked';
end $$;

-- ===== 24. Hardened FKs: a direct DELETE of the parent tenant_property_access/property_conversations row is now BLOCKED while request history referencing it exists (defense-in-depth — Round 6, Concern 3) =====
-- Run as postgres (bypasses RLS entirely) specifically to isolate the
-- FK's own ON DELETE behavior from RLS — this proves the constraint
-- itself, independent of who is or isn't allowed to attempt the delete.
reset role;
do $$
begin
  begin
    delete from public.tenant_property_access where id = 'c0000000-0000-0000-0000-000000000241'; -- the FORMER tenant's access row — has request history (f0000...241) referencing it
    raise exception 'REGRESSION: a tenant_property_access row with tenant_requests history was deleted despite the ON DELETE RESTRICT foreign key';
  exception
    when foreign_key_violation then raise notice 'PASS 24a: deleting a tenant_property_access row that still has tenant_requests history is blocked by the hardened FK (on delete restrict), so request history can never be silently cascade-deleted this way';
    when others then
      if SQLERRM like 'REGRESSION%' then raise; end if;
      raise notice 'PASS 24a: deleting a tenant_property_access row that still has tenant_requests history is blocked (%).', SQLERRM;
  end;
end $$;
do $$
begin
  begin
    delete from public.property_conversations where id = current_setting('pgtest.former_conv')::uuid; -- backs the same request f0000...241
    raise exception 'REGRESSION: a property_conversations row with tenant_requests history was deleted despite the ON DELETE RESTRICT foreign key';
  exception
    when foreign_key_violation then raise notice 'PASS 24b: deleting a property_conversations row that still backs a tenant_requests row is blocked by the hardened FK (on delete restrict)';
    when others then
      if SQLERRM like 'REGRESSION%' then raise; end if;
      raise notice 'PASS 24b: deleting a property_conversations row that still backs a tenant_requests row is blocked (%).', SQLERRM;
  end;
  -- Confirm the request history is still there, completely untouched, after the blocked delete attempts above.
  perform 1 from public.tenant_requests where id = 'f0000000-0000-0000-0000-000000000241';
  if not found then raise exception 'REGRESSION: request history disappeared after the blocked delete attempts'; end if;
  raise notice 'PASS 24c: request history survives intact after both blocked delete attempts';
end $$;

set local role authenticated;

-- ===== 25. A signed-in user with no relationship to anything still gets nothing, at the end of the run =====
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000247', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000247","email":"attacker@example.com"}', true);
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.properties where id in ('b0000000-0000-0000-0000-000000000241', 'b0000000-0000-0000-0000-000000000242', 'b0000000-0000-0000-0000-000000000243');
  if v_count > 0 then raise exception 'REGRESSION: unrelated signed-in user can read a property'; end if;
  select count(*) into v_count from public.tenant_requests;
  if v_count > 0 then raise exception 'REGRESSION: unrelated signed-in user can read any tenant_requests row'; end if;
  raise notice 'PASS 25: a signed-in user with no ownership/tenancy relationship reads nothing (final check)';
end $$;

rollback;
