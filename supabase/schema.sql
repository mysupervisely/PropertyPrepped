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
-- Milestone 11: Property Profile 2.0 Foundation (see milestone-11-property-profile-2.sql
-- for section-by-section commentary — identical content, appended here for a single
-- fresh-project run, matching every prior milestone's convention in this file).
-- ============================================================

-- PropRoster Milestone 11: Property Profile 2.0 Foundation
-- Run once if upgrading an existing project (after Milestone 10).
--
-- Adds: a real user profile table (Section 1/2), additional Overview
-- fields on properties (Section 5), Ownership/Entity recordkeeping
-- (Section 6), Property Systems & Appliances (Section 7), Notes 2.0
-- (Section 8), and the PropCrew extension of the existing
-- property_contacts table (Sections 10-13) — reusing that table rather
-- than duplicating it, since a PropCrew provider IS a property contact,
-- just no longer scoped to a single property.
--
-- Property Timeline (Section 9) intentionally adds NO new table — it is
-- fully derived, client-side, from the tables that already exist (leases,
-- mortgages, insurance_policies, maintenance_records, financial_transactions,
-- property_systems). See lib/property-timeline/derive-timeline.ts for the
-- derivation logic and its doc comment for the full architecture rationale.
--
-- Every new table follows the exact owner_id + RLS pattern already used by
-- every other table in this schema (see schema.sql) — "select to
-- authenticated using ((select auth.uid()) = owner_id)" and the matching
-- insert/update/delete policies, with write policies additionally checking
-- the referenced property_id belongs to the same owner where applicable.

-- ============================================================
-- Section 1/2: User Profile
-- ============================================================
-- 1:1 with auth.users, per Part 1 ("Use a proper user profile data model
-- linked 1:1 to auth.users. Do not rely exclusively on mutable auth
-- metadata"). id IS the primary key AND the FK to auth.users, enforcing
-- the 1:1 relationship structurally, not just by convention.
create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  first_name text,
  last_name text,
  display_name text,
  phone text,
  timezone text,
  photo_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.user_profiles enable row level security;
drop policy if exists "user_profiles_select_own" on public.user_profiles;
create policy "user_profiles_select_own" on public.user_profiles for select to authenticated using ((select auth.uid()) = id);
drop policy if exists "user_profiles_insert_own" on public.user_profiles;
create policy "user_profiles_insert_own" on public.user_profiles for insert to authenticated with check ((select auth.uid()) = id);
drop policy if exists "user_profiles_update_own" on public.user_profiles;
create policy "user_profiles_update_own" on public.user_profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
-- Deliberately no delete policy — a profile row is cleaned up automatically
-- by the `on delete cascade` FK to auth.users when the account itself is
-- deleted; a signed-in user has no reason to delete just the profile row.

-- Auto-creates a blank profile row the moment a new auth user is created,
-- so the app never has to special-case "no profile row yet" beyond the
-- greeting fallback chain itself (Part 1's display/preferred name -> first
-- name -> email prefix -> "there"). Idempotent trigger — safe to re-run
-- this file against a project that already has it.
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute procedure public.handle_new_user_profile();

-- Backfill: existing accounts created before this migration get a blank
-- profile row too, so the greeting fallback chain has a row to read from
-- (still all-null -> still falls back to email prefix, nothing changes
-- visibly until the user actually fills in their profile).
insert into public.user_profiles (id)
select id from auth.users
on conflict (id) do nothing;

-- ============================================================
-- Section 5: additional Property Overview fields
-- ============================================================
-- All nullable, all additive — existing rows are unaffected (every
-- existing property simply reads as "not set yet" for these until the
-- owner fills them in; Part 5: "Never fabricate... omit gracefully or
-- provide a clear Add/Edit action").
alter table public.properties add column if not exists beds integer;
alter table public.properties add column if not exists baths numeric(4,1);
alter table public.properties add column if not exists square_feet integer;
alter table public.properties add column if not exists year_built integer;
alter table public.properties add column if not exists lot_size_sqft integer;
alter table public.properties add column if not exists purchase_date date;
alter table public.properties add column if not exists property_tax_annual numeric(14,2);
alter table public.properties add column if not exists hoa_monthly numeric(14,2);

-- ============================================================
-- Section 6: Ownership / Entity recordkeeping
-- ============================================================
-- Multiple rows per property are allowed on purpose (a partnership with
-- two owners each holding a percentage) — recordkeeping only, never legal
-- advice (Part 6).
create table if not exists public.property_ownership (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  entity_name text not null,
  ownership_type text not null default 'Individual' check (ownership_type in ('Individual', 'LLC', 'Trust', 'Partnership', 'Other')),
  ownership_percentage numeric(5,2),
  acquisition_date date,
  purchase_price numeric(14,2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists property_ownership_property_idx on public.property_ownership(property_id);
create index if not exists property_ownership_owner_idx on public.property_ownership(owner_id);
alter table public.property_ownership enable row level security;
drop policy if exists "property_ownership_select_own" on public.property_ownership;
create policy "property_ownership_select_own" on public.property_ownership for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists "property_ownership_insert_own" on public.property_ownership;
create policy "property_ownership_insert_own" on public.property_ownership for insert to authenticated with check (
  (select auth.uid()) = owner_id
  and exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid()))
);
drop policy if exists "property_ownership_update_own" on public.property_ownership;
create policy "property_ownership_update_own" on public.property_ownership for update to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid()))
);
drop policy if exists "property_ownership_delete_own" on public.property_ownership;
create policy "property_ownership_delete_own" on public.property_ownership for delete to authenticated using ((select auth.uid()) = owner_id);

