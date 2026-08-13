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

-- Milestone 6: Property Network (contacts + landlord maintenance requests)
create table if not exists public.property_contacts (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  business_name text,
  role text not null default 'Other',
  phone text,
  email text,
  website text,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists property_contacts_property_idx on public.property_contacts(property_id);
create index if not exists property_contacts_owner_idx on public.property_contacts(owner_id);
alter table public.property_contacts enable row level security;
drop policy if exists "property_contacts_select_own" on public.property_contacts;
create policy "property_contacts_select_own" on public.property_contacts for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists "property_contacts_insert_own" on public.property_contacts;
create policy "property_contacts_insert_own" on public.property_contacts for insert to authenticated with check ((select auth.uid()) = owner_id);
drop policy if exists "property_contacts_update_own" on public.property_contacts;
create policy "property_contacts_update_own" on public.property_contacts for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop policy if exists "property_contacts_delete_own" on public.property_contacts;
create policy "property_contacts_delete_own" on public.property_contacts for delete to authenticated using ((select auth.uid()) = owner_id);

create table if not exists public.maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  tenant_name text not null,
  tenant_email text,
  title text not null,
  description text not null default '',
  priority text not null default 'Normal' check (priority in ('Low', 'Normal', 'High', 'Urgent')),
  status text not null default 'Submitted' check (status in ('Submitted', 'Scheduled', 'In Progress', 'Completed')),
  created_at timestamptz not null default now()
);
create index if not exists maintenance_requests_property_idx on public.maintenance_requests(property_id, created_at desc);
create index if not exists maintenance_requests_owner_idx on public.maintenance_requests(owner_id);
create index if not exists maintenance_requests_status_idx on public.maintenance_requests(status);
alter table public.maintenance_requests enable row level security;
drop policy if exists "maintenance_requests_select_own" on public.maintenance_requests;
create policy "maintenance_requests_select_own" on public.maintenance_requests for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists "maintenance_requests_insert_own" on public.maintenance_requests;
create policy "maintenance_requests_insert_own" on public.maintenance_requests for insert to authenticated with check ((select auth.uid()) = owner_id);
drop policy if exists "maintenance_requests_update_own" on public.maintenance_requests;
create policy "maintenance_requests_update_own" on public.maintenance_requests for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop policy if exists "maintenance_requests_delete_own" on public.maintenance_requests;
create policy "maintenance_requests_delete_own" on public.maintenance_requests for delete to authenticated using ((select auth.uid()) = owner_id);

-- Milestone 7: Investment Tools (saved property evaluator analyses)
create table if not exists public.investment_analyses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,

  name text not null default 'Untitled analysis',
  address text,
  status text not null default 'Analyzing' check (status in ('Analyzing', 'Considering', 'Offer Made', 'Under Contract', 'Purchased', 'Passed')),

  purchase_price numeric(14,2) not null default 0,
  market_value numeric(14,2) not null default 0,
  units integer not null default 1,

  down_payment numeric(14,2) not null default 0,
  interest_rate numeric(7,4) not null default 0,
  loan_term_years integer not null default 30,
  closing_costs numeric(14,2) not null default 0,

  monthly_rent numeric(14,2) not null default 0,
  other_income numeric(14,2) not null default 0,

  property_taxes numeric(14,2) not null default 0,
  insurance numeric(14,2) not null default 0,
  hoa numeric(14,2) not null default 0,
  management numeric(14,2) not null default 0,
  maintenance numeric(14,2) not null default 0,
  vacancy numeric(14,2) not null default 0,
  utilities numeric(14,2) not null default 0,
  other_expenses numeric(14,2) not null default 0,

  appreciation_rate numeric(7,4) not null default 0,
  rent_growth_rate numeric(7,4) not null default 0,
  expense_growth_rate numeric(7,4) not null default 0,

  assumptions jsonb not null default '{}'::jsonb,
  results jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists investment_analyses_owner_idx on public.investment_analyses(owner_id);
