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
-- Insert/update also verify property_id belongs to the same owner (not just
-- owner_id itself) — see the Milestone 8 hardening notes below, which this
-- table's write policies now match.
drop policy if exists "documents_insert_own" on public.property_documents;
create policy "documents_insert_own" on public.property_documents for insert to authenticated with check (
  (select auth.uid()) = owner_id
  and exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid()))
);
drop policy if exists "documents_update_own" on public.property_documents;
create policy "documents_update_own" on public.property_documents for update to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid()))
);
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
            hint = 'Upgrade your PropRoster plan to add more properties.';
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

-- Internal owner entitlement (INTERNAL ONLY — see
-- supabase/milestone-9-subscriptions.sql for full rationale). Widens the
-- plan check constraints to also allow 'owner' and gives it an
-- effectively-unlimited plan_limits ceiling; enforce_property_limit()
-- itself is unchanged. Still governed by the same RLS as every other
-- plan — no insert/update/delete policy exists for `authenticated` on
-- user_subscriptions, so this alone grants nobody anything.
alter table public.plan_limits drop constraint if exists plan_limits_plan_check;
alter table public.plan_limits add constraint plan_limits_plan_check
  check (plan in ('free', 'investor', 'portfolio', 'portfolio_pro', 'owner'));

alter table public.user_subscriptions drop constraint if exists user_subscriptions_plan_check;
alter table public.user_subscriptions add constraint user_subscriptions_plan_check
  check (plan in ('free', 'investor', 'portfolio', 'portfolio_pro', 'owner'));

insert into public.plan_limits (plan, max_properties) values ('owner', 1000000000)
on conflict (plan) do update set max_properties = excluded.max_properties;

-- ============================================================
-- Milestone 8: AI Document Intelligence
-- (mirrors supabase/milestone-8-document-intelligence.sql exactly)
-- ============================================================
alter table public.property_documents
  add column if not exists document_type text,
  add column if not exists classification_confidence text check (classification_confidence in ('High', 'Medium', 'Low')),
  add column if not exists classification_source text check (classification_source in ('User', 'AI')),
  add column if not exists analysis_status text not null default 'Not Analyzed'
    check (analysis_status in ('Not Analyzed', 'Queued', 'Processing', 'Completed', 'Failed')),
  add column if not exists analysis_requested_at timestamptz,
  add column if not exists analysis_completed_at timestamptz,
  add column if not exists analysis_error text;
create index if not exists property_documents_analysis_status_idx on public.property_documents(analysis_status);

create table if not exists public.document_analyses (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.property_documents(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  document_type text not null,
  summary text not null default '',
  structured_data jsonb not null default '{}'::jsonb,
  source_references jsonb not null default '[]'::jsonb,
  model_provider text not null,
  model_name text not null,
  analysis_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists document_analyses_document_idx on public.document_analyses(document_id, analysis_version desc);
create index if not exists document_analyses_property_idx on public.document_analyses(property_id);
create index if not exists document_analyses_owner_idx on public.document_analyses(owner_id);
alter table public.document_analyses enable row level security;
drop policy if exists "document_analyses_select_own" on public.document_analyses;
create policy "document_analyses_select_own" on public.document_analyses for select to authenticated using ((select auth.uid()) = owner_id);
-- INSERT/UPDATE verify owner_id, that document_id/property_id belong to the
-- caller, and that the referenced document's own property_id matches — see
-- supabase/milestone-8-document-intelligence.sql for the full rationale.
drop policy if exists "document_analyses_insert_own" on public.document_analyses;
create policy "document_analyses_insert_own" on public.document_analyses for insert to authenticated with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.property_documents pd
    where pd.id = document_id
      and pd.owner_id = (select auth.uid())
      and pd.property_id = property_id
  )
  and exists (
    select 1 from public.properties p
    where p.id = property_id
      and p.owner_id = (select auth.uid())
  )
);
drop policy if exists "document_analyses_update_own" on public.document_analyses;
create policy "document_analyses_update_own" on public.document_analyses for update to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.property_documents pd
    where pd.id = document_id
      and pd.owner_id = (select auth.uid())
      and pd.property_id = property_id
  )
  and exists (
    select 1 from public.properties p
    where p.id = property_id
      and p.owner_id = (select auth.uid())
  )
);
drop policy if exists "document_analyses_delete_own" on public.document_analyses;
create policy "document_analyses_delete_own" on public.document_analyses for delete to authenticated using ((select auth.uid()) = owner_id);

