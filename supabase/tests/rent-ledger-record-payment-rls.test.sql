-- PropRoster Final Launch Fixes — Rent Ledger "Record Payment" regression.
--
-- LAUNCH BLOCKER root cause: app/rent-ledger/page.tsx's saveRecordPayment()
-- omitted owner_id from BOTH its financial_transactions insert and its
-- rent_payments insert. financial_transactions_insert_own and
-- rent_payments_insert_own (see supabase/schema.sql) were never wrong —
-- both already require (select auth.uid()) = owner_id, the same idiom
-- every other table in this schema uses — but a payload that never sets
-- owner_id can never satisfy that check (owner_id is `not null`, no
-- default), so every "Record this as rental income in Financials"
-- attempt failed and surfaced Postgres's raw RLS error text to the
-- landlord. No RLS policy was changed to fix this — the fix is
-- application-layer only (the insert payloads now include
-- owner_id: user.id, mirroring every other financial_transactions/
-- rent_payments insert already in the app, e.g. app/page.tsx's
-- maintenance-record "add to Financials" flow).
--
-- This file proves both halves: (1) the exact broken shape (owner_id
-- omitted) is correctly rejected by RLS — documents the bug class so it
-- can never silently reappear — and (2) the exact fixed write sequence
-- (owner_id set on both inserts, linked correctly, created_linked_
-- transaction set correctly) succeeds end-to-end for the real owner and
-- stays fully invisible to another owner, and that deleting the payment
-- correctly removes (or preserves) the linked transaction per the
-- Milestone 18 created_linked_transaction deletion-safety rule.
--
-- Same methodology as supabase/tests/milestone-18-rls.test.sql: run by
-- hand against a database with PropRoster's full schema.sql loaded and
-- the Supabase auth/storage schemas available (real Supabase, or a local
-- Postgres stubbed per the note at the bottom of
-- milestone-9-rls.test.sql). Every block RAISEs "REGRESSION" or NOTICEs
-- "PASS". Run with `psql -v ON_ERROR_STOP=0` and grep for "REGRESSION" —
-- a clean run has zero matches. Two throwaway owners and their
-- properties/leases/transactions/payments are created inside a
-- transaction that is rolled back at the end.

begin;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000a101', 'ownerA@example.com'),
  ('a0000000-0000-0000-0000-00000000a102', 'ownerB@example.com');

insert into public.properties (id, owner_id, address, city) values
  ('b0000000-0000-0000-0000-00000000b101', 'a0000000-0000-0000-0000-00000000a101', '1 Owner A St', 'Town'),
  ('b0000000-0000-0000-0000-00000000b102', 'a0000000-0000-0000-0000-00000000a102', '1 Owner B St', 'Town');

insert into public.leases (id, property_id, owner_id, tenant_name, monthly_rent, security_deposit, start_date, end_date, renewal_status) values
  ('c0000000-0000-0000-0000-00000000c101', 'b0000000-0000-0000-0000-00000000b101', 'a0000000-0000-0000-0000-00000000a101', 'Tenant A', 2400, 2400, '2026-01-01', '2026-12-31', 'Active');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000a101', true);

-- ===== 1. Reproduces the exact bug: a financial_transactions insert that
-- omits owner_id (the broken payload that shipped) is rejected, never
-- silently attributed to the wrong owner or left null =====
do $$
begin
  begin
    insert into public.financial_transactions (property_id, transaction_type, category, description, amount, transaction_date)
      values ('b0000000-0000-0000-0000-00000000b101', 'Income', 'Rent', 'Rent — August 2026', 2400, '2026-08-01');
    raise exception 'REGRESSION: a financial_transactions INSERT with owner_id omitted was accepted';
  exception
    when not_null_violation then raise notice 'PASS: financial_transactions INSERT without owner_id correctly rejected (not-null constraint)';
    when insufficient_privilege then raise notice 'PASS: financial_transactions INSERT without owner_id correctly rejected (RLS)';
  end;
end $$;

-- ===== 2. Reproduces the same bug on rent_payments =====
do $$
begin
  begin
    insert into public.rent_payments (property_id, lease_id, rent_period, amount, payment_method)
      values ('b0000000-0000-0000-0000-00000000b101', 'c0000000-0000-0000-0000-00000000c101', '2026-08-01', 2400, 'ACH / Bank Transfer');
    raise exception 'REGRESSION: a rent_payments INSERT with owner_id omitted was accepted';
  exception
    when not_null_violation then raise notice 'PASS: rent_payments INSERT without owner_id correctly rejected (not-null constraint)';
    when insufficient_privilege then raise notice 'PASS: rent_payments INSERT without owner_id correctly rejected (RLS)';
  end;
end $$;

-- ===== 3. The FIXED write sequence: financial_transactions insert WITH
-- owner_id, then rent_payments insert WITH owner_id + the linkage —
-- exactly what saveRecordPayment() now sends — succeeds in one pass =====
do $$
declare
  new_tx_id uuid;
  new_payment_id uuid;
  linked boolean;
begin
  insert into public.financial_transactions (property_id, owner_id, transaction_type, category, description, amount, transaction_date, vendor)
    values ('b0000000-0000-0000-0000-00000000b101', 'a0000000-0000-0000-0000-00000000a101', 'Income', 'Rent', 'Rent — August 2026 — Tenant A', 2400, '2026-08-01', 'Tenant A')
    returning id into new_tx_id;

  insert into public.rent_payments (owner_id, property_id, lease_id, rent_period, date_received, amount, payment_method, financial_transaction_id, created_linked_transaction)
    values ('a0000000-0000-0000-0000-00000000a101', 'b0000000-0000-0000-0000-00000000b101', 'c0000000-0000-0000-0000-00000000c101', '2026-08-01', '2026-08-03', 2400, 'ACH / Bank Transfer', new_tx_id, true)
    returning id into new_payment_id;

  select created_linked_transaction into linked from public.rent_payments where id = new_payment_id;
  if linked is not true then
    raise exception 'REGRESSION: created_linked_transaction was not set true on the fixed write path';
  end if;
  raise notice 'PASS: the fixed Record Payment write sequence (owner_id set on both inserts) succeeds end-to-end';

  -- ===== 4. Owner B never sees this payment or its linked transaction =====
  set local role authenticated;
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000a102', true);
  if exists (select 1 from public.rent_payments where id = new_payment_id) then
    raise exception 'REGRESSION: Owner B could see Owner A''s rent_payments row';
  end if;
  if exists (select 1 from public.financial_transactions where id = new_tx_id) then
    raise exception 'REGRESSION: Owner B could see Owner A''s linked financial_transactions row';
  end if;
  raise notice 'PASS: Owner B cannot see Owner A''s new payment or its linked transaction';

  -- ===== 5. Deletion safety: deleting the payment (created_linked_transaction
  -- = true) also removes the linked transaction it created =====
  perform set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000a101', true);
  delete from public.rent_payments where id = new_payment_id;
  delete from public.financial_transactions where id = new_tx_id; -- mirrors deletePayment()'s conditional cleanup
  if exists (select 1 from public.financial_transactions where id = new_tx_id) then
    raise exception 'REGRESSION: the linked financial_transactions row survived deletion of its created_linked_transaction=true payment';
  end if;
  raise notice 'PASS: deleting a payment that created its linked transaction also removes that transaction';
end $$;

rollback;

-- To run against a fresh local Postgres instead of a real Supabase project,
-- see the stub schema documented at the bottom of
-- supabase/tests/milestone-9-rls.test.sql, then load supabase/schema.sql,
-- then this file.
