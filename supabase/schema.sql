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
-- owner_has_tenant_connect(uuid) — the ONE place the tenantConnect plan
-- check lives (production-hardening pass). Mirrors
-- lib/billing/entitlements.ts's resolveEffectivePlan()/TENANT_CONNECT_ENABLED
-- exactly: a plan only counts if the subscription status is currently
-- entitled ('active', 'trialing', 'past_due' — same set as
-- ENTITLED_STATUSES), and only 'portfolio', 'portfolio_pro', and the
-- internal 'owner' plan grant Tenant Connect. No row at all (a brand-new
-- Free account that has never touched Stripe) correctly evaluates to
-- false, same as every other plan check in this codebase.
--
-- SECURITY DEFINER is required here for a real reason, not convenience:
-- this function is called from tenant-side policies too (a tenant
-- replying needs the OWNER's plan checked, not their own — see the
-- completion report), and user_subscriptions' own RLS only lets a caller
-- see their OWN row (owner_id = auth.uid()). Without SECURITY DEFINER, a
-- tenant's query would never be able to evaluate their landlord's plan at
-- all. The function only ever returns a boolean — never a row, a plan
-- name, or a status — so this elevated read can't leak anything beyond
-- "does this specific owner_id currently have Tenant Connect."
--
-- This is the single reusable helper referenced by every Tenant Connect
-- CREATE policy below, rather than duplicating this plan/status logic
-- five separate times.
create or replace function public.owner_has_tenant_connect(p_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_subscriptions us
    where us.owner_id = p_owner_id
      and us.status in ('active', 'trialing', 'past_due')
      and us.plan in ('portfolio', 'portfolio_pro', 'owner')
  );
$$;

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