-- ============================================================
-- Section 7: Property Systems & Appliances
-- ============================================================
create table if not exists public.property_systems (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  system_type text not null check (system_type in (
    'Roof', 'HVAC', 'Water Heater', 'Electrical', 'Plumbing', 'Refrigerator',
    'Range/Oven', 'Dishwasher', 'Washer', 'Dryer', 'Pool Equipment', 'Solar', 'Other'
  )),
  name text,
  manufacturer text,
  model text,
  serial_number text,
  install_date date,
  last_service_date date,
  warranty_expiration date,
  cost numeric(14,2),
  -- The PropCrew provider (property_contacts row) who installed/services
  -- this system, if any — see Section 10-13's PropCrew notes below for why
  -- property_contacts is PropCrew, not a separate table.
  propcrew_contact_id uuid references public.property_contacts(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists property_systems_property_idx on public.property_systems(property_id);
create index if not exists property_systems_owner_idx on public.property_systems(owner_id);
alter table public.property_systems enable row level security;
drop policy if exists "property_systems_select_own" on public.property_systems;
create policy "property_systems_select_own" on public.property_systems for select to authenticated using ((select auth.uid()) = owner_id);
-- SECURITY: propcrew_contact_id is a plain FK — Postgres only enforces
-- that the referenced row EXISTS somewhere, not that it belongs to the
-- same owner. Without the extra check below, Owner A could set
-- propcrew_contact_id to any other owner's property_contacts row (an id
-- they'd have to already know/guess, since UUIDs aren't enumerable, but
-- RLS must not rely on that). "is null or" keeps the field optional.
drop policy if exists "property_systems_insert_own" on public.property_systems;
create policy "property_systems_insert_own" on public.property_systems for insert to authenticated with check (
  (select auth.uid()) = owner_id
  and exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid()))
  and (propcrew_contact_id is null or exists (select 1 from public.property_contacts c where c.id = propcrew_contact_id and c.owner_id = (select auth.uid())))
);
drop policy if exists "property_systems_update_own" on public.property_systems;
create policy "property_systems_update_own" on public.property_systems for update to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid()))
  and (propcrew_contact_id is null or exists (select 1 from public.property_contacts c where c.id = propcrew_contact_id and c.owner_id = (select auth.uid())))
);
drop policy if exists "property_systems_delete_own" on public.property_systems;
create policy "property_systems_delete_own" on public.property_systems for delete to authenticated using ((select auth.uid()) = owner_id);