create or replace function public.document_analyses_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists document_analyses_touch_updated_at on public.document_analyses;
create trigger document_analyses_touch_updated_at
  before update on public.document_analyses
  for each row
  execute function public.document_analyses_set_updated_at();

create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid references public.property_documents(id) on delete set null,
  analysis_id uuid references public.document_analyses(id) on delete set null,
  provider text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_events_owner_created_idx on public.ai_usage_events(owner_id, created_at desc);
alter table public.ai_usage_events enable row level security;
drop policy if exists "ai_usage_events_select_own" on public.ai_usage_events;
create policy "ai_usage_events_select_own" on public.ai_usage_events for select to authenticated using ((select auth.uid()) = owner_id);
-- document_id/analysis_id are nullable; when present they must belong to
-- the caller too.
drop policy if exists "ai_usage_events_insert_own" on public.ai_usage_events;
create policy "ai_usage_events_insert_own" on public.ai_usage_events for insert to authenticated with check (
  (select auth.uid()) = owner_id
  and (
    document_id is null
    or exists (select 1 from public.property_documents pd where pd.id = document_id and pd.owner_id = (select auth.uid()))
  )
  and (
    analysis_id is null
    or exists (select 1 from public.document_analyses da where da.id = analysis_id and da.owner_id = (select auth.uid()))
  )
);
-- No UPDATE or DELETE policy: usage events are an append-only audit trail
-- kept for future plan-limit enforcement, so clients cannot alter or erase
-- their own usage history. RLS denies both by default with no policy present.
drop policy if exists "ai_usage_events_delete_own" on public.ai_usage_events;

-- ============================================================
-- Milestone 10: Tenant Connect foundation
-- (mirrors supabase/milestone-10-tenant-connect.sql exactly)
-- ============================================================
-- ==================================================================
-- tenant_property_access — the tenant/property relationship.
-- ==================================================================
create table if not exists public.tenant_property_access (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  -- Null until the tenant accepts the invite (see accept_tenant_invite()
  -- below) — there is no auth.users row to reference yet at invite time.
  tenant_user_id uuid references auth.users(id) on delete cascade,
  tenant_email text not null,
  lease_id uuid references public.leases(id) on delete set null,
  status text not null default 'Invited' check (status in ('Invited', 'Active', 'Revoked')),
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists tenant_property_access_property_idx on public.tenant_property_access(property_id);
create index if not exists tenant_property_access_owner_idx on public.tenant_property_access(owner_id);
create index if not exists tenant_property_access_tenant_idx on public.tenant_property_access(tenant_user_id);
-- One non-revoked relationship per (property, email) — re-inviting the
-- same tenant to the same property after a genuine revoke is fine (that
-- old row stays status='Revoked' and simply isn't counted here), but two
-- simultaneously live invites/active relationships for the same email on
-- the same property would just be confusing, not a security issue.
create unique index if not exists tenant_property_access_live_unique
  on public.tenant_property_access(property_id, lower(tenant_email))
  where status <> 'Revoked';

alter table public.tenant_property_access enable row level security;

-- SELECT: owner sees every relationship on their own properties. A
-- tenant sees their own row once it's Active (steady state — "tenants
-- can read only their own active relationship"), OR while it's still
-- Invited and addressed to their own signed-in email (the one-time
-- bootstrap step needed to discover and accept an invite at all, since
-- tenant_user_id is null until acceptance so it can't be matched yet).
drop policy if exists "tenant_access_select" on public.tenant_property_access;
create policy "tenant_access_select" on public.tenant_property_access for select to authenticated using (
  (select auth.uid()) = owner_id
  or (status = 'Active' and tenant_user_id = (select auth.uid()))
  or (status = 'Invited' and lower(tenant_email) = lower((select auth.jwt() ->> 'email')))
);

-- INSERT: only an owner, only for a property they own, and only as a
-- fresh Invited row (tenant_user_id must be null — the only path to
-- Active is accept_tenant_invite() below, never a direct client insert).
drop policy if exists "tenant_access_insert_owner" on public.tenant_property_access;
create policy "tenant_access_insert_owner" on public.tenant_property_access for insert to authenticated with check (
  (select auth.uid()) = owner_id
  and exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid()))
  and status = 'Invited'
  and tenant_user_id is null
);

-- UPDATE: owner only (e.g. revoking access: status='Revoked', revoked_at
-- set). Tenants never get an UPDATE policy — acceptance is handled by
-- the SECURITY DEFINER function below, not a client-side UPDATE, which
-- is what makes "a tenant cannot self-activate/self-assign another
-- tenant_user_id" true by construction rather than by convention.
drop policy if exists "tenant_access_update_owner" on public.tenant_property_access;
create policy "tenant_access_update_owner" on public.tenant_property_access for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);
-- No DELETE policy — access is retired via status='Revoked', never removed.

