-- PropRoster Milestone 18 — Rent Ledger RLS regression test.
--
-- Proves rent_payments' owner isolation and FK-ownership checks: an
-- authenticated owner can only see/write their own rows, and cannot
-- insert a payment against another owner's property, lease, or
-- financial transaction even when they own the payment row itself.
--
-- Same methodology as supabase/tests/milestone-8..14-rls.test.sql: run
-- by hand against a database with PropRoster's full schema.sql loaded
-- and the Supabase auth/storage schemas available (real Supabase, or a
-- local Postgres stubbed per the note at the bottom of
-- milestone-9-rls.test.sql). Every block RAISEs "REGRESSION" or NOTICEs
-- "PASS". Run with `psql -v ON_ERROR_STOP=0` and grep for "REGRESSION"
-- — a clean run has zero matches. Two throwaway owners and their
-- properties/leases/transactions/payments are created inside a
-- transaction that is rolled back at the end.

begin;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000a001', 'ownerA@example.com'),
  ('a0000000-0000-0000-0000-00000000a002', 'ownerB@example.com');

insert into public.properties (id, owner_id, address, city) values
  ('b0000000-0000-0000-0000-00000000b001', 'a0000000-0000-0000-0000-00000000a001', '1 Owner A St', 'Town'),
  ('b0000000-0000-0000-0000-00000000b002', 'a0000000-0000-0000-0000-00000000a002', '1 Owner B St', 'Town');

insert into public.leases (id, property_id, owner_id, tenant_name, monthly_rent, security_deposit, start_date, end_date, renewal_status) values
  ('c0000000-0000-0000-0000-00000000c001', 'b0000000-0000-0000-0000-00000000b001', 'a0000000-0000-0000-0000-00000000a001', 'Tenant A', 2400, 2400, '2026-01-01', '2026-12-31', 'Active'),
  ('c0000000-0000-0000-0000-00000000c002', 'b0000000-0000-0000-0000-00000000b002', 'a0000000-0000-0000-0000-00000000a002', 'Tenant B', 2350, 2350, '2026-01-01', '2026-12-31', 'Active');

insert into public.financial_transactions (id, property_id, owner_id, transaction_type, category, description, amount) values
  ('d0000000-0000-0000-0000-00000000d001', 'b0000000-0000-0000-0000-00000000b001', 'a0000000-0000-0000-0000-00000000a001', 'Income', 'Rent', 'August rent', 2400),
  ('d0000000-0000-0000-0000-00000000d002', 'b0000000-0000-0000-0000-00000000b002', 'a0000000-0000-0000-0000-00000000a002', 'Income', 'Rent', 'August rent', 2350);

insert into public.rent_payments (id, owner_id, property_id, lease_id, rent_period, amount, payment_method, financial_transaction_id) values
  ('e0000000-0000-0000-0000-00000000e001', 'a0000000-0000-0000-0000-00000000a001', 'b0000000-0000-0000-0000-00000000b001', 'c0000000-0000-0000-0000-00000000c001', '2026-08-01', 2400, 'ACH / Bank Transfer', 'd0000000-0000-0000-0000-00000000d001'),
  ('e0000000-0000-0000-0000-00000000e002', 'a0000000-0000-0000-0000-00000000a002', 'b0000000-0000-0000-0000-00000000b002', 'c0000000-0000-0000-0000-00000000c002', '2026-08-01', 2350, 'Check', 'd0000000-0000-0000-0000-00000000d002');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000a001', true);

-- ===== 1. Owner A sees exactly their own rent payment =====
do $$
declare found_count int;
begin
  select count(*) into found_count from public.rent_payments;
  if found_count <> 1 then
    raise exception 'REGRESSION: Owner A''s SELECT returned % rent_payments rows, expected exactly 1', found_count;
  end if;
  raise notice 'PASS: Owner A sees exactly their own rent_payments row';
end $$;

-- ===== 2. Owner A cannot SELECT Owner B's payment by id =====
do $$
declare found_id uuid;
begin
  select id into found_id from public.rent_payments where id = 'e0000000-0000-0000-0000-00000000e002';
  if found_id is not null then
    raise exception 'REGRESSION: Owner A was able to SELECT Owner B''s rent_payments row';
  end if;
  raise notice 'PASS: Owner A cannot SELECT Owner B''s rent_payments row';