create index if not exists investment_analyses_property_idx on public.investment_analyses(property_id);
create index if not exists investment_analyses_status_idx on public.investment_analyses(status);
create index if not exists investment_analyses_owner_updated_idx on public.investment_analyses(owner_id, updated_at desc);
alter table public.investment_analyses enable row level security;
drop policy if exists "investment_analyses_select_own" on public.investment_analyses;
create policy "investment_analyses_select_own" on public.investment_analyses for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists "investment_analyses_insert_own" on public.investment_analyses;
create policy "investment_analyses_insert_own" on public.investment_analyses for insert to authenticated with check ((select auth.uid()) = owner_id);
drop policy if exists "investment_analyses_update_own" on public.investment_analyses;
create policy "investment_analyses_update_own" on public.investment_analyses for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop policy if exists "investment_analyses_delete_own" on public.investment_analyses;
create policy "investment_analyses_delete_own" on public.investment_analyses for delete to authenticated using ((select auth.uid()) = owner_id);

create or replace function public.investment_analyses_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists investment_analyses_touch_updated_at on public.investment_analyses;
create trigger investment_analyses_touch_updated_at
  before update on public.investment_analyses
  for each row
  execute function public.investment_analyses_set_updated_at();

-- ============================================================
-- Milestone 9: SaaS plans, Stripe billing, entitlements
-- (mirrors supabase/milestone-9-subscriptions.sql exactly)
-- ============================================================
create table if not exists public.plan_limits (
  plan text primary key check (plan in ('free', 'investor', 'portfolio', 'portfolio_pro')),
  max_properties integer not null check (max_properties > 0)
);
insert into public.plan_limits (plan, max_properties) values
  ('free', 1),
  ('investor', 4),
  ('portfolio', 9),
  ('portfolio_pro', 20)
on conflict (plan) do update set max_properties = excluded.max_properties;
alter table public.plan_limits enable row level security;
drop policy if exists "plan_limits_select_all" on public.plan_limits;
create policy "plan_limits_select_all" on public.plan_limits for select to authenticated using (true);

create table if not exists public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  plan text not null default 'free' check (plan in ('free', 'investor', 'portfolio', 'portfolio_pro')),
  status text not null default 'active' check (status in (
    'active', 'trialing', 'past_due', 'unpaid', 'canceled',
    'incomplete', 'incomplete_expired', 'paused'
  )),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists user_subscriptions_owner_idx on public.user_subscriptions(owner_id);
create index if not exists user_subscriptions_stripe_customer_idx on public.user_subscriptions(stripe_customer_id);
create index if not exists user_subscriptions_stripe_subscription_idx on public.user_subscriptions(stripe_subscription_id);
alter table public.user_subscriptions enable row level security;
drop policy if exists "user_subscriptions_select_own" on public.user_subscriptions;
create policy "user_subscriptions_select_own" on public.user_subscriptions for select to authenticated using ((select auth.uid()) = owner_id);
-- No insert/update/delete policy for `authenticated` — see
-- milestone-9-subscriptions.sql for the full explanation. Every write to
-- this table comes from the server (Stripe webhook handler) via the
-- service-role key, never from a client request.

create or replace function public.user_subscriptions_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists user_subscriptions_touch_updated_at on public.user_subscriptions;
create trigger user_subscriptions_touch_updated_at
  before update on public.user_subscriptions
  for each row execute function public.user_subscriptions_set_updated_at();

create table if not exists public.stripe_webhook_events (
  id text primary key,
  type text not null,
  created_at timestamptz not null default now()
);
alter table public.stripe_webhook_events enable row level security;
-- No policies — RLS enabled with zero policies denies all client access;
-- only the service-role webhook handler touches this table.

create or replace function public.enforce_property_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan text;
  v_status text;
  v_max integer;
  v_count integer;
begin
  if new.owner_id is distinct from (select auth.uid()) then
    return new;
  end if;

  select plan, status into v_plan, v_status
  from public.user_subscriptions
  where owner_id = new.owner_id;

  if v_plan is null or v_status is null or v_status not in ('active', 'past_due') then
    v_plan := 'free';
  end if;

  select max_properties into v_max from public.plan_limits where plan = v_plan;
  if v_max is null then
    v_max := 1;
  end if;

  select count(*) into v_count from public.properties where owner_id = new.owner_id;

  if v_count >= v_max then
    raise exception 'PROPERTY_LIMIT_REACHED'
      using detail = format('plan=%s;max=%s;current=%s', v_plan, v_max, v_count),
            hint = 'Upgrade your PropPrepped plan to add more properties.';
  end if;

  return new;
end;
$$;

drop trigger if exists properties_enforce_limit on public.properties;
create trigger properties_enforce_limit
  before insert on public.properties
  for each row
  execute function public.enforce_property_limit();
-- See supabase/milestone-9-subscriptions.sql for the full commented
-- version of every statement above (identical logic, extended rationale).