-- Linked documents (plural, per Part 7) — a system can reference more than
-- one document (e.g. an install invoice AND a warranty PDF), so this is a
-- join table rather than a single document_id column like the simpler
-- module tables (leases/mortgages/etc.) use.
create table if not exists public.property_system_documents (
  id uuid primary key default gen_random_uuid(),
  system_id uuid not null references public.property_systems(id) on delete cascade,
  document_id uuid not null references public.property_documents(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (system_id, document_id)
);
create index if not exists property_system_documents_system_idx on public.property_system_documents(system_id);
alter table public.property_system_documents enable row level security;
drop policy if exists "property_system_documents_select_own" on public.property_system_documents;
create policy "property_system_documents_select_own" on public.property_system_documents for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists "property_system_documents_insert_own" on public.property_system_documents;
create policy "property_system_documents_insert_own" on public.property_system_documents for insert to authenticated with check (
  (select auth.uid()) = owner_id
  and exists (select 1 from public.property_systems s where s.id = system_id and s.owner_id = (select auth.uid()))
  and exists (select 1 from public.property_documents d where d.id = document_id and d.owner_id = (select auth.uid()))
);
drop policy if exists "property_system_documents_delete_own" on public.property_system_documents;
create policy "property_system_documents_delete_own" on public.property_system_documents for delete to authenticated using ((select auth.uid()) = owner_id);

-- "Linked maintenance records" (Part 7) reuses the EXISTING
-- maintenance_records table rather than a new concept — just a nullable
-- pointer back to the system it serviced. This is also the Property
-- Timeline's "system installed/replaced" and "maintenance event" source
-- for a given system (Part 9: "avoid a second source of truth").
alter table public.maintenance_records add column if not exists system_id uuid references public.property_systems(id) on delete set null;
create index if not exists maintenance_records_system_idx on public.maintenance_records(system_id);

-- A real FK from maintenance history to the PropCrew provider who did the
-- work — deliberately NOT inferred by fuzzy-matching maintenance_records'
-- free-text `vendor` field against contact names (Part 12: "Only
-- calculate from real linked records. Never invent spend totals."). This
-- is what makes PropCrew "service history"/"documented spend" (Part 12)
-- a real, linked calculation instead of a guess.
alter table public.maintenance_records add column if not exists propcrew_contact_id uuid references public.property_contacts(id) on delete set null;
create index if not exists maintenance_records_propcrew_contact_idx on public.maintenance_records(propcrew_contact_id);

-- SECURITY: maintenance_records' original (Milestone 5) insert/update
-- policies only ever checked `owner_id = auth.uid()` — they never
-- validated any FK column's target. That was already true of property_id
-- before this milestone (a separate, pre-existing, lower-severity gap:
-- since every read of this table is itself owner_id-scoped, a forged
-- property_id can't leak another owner's data, only create an orphaned
-- row invisible to both owners — out of scope for this milestone, not
-- changed here). The two NEW columns above are this milestone's own
-- responsibility, so their policies are tightened here, in the same
-- drop-and-recreate idiom every other policy in this schema uses, so an
-- existing production project picks up the fix by simply running this
-- upgrade file — no separate patch needed.
drop policy if exists "maintenance_insert_own" on public.maintenance_records;
create policy "maintenance_insert_own" on public.maintenance_records for insert to authenticated with check (
  (select auth.uid()) = owner_id
  and (system_id is null or exists (select 1 from public.property_systems s where s.id = system_id and s.owner_id = (select auth.uid())))
  and (propcrew_contact_id is null or exists (select 1 from public.property_contacts c where c.id = propcrew_contact_id and c.owner_id = (select auth.uid())))
);
drop policy if exists "maintenance_update_own" on public.maintenance_records;
create policy "maintenance_update_own" on public.maintenance_records for update to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and (system_id is null or exists (select 1 from public.property_systems s where s.id = system_id and s.owner_id = (select auth.uid())))
  and (propcrew_contact_id is null or exists (select 1 from public.property_contacts c where c.id = propcrew_contact_id and c.owner_id = (select auth.uid())))
);

-- ============================================================
-- Section 8: Property Notes 2.0
-- ============================================================
-- related_table/related_id are reserved for future record-specific notes
-- (Part 8: "Architect for future record-specific notes, but do not
-- overengineer V1") — always null in V1, where every note is a
-- property-level note; nothing in this milestone reads or writes them yet.
create table if not exists public.property_notes (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  is_pinned boolean not null default false,
  related_table text,
  related_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists property_notes_property_idx on public.property_notes(property_id, is_pinned desc, created_at desc);
alter table public.property_notes enable row level security;
drop policy if exists "property_notes_select_own" on public.property_notes;
create policy "property_notes_select_own" on public.property_notes for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists "property_notes_insert_own" on public.property_notes;
create policy "property_notes_insert_own" on public.property_notes for insert to authenticated with check (
  (select auth.uid()) = owner_id
  and exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid()))
);
drop policy if exists "property_notes_update_own" on public.property_notes;
create policy "property_notes_update_own" on public.property_notes for update to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid()))
);
drop policy if exists "property_notes_delete_own" on public.property_notes;
create policy "property_notes_delete_own" on public.property_notes for delete to authenticated using ((select auth.uid()) = owner_id);