-- Lets a signed-in user accept an invite addressed to their own email.
-- SECURITY DEFINER only to perform the tenant_user_id/status/accepted_at
-- write (which no client-facing UPDATE policy allows, deliberately —
-- see above); it still fully re-checks identity itself before writing
-- anything, so the elevated privilege never becomes a bypass.
create or replace function public.accept_tenant_invite(p_access_id uuid)
returns public.tenant_property_access
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.tenant_property_access;
  v_email text;
begin
  v_email := auth.jwt() ->> 'email';
  if v_email is null then
    raise exception 'Not authenticated.';
  end if;

  select * into v_row from public.tenant_property_access where id = p_access_id;
  if v_row.id is null then
    raise exception 'Invite not found.';
  end if;
  if v_row.status <> 'Invited' then
    raise exception 'This invite is no longer pending.';
  end if;
  if lower(v_row.tenant_email) <> lower(v_email) then
    raise exception 'This invite was not addressed to your account.';
  end if;

  update public.tenant_property_access
  set tenant_user_id = auth.uid(), status = 'Active', accepted_at = now()
  where id = p_access_id
  returning * into v_row;

  return v_row;
end;
$$;

-- ==================================================================
-- property_conversations — property-scoped conversations between the
-- owner and one tenant relationship.
-- ==================================================================
create table if not exists public.property_conversations (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  tenant_access_id uuid not null references public.tenant_property_access(id) on delete cascade,
  -- Optional link to a real Maintenance record (Section C: "reuse the
  -- existing maintenance-request architecture where practical" without
  -- duplicating it) — set by the owner once/if they formalize a
  -- conversation into a tracked maintenance item. Never set by a tenant.
  maintenance_request_id uuid references public.maintenance_requests(id) on delete set null,
  subject text not null,
  conversation_type text not null default 'General' check (conversation_type in ('General', 'Maintenance', 'Lease', 'Question', 'Other')),
  status text not null default 'Open' check (status in ('Open', 'Closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists property_conversations_property_idx on public.property_conversations(property_id);
create index if not exists property_conversations_owner_idx on public.property_conversations(owner_id);
create index if not exists property_conversations_tenant_access_idx on public.property_conversations(tenant_access_id);
create index if not exists property_conversations_maintenance_idx on public.property_conversations(maintenance_request_id);

alter table public.property_conversations enable row level security;

-- SELECT: owner of the property, or the active tenant on the specific
-- access row this conversation belongs to. Relational (EXISTS through
-- tenant_property_access), never a bare owner_id check alone — this is
-- what stops Tenant A from ever reading Tenant B's conversation even if
-- they somehow learned its id, and what makes a Revoked tenant lose
-- access immediately (the EXISTS stops matching the moment status flips).
drop policy if exists "property_conversations_select" on public.property_conversations;
create policy "property_conversations_select" on public.property_conversations for select to authenticated using (
  (select auth.uid()) = owner_id
  or exists (
    select 1 from public.tenant_property_access tpa
    where tpa.id = tenant_access_id and tpa.status = 'Active' and tpa.tenant_user_id = (select auth.uid())
  )
);

-- INSERT: either the owner (for their own property, referencing one of
-- their own tenant_property_access rows on that same property), or the
-- active tenant on that access row (starting a conversation themselves —
-- Section D: "tenant can submit issue"). Either way owner_id must equal
-- the access row's real owner_id, never a value the caller invents.
drop policy if exists "property_conversations_insert" on public.property_conversations;
create policy "property_conversations_insert" on public.property_conversations for insert to authenticated with check (
  owner_id = (select tpa.owner_id from public.tenant_property_access tpa where tpa.id = tenant_access_id)
  and property_id = (select tpa.property_id from public.tenant_property_access tpa where tpa.id = tenant_access_id)
  and (
    (select auth.uid()) = owner_id
    or exists (
      select 1 from public.tenant_property_access tpa
      where tpa.id = tenant_access_id and tpa.status = 'Active' and tpa.tenant_user_id = (select auth.uid())
    )
  )
);

-- UPDATE: owner only (subject/status/maintenance_request_id). Tenants
-- never update conversation-level fields, only post messages into it.
drop policy if exists "property_conversations_update_owner" on public.property_conversations;
create policy "property_conversations_update_owner" on public.property_conversations for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);
-- No DELETE policy — conversations are retired via status='Closed', never removed.

create or replace function public.property_conversations_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists property_conversations_touch_updated_at on public.property_conversations;
create trigger property_conversations_touch_updated_at
  before update on public.property_conversations
  for each row
  execute function public.property_conversations_set_updated_at();

-- ==================================================================
-- property_messages — the actual thread. sender_role/sender_user_id are
-- NEVER trusted from the client; a BEFORE INSERT trigger derives both
-- from auth.uid() and the conversation's real owner/tenant relationship.
-- ==================================================================
create table if not exists public.property_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.property_conversations(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  sender_role text not null check (sender_role in ('Owner', 'Tenant')),
  message text not null,
  created_at timestamptz not null default now()
);
create index if not exists property_messages_conversation_idx on public.property_messages(conversation_id, created_at);

alter table public.property_messages enable row level security;

-- SELECT/INSERT membership check is identical: same conversation
-- membership rule as property_conversations_select above.
drop policy if exists "property_messages_select" on public.property_messages;
create policy "property_messages_select" on public.property_messages for select to authenticated using (
  exists (
    select 1 from public.property_conversations pc
    where pc.id = conversation_id
      and (
        pc.owner_id = (select auth.uid())
        or exists (
          select 1 from public.tenant_property_access tpa
          where tpa.id = pc.tenant_access_id and tpa.status = 'Active' and tpa.tenant_user_id = (select auth.uid())
        )
      )
  )
);

-- INSERT: any conversation member (owner or active tenant) may post —
-- the trigger below (which runs BEFORE this check, since it's a BEFORE
-- INSERT trigger) has already forced sender_user_id/sender_role to the
-- correct, non-spoofable values by the time this with-check evaluates,
-- so this is only re-verifying the caller belongs to the conversation at
-- all, same rule as the select policy.
drop policy if exists "property_messages_insert" on public.property_messages;
create policy "property_messages_insert" on public.property_messages for insert to authenticated with check (
  exists (
    select 1 from public.property_conversations pc
    where pc.id = conversation_id
      and (
        pc.owner_id = (select auth.uid())
        or exists (
          select 1 from public.tenant_property_access tpa
          where tpa.id = pc.tenant_access_id and tpa.status = 'Active' and tpa.tenant_user_id = (select auth.uid())
        )
      )
  )
);
-- No UPDATE/DELETE policy — messages are immutable once posted.

create or replace function public.derive_message_sender_role()
returns trigger
language plpgsql
as $$
declare
  v_owner_id uuid;
  v_tenant_user_id uuid;
  v_tenant_status text;
begin
  -- Force the sender to whoever is actually making this request — never
  -- whatever the client happened to send in the insert payload.
  new.sender_user_id := auth.uid();
  if new.sender_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  select pc.owner_id into v_owner_id
  from public.property_conversations pc
  where pc.id = new.conversation_id;

  if v_owner_id is null then
    raise exception 'Conversation not found.';
  end if;

  if v_owner_id = new.sender_user_id then
    new.sender_role := 'Owner';
    return new;
  end if;

  select tpa.tenant_user_id, tpa.status into v_tenant_user_id, v_tenant_status
  from public.property_conversations pc
  join public.tenant_property_access tpa on tpa.id = pc.tenant_access_id
  where pc.id = new.conversation_id;

  if v_tenant_user_id = new.sender_user_id and v_tenant_status = 'Active' then
    new.sender_role := 'Tenant';
    return new;
  end if;

  raise exception 'Not authorized to post in this conversation.';
end;
$$;

drop trigger if exists property_messages_derive_sender on public.property_messages;
create trigger property_messages_derive_sender
  before insert on public.property_messages
  for each row
  execute function public.derive_message_sender_role();

-- ==================================================================
-- property_message_attachments — image attachments for a message
-- (Section F). Storage object itself lives in the private
-- tenant-connect-attachments bucket, below; this row is the DB-side
-- record tying a storage path to the message/conversation for
-- authorization and listing.
-- ==================================================================
create table if not exists public.property_message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.property_messages(id) on delete cascade,
  storage_path text not null unique,
  mime_type text,
  size_bytes bigint not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists property_message_attachments_message_idx on public.property_message_attachments(message_id);

alter table public.property_message_attachments enable row level security;

drop policy if exists "property_message_attachments_select" on public.property_message_attachments;
create policy "property_message_attachments_select" on public.property_message_attachments for select to authenticated using (
  exists (
    select 1 from public.property_messages pm
    join public.property_conversations pc on pc.id = pm.conversation_id
    where pm.id = message_id
      and (
        pc.owner_id = (select auth.uid())
        or exists (
          select 1 from public.tenant_property_access tpa
          where tpa.id = pc.tenant_access_id and tpa.status = 'Active' and tpa.tenant_user_id = (select auth.uid())
        )
      )
  )
);

-- INSERT additionally requires the attaching message to actually belong
-- to the caller (sender_user_id = auth.uid()) — you can only attach a
-- file to a message you yourself just sent, not retroactively attach to
-- someone else's message in a conversation you're a member of.
drop policy if exists "property_message_attachments_insert" on public.property_message_attachments;
create policy "property_message_attachments_insert" on public.property_message_attachments for insert to authenticated with check (
  exists (
    select 1 from public.property_messages pm
    where pm.id = message_id and pm.sender_user_id = (select auth.uid())
  )
);
-- No UPDATE/DELETE policy — attachments are immutable once posted, same as messages.

-- ==================================================================
-- property_conversation_reads — minimal per-user "last read" marker so
-- the owner-side Tenant Connect list can show an unread indicator
-- (Section E: "if implemented safely") without guessing at anything —
-- a conversation is unread for a user when its latest message's
-- created_at is newer than that user's own last_read_at row (or no row
-- exists yet at all).
-- ==================================================================
create table if not exists public.property_conversation_reads (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.property_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  unique (conversation_id, user_id)
);
create index if not exists property_conversation_reads_user_idx on public.property_conversation_reads(user_id);

alter table public.property_conversation_reads enable row level security;

-- A user may only ever read/write their OWN read-marker row, and only
-- for a conversation they're actually a member of (same membership rule
-- as property_conversations_select) — this table can't be used to probe
-- who else is in a conversation or to mark it read/unread for anyone else.
drop policy if exists "property_conversation_reads_select" on public.property_conversation_reads;
create policy "property_conversation_reads_select" on public.property_conversation_reads for select to authenticated using (
  user_id = (select auth.uid())
);