-- INSERT: only an owner, only for a property they own, only as a fresh
-- Invited row (tenant_user_id must be null — the only path to Active is
-- accept_tenant_invite() below, never a direct client insert), and only
-- when the OWNER's own current plan includes Tenant Connect
-- (production-hardening pass — see owner_has_tenant_connect() above).
-- This is a Free/Investor owner's only Tenant Connect touchpoint (they
-- can never even create the access row), so gating it here is enough to
-- keep them out of the feature entirely — everything downstream
-- (conversations, messages) additionally re-checks the same plan anyway.
drop policy if exists "tenant_access_insert_owner" on public.tenant_property_access;
create policy "tenant_access_insert_owner" on public.tenant_property_access for insert to authenticated with check (
  (select auth.uid()) = owner_id
  and exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid()))
  and status = 'Invited'
  and tenant_user_id is null
  and public.owner_has_tenant_connect(owner_id)
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
--
-- Production-hardening pass: the acceptance write is now a SINGLE atomic
-- `update ... where id = ... and status = 'Invited' and lower(email) =
-- lower(...)`, not a separate SELECT-then-UPDATE. The original two-step
-- version had a real (if narrow) TOCTOU race: two concurrent calls could
-- both pass the initial SELECT-based check before either committed its
-- UPDATE, and since that UPDATE's WHERE clause didn't re-verify status,
-- a second, already-superseded call could silently overwrite
-- tenant_user_id right after a legitimate first acceptance. Baking the
-- status/email condition directly into the UPDATE's WHERE clause closes
-- that gap the same way M8's duplicate-analysis protection does
-- (property_documents.analysis_status conditional UPDATE) — only one
-- concurrent caller can ever match and win the row lock.
--
-- Error messages are deliberately generic and never echo back
-- tenant_email, owner_id, or property_id — calling this with someone
-- else's access id, a revoked id, or a bogus id all fail the same way a
-- legitimate-but-already-claimed id does ("not available to accept"),
-- so no response here distinguishes "this id exists but isn't yours"
-- from "this id doesn't exist" from "this id was already claimed" in any
-- way that discloses another user's email address. Access ids are
-- random v4 UUIDs (122 bits), never sequential or guessable, and this
-- function only ever accepts an id — never a raw email — so there is no
-- path through it to test "does tenant X have a pending invite."
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

  update public.tenant_property_access
  set tenant_user_id = auth.uid(), status = 'Active', accepted_at = now()
  where id = p_access_id
    and status = 'Invited'
    and lower(tenant_email) = lower(v_email)
  returning * into v_row;

  if v_row.id is null then
    raise exception 'This invite is not available to accept.';
  end if;

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
-- the access row's real owner_id, never a value the caller invents, AND
-- (production-hardening pass) the OWNER's own current plan must include
-- Tenant Connect — checked identically whether the OWNER or the TENANT
-- is the one creating the conversation. This is the "entitlement belongs
-- to the landlord account, not the tenant" rule from the completion
-- report: a tenant's own plan is never consulted (tenants don't have a
-- Tenant Connect plan of their own to check), only the property owner's.
drop policy if exists "property_conversations_insert" on public.property_conversations;
create policy "property_conversations_insert" on public.property_conversations for insert to authenticated with check (
  owner_id = (select tpa.owner_id from public.tenant_property_access tpa where tpa.id = tenant_access_id)
  and property_id = (select tpa.property_id from public.tenant_property_access tpa where tpa.id = tenant_access_id)
  and public.owner_has_tenant_connect(owner_id)
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
-- all, same rule as the select policy — PLUS (production-hardening pass)
-- that the conversation's OWNER still currently has Tenant Connect. This
-- is deliberately checked on every message, not just at conversation
-- creation time: if an owner's plan is later downgraded, new messages
-- (from either side) stop being creatable in their existing
-- conversations too, even though those conversations/messages remain
-- readable (this policy only gates INSERT, never SELECT — existing data
-- is never hidden by a downgrade, same convention as every other plan
-- check in this codebase). A tenant's OWN plan is never consulted here —
-- exactly the "entitlement belongs to the landlord account" rule.
drop policy if exists "property_messages_insert" on public.property_messages;
create policy "property_messages_insert" on public.property_messages for insert to authenticated with check (
  exists (
    select 1 from public.property_conversations pc
    where pc.id = conversation_id
      and public.owner_has_tenant_connect(pc.owner_id)
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
-- someone else's message in a conversation you're a member of. Also
-- requires (production-hardening pass) the message's conversation's
-- owner to currently have Tenant Connect — since sender_user_id already
-- proves the caller is a legitimate member (the message row could only
-- have been created under property_messages_insert's own entitlement
-- check above), this is mostly defense-in-depth against a plan
-- downgrade landing between the message insert and the attachment
-- insert in the same request.
drop policy if exists "property_message_attachments_insert" on public.property_message_attachments;
create policy "property_message_attachments_insert" on public.property_message_attachments for insert to authenticated with check (
  exists (
    select 1 from public.property_messages pm
    join public.property_conversations pc on pc.id = pm.conversation_id
    where pm.id = message_id
      and pm.sender_user_id = (select auth.uid())
      and public.owner_has_tenant_connect(pc.owner_id)
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

-- Upload additionally requires (production-hardening pass) the target
-- conversation's owner to currently have Tenant Connect — this is the
-- actual upload gate (the DB row insert above is necessary but the
-- browser talks to Storage directly for the file bytes, so the same
-- check must be re-enforced here, not just on property_message_attachments).
drop policy if exists "tenant_connect_attachments_insert" on storage.objects;
create policy "tenant_connect_attachments_insert" on storage.objects for insert to authenticated
with check (
  bucket_id = 'tenant-connect-attachments'
  and exists (
    select 1 from public.property_conversations pc
    where pc.id::text = (storage.foldername(name))[1]
      and public.owner_has_tenant_connect(pc.owner_id)
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

-- ============================================================
-- Milestone 11: Privacy-First Admin Analytics
-- (mirrors supabase/milestone-11-admin-analytics.sql exactly)
-- ============================================================
-- PropRoster Milestone 11: Privacy-First Admin Analytics.
--
-- Goal (see the completion report for the full rationale): give PropRoster
-- staff enough aggregate visibility to operate the SaaS business — growth,
-- subscription mix, feature adoption, AI cost, platform health — WITHOUT
-- ever exposing individual customer portfolio contents (addresses,
-- documents, tenants, financials, mortgages, insurance, investment
-- analyses, Tenant Connect messages). This file adds ONLY:
--
--   1. admin_roles           — server/database-controlled admin flag.
--   2. admin_audit_events    — append-only log of admin actions.
--   3. is_admin()            — the one place admin status is resolved.
--   4. Six SECURITY DEFINER aggregate functions — the ONLY way admin data
--      leaves the database. Every one authorizes the caller internally,
--      returns nothing but counts/sums/averages (never a portfolio row),
--      and is documented with exactly which columns it touches and why
--      that's safe.
--
-- Nothing here modifies any existing table, policy, or trigger. This is
-- purely additive.
--
-- ============================================================
-- 1. admin_roles — the ONLY source of truth for "is this user an admin."
-- ============================================================
-- Deliberately NOT derived from:
--   - any client-supplied value (there is no adminOverride flag anywhere)
--   - email domain (a client/attacker-controlled auth.users column)
--   - the 'owner' subscription plan (a SEPARATE, purely billing concept —
--     see lib/billing/plans.ts's 'owner' entry. An internal team member
--     could have BOTH an 'owner' subscription AND an admin_roles row, or
--     either alone, or neither; this table never reads user_subscriptions
--     and is_admin() below never reads it either).
--
-- There is deliberately no INSERT/UPDATE/DELETE policy for `authenticated`
-- at all, so RLS denies every client-side write with zero policies present
-- — the exact same pattern already used for stripe_webhook_events and the
-- internal 'owner' plan elsewhere in this schema. The ONLY way a row is
-- ever created here is a direct SQL statement run by a human operator with
-- database access (e.g. via the Supabase SQL Editor with the service
-- role/superuser connection) — never through this app's API surface. This
-- is what makes "normal users must never be able to make themselves
-- admins" true by construction, not convention.
--
-- revoked_at (nullable) lets an admin grant be revoked without deleting
-- history — is_admin() below only counts a row where revoked_at is null.
create table if not exists public.admin_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index if not exists admin_roles_active_idx on public.admin_roles(user_id) where revoked_at is null;

alter table public.admin_roles enable row level security;
-- No policies for `authenticated` — RLS enabled with zero policies denies
-- all client access (select, insert, update, delete alike). Only
-- SECURITY DEFINER functions below (is_admin()) and direct
-- operator/service-role SQL ever touch this table.

-- To grant/revoke admin access, run one of these directly against the
-- database (never exposed through any API route or UI in this app):
--
--   insert into public.admin_roles (user_id, granted_by)
--   values ('<uuid-of-new-admin>', '<uuid-of-granting-operator>');
--
--   update public.admin_roles set revoked_at = now() where user_id = '<uuid>';

-- ==================================================================
-- is_admin(uuid) — the ONE place admin status is resolved anywhere in
-- this codebase. Every admin-gated route/RPC calls this, never
-- duplicates the admin_roles lookup inline.
--
-- SECURITY DEFINER is required because admin_roles has no SELECT policy
-- for `authenticated` at all (see above) — a plain query from the caller's
-- own RLS context would see zero rows even for a real admin. This
-- function only ever returns a boolean, never a row, so the elevated read
-- can't leak anything beyond "is this specific user_id currently an
-- admin." Defaults to the caller's own auth.uid() when no argument is
-- given, matching the owner_has_tenant_connect(uuid) convention already
-- used in this schema (Milestone 10) for the same "elevated boolean
-- check, nothing else" shape.
-- ==================================================================
create or replace function public.is_admin(p_user_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_roles ar
    where ar.user_id = coalesce(p_user_id, auth.uid())
      and ar.revoked_at is null
  );
$$;

-- ============================================================
-- 2. admin_audit_events — append-only log of meaningful admin actions.
-- ============================================================
-- admin_user_id: who did it. target_user_id: nullable — set only for
-- actions that concern one specific account (none yet; reserved for a
-- future GRANT_INTERNAL_ROLE/REVOKE_INTERNAL_ROLE/CHANGE_ACCOUNT_STATUS
-- action, none of which this pass implements). metadata is operational
-- context ONLY — e.g. {} or a section name — application code must never
-- write a secret, a document id, a property address, or any other
-- customer-portfolio value into this column. `action` is deliberately a
-- free-text column, not a check-constrained enum: the exact action
-- vocabulary is defined and validated in TypeScript
-- (lib/admin/audit-actions.ts), not the database, so adding a new
-- documented action never requires a migration.
create table if not exists public.admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  target_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_events_admin_idx on public.admin_audit_events(admin_user_id, created_at desc);
create index if not exists admin_audit_events_action_idx on public.admin_audit_events(action);
create index if not exists admin_audit_events_target_idx on public.admin_audit_events(target_user_id);

alter table public.admin_audit_events enable row level security;

-- SELECT: any current admin may read the full audit log (this is an
-- internal ops tool — the audit trail itself is not per-admin private).
-- A normal, non-admin user gets zero rows, same mechanism as every other
-- RLS-gated table in this codebase.
drop policy if exists "admin_audit_events_select_admin" on public.admin_audit_events;
create policy "admin_audit_events_select_admin" on public.admin_audit_events for select to authenticated
using (public.is_admin((select auth.uid())));

-- INSERT: an authenticated admin may insert an audit row for THEIR OWN
-- admin_user_id only, and only while they currently pass is_admin() —
-- this is what lets the app log "VIEW_ADMIN_ANALYTICS" via a normal
-- RLS-scoped client call (the same pattern as ai_usage_events' own-row
-- insert policy) rather than needing a service-role key or another
-- SECURITY DEFINER function just to write a log line.
drop policy if exists "admin_audit_events_insert_admin" on public.admin_audit_events;
create policy "admin_audit_events_insert_admin" on public.admin_audit_events for insert to authenticated
with check (
  admin_user_id = (select auth.uid())
  and public.is_admin((select auth.uid()))
);
-- No UPDATE or DELETE policy: append-only audit trail, same convention as
-- ai_usage_events — RLS denies both by default with no policy present.

-- ============================================================
-- 3. Aggregate RPCs. Every function below:
--   - is SECURITY DEFINER with search_path pinned to `public` explicitly
--     (never trusts the caller's search_path)
--   - re-checks public.is_admin((select auth.uid())) as its very first
--     statement and RAISEs an insufficient_privilege error otherwise —
--     the same errcode a real RLS denial would surface, so a non-admin
--     caller cannot distinguish "this RPC doesn't exist" from "you're not
--     an admin" from any other RLS-style rejection anywhere else in the
--     app
--   - returns ONLY pre-aggregated counts/sums/averages — never a raw
--     properties/documents/leases/etc. row, never an address, never
--     document content, never a tenant message
--   - is documented with the exact source tables/columns it reads and
--     why each one is safe to aggregate
-- ============================================================

-- ------------------------------------------------------------
-- admin_overview_metrics() — USERS section.
-- Reads: auth.users(id, created_at, last_sign_in_at) only — no profile
-- fields, no email is selected here (email appears only in
-- admin_list_user_accounts() below, which is explicitly documented as
-- exposing account email as minimum account metadata, per the completion
-- report's Section 5 allow-list).
-- "Active user" is defined narrowly and explicitly, never guessed: signed
-- in within the last 30 days, using Supabase Auth's own last_sign_in_at —
-- a safe, already-existing definition rather than inventing an
-- engagement heuristic.
-- ------------------------------------------------------------
create or replace function public.admin_overview_metrics()
returns table(
  total_users bigint,
  new_users_this_month bigint,
  active_users_30d bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin((select auth.uid())) then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  return query
  select
    count(*)::bigint,
    count(*) filter (where u.created_at >= date_trunc('month', now()))::bigint,
    count(*) filter (where u.last_sign_in_at >= now() - interval '30 days')::bigint
  from auth.users u;
end;
$$;

-- ------------------------------------------------------------
-- admin_subscription_metrics() — SUBSCRIPTIONS section.
-- Reads: user_subscriptions(plan, status) grouped and counted — never
-- owner_id, never stripe_customer_id/stripe_subscription_id. Pricing
-- (needed to turn these counts into MRR) intentionally does NOT live in
-- SQL — it's computed in TypeScript from the exact same PLANS catalog
-- (lib/billing/plans.ts) the rest of the app already uses for pricing
-- display, so there is one source of truth for "what a plan costs," not
-- two that can drift.
-- ------------------------------------------------------------
create or replace function public.admin_subscription_metrics()
returns table(
  plan text,
  status text,
  account_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin((select auth.uid())) then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  return query
  select us.plan, us.status, count(*)::bigint
  from public.user_subscriptions us
  group by us.plan, us.status;
end;
$$;

-- ------------------------------------------------------------
-- admin_portfolio_usage_metrics() — PORTFOLIO USAGE section.
-- Reads: properties(owner_id) ONLY — grouped by owner_id purely to COUNT
-- rows per owner, never selecting address/estimated_value/mortgage_balance
-- or any other column. owner_id itself never leaves this function (it's
-- consumed inside the CTE, not returned). The result is five bucket
-- counts plus an average/median restricted to the population of owners
-- who have at least one property (matching the buckets, which start at
-- "1 property") — average-across-ALL-registered-accounts is computed in
-- TypeScript instead, by dividing this function's total_properties by
-- admin_overview_metrics()'s total_users, so this function never needs to
-- touch auth.users at all.
-- ------------------------------------------------------------
create or replace function public.admin_portfolio_usage_metrics()
returns table(
  total_properties bigint,
  owners_with_properties bigint,
  avg_properties_per_owner numeric,
  median_properties_per_owner numeric,
  bucket_1 bigint,
  bucket_2_4 bigint,
  bucket_5_9 bigint,
  bucket_10_20 bigint,
  bucket_21_plus bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin((select auth.uid())) then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  return query
  with per_owner as (
    select p.owner_id, count(*) as property_count
    from public.properties p
    group by p.owner_id
  )
  select
    coalesce(sum(property_count), 0)::bigint,
    count(*)::bigint,
    coalesce(avg(property_count), 0)::numeric,
    coalesce(percentile_cont(0.5) within group (order by property_count), 0)::numeric,
    count(*) filter (where property_count = 1)::bigint,
    count(*) filter (where property_count between 2 and 4)::bigint,
    count(*) filter (where property_count between 5 and 9)::bigint,
    count(*) filter (where property_count between 10 and 20)::bigint,
    count(*) filter (where property_count >= 21)::bigint
  from per_owner;
end;
$$;

-- ------------------------------------------------------------
-- admin_feature_adoption_metrics() — FEATURE ADOPTION section.
-- Reads only owner_id (for distinct-user counts) and row counts from
-- investment_analyses, document_analyses, and tenant_property_access —
-- never address/results/structured_data/tenant_email or any other
-- content column from those tables. Property Watch, Home Purchase
-- Calculator, and Property Value & Comps have no tables yet (not built),
-- so they are intentionally absent here rather than guessed — the
-- TypeScript layer renders them as "not available yet," never a fake 0.
-- ------------------------------------------------------------
create or replace function public.admin_feature_adoption_metrics()
returns table(
  investment_tools_users bigint,
  investment_analyses_count bigint,
  document_intelligence_users bigint,
  document_analyses_count bigint,
  tenant_connect_owner_count bigint,
  tenant_connect_active_relationships bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin((select auth.uid())) then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  return query
  select
    (select count(distinct ia.owner_id) from public.investment_analyses ia)::bigint,
    (select count(*) from public.investment_analyses)::bigint,
    (select count(distinct da.owner_id) from public.document_analyses da)::bigint,
    (select count(*) from public.document_analyses)::bigint,
    (select count(distinct tpa.owner_id) from public.tenant_property_access tpa where tpa.status <> 'Revoked')::bigint,
    (select count(*) from public.tenant_property_access tpa where tpa.status = 'Active')::bigint;
end;
$$;

-- ------------------------------------------------------------
-- admin_ai_usage_summary() — AI USAGE section (month-to-date totals).
-- Reads only owner_id/input_tokens/output_tokens/created_at from
-- ai_usage_events — never document_id/analysis_id are returned, and this
-- function never joins into document_analyses or property_documents, so
-- no document content or structured extraction result is anywhere near
-- this query.
-- ------------------------------------------------------------
create or replace function public.admin_ai_usage_summary()
returns table(
  analyses_this_month bigint,
  input_tokens_this_month bigint,
  output_tokens_this_month bigint,
  active_ai_users_this_month bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin((select auth.uid())) then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  return query
  select
    count(*)::bigint,
    coalesce(sum(e.input_tokens), 0)::bigint,
    coalesce(sum(e.output_tokens), 0)::bigint,
    count(distinct e.owner_id)::bigint
  from public.ai_usage_events e
  where e.created_at >= date_trunc('month', now());
end;
$$;

-- ------------------------------------------------------------
-- admin_ai_usage_daily(p_days) — AI USAGE section (cost by day/model, for
-- the "AI analyses/day" chart and cost-by-day breakdown). Grouped by
-- (day, model) so TypeScript can price each row against the correct
-- per-model rate (lib/admin/pricing.ts) rather than assuming every call
-- used the same model — never returns owner_id, document_id, or
-- analysis_id, so it cannot be used to reconstruct "who ran what."
-- p_days is clamped to [1, 365] so a caller can't force an unbounded
-- full-table scan/response.
-- ------------------------------------------------------------
create or replace function public.admin_ai_usage_daily(p_days integer default 30)
returns table(
  usage_date date,
  model text,
  analyses_count bigint,
  input_tokens bigint,
  output_tokens bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days integer;
begin
  if not public.is_admin((select auth.uid())) then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  v_days := greatest(least(coalesce(p_days, 30), 365), 1);

  return query
  select
    date_trunc('day', e.created_at)::date,
    e.model,
    count(*)::bigint,
    coalesce(sum(e.input_tokens), 0)::bigint,
    coalesce(sum(e.output_tokens), 0)::bigint
  from public.ai_usage_events e
  where e.created_at >= now() - (v_days || ' days')::interval
  group by date_trunc('day', e.created_at), e.model
  order by date_trunc('day', e.created_at) asc;
end;
$$;

-- ------------------------------------------------------------
-- admin_list_user_accounts(p_limit, p_offset) — minimum account metadata
-- only (Section 5 of the completion report's allow-list). Reads
-- auth.users(id, email, created_at, last_sign_in_at) joined with
-- user_subscriptions(plan, status, stripe_customer_id IS NOT NULL — never
-- the raw stripe_customer_id/stripe_subscription_id/stripe_price_id
-- values themselves) and a properties COUNT per owner. Never reads
-- properties.address, never any document/lease/mortgage/insurance/
-- financial/maintenance/investment-analysis/tenant table. p_limit is
-- clamped to [1, 500] so this can never be used to dump the entire user
-- base in one call.
-- ------------------------------------------------------------
create or replace function public.admin_list_user_accounts(p_limit integer default 200, p_offset integer default 0)
returns table(
  user_id uuid,
  email text,
  signup_date timestamptz,
  last_sign_in_at timestamptz,
  plan text,
  status text,
  has_stripe_customer boolean,
  property_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_limit integer;
  v_offset integer;
begin
  if not public.is_admin((select auth.uid())) then
    raise exception 'Not authorized.' using errcode = '42501';
  end if;

  v_limit := greatest(least(coalesce(p_limit, 200), 500), 1);
  v_offset := greatest(coalesce(p_offset, 0), 0);

  return query
  select
    u.id,
    u.email,
    u.created_at,
    u.last_sign_in_at,
    coalesce(us.plan, 'free'),
    us.status,
    (us.stripe_customer_id is not null),
    coalesce(pc.property_count, 0)::bigint
  from auth.users u
  left join public.user_subscriptions us on us.owner_id = u.id
  left join (
    select p.owner_id, count(*) as property_count
    from public.properties p
    group by p.owner_id
  ) pc on pc.owner_id = u.id
  order by u.created_at desc
  limit v_limit offset v_offset;
end;
$$;