-- ============================================================
-- Sections 10-13: PropCrew
-- ============================================================
-- PropCrew is property_contacts, evolved rather than duplicated (Phase 0:
-- "Avoid duplicate systems" — property_contacts already has exactly
-- PropCrew's shape: name/business_name/role(category)/phone/email/
-- website/notes). Two additive changes make it PropCrew:
--
-- 1. would_use_again + experience_note: the private reuse-preference
--    fields (Part 11). NEVER "review"/"rating"/"feedback" — see the UI
--    copy requirements in components/PropCrewPanel.tsx. Selecting NO must
--    never delete/hide the historical record (enforced by the app layer
--    simply never offering a delete-on-NO action; nothing at the schema
--    level ties would_use_again to row visibility).
alter table public.property_contacts add column if not exists would_use_again text check (would_use_again in ('YES', 'POSSIBLY', 'NO'));
alter table public.property_contacts add column if not exists experience_note text;

-- SECURITY: property_contacts' original (Milestone 6) insert/update
-- policies only ever checked `owner_id = auth.uid()` — property_id
-- itself was never cross-checked against ownership. That was a narrower
-- risk before PropCrew (a contact was just a per-property note); it
-- becomes directly relevant now because PropCrewPanel.save() writes
-- property_id from client-supplied form state (the "primary" associated
-- property in its multi-select), so a forged property_id here is one
-- request away, not a theoretical concern. Tightened here for the same
-- "Owner A cannot link a PropCrew contact to Owner B's property" property
-- that property_contact_links below already enforces for its OWN rows —
-- this closes the same hole on property_contacts' own property_id column.
drop policy if exists "property_contacts_insert_own" on public.property_contacts;
create policy "property_contacts_insert_own" on public.property_contacts for insert to authenticated with check (
  (select auth.uid()) = owner_id
  and exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid()))
);
drop policy if exists "property_contacts_update_own" on public.property_contacts;
create policy "property_contacts_update_own" on public.property_contacts for update to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid()))
);

-- 2. property_contact_links: a provider can serve MULTIPLE properties
--    (Part 10: "One PropCrew provider may be associated with multiple
--    properties"), but property_contacts.property_id is a single FK — kept
--    exactly as-is for backward compatibility (every existing contact's
--    original property association still works unchanged). This join
--    table adds the ADDITIONAL associations on top; a contact's full
--    "associated properties" list is its own property_id UNIONed with
--    every row here.
create table if not exists public.property_contact_links (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.property_contacts(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (contact_id, property_id)
);
create index if not exists property_contact_links_contact_idx on public.property_contact_links(contact_id);
create index if not exists property_contact_links_property_idx on public.property_contact_links(property_id);
alter table public.property_contact_links enable row level security;
drop policy if exists "property_contact_links_select_own" on public.property_contact_links;
create policy "property_contact_links_select_own" on public.property_contact_links for select to authenticated using ((select auth.uid()) = owner_id);
drop policy if exists "property_contact_links_insert_own" on public.property_contact_links;
create policy "property_contact_links_insert_own" on public.property_contact_links for insert to authenticated with check (
  (select auth.uid()) = owner_id
  and exists (select 1 from public.property_contacts c where c.id = contact_id and c.owner_id = (select auth.uid()))
  and exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid()))
);
drop policy if exists "property_contact_links_delete_own" on public.property_contact_links;
create policy "property_contact_links_delete_own" on public.property_contact_links for delete to authenticated using ((select auth.uid()) = owner_id);

