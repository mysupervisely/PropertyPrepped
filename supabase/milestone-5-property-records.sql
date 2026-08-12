-- PropPrepped Milestone 5 upgrade
-- Run once if upgrading an existing Milestone 4 Supabase project.

-- Milestone 5: leases, mortgages, insurance, maintenance
create table if not exists public.leases (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  tenant_name text not null,
  tenant_email text,
  monthly_rent numeric(14,2) not null default 0,
  security_deposit numeric(14,2) not null default 0,
  start_date date not null,
  end_date date not null,
  renewal_status text not null default 'Active',
  document_id uuid references public.property_documents(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists leases_property_idx on public.leases(property_id);
alter table public.leases enable row level security;
drop policy if exists "leases_select_own" on public.leases;
create policy "leases_select_own" on public.leases for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists "leases_insert_own" on public.leases;
create policy "leases_insert_own" on public.leases for insert to authenticated with check ((select auth.uid()) = owner_id);
drop policy if exists "leases_update_own" on public.leases;
create policy "leases_update_own" on public.leases for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop policy if exists "leases_delete_own" on public.leases;
create policy "leases_delete_own" on public.leases for delete to authenticated using ((select auth.uid()) = owner_id);

create table if not exists public.mortgages (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  lender text not null,
  loan_number text,
  original_balance numeric(14,2) not null default 0,
  current_balance numeric(14,2) not null default 0,
  interest_rate numeric(7,4) not null default 0,
  monthly_payment numeric(14,2) not null default 0,
  escrow_amount numeric(14,2) not null default 0,
  loan_term_years integer,
  maturity_date date,
  document_id uuid references public.property_documents(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists mortgages_property_idx on public.mortgages(property_id);
alter table public.mortgages enable row level security;
drop policy if exists "mortgages_select_own" on public.mortgages;
create policy "mortgages_select_own" on public.mortgages for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists "mortgages_insert_own" on public.mortgages;
create policy "mortgages_insert_own" on public.mortgages for insert to authenticated with check ((select auth.uid()) = owner_id);
drop policy if exists "mortgages_update_own" on public.mortgages;
create policy "mortgages_update_own" on public.mortgages for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop policy if exists "mortgages_delete_own" on public.mortgages;
create policy "mortgages_delete_own" on public.mortgages for delete to authenticated using ((select auth.uid()) = owner_id);

create table if not exists public.insurance_policies (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  carrier text not null,
  policy_number text,
  annual_premium numeric(14,2) not null default 0,
  deductible numeric(14,2) not null default 0,
  effective_date date,
  expiration_date date,
  document_id uuid references public.property_documents(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists insurance_policies_property_idx on public.insurance_policies(property_id);
alter table public.insurance_policies enable row level security;
drop policy if exists "insurance_select_own" on public.insurance_policies;
create policy "insurance_select_own" on public.insurance_policies for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists "insurance_insert_own" on public.insurance_policies;
create policy "insurance_insert_own" on public.insurance_policies for insert to authenticated with check ((select auth.uid()) = owner_id);
drop policy if exists "insurance_update_own" on public.insurance_policies;
create policy "insurance_update_own" on public.insurance_policies for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop policy if exists "insurance_delete_own" on public.insurance_policies;
create policy "insurance_delete_own" on public.insurance_policies for delete to authenticated using ((select auth.uid()) = owner_id);

create table if not exists public.maintenance_records (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  service_date date not null default current_date,
  status text not null default 'Completed',
  category text not null default 'Repair',
  vendor text,
  description text not null,
  cost numeric(14,2) not null default 0,
  document_id uuid references public.property_documents(id) on delete set null,
  financial_transaction_id uuid references public.financial_transactions(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists maintenance_property_date_idx on public.maintenance_records(property_id, service_date desc);
alter table public.maintenance_records enable row level security;
drop policy if exists "maintenance_select_own" on public.maintenance_records;
create policy "maintenance_select_own" on public.maintenance_records for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists "maintenance_insert_own" on public.maintenance_records;
create policy "maintenance_insert_own" on public.maintenance_records for insert to authenticated with check ((select auth.uid()) = owner_id);
drop policy if exists "maintenance_update_own" on public.maintenance_records;
create policy "maintenance_update_own" on public.maintenance_records for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop policy if exists "maintenance_delete_own" on public.maintenance_records;
create policy "maintenance_delete_own" on public.maintenance_records for delete to authenticated using ((select auth.uid()) = owner_id);