drop policy if exists "property_conversation_reads_upsert" on public.property_conversation_reads;
create policy "property_conversation_reads_upsert" on public.property_conversation_reads for insert to authenticated with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.property_conversations pc
    where pc.id = conversation_id
      and (
        pc.owner_id = (select auth.uid())
        or exists (
          select 1 from public.tenant_property_access tpa
          where tpa.id = pc.tenant_access_id and tpa.status = 'Active' and tpa.tenant_user_id = (select auth.uid())
        )
      )
  )
);

drop policy if exists "property_conversation_reads_update" on public.property_conversation_reads;
create policy "property_conversation_reads_update" on public.property_conversation_reads for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- ==================================================================
-- Private storage bucket for message attachments (Section F). Folder
-- convention: <conversation_id>/<file>. Unlike property-documents/
-- property-photos (folder-scoped to the uploader's own UID, since those
-- are strictly owner-exclusive), attachments here must be readable by
-- BOTH conversation participants, so the policy below checks real
-- conversation membership instead of a bare foldername-equals-uid check.
-- ==================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tenant-connect-attachments',
  'tenant-connect-attachments',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "tenant_connect_attachments_select" on storage.objects;
create policy "tenant_connect_attachments_select" on storage.objects for select to authenticated
using (
  bucket_id = 'tenant-connect-attachments'
  and exists (
    select 1 from public.property_conversations pc
    where pc.id::text = (storage.foldername(name))[1]
      and (
        pc.owner_id = (select auth.uid())
        or exists (
          select 1 from public.tenant_property_access tpa
          where tpa.id = pc.tenant_access_id and tpa.status = 'Active' and tpa.tenant_user_id = (select auth.uid())
        )
      )
  )
);

drop policy if exists "tenant_connect_attachments_insert" on storage.objects;
create policy "tenant_connect_attachments_insert" on storage.objects for insert to authenticated
with check (
  bucket_id = 'tenant-connect-attachments'
  and exists (
    select 1 from public.property_conversations pc
    where pc.id::text = (storage.foldername(name))[1]
      and (
        pc.owner_id = (select auth.uid())
        or exists (
          select 1 from public.tenant_property_access tpa
          where tpa.id = pc.tenant_access_id and tpa.status = 'Active' and tpa.tenant_user_id = (select auth.uid())
        )
      )
  )
);
-- No UPDATE/DELETE storage policy — attachments are immutable once posted, same as the DB row above.