-- Backfill: every existing contact's current property_id becomes its
-- first "associated property" link too, so PropCrew's multi-property view
-- and the per-property People tab agree from day one.
insert into public.property_contact_links (contact_id, property_id, owner_id)
select id, property_id, owner_id from public.property_contacts
on conflict (contact_id, property_id) do nothing;

-- ============================================================
-- Section 15 prep: Tenant Connect + PropCrew future integration boundary
-- ============================================================
-- A single nullable pointer so a maintenance request can (later) record
-- which PropCrew provider was assigned to it — no automation/matching is
-- built in this milestone, this only keeps the future flow (Part 15:
-- "owner approves -> relevant PropCrew options shown -> owner selects
-- approved provider(s)") from requiring a schema change when it's built.
alter table public.maintenance_requests add column if not exists assigned_contact_id uuid references public.property_contacts(id) on delete set null;

-- SECURITY: same reasoning as maintenance_records above — this new FK
-- column needs its own ownership check added to the existing (Milestone
-- 6) insert/update policies, which otherwise only checked
-- `owner_id = auth.uid()`.
drop policy if exists "maintenance_requests_insert_own" on public.maintenance_requests;
create policy "maintenance_requests_insert_own" on public.maintenance_requests for insert to authenticated with check (
  (select auth.uid()) = owner_id
  and (assigned_contact_id is null or exists (select 1 from public.property_contacts c where c.id = assigned_contact_id and c.owner_id = (select auth.uid())))
);
drop policy if exists "maintenance_requests_update_own" on public.maintenance_requests;
create policy "maintenance_requests_update_own" on public.maintenance_requests for update to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and (assigned_contact_id is null or exists (select 1 from public.property_contacts c where c.id = assigned_contact_id and c.owner_id = (select auth.uid())))
);


-- ============================================================
-- Milestone 12: Smart Upload Foundation
-- (mirrors supabase/milestone-12-smart-upload.sql exactly)
-- ============================================================
-- PropRoster Milestone 12: Smart Upload Foundation
-- Run once if upgrading an existing project (after Milestone 11).
--
-- Turns the header's "Smart Upload" button (currently a disabled
-- placeholder) into a real ingestion workflow: upload -> AI analysis ->
-- user confirms property -> user reviews extracted fields -> save.
-- Deliberately reuses every existing table/pipeline instead of
-- duplicating any of them (property_documents, document_analyses,
-- financial_transactions, maintenance_records, property_contacts/
-- PropCrew, property_systems) — see the completion report for the full
-- audit. Only two things are genuinely new:
--
-- 1. property_documents.property_id and document_analyses.property_id
--    become NULLABLE. Every existing upload flow always already knew
--    which property a file belonged to (it's opened from inside that
--    property's own Documents tab) — Smart Upload's whole premise is the
--    opposite order: upload and analyze FIRST, then confirm/choose the
--    property. That only requires loosening these two columns, nothing
--    about the rest of the financial/maintenance/lease/insurance schema
--    changes — those are only ever written AFTER the property is known,
--    exactly like every existing flow, so their NOT NULL property_id is
--    untouched.
--
--    Explicitly NOT done here: "General / Portfolio Expense" (an item
--    with NO property at all, ever) is not supported in this milestone —
--    that would additionally require loosening financial_transactions'
--    OWN NOT NULL property_id, a materially bigger, more consequential
--    change (the Financials tab, Property Timeline, and Investment
--    calculations all assume every transaction belongs to exactly one
--    property). See the completion report for the options this needs a
--    real decision on before it's built.
--
-- 2. smart_upload_items: a thin, owner-scoped workflow-state table. NOT a
--    second document store or a second AI pipeline — every row points at
--    exactly one already-canonical property_documents row (the file
--    itself is stored/classified/analyzed exactly like any other
--    document) and exists only to track this ONE workflow's own state:
--    which batch a multi-file upload belongs to, which property the user
--    confirmed, and which downstream records (expense, maintenance
--    record, PropCrew contact) this item has already created — the
--    idempotency guard that stops a double Save from creating duplicates.

-- ============================================================
-- Section 1: let a document exist before its property is known
-- ============================================================
alter table public.property_documents alter column property_id drop not null;
alter table public.document_analyses alter column property_id drop not null;

-- The existing property_documents write policies (Milestone 8 hardening)
-- required property_id to already reference one of the caller's own
-- properties. A NULL property_id must remain allowed (Smart Upload's
-- pre-confirmation state) without opening a hole for a forged one.
drop policy if exists "documents_insert_own" on public.property_documents;
create policy "documents_insert_own" on public.property_documents for insert to authenticated with check (
  (select auth.uid()) = owner_id
  and (property_id is null or exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid())))
);
drop policy if exists "documents_update_own" on public.property_documents;
create policy "documents_update_own" on public.property_documents for update to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and (property_id is null or exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid())))
);

