-- PropPrepped Milestone 3
-- Run this entire file once in the Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  address text not null,
  city text not null,
  property_type text not null default 'Rental Property',
  estimated_value numeric(14,2) not null default 0,
  mortgage_balance numeric(14,2) not null default 0,
  monthly_rent numeric(14,2) not null default 0,
  purchase_price numeric(14,2) not null default 0,
  monthly_expenses numeric(14,2) not null default 0,
  cover_photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.property_documents (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text not null default 'Other',
  storage_path text not null unique,
  size_bytes bigint not null default 0,
  mime_type text,
  created_at timestamptz not null default now()
);

create table if not exists public.property_photos (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  storage_path text not null unique,
  is_cover boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists properties_owner_idx on public.properties(owner_id);
create index if not exists property_documents_property_idx on public.property_documents(property_id);
create index if not exists property_documents_owner_idx on public.property_documents(owner_id);
create index if not exists property_photos_property_idx on public.property_photos(property_id);
create index if not exists property_photos_owner_idx on public.property_photos(owner_id);

alter table public.properties enable row level security;
alter table public.property_documents enable row level security;
alter table public.property_photos enable row level security;

-- Each signed-in user can only access rows they own.
drop policy if exists "properties_select_own" on public.properties;
create policy "properties_select_own" on public.properties for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists "properties_insert_own" on public.properties;
create policy "properties_insert_own" on public.properties for insert to authenticated with check ((select auth.uid()) = owner_id);
drop policy if exists "properties_update_own" on public.properties;
create policy "properties_update_own" on public.properties for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop policy if exists "properties_delete_own" on public.properties;
create policy "properties_delete_own" on public.properties for delete to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists "documents_select_own" on public.property_documents;
create policy "documents_select_own" on public.property_documents for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists "documents_insert_own" on public.property_documents;
create policy "documents_insert_own" on public.property_documents for insert to authenticated with check ((select auth.uid()) = owner_id);
drop policy if exists "documents_update_own" on public.property_documents;
create policy "documents_update_own" on public.property_documents for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop policy if exists "documents_delete_own" on public.property_documents;
create policy "documents_delete_own" on public.property_documents for delete to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists "photos_select_own" on public.property_photos;
create policy "photos_select_own" on public.property_photos for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists "photos_insert_own" on public.property_photos;
create policy "photos_insert_own" on public.property_photos for insert to authenticated with check ((select auth.uid()) = owner_id);
drop policy if exists "photos_update_own" on public.property_photos;
create policy "photos_update_own" on public.property_photos for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop policy if exists "photos_delete_own" on public.property_photos;
create policy "photos_delete_own" on public.property_photos for delete to authenticated using ((select auth.uid()) = owner_id);

-- Private file buckets. The first folder in every path is the authenticated user's UUID.
insert into storage.buckets (id, name, public, file_size_limit)
values ('property-documents', 'property-documents', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'property-photos',
  'property-photos',
  false,
  20971520,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Storage policies: user can only work inside /<their-user-id>/...
drop policy if exists "property_documents_select_own" on storage.objects;
create policy "property_documents_select_own" on storage.objects for select to authenticated
using (bucket_id = 'property-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "property_documents_insert_own" on storage.objects;
create policy "property_documents_insert_own" on storage.objects for insert to authenticated
with check (bucket_id = 'property-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "property_documents_update_own" on storage.objects;
create policy "property_documents_update_own" on storage.objects for update to authenticated
using (bucket_id = 'property-documents' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'property-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "property_documents_delete_own" on storage.objects;
create policy "property_documents_delete_own" on storage.objects for delete to authenticated
using (bucket_id = 'property-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "property_photos_select_own" on storage.objects;
create policy "property_photos_select_own" on storage.objects for select to authenticated
using (bucket_id = 'property-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "property_photos_insert_own" on storage.objects;
create policy "property_photos_insert_own" on storage.objects for insert to authenticated
with check (bucket_id = 'property-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "property_photos_update_own" on storage.objects;
create policy "property_photos_update_own" on storage.objects for update to authenticated
using (bucket_id = 'property-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'property-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "property_photos_delete_own" on storage.objects;
create policy "property_photos_delete_own" on storage.objects for delete to authenticated
using (bucket_id = 'property-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Milestone 4: financial ledger
create table if not exists public.financial_transactions (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  transaction_date date not null default current_date,
  transaction_type text not null check (transaction_type in ('Income', 'Expense')),
  category text not null default 'Other',
  vendor text,
  description text not null,
  amount numeric(14,2) not null check (amount > 0),
  document_id uuid references public.property_documents(id) on delete set null,
  is_recurring boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists financial_transactions_property_date_idx on public.financial_transactions(property_id, transaction_date desc);
create index if not exists financial_transactions_owner_idx on public.financial_transactions(owner_id);
alter table public.financial_transactions enable row level security;

drop policy if exists "financial_transactions_select_own" on public.financial_transactions;
create policy "financial_transactions_select_own" on public.financial_transactions for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists "financial_transactions_insert_own" on public.financial_transactions;
create policy "financial_transactions_insert_own" on public.financial_transactions for insert to authenticated with check ((select auth.uid()) = owner_id);
drop policy if exists "financial_transactions_update_own" on public.financial_transactions;
create policy "financial_transactions_update_own" on public.financial_transactions for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop policy if exists "financial_transactions_delete_own" on public.financial_transactions;
create policy "financial_transactions_delete_own" on public.financial_transactions for delete to authenticated using ((select auth.uid()) = owner_id);

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