end $$;

-- ===== 3. Owner A cannot INSERT a payment against Owner B's property (even naming their own lease/owner_id) =====
do $$
begin
  begin
    insert into public.rent_payments (owner_id, property_id, lease_id, rent_period, amount, payment_method)
      values ('a0000000-0000-0000-0000-00000000a001', 'b0000000-0000-0000-0000-00000000b002', 'c0000000-0000-0000-0000-00000000c001', '2026-09-01', 100, 'Cash');
    raise exception 'REGRESSION: Owner A inserted a rent_payments row against Owner B''s property';
  exception
    when insufficient_privilege then raise notice 'PASS: INSERT against another owner''s property correctly rejected';
  end;
end $$;

-- ===== 4. Owner A cannot INSERT a payment against Owner B's lease (even naming their own property) =====
do $$
begin
  begin
    insert into public.rent_payments (owner_id, property_id, lease_id, rent_period, amount, payment_method)
      values ('a0000000-0000-0000-0000-00000000a001', 'b0000000-0000-0000-0000-00000000b001', 'c0000000-0000-0000-0000-00000000c002', '2026-09-01', 100, 'Cash');
    raise exception 'REGRESSION: Owner A inserted a rent_payments row against Owner B''s lease';
  exception
    when insufficient_privilege then raise notice 'PASS: INSERT against another owner''s lease correctly rejected';
  end;
end $$;

-- ===== 5. Owner A cannot INSERT a payment linked to Owner B's financial transaction =====
do $$
begin
  begin
    insert into public.rent_payments (owner_id, property_id, lease_id, rent_period, amount, payment_method, financial_transaction_id)
      values ('a0000000-0000-0000-0000-00000000a001', 'b0000000-0000-0000-0000-00000000b001', 'c0000000-0000-0000-0000-00000000c001', '2026-09-01', 100, 'Cash', 'd0000000-0000-0000-0000-00000000d002');
    raise exception 'REGRESSION: Owner A inserted a rent_payments row linked to Owner B''s financial transaction';
  exception
    when insufficient_privilege then raise notice 'PASS: INSERT linked to another owner''s financial transaction correctly rejected';
  end;
end $$;

-- ===== 6. Owner A cannot UPDATE their own payment to point at Owner B's lease =====
do $$
begin
  begin
    update public.rent_payments set lease_id = 'c0000000-0000-0000-0000-00000000c002' where id = 'e0000000-0000-0000-0000-00000000e001';
    raise exception 'REGRESSION: Owner A was able to UPDATE their payment to reference Owner B''s lease';
  exception
    when insufficient_privilege then raise notice 'PASS: UPDATE retargeting another owner''s lease correctly rejected';
  end;
end $$;

-- ===== 7. The payment_method check constraint rejects an invalid value =====
do $$
begin
  begin
    insert into public.rent_payments (owner_id, property_id, lease_id, rent_period, amount, payment_method)
      values ('a0000000-0000-0000-0000-00000000a001', 'b0000000-0000-0000-0000-00000000b001', 'c0000000-0000-0000-0000-00000000c001', '2026-09-01', 100, 'Bitcoin');
    raise exception 'REGRESSION: an invalid payment_method value was accepted';
  exception
    when check_violation then raise notice 'PASS: an invalid payment_method value is rejected by the check constraint';
  end;
end $$;

-- ===== 8. Owner A cannot DELETE Owner B's payment =====
do $$
declare affected integer;
begin
  delete from public.rent_payments where id = 'e0000000-0000-0000-0000-00000000e002';
  get diagnostics affected = row_count;
  if affected > 0 then
    raise exception 'REGRESSION: Owner A was able to DELETE Owner B''s rent_payments row';
  end if;
  raise notice 'PASS: Owner A''s DELETE of Owner B''s row correctly affected 0 rows';
end $$;

rollback;

-- To run against a fresh local Postgres instead of a real Supabase project,
-- see the stub schema documented at the bottom of
-- supabase/tests/milestone-9-rls.test.sql, then load supabase/schema.sql,
-- then this file.