-- Same idea for document_analyses, which additionally requires its own
-- property_id to match the document's property_id — "= " must become
-- "is not distinct from" so two NULLs (Smart Upload analyzing before a
-- property is chosen) still count as matching instead of vacuously
-- failing (NULL = NULL is NULL, not true, in SQL). The outer reference
-- MUST be qualified as document_analyses.property_id, not bare
-- property_id — inside the EXISTS subquery, an unqualified property_id
-- resolves to the subquery's own pd.property_id (its innermost scope),
-- not the row being inserted/updated, which would silently compare
-- pd.property_id to itself (always true) instead of to the real target.
-- Caught by supabase/tests/milestone-12-rls.test.sql actually running
-- against a database, not by reading the policy text.
drop policy if exists "document_analyses_insert_own" on public.document_analyses;
create policy "document_analyses_insert_own" on public.document_analyses for insert to authenticated with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.property_documents pd
    where pd.id = document_id
      and pd.owner_id = (select auth.uid())
      and pd.property_id is not distinct from document_analyses.property_id
  )
  and (property_id is null or exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid())))
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
      and pd.property_id is not distinct from document_analyses.property_id
  )
  and (property_id is null or exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid())))
);

-- ============================================================
-- Section 2: Smart Upload workflow state
-- ============================================================
create table if not exists public.smart_upload_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  -- The ONE canonical source document ("save once, use throughout
  -- PropRoster") — a normal property_documents row, analyzed through the
  -- normal document_analyses pipeline. This table never stores a copy of
  -- the file or the analysis, only a pointer plus this workflow's own
  -- progress against it.
  document_id uuid not null references public.property_documents(id) on delete cascade,
  -- Groups files selected together via "Upload Multiple" into one queue
  -- (Section 20) — a single upload still gets a batch_id, just one of
  -- one. Not a foreign key to anything; a shared client-generated value.
  batch_id uuid not null default gen_random_uuid(),
  -- The user's actual confirmed choice (Section 9: "no silent property
  -- guessing" — AI's suggested match is derived at render time from the
  -- stored analysis's extracted address text plus the caller's own
  -- properties, never persisted as a separate "suggested" value that
  -- could drift from that source of truth). Null until confirmed.
  confirmed_property_id uuid references public.properties(id) on delete set null,
  -- Idempotency guards: once set, Save is a no-op for that record type —
  -- see Section 25. Each points at the exact row this item created, so a
  -- retried/double-clicked Save can detect "already done" instead of
  -- inserting a second time.
  created_financial_transaction_id uuid references public.financial_transactions(id) on delete set null,
  created_maintenance_record_id uuid references public.maintenance_records(id) on delete set null,
  created_contact_id uuid references public.property_contacts(id) on delete set null,
  -- Null while still in the entry/analyzing/review flow; set once the
  -- user finishes this item (saved something, or explicitly kept it as a
  -- Documents-only file). Lets a closed/reopened Smart Upload session
  -- show "still needs review" vs "done" per item (Section 21's
  -- leave-and-return foundation).
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists smart_upload_items_owner_idx on public.smart_upload_items(owner_id);
create index if not exists smart_upload_items_batch_idx on public.smart_upload_items(batch_id);
create index if not exists smart_upload_items_document_idx on public.smart_upload_items(document_id);
alter table public.smart_upload_items enable row level security;

