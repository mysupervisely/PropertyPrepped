-- PropRoster Milestone 18: Rent Ledger + PropWatch V1
-- Run once if upgrading an existing project (after Milestone 17).
--
-- Data model audit (done before writing this file): leases, properties,
-- financial_transactions, property_systems, insurance_policies,
-- mortgages, maintenance_records, and Tenant Connect's tables were all
-- inspected. financial_transactions is a flat income/expense ledger with
-- no lease_id, no rent-period concept, and no payment-method/reference
-- fields — forcing "expected rent for lease X, period Y, compared
-- against one or more payments" into it would make that table
-- ambiguous (a plain Income row can't distinguish "this IS August's
-- rent, fully explaining an $2,400 obligation" from "partial payment
-- toward August" from "unrelated income"). A small, dedicated
-- rent_payments table is the clean fit instead — one row per RECORDED
-- payment (never per expected obligation; expected rent is always
-- derived live from the lease's monthly_rent/rent_due_day/start_date/
-- end_date, never persisted or cron-generated, per this milestone's
-- explicit instruction).
--
-- rent_payments <-> financial_transactions relationship: recording a
-- rent payment MAY create exactly one linked financial_transactions
-- Income/Rent row (financial_transaction_id), the SAME canonical
-- relationship pattern maintenance_records already uses for its
-- optional "add this cost to Financials" linkage
-- (maintenance_records.financial_transaction_id, milestone-4/8). The
-- landlord can opt out per-payment (mirroring maintenance's existing
-- checkbox), so money already logged manually is never double-counted.
--
-- Idempotent: safe to run multiple times, safe on a database that
-- already has this table.
--
-- RLS: every policy is owner-scoped, and insert/update additionally
-- verify property_id, lease_id, and (when set) financial_transaction_id
-- all belong to the SAME owner and that lease_id actually belongs to
-- property_id — the exact FK-ownership-check idiom already used by
-- leases_insert_own / maintenance_update_own in supabase/schema.sql.
-- No service-role access; nothing here is reachable by an
-- unauthenticated or cross-owner request.

create table if not exists public.rent_payments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  lease_id uuid not null references public.leases(id) on delete cascade,
  -- Always the first of the covered month (e.g. '2026-08-01' for
  -- "August 2026") — a rent PERIOD, not a specific calendar day. The
  -- specific due day is derived live from the lease, never stored here.
  rent_period date not null,
  date_received date not null default current_date,
  amount numeric(14,2) not null check (amount > 0),
  payment_method text not null default 'Other',
  reference_number text,
  notes text,
  -- Optional link to the ONE financial_transactions row this payment
  -- created, if the landlord chose to also log it as rental income.
  -- ON DELETE SET NULL rather than CASCADE: deleting the financial
  -- transaction itself (from the Financials ledger directly) should not
  -- silently delete the landlord's payment record.
  financial_transaction_id uuid references public.financial_transactions(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.rent_payments drop constraint if exists rent_payments_payment_method_check;
alter table public.rent_payments add constraint rent_payments_payment_method_check
  check (payment_method in ('ACH / Bank Transfer', 'Check', 'Cash', 'Zelle', 'Venmo', 'Cash App', 'Other'));

create index if not exists rent_payments_lease_period_idx on public.rent_payments(lease_id, rent_period);
create index if not exists rent_payments_property_period_idx on public.rent_payments(property_id, rent_period);
create index if not exists rent_payments_owner_idx on public.rent_payments(owner_id);

alter table public.rent_payments enable row level security;

drop policy if exists "rent_payments_select_own" on public.rent_payments;
create policy "rent_payments_select_own" on public.rent_payments for select to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists "rent_payments_insert_own" on public.rent_payments;
create policy "rent_payments_insert_own" on public.rent_payments for insert to authenticated with check (
  (select auth.uid()) = owner_id
  and exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid()))
  and exists (select 1 from public.leases l where l.id = lease_id and l.owner_id = (select auth.uid()) and l.property_id = property_id)
  and (financial_transaction_id is null or exists (select 1 from public.financial_transactions t where t.id = financial_transaction_id and t.owner_id = (select auth.uid())))
);

drop policy if exists "rent_payments_update_own" on public.rent_payments;
create policy "rent_payments_update_own" on public.rent_payments for update to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid()))
  and exists (select 1 from public.leases l where l.id = lease_id and l.owner_id = (select auth.uid()) and l.property_id = property_id)
  and (financial_transaction_id is null or exists (select 1 from public.financial_transactions t where t.id = financial_transaction_id and t.owner_id = (select auth.uid())))
);

drop policy if exists "rent_payments_delete_own" on public.rent_payments;
create policy "rent_payments_delete_own" on public.rent_payments for delete to authenticated
  using ((select auth.uid()) = owner_id);