drop policy if exists "smart_upload_items_select_own" on public.smart_upload_items;
create policy "smart_upload_items_select_own" on public.smart_upload_items for select to authenticated using ((select auth.uid()) = owner_id);

-- SECURITY: every nullable FK column here points at another owner-scoped
-- table — a plain foreign key only proves the referenced row EXISTS, not
-- that it belongs to the same owner (the FK-forging lesson from Milestone
-- 11's review, applied from the start this time). "is null or exists(...
-- owner_id = caller)" on every one of them.
drop policy if exists "smart_upload_items_insert_own" on public.smart_upload_items;
create policy "smart_upload_items_insert_own" on public.smart_upload_items for insert to authenticated with check (
  (select auth.uid()) = owner_id
  and exists (select 1 from public.property_documents d where d.id = document_id and d.owner_id = (select auth.uid()))
  and (confirmed_property_id is null or exists (select 1 from public.properties p where p.id = confirmed_property_id and p.owner_id = (select auth.uid())))
  and (created_financial_transaction_id is null or exists (select 1 from public.financial_transactions t where t.id = created_financial_transaction_id and t.owner_id = (select auth.uid())))
  and (created_maintenance_record_id is null or exists (select 1 from public.maintenance_records m where m.id = created_maintenance_record_id and m.owner_id = (select auth.uid())))
  and (created_contact_id is null or exists (select 1 from public.property_contacts c where c.id = created_contact_id and c.owner_id = (select auth.uid())))
);
drop policy if exists "smart_upload_items_update_own" on public.smart_upload_items;
create policy "smart_upload_items_update_own" on public.smart_upload_items for update to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and exists (select 1 from public.property_documents d where d.id = document_id and d.owner_id = (select auth.uid()))
  and (confirmed_property_id is null or exists (select 1 from public.properties p where p.id = confirmed_property_id and p.owner_id = (select auth.uid())))
  and (created_financial_transaction_id is null or exists (select 1 from public.financial_transactions t where t.id = created_financial_transaction_id and t.owner_id = (select auth.uid())))
  and (created_maintenance_record_id is null or exists (select 1 from public.maintenance_records m where m.id = created_maintenance_record_id and m.owner_id = (select auth.uid())))
  and (created_contact_id is null or exists (select 1 from public.property_contacts c where c.id = created_contact_id and c.owner_id = (select auth.uid())))
);
drop policy if exists "smart_upload_items_delete_own" on public.smart_upload_items;
create policy "smart_upload_items_delete_own" on public.smart_upload_items for delete to authenticated using ((select auth.uid()) = owner_id);

-- ============================================================
-- Section 3: RLS hardening — financial_transactions / maintenance_records
-- / leases / insurance_policies property_id ownership
-- ============================================================
-- These four tables' INSERT/UPDATE policies have only ever checked
-- owner_id = auth.uid() — never that property_id actually belongs to
-- that same owner. maintenance_records' own Milestone 11 hardening pass
-- explicitly deferred this exact gap as "pre-existing, lower-severity,
-- out of scope for that milestone" (see the comment directly above its
-- policies below, left as historical record) — closed now, on all four
-- tables at once, on request.
--
-- Every SELECT on these tables is already owner_id-scoped, so a forged
-- property_id was never a direct read-leak — but it let a caller
-- create, or move via UPDATE, a financial/maintenance/lease/insurance
-- record against a property_id that isn't theirs: a real data-integrity
-- gap (an orphaned/misattributed record, invisible to both owners),
-- exactly the class of issue Milestone 11's FK-forging review closed
-- elsewhere in this schema. Smart Upload's own new writes were never
-- exposed to this — its property_id always comes from
-- smart_upload_items.confirmed_property_id, itself ownership-checked in
-- Section 2 above — this section is a general fix, not Smart-Upload-
-- specific.
drop policy if exists "financial_transactions_insert_own" on public.financial_transactions;
create policy "financial_transactions_insert_own" on public.financial_transactions for insert to authenticated with check (
  (select auth.uid()) = owner_id
  and exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid()))
);
drop policy if exists "financial_transactions_update_own" on public.financial_transactions;
create policy "financial_transactions_update_own" on public.financial_transactions for update to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid()))
);

drop policy if exists "maintenance_insert_own" on public.maintenance_records;
create policy "maintenance_insert_own" on public.maintenance_records for insert to authenticated with check (
  (select auth.uid()) = owner_id
  and exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid()))
  and (system_id is null or exists (select 1 from public.property_systems s where s.id = system_id and s.owner_id = (select auth.uid())))
  and (propcrew_contact_id is null or exists (select 1 from public.property_contacts c where c.id = propcrew_contact_id and c.owner_id = (select auth.uid())))
);
drop policy if exists "maintenance_update_own" on public.maintenance_records;
create policy "maintenance_update_own" on public.maintenance_records for update to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid()))
  and (system_id is null or exists (select 1 from public.property_systems s where s.id = system_id and s.owner_id = (select auth.uid())))
  and (propcrew_contact_id is null or exists (select 1 from public.property_contacts c where c.id = propcrew_contact_id and c.owner_id = (select auth.uid())))
);

drop policy if exists "leases_insert_own" on public.leases;
create policy "leases_insert_own" on public.leases for insert to authenticated with check (
  (select auth.uid()) = owner_id
  and exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid()))
);
drop policy if exists "leases_update_own" on public.leases;
create policy "leases_update_own" on public.leases for update to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid()))
);

drop policy if exists "insurance_insert_own" on public.insurance_policies;
create policy "insurance_insert_own" on public.insurance_policies for insert to authenticated with check (
  (select auth.uid()) = owner_id
  and exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid()))
);
drop policy if exists "insurance_update_own" on public.insurance_policies;
create policy "insurance_update_own" on public.insurance_policies for update to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid()))
);

-- PropRoster Milestone 13: Property Financing Status Foundation
-- Run once if upgrading an existing project (after Milestone 12).
--
-- Core Experience Bundle, item 6 (approved): the Investment Analysis
-- calculator already supports an explicit, analysis-level
-- Mortgage/Paid-Off/Unknown choice, but the canonical property itself
-- had no way to remember that distinction — properties.mortgage_balance
-- is a plain not-null numeric(14,2) (0 could mean "genuinely paid off"
-- OR "never entered"), and mortgages is a separate zero-or-more-rows
-- table (no row is just as ambiguous). This adds the single nullable
-- column that fixes both.
--
-- Adds ONE new column, four allowed values:
--   - 'Active Mortgage'  — has an active loan
--   - 'Paid Off'         — previously financed, now paid in full
--   - 'No Mortgage'      — bought outright / cash purchase, never financed
--   - 'Unknown'          — not yet asked / not entered
--
-- NULL is the "not entered" state for every existing row and every new
-- property going forward — this migration NEVER infers 'Paid Off' or
-- 'No Mortgage' from the absence of a mortgages row or from
-- mortgage_balance = 0. That silent inference is exactly the bug this
-- column exists to prevent. The application layer treats NULL the same
-- as the explicit 'Unknown' value; both mean "not entered," never
-- "confirmed paid off."
--
-- Idempotent: safe to run multiple times, safe on a database that
-- already has this column — same "add column if not exists" +
-- "drop constraint if exists / add constraint" idiom already used
-- elsewhere in this schema for additive columns and for policies.

alter table public.properties add column if not exists financing_status text;

alter table public.properties drop constraint if exists properties_financing_status_check;
alter table public.properties add constraint properties_financing_status_check
  check (financing_status is null or financing_status in ('Active Mortgage', 'Paid Off', 'No Mortgage', 'Unknown'));

-- No RLS changes needed — financing_status is just another column on
-- properties, already covered by the existing owner-scoped
-- properties_select_own / properties_insert_own / properties_update_own /
-- properties_delete_own policies (supabase/schema.sql, Section 1).
