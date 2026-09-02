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

-- PropRoster Milestone 14: Smart Import V1
-- Run once if upgrading an existing project (after Milestone 13).
--
-- Smart Import reuses Smart Upload's entire pipeline as-is — the SAME
-- property_documents rows, the SAME private storage bucket, the SAME
-- document_analyses/analyze endpoint, and the SAME smart_upload_items
-- workflow table (supabase/milestone-12-smart-upload.sql). Nothing here
-- creates a second document store, a second AI pipeline, or a second
-- ingestion table.
--
-- Exactly ONE column is added, to make "durable import session" (leaving
-- and resuming a large batch) actually distinguishable per surface:
-- smart_upload_items rows created from the header's "+ Smart Upload"
-- modal and rows created from the standalone /smart-import review queue
-- are functionally identical in every other way (same tables, same
-- analysis, same downstream saves) — `source` only lets each surface's
-- own "what's still unfinished" query (Smart Upload's existing
-- leave-and-return; Smart Import's new "Continue Smart Import" prompt)
-- find its own batches without mixing in the other surface's stray
-- items. It never changes RLS, ownership, or which pipeline a row goes
-- through.
--
-- Idempotent: safe to run multiple times, safe on a database that
-- already has this column — same "add column if not exists" +
-- "drop constraint if exists / add constraint" idiom already used
-- elsewhere in this schema.

alter table public.smart_upload_items add column if not exists source text not null default 'SmartUpload';

alter table public.smart_upload_items drop constraint if exists smart_upload_items_source_check;
alter table public.smart_upload_items add constraint smart_upload_items_source_check
  check (source in ('SmartUpload', 'SmartImport'));

-- No RLS changes needed — `source` is a plain non-FK column on
-- smart_upload_items, already fully covered by the existing owner-scoped
-- smart_upload_items_select_own / insert_own / update_own / delete_own
-- policies (supabase/milestone-12-smart-upload.sql), which check
-- owner_id, not source. A resumed-batch query is just another
-- owner-scoped SELECT through those same policies.

-- PropRoster Milestone 17: Tenant & Lease Management V2
-- Run once if upgrading an existing project (after Milestone 16).
--
-- Schema audit (done before writing this file, source of truth was the
-- actual public.leases table, not this prompt) found the leases table
-- already supports: a flat tenant_name/tenant_email per lease, monthly
-- rent, a not-null security_deposit, start/end dates, a free-text
-- renewal_status, an optional linked lease document, notes, and — since
-- property_id carries NO unique constraint — already-unlimited lease
-- rows per property, i.e. lease history is already fully supported at
-- the schema/RLS level with zero migration needed for that capability.
--
-- Two small, additive, nullable columns were genuinely missing and are
-- added here:
--   tenant_phone   — a second contact channel alongside the existing
--                    tenant_email; purely informational, same shape as
--                    every other contact phone field in this schema.
--   rent_due_day   — a plain calendar day (1-31) the rent is due, e.g.
--                    "due the 1st." NOT a rent ledger, NOT a payment
--                    schedule, NOT tied to any specific month's actual
--                    length — recorded verbatim, never computed.
--
-- Deliberately NOT added in this pass: a lease_tenants join table for
-- true multiple-named-tenants-per-lease. The existing tenant_name/
-- tenant_email/tenant_phone columns are flat (one tenant identity per
-- lease row) and migrating every existing lease row into a relational
-- multi-tenant shape is a materially bigger, riskier change than this
-- milestone's smallest-safe-change mandate allows. See the Milestone 17
-- completion report for the deferred design.
--
-- Idempotent: safe to run multiple times, safe on a database that
-- already has these columns — same "add column if not exists" +
-- "drop constraint if exists / add constraint" idiom already used
-- elsewhere in this schema (e.g. milestone-13-financing-status.sql).
--
-- No RLS changes: tenant_phone and rent_due_day are plain non-FK columns
-- on leases, already fully covered by the existing owner-scoped
-- leases_select_own / leases_insert_own / leases_update_own /
-- leases_delete_own policies (supabase/schema.sql), none of which
-- reference specific column names.

alter table public.leases add column if not exists tenant_phone text;
alter table public.leases add column if not exists rent_due_day smallint;

alter table public.leases drop constraint if exists leases_rent_due_day_range;
alter table public.leases add constraint leases_rent_due_day_range
  check (rent_due_day is null or (rent_due_day >= 1 and rent_due_day <= 31));

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
  -- True only when THIS payment is what created financial_transaction_id
  -- (the app's only current write path, saveRecordPayment()). Deleting
  -- a rent payment is only ever allowed to cascade-delete the linked
  -- transaction when this is true — never merely because a link exists
  -- — so a payment that in the future gets linked to a pre-existing/
  -- manual transaction instead of one it created can never take that
  -- unrelated transaction down with it.
  created_linked_transaction boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.rent_payments add column if not exists created_linked_transaction boolean not null default false;

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

-- PropRoster Launch Pricing (capability-based relaunch) — Milestone 19.
-- Run once if upgrading an existing project (after Milestone 18).
--
-- Adds the new public plan ids ('organize', 'manage', 'automate') to the
-- SAME plan_limits/user_subscriptions tables Milestone 9 already
-- established — no new tables, no new columns. Purely additive:
--
--   - Widens both tables' `plan` check constraints to also allow
--     'organize', 'manage', 'automate' (Postgres check constraints don't
--     support incremental ADD VALUE the way an enum does, so the
--     existing "drop constraint if exists / add constraint" idiom —
--     already used by this same migration file's own 'owner' addition —
--     is reused here verbatim).
--   - Adds plan_limits rows for the three new ids (organize=5,
--     manage=15, automate=50 — see lib/billing/plans.ts's PLANS.automate
--     doc comment for why this row exists even though no subscription
--     can be sold at that plan yet: enforce_property_limit() fails
--     closed to 1 if a plan_limits row is ever missing, so this avoids
--     that surprise if 'automate' is ever assigned internally before a
--     real Stripe product exists for it).
--
-- CRITICAL — Legacy Subscribers: this migration does NOT touch the
-- existing 'free'/'investor'/'portfolio'/'portfolio_pro'/'owner' rows in
-- plan_limits, does NOT change their max_properties values, does NOT
-- rename any plan id, and does NOT alter a single existing
-- user_subscriptions row. Every existing subscriber keeps their exact
-- current plan id, Stripe price, property limit, and billing state.
-- lib/billing/stripe.ts's planForPriceId() independently keeps
-- recognizing their existing Stripe Price ids (a pure code change, nothing
-- to run here) — this file only ever ADDS new allowed values, it never
-- removes or rewrites one.
--
-- Idempotent: safe to run multiple times, safe on a database that
-- already has these constraint values/rows.

alter table public.plan_limits drop constraint if exists plan_limits_plan_check;
alter table public.plan_limits add constraint plan_limits_plan_check
  check (plan in ('free', 'organize', 'manage', 'automate', 'investor', 'portfolio', 'portfolio_pro', 'owner'));

alter table public.user_subscriptions drop constraint if exists user_subscriptions_plan_check;
alter table public.user_subscriptions add constraint user_subscriptions_plan_check
  check (plan in ('free', 'organize', 'manage', 'automate', 'investor', 'portfolio', 'portfolio_pro', 'owner'));

insert into public.plan_limits (plan, max_properties) values
  ('organize', 5),
  ('manage', 15),
  ('automate', 50)
on conflict (plan) do update set max_properties = excluded.max_properties;

-- Free/Investor/Portfolio/Portfolio Pro/Owner rows are intentionally left
-- untouched below this line — no insert, no update, no delete. Listed
-- here only so a reviewer can see at a glance that nothing legacy was
-- silently changed by this file:
--   free           -> 1   (unchanged, set by milestone-9-subscriptions.sql)
--   investor       -> 4   (unchanged, legacy)
--   portfolio      -> 9   (unchanged, legacy)
--   portfolio_pro  -> 20  (unchanged, legacy)
--   owner          -> 1000000000 (unchanged, internal)

-- PropRoster Launch Polish — basic user profile photo (avatar).
-- Run once if upgrading an existing project (after Launch Pricing).
--
-- public.user_profiles.photo_path (supabase/milestone-11-property-
-- profile-2.sql) already exists and was explicitly reserved for this —
-- see app/profile/page.tsx's own prior comment ("reserved space so it
-- can be added later without another migration"). No table/column
-- change is needed; this file only adds the storage side: a new
-- private bucket for profile photos, following the EXACT same
-- owner-scoped-folder-path pattern already established by
-- property-photos (supabase/schema.sql) and tenant-connect-attachments
-- (supabase/milestone-10-tenant-connect.sql) — the first folder segment
-- of every object's path must equal the uploader's own auth.uid().
--
-- One canonical photo per user (not a gallery): the app always uploads
-- to a fresh path under the user's own folder and deletes the prior
-- object (if any) once the new upload succeeds, then updates
-- photo_path to the new path — mirrored from the exact same add/
-- replace/remove flow property_photos already uses for a property's
-- cover photo. Never public: the bucket is private, and the app reads
-- the image back only via a short-lived signed URL (same as
-- property-photos/property-documents), never a bare public URL.
--
-- Idempotent: safe to run multiple times, safe on a database that
-- already has this bucket/these policies.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-photos',
  'profile-photos',
  false,
  5242880, -- 5MB — a single small avatar image, deliberately tighter than property-photos' 20MB (a full property photo)
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Storage policies: a user can only work inside their own /<their-user-id>/...
-- folder — the same (storage.foldername(name))[1] = auth.uid() idiom
-- property-photos and property-documents already use. No service-role
-- bypass, no public read.
drop policy if exists "profile_photos_select_own" on storage.objects;
create policy "profile_photos_select_own" on storage.objects for select to authenticated
using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "profile_photos_insert_own" on storage.objects;
create policy "profile_photos_insert_own" on storage.objects for insert to authenticated
with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "profile_photos_update_own" on storage.objects;
create policy "profile_photos_update_own" on storage.objects for update to authenticated
using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "profile_photos_delete_own" on storage.objects;
create policy "profile_photos_delete_own" on storage.objects for delete to authenticated
using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- No change to public.user_profiles or its RLS policies — photo_path is
-- just another nullable column on a row already fully owner-scoped by
-- the existing user_profiles_select_own / insert_own / update_own
-- policies (supabase/milestone-11-property-profile-2.sql), none of
-- which reference specific column names.
-- PropRoster Milestone 21: Realtor Connect V1.
--
-- Lead-capture workflow for calculator visitors who want help from a
-- real estate professional. ALL leads route to the PropRoster owner
-- first — this migration builds storage + access control only, never
-- automatic routing, referral-fee accounting, or agent matching.
--
-- Security model (Section 9 of the spec):
--   - NO insert policy is granted to anon or authenticated at all. A
--     lead can only be created by the server-side admin (service-role)
--     client in app/api/realtor-leads/route.ts — the ONLY other
--     consumer of that client in this codebase is the Stripe webhook,
--     for the identical reason (a write that must succeed regardless of
--     whether a session exists). This is what makes "public users may
--     INSERT a lead only through the intended server-side path" true at
--     the database level, not just by convention.
--   - NO select policy is granted to anon or a normal authenticated
--     user. Only the internal 'owner' plan (the exact same
--     `user_subscriptions.plan = 'owner'` check already used by
--     app/api/document-intelligence/analyze/route.ts's diagnostics gate,
--     app/account/billing/page.tsx, and app/pricing/page.tsx — a plan a
--     client can never self-assign, see milestone-9-subscriptions.sql)
--     may select/update rows, via a subquery against user_subscriptions.
--     This lets the admin Lead Center (app/admin/realtor-leads/page.tsx)
--     read/update leads through the caller's own normal RLS-scoped
--     client — no service-role key needed in that page at all.
--
-- Idempotent: safe to run multiple times, safe on a database that
-- already has this table/these policies. Additive only.

create table if not exists public.realtor_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Signed-in submitter, if any (Section 4: never required). ON DELETE
  -- SET NULL — a lead is a business record the owner may still need
  -- after the submitter's account is gone; it must never cascade-delete.
  owner_user_id uuid references auth.users(id) on delete set null,
  source text not null check (source in ('rental_analyzer', 'home_purchase')),
  property_address text,
  city text,
  state text,
  zip text,
  geography_bucket text not null default 'Unknown' check (geography_bucket in ('Tampa Bay Area', 'Outside Tampa Bay Area', 'Unknown')),
  name text not null,
  email text,
  phone text,
  preferred_contact_method text not null check (preferred_contact_method in ('Call', 'Text', 'Email')),
  message text,
  -- Explicit consent timestamp, not a boolean — set server-side only when
  -- the checkbox was actually true at submission (see
  -- lib/realtor-leads/handle-lead-submission.ts). Never defaulted.
  consent_at timestamptz not null,
  analysis_snapshot jsonb,
  status text not null default 'New' check (status in ('New', 'Contacted', 'Referred', 'Closed', 'Archived')),
  -- Manual referral fields only (Section 12/16) — the PropRoster owner
  -- fills these in by hand after deciding to refer a lead. No automatic
  -- routing, no commission/fee accounting of any kind.
  referred_to_name text,
  referred_to_email text,
  referred_to_state text,
  notes text,
  constraint realtor_leads_contact_required check (email is not null or phone is not null)
);

alter table public.realtor_leads add column if not exists updated_at timestamptz not null default now();

create index if not exists realtor_leads_status_created_idx on public.realtor_leads(status, created_at desc);
create index if not exists realtor_leads_owner_user_idx on public.realtor_leads(owner_user_id);

alter table public.realtor_leads enable row level security;

-- Deliberately NO insert/select policy for anon or authenticated here —
-- see this file's top comment. RLS with zero matching policies denies
-- by default, which is exactly the intended "not a public lead table."

drop policy if exists "realtor_leads_admin_select" on public.realtor_leads;
create policy "realtor_leads_admin_select" on public.realtor_leads for select to authenticated using (
  exists (
    select 1 from public.user_subscriptions us
    where us.owner_id = (select auth.uid())
      and us.plan = 'owner'
      and us.status in ('active', 'trialing', 'past_due')
  )
);

drop policy if exists "realtor_leads_admin_update" on public.realtor_leads;
create policy "realtor_leads_admin_update" on public.realtor_leads for update to authenticated
using (
  exists (
    select 1 from public.user_subscriptions us
    where us.owner_id = (select auth.uid())
      and us.plan = 'owner'
      and us.status in ('active', 'trialing', 'past_due')
  )
)
with check (
  exists (
    select 1 from public.user_subscriptions us
    where us.owner_id = (select auth.uid())
      and us.plan = 'owner'
      and us.status in ('active', 'trialing', 'past_due')
  )
);

create or replace function public.realtor_leads_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists realtor_leads_touch_updated_at on public.realtor_leads;
create trigger realtor_leads_touch_updated_at
  before update on public.realtor_leads
  for each row execute function public.realtor_leads_set_updated_at();

-- Not added to Global Search (Section 13) — no change to
-- lib/search/build-results.ts or any search-indexing code; this table is
-- simply never queried from there.



-- ============================================================
-- Milestone 22: Tax Center V2 — property-level manual tax entry
-- (mirrors supabase/milestone-22-tax-center-v2.sql exactly)
-- ============================================================
-- PropRoster Milestone 22: Tax Center V2 — property-level manual tax entry.
--
-- Tax Center V1 (Milestone 21... actually the prior Tax Center milestone)
-- was intentionally read-only and required no schema change — every
-- figure was aggregated live from financial_transactions. V2 adds the
-- ONE new thing that genuinely requires persistence: a landlord's
-- manual annual tax entry for a specific property and tax year (e.g.
-- mortgage interest from a lender's Form 1098, which PropRoster has no
-- other reliable source for at all).
--
-- Why a new table, not a reuse of financial_transactions (Section "Data
-- Model"): a manual tax entry is a single annual figure per category
-- (e.g. "insurance for 2026 = $1,200"), not a dated ledger event — it
-- has no transaction_date, no vendor, no document-per-line-item shape.
-- Forcing it into financial_transactions would mean inventing a fake
-- date for a same-figure and risk it silently being double-counted
-- alongside real dated transactions in that same category. Kept
-- completely separate instead: property_tax_records is read ALONGSIDE
-- financial_transactions by lib/tax-center/aggregate.ts, never merged
-- into it, and the effective Tax Center amount for each category is an
-- explicit override rule (manual value if entered, else the tracked sum
-- from financial_transactions) — never an automatic sum of both, which
-- is exactly the double-counting Section "Source-of-Truth Behavior"
-- forbids.
--
-- One row per (property_id, tax_year) — every manual value for that
-- property/year lives in a single row's columns, not one row per
-- category, since the category list is fixed and known (this mirrors
-- how mortgages/insurance_policies are each "one row per property"
-- rather than a generic key/value table). owner_id is stored directly
-- (not just derivable through property_id) purely so its own RLS
-- policies can check `owner_id = auth.uid()` directly, the same
-- convention every other owner-scoped table here already uses.
--
-- Idempotent: safe to run multiple times, safe on a database that
-- already has this table/these policies. Additive only.

create table if not exists public.property_tax_records (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  tax_year integer not null check (tax_year between 2000 and 2100),

  -- Income
  rental_income numeric(14,2),
  other_income numeric(14,2),

  -- Ordinary operating expenses (Section "Suggested Fields" —
  -- Advertising/Cleaning/Landscaping/Pest control get their own columns
  -- here, unlike Tax Center V1's read-only aggregation, which could only
  -- ever show what financial_transactions' existing FINANCIAL_CATEGORIES
  -- vocabulary already tracked and had no such categories to read).
  property_taxes numeric(14,2),
  insurance numeric(14,2),
  hoa numeric(14,2),
  repairs numeric(14,2),
  maintenance numeric(14,2),
  utilities numeric(14,2),
  management_fees numeric(14,2),
  legal_professional numeric(14,2),
  supplies numeric(14,2),
  cleaning numeric(14,2),
  landscaping numeric(14,2),
  pest_control numeric(14,2),
  advertising numeric(14,2),
  other_expenses numeric(14,2),

  -- Financing — interest ONLY, never estimated from mortgage payments,
  -- never including principal. See lib/tax-center/categories.ts for why
  -- PropRoster has no other source for this figure at all.
  mortgage_interest numeric(14,2),

  -- Capital items — always kept separate from operating expenses; never
  -- presented as immediately deductible (see this milestone's own report
  -- for the UI copy that enforces this).
  capital_improvements numeric(14,2),

  notes text,
  -- Optional supporting document — reuses the EXISTING property_documents
  -- system (Section "Additional Information": "Reuse the existing
  -- document system rather than creating separate file storage"). No
  -- new storage bucket, no new upload path.
  document_id uuid references public.property_documents(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint property_tax_records_property_year_unique unique (property_id, tax_year),
  -- Every manual amount is optional (NULL = "left blank", never treated
  -- as $0 — see lib/tax-center/manual-entry.ts) but if present must be
  -- zero or positive. These are landlord-entered annual totals, not
  -- ledger entries with a sign convention; a negative "insurance" figure
  -- would only ever indicate a data-entry mistake, not a real value.
  constraint property_tax_records_non_negative check (
    (rental_income is null or rental_income >= 0) and
    (other_income is null or other_income >= 0) and
    (property_taxes is null or property_taxes >= 0) and
    (insurance is null or insurance >= 0) and
    (hoa is null or hoa >= 0) and
    (repairs is null or repairs >= 0) and
    (maintenance is null or maintenance >= 0) and
    (utilities is null or utilities >= 0) and
    (management_fees is null or management_fees >= 0) and
    (legal_professional is null or legal_professional >= 0) and
    (supplies is null or supplies >= 0) and
    (cleaning is null or cleaning >= 0) and
    (landscaping is null or landscaping >= 0) and
    (pest_control is null or pest_control >= 0) and
    (advertising is null or advertising >= 0) and
    (other_expenses is null or other_expenses >= 0) and
    (mortgage_interest is null or mortgage_interest >= 0) and
    (capital_improvements is null or capital_improvements >= 0)
  )
);

create index if not exists property_tax_records_property_idx on public.property_tax_records(property_id);
create index if not exists property_tax_records_owner_idx on public.property_tax_records(owner_id);

alter table public.property_tax_records enable row level security;

-- Same owner-scoped shape as every other property-child table
-- (mortgages, insurance_policies, leases): a caller may only
-- read/write rows for properties they themselves own. The insert/update
-- WITH CHECK additionally confirms property_id actually belongs to the
-- caller — the identical "forged property_id" guard financial_transactions
-- and property_documents already use — so a caller can never attach a
-- manual tax record to another owner's property.
drop policy if exists "property_tax_records_select_own" on public.property_tax_records;
create policy "property_tax_records_select_own" on public.property_tax_records for select to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists "property_tax_records_insert_own" on public.property_tax_records;
create policy "property_tax_records_insert_own" on public.property_tax_records for insert to authenticated with check (
  (select auth.uid()) = owner_id
  and exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid()))
);

drop policy if exists "property_tax_records_update_own" on public.property_tax_records;
create policy "property_tax_records_update_own" on public.property_tax_records for update to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid()))
);

drop policy if exists "property_tax_records_delete_own" on public.property_tax_records;
create policy "property_tax_records_delete_own" on public.property_tax_records for delete to authenticated
  using ((select auth.uid()) = owner_id);

create or replace function public.property_tax_records_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists property_tax_records_touch_updated_at on public.property_tax_records;
create trigger property_tax_records_touch_updated_at
  before update on public.property_tax_records
  for each row execute function public.property_tax_records_set_updated_at();

-- Milestone 23: Tax Center V3 — expanded manual tax categories
-- PropRoster Milestone 23: Tax Center V3 — expanded manual tax categories.
--
-- Goal (per this milestone's own spec): "More capability, less visible
-- complexity." Landlords can now organize a much wider set of annual
-- tax-related figures per property/year — property & operating expenses
-- (2 new: permits/licenses, bank/financial fees), a new Professional &
-- Administrative group (10 categories — legal, accounting, tax prep,
-- bookkeeping, software, office, phone/internet, memberships,
-- education, other), a new Travel & Vehicle group (6 dollar categories
-- plus a separate MILEAGE QUANTITY — miles, not dollars, never converted
-- to a dollar deduction here), a new Meals group (business meals, kept
-- distinct from travel), 2 new Mortgage & Financing categories (points/
-- loan costs, other financing) alongside the existing mortgage interest,
-- and 7 new Capital & Depreciable categories (appliances, furniture,
-- equipment, major renovations, roof, HVAC, other) alongside the
-- existing capital improvements.
--
-- Additive only, exactly like milestone-22: every new column is nullable
-- (blank = "no manual entry," never coerced to $0 — see
-- lib/tax-center/manual-entry.ts's computeCategoryValue, completely
-- unchanged by this milestone) and every statement below is safe to
-- re-run. NOTHING about the existing property_tax_records table, its
-- existing columns, its existing RLS policies, or its existing
-- constraint (property_tax_records_non_negative) is touched, dropped, or
-- rewritten — this migration only ADDS columns and adds a SEPARATE
-- non-negative check constraint scoped to the new columns, so existing
-- rows and the existing constraint are provably untouched.
--
-- Custom Tax Items (property_tax_custom_items, new table): the
-- landlord-defined "+ Add Other Tax Item" escape hatch for anything the
-- fixed categories above don't fit — a genuinely dynamic, per-property/
-- year list, which is exactly the case (per this milestone's own
-- guidance) where a child table is the right structure instead of more
-- speculative fixed columns or a JSON blob. Each row is its own explicit
-- expense record (description/amount/group/notes/optional document),
-- tied to property_id + owner_id + tax_year (and, where one already
-- exists, the parent property_tax_records row via tax_record_id — kept
-- nullable since a custom item may be added before any fixed manual
-- entry exists for that year). "source" is not a stored column: every
-- row in this table is, by construction, a manual entry — there is no
-- tracked equivalent to distinguish it from, so the application layer
-- always labels these "Manual" rather than storing a constant that can
-- never vary.
--
-- Double-counting: a custom item is its own explicit row, summed exactly
-- once into whichever total its own "category_group" belongs to
-- (lib/tax-center/aggregate.ts) — it never touches, overrides, or adds
-- to any FIXED category's manual/tracked value. Financing and Capital /
-- Depreciable custom items are excluded from operating-expense/net-result
-- totals, exactly like the existing fixed mortgage-interest and capital-
-- improvement categories, so a custom capital or financing item can
-- never be misread as an immediately deductible operating expense.
--
-- Idempotent: every "add column if not exists" / constraint drop-then-add
-- / "create table if not exists" / policy drop-then-create below is safe
-- to run on a database that already has some or all of this.

-- ---------------------------------------------------------------------
-- Expanded fixed categories on the existing property_tax_records table
-- ---------------------------------------------------------------------

alter table public.property_tax_records
  -- Property & Operating Expenses (2 new — the rest of this group
  -- already existed as of milestone-22).
  add column if not exists permits_licenses numeric(14,2),
  add column if not exists bank_fees numeric(14,2),

  -- Professional & Administrative (new group — organizational only;
  -- PropRoster never guarantees deductibility of any of these).
  add column if not exists prof_legal_fees numeric(14,2),
  add column if not exists prof_accounting_fees numeric(14,2),
  add column if not exists prof_tax_prep_fees numeric(14,2),
  add column if not exists prof_bookkeeping numeric(14,2),
  add column if not exists prof_software_subscriptions numeric(14,2),
  add column if not exists prof_office_expenses numeric(14,2),
  add column if not exists prof_phone_internet numeric(14,2),
  add column if not exists prof_memberships numeric(14,2),
  add column if not exists prof_education numeric(14,2),
  add column if not exists prof_other numeric(14,2),

  -- Travel & Vehicle (new group) — 6 dollar categories, manual-only
  -- (no matching financial_transactions category exists for any of
  -- these — see lib/property-categories.ts's FINANCIAL_CATEGORIES).
  add column if not exists travel_parking numeric(14,2),
  add column if not exists travel_tolls numeric(14,2),
  add column if not exists travel_airfare numeric(14,2),
  add column if not exists travel_rental_car numeric(14,2),
  add column if not exists travel_lodging numeric(14,2),
  add column if not exists travel_other numeric(14,2),
  -- Business mileage is a QUANTITY (miles), never a dollar amount, and
  -- is NEVER converted to a dollar figure by PropRoster — no hardcoded
  -- IRS mileage rate is applied anywhere in this codebase. Kept as its
  -- own nullable numeric (one decimal place — partial miles happen) plus
  -- its own free-text notes field, entirely separate from the dollar
  -- categories above and from the record's general `notes` column.
  add column if not exists business_mileage numeric(10,1),
  add column if not exists business_mileage_notes text,

  -- Meals (new group) — kept distinct from Travel & Vehicle per this
  -- milestone's spec. PropRoster never assumes any particular
  -- deductible percentage (50%, 100%, or otherwise) — the stored amount
  -- is always the landlord's own recorded actual amount.
  add column if not exists meals_business numeric(14,2),

  -- Mortgage & Financing (2 new, alongside the existing mortgage_interest
  -- column) — organizational only. Never summed into mortgage_interest,
  -- never treated as interest, never derived from mortgages.monthly_payment.
  add column if not exists financing_points numeric(14,2),
  add column if not exists financing_other numeric(14,2),

  -- Capital & Depreciable Items (7 new, alongside the existing
  -- capital_improvements column) — always kept separate from ordinary
  -- operating-expense totals, never presented as immediately deductible.
  add column if not exists capital_appliances numeric(14,2),
  add column if not exists capital_furniture numeric(14,2),
  add column if not exists capital_equipment numeric(14,2),
  add column if not exists capital_major_renovations numeric(14,2),
  add column if not exists capital_roof numeric(14,2),
  add column if not exists capital_hvac numeric(14,2);

alter table public.property_tax_records
  add column if not exists capital_other numeric(14,2);

-- A SEPARATE non-negative constraint scoped to only the new columns
-- above (mileage included — negative miles make no sense either) — the
-- existing property_tax_records_non_negative constraint (milestone-22)
-- is never dropped, redefined, or otherwise touched, so there is zero
-- risk to it or to any existing row that already satisfies it.
alter table public.property_tax_records drop constraint if exists property_tax_records_non_negative_v3;
alter table public.property_tax_records add constraint property_tax_records_non_negative_v3 check (
  (permits_licenses is null or permits_licenses >= 0) and
  (bank_fees is null or bank_fees >= 0) and
  (prof_legal_fees is null or prof_legal_fees >= 0) and
  (prof_accounting_fees is null or prof_accounting_fees >= 0) and
  (prof_tax_prep_fees is null or prof_tax_prep_fees >= 0) and
  (prof_bookkeeping is null or prof_bookkeeping >= 0) and
  (prof_software_subscriptions is null or prof_software_subscriptions >= 0) and
  (prof_office_expenses is null or prof_office_expenses >= 0) and
  (prof_phone_internet is null or prof_phone_internet >= 0) and
  (prof_memberships is null or prof_memberships >= 0) and
  (prof_education is null or prof_education >= 0) and
  (prof_other is null or prof_other >= 0) and
  (travel_parking is null or travel_parking >= 0) and
  (travel_tolls is null or travel_tolls >= 0) and
  (travel_airfare is null or travel_airfare >= 0) and
  (travel_rental_car is null or travel_rental_car >= 0) and
  (travel_lodging is null or travel_lodging >= 0) and
  (travel_other is null or travel_other >= 0) and
  (business_mileage is null or business_mileage >= 0) and
  (meals_business is null or meals_business >= 0) and
  (financing_points is null or financing_points >= 0) and
  (financing_other is null or financing_other >= 0) and
  (capital_appliances is null or capital_appliances >= 0) and
  (capital_furniture is null or capital_furniture >= 0) and
  (capital_equipment is null or capital_equipment >= 0) and
  (capital_major_renovations is null or capital_major_renovations >= 0) and
  (capital_roof is null or capital_roof >= 0) and
  (capital_hvac is null or capital_hvac >= 0) and
  (capital_other is null or capital_other >= 0)
);

-- ---------------------------------------------------------------------
-- Custom Tax Items — the "+ Add Other Tax Item" child table
-- ---------------------------------------------------------------------

create table if not exists public.property_tax_custom_items (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  tax_year integer not null check (tax_year between 2000 and 2100),
  -- Nullable and best-effort only: set when a property_tax_records row
  -- already exists for this property/year at save time, so the item can
  -- be traced to its "parent" annual record where useful (e.g. a future
  -- CASCADE-aware admin view) — but a custom item's real identity keys
  -- are property_id + tax_year (mirroring property_tax_records' own
  -- keying) and RLS below never depends on this column being set.
  tax_record_id uuid references public.property_tax_records(id) on delete set null,

  description text not null check (char_length(trim(description)) > 0),
  amount numeric(14,2) not null check (amount >= 0),
  -- Where the item's amount flows into aggregation (lib/tax-center/
  -- custom-items.ts mirrors this exact list): operatingExpense/
  -- professional/travel/meals/other count toward the property's
  -- operating-expense total and Net Result; financing/capital are
  -- excluded from both, shown separately, exactly like the fixed
  -- mortgage-interest/capital-improvement categories.
  category_group text not null check (category_group in (
    'operatingExpense', 'professional', 'travel', 'meals', 'financing', 'capital', 'other'
  )),
  notes text,
  document_id uuid references public.property_documents(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists property_tax_custom_items_property_idx on public.property_tax_custom_items(property_id);
create index if not exists property_tax_custom_items_owner_idx on public.property_tax_custom_items(owner_id);
create index if not exists property_tax_custom_items_property_year_idx on public.property_tax_custom_items(property_id, tax_year);

alter table public.property_tax_custom_items enable row level security;

-- Same owner-scoped shape as property_tax_records itself (and every
-- other property-child table in this schema): a caller may only
-- read/write custom tax items for properties they own. The insert/
-- update WITH CHECK additionally confirms property_id actually belongs
-- to the caller — the identical "forged property_id" guard
-- property_tax_records already uses.
drop policy if exists "property_tax_custom_items_select_own" on public.property_tax_custom_items;
create policy "property_tax_custom_items_select_own" on public.property_tax_custom_items for select to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists "property_tax_custom_items_insert_own" on public.property_tax_custom_items;
create policy "property_tax_custom_items_insert_own" on public.property_tax_custom_items for insert to authenticated with check (
  (select auth.uid()) = owner_id
  and exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid()))
);

drop policy if exists "property_tax_custom_items_update_own" on public.property_tax_custom_items;
create policy "property_tax_custom_items_update_own" on public.property_tax_custom_items for update to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid()))
);

drop policy if exists "property_tax_custom_items_delete_own" on public.property_tax_custom_items;
create policy "property_tax_custom_items_delete_own" on public.property_tax_custom_items for delete to authenticated
  using ((select auth.uid()) = owner_id);

create or replace function public.property_tax_custom_items_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists property_tax_custom_items_touch_updated_at on public.property_tax_custom_items;
create trigger property_tax_custom_items_touch_updated_at
  before update on public.property_tax_custom_items
  for each row execute function public.property_tax_custom_items_set_updated_at();


-- ============================================================
-- Milestone 25: Tenant Connect + Maintenance Coordination M1 —
-- foundation repair + Guided Intake/audit-log scaffolding
-- (mirrors supabase/milestone-25-maintenance-coordination-foundation.sql
-- exactly, appended here for a single fresh-project run, matching
-- every prior milestone's convention in this file). See that file's
-- own header for the full remediation-decision rationale, and
-- docs/tenant-connect-maintenance-m1-foundation.md for the M1
-- completion report this migration was written for.
-- ============================================================
-- PropRoster Milestone 25 — Tenant Connect + Maintenance Coordination,
-- M1: Foundation repair + unified maintenance schema foundation.
--
-- NOT APPLIED TO PRODUCTION. Written on branch
-- claude/tenant-connect-maintenance-m1-foundation, reviewed but not run
-- against any live database as part of this milestone. See
-- docs/tenant-connect-maintenance-m1-foundation.md for the full
-- remediation decision, migration safety review, and deployment
-- sequencing notes this file assumes.
--
-- ===================================================================
-- WHY THIS FILE EXISTS (read this before running anything)
-- ===================================================================
-- supabase/milestone-24-tenant-connect-v1.sql was written, reviewed
-- (through a "Round 6" safety pass), and given a full RLS regression
-- suite (supabase/tests/milestone-24-rls.test.sql) — but per that
-- file's own header comment, it was NEVER SUCCESSFULLY APPLIED TO
-- PRODUCTION, even though the application code that depends on its
-- public.tenant_requests table (components/tenant-connect/
-- TenantRequestsPanel.tsx, app/tenant/page.tsx, app/api/tenant-connect/
-- notify/route.ts, app/page.tsx) has been shipping and querying that
-- table unconditionally the whole time.
--
-- This file does NOT simply re-run milestone-24-tenant-connect-v1.sql
-- verbatim. milestone-24-tenant-connect-v1.sql is preserved byte-for-
-- byte, untouched, as the historical record of that design (and
-- because lib/tenant-connect/tenant-connect-v1-wiring.test.ts asserts
-- directly against its exact content) — this file is a NEW, reconciled,
-- forward-only migration that:
--
--   1. Creates the SAME public.tenant_requests table and the SAME two
--      tenant-facing views/SECURITY DEFINER functions milestone-24
--      designed, re-verified line-by-line against the CURRENT
--      supabase/schema.sql (confirmed non-stale — every column/table it
--      depends on, e.g. leases.rent_due_day, user_subscriptions.plan's
--      'portfolio'/'portfolio_pro' values, still exists unchanged).
--      This part is content-IDENTICAL to milestone-24's design intent.
--
--   2. Uses a DIFFERENT, FINAL category vocabulary for
--      tenant_requests.category — stable, machine-readable identifiers
--      (heating_ac/plumbing/toilet/electrical/appliance/lock_door/
--      leak_water/other; see lib/maintenance/categories.ts) instead of
--      milestone-24's original six display-string values. This is safe
--      to change here, and ONLY here, because public.tenant_requests
--      has never held a single row of real data in production — this is
--      the one and only moment this column's vocabulary can be set
--      without a live-data migration.
--
--   3. Adds new, additive-only foundation for the next milestone (M2 —
--      Guided Maintenance Intake) to build on, per the M1 brief's
--      explicit "make room to store" list: maintenance_intake_sessions
--      / maintenance_intake_answers (Section C below). No application
--      code writes to either table yet — M1 ships zero intake UI.
--
--   4. Adds a minimal, trigger-driven, append-only maintenance audit
--      log (Section D below) covering the two real actions M1 itself
--      re-enables (a tenant submitting a request, an owner changing its
--      status) — not a general-purpose future audit system, just the
--      foundation for one, following the exact "no client-facing
--      INSERT/UPDATE/DELETE policy" immutability convention
--      public.ai_usage_events already established in this schema.
--
--   5. Fixes a real, PRE-EXISTING, currently-live production bug in
--      public.owner_has_tenant_connect() (Section E below), discovered
--      during this milestone's own hands-on RLS verification, not
--      invented scope. See Section E's header for the full finding.
--
-- Explicitly NOT done here (deferred to their own future milestones —
-- see docs/tenant-connect-maintenance-m1-foundation.md's "deferred"
-- section): no maintenance_access_windows table (no structural need to
-- create it before M2 actually consumes it — creating it now would not
-- reduce future migration risk), no appointment/quote/authorization
-- tables (M6/M7 territory, no M1 application behavior needs them), no
-- provider-token table (M5), no changes whatsoever to the pre-existing,
-- separate public.maintenance_requests table (the landlord's own manual
-- log — a different actor, a different workflow, untouched), no changes
-- to public.property_contacts / public.property_contact_links (M4).
--
-- ===================================================================
-- CANONICAL MAINTENANCE-REQUEST MODEL DECISION (Phase 1F)
-- ===================================================================
-- Neither existing table "becomes canonical" over the other in M1.
-- public.maintenance_requests (owner-only manual log, live since
-- Milestone 6, may already hold real production rows) and
-- public.tenant_requests (tenant-submitted, backed by a
-- property_conversations thread, ZERO production rows because it has
-- never existed) represent two genuinely different origins — exactly
-- the distinction milestone-24's own original header comment already
-- drew ("This is DELIBERATELY SEPARATE from the pre-existing
-- maintenance_requests table... a different actor, a different
-- workflow"). Forcing them into one physical table in M1 would mean
-- either (a) an in-place schema rewrite of a table that may hold real
-- landlord data, for zero M1 application benefit, or (b) inventing a
-- new unified table no M1 UI reads or writes, purely speculatively.
-- Both fail "minimal migration risk" and "smallest coherent
-- foundation." tenant_requests is the safe, additive, already-shipped-
-- application-code-compatible interim canonical entity for
-- TENANT-SUBMITTED requests; maintenance_requests remains canonical for
-- LANDLORD-LOGGED requests. Whether/how a future milestone (M3's
-- landlord command center is the natural candidate) presents these as
-- one unified inbox — via a read-time view/union, or a genuine later
-- physical unification once real usage patterns are known — is
-- explicitly left open and documented as a product-owner decision in
-- docs/tenant-connect-maintenance-m1-foundation.md, not decided here.
--
-- ===================================================================
-- REVISION HISTORY (this file)
-- ===================================================================
-- v1 (this version): initial M1 foundation-repair migration, plus a
-- same-milestone fix to public.owner_has_tenant_connect() (Section E)
-- found via this migration's own local RLS test run — see Section E.
--
-- ===================================================================
-- ROLLBACK
-- ===================================================================
-- Section E (the owner_has_tenant_connect() plan-list fix) is
-- deliberately NOT included below. It corrects an already-live
-- Milestone 10 function to match the already-live TS entitlement map;
-- rolling it back would re-introduce a real production bug (current
-- Manage/Automate-plan owners silently unable to write
-- property_conversations/property_messages), not undo new M1 scope.
-- If this file is fully rolled back for some other reason, leave
-- Section E's CREATE OR REPLACE applied on its own.
--
-- Run, in this order (safe even if only some of the below was applied):
--   drop trigger if exists tenant_requests_write_audit_log on public.tenant_requests;
--   drop function if exists public.maintenance_audit_log_write();
--   drop policy if exists "maintenance_audit_log_select" on public.maintenance_audit_log;
--   drop table if exists public.maintenance_audit_log;
--   drop policy if exists "maintenance_intake_answers_select" on public.maintenance_intake_answers;
--   drop policy if exists "maintenance_intake_answers_insert_tenant" on public.maintenance_intake_answers;
--   drop table if exists public.maintenance_intake_answers;
--   drop policy if exists "maintenance_intake_sessions_select" on public.maintenance_intake_sessions;
--   drop policy if exists "maintenance_intake_sessions_insert_tenant" on public.maintenance_intake_sessions;
--   drop policy if exists "maintenance_intake_sessions_update_tenant" on public.maintenance_intake_sessions;
--   drop table if exists public.maintenance_intake_sessions;
--   drop view if exists public.tenant_lease_view;
--   drop view if exists public.tenant_property_view;
--   drop function if exists public.is_active_tenant_of_lease(uuid);
--   drop function if exists public.is_active_tenant_of_property(uuid);
--   drop policy if exists "tenant_requests_update_owner" on public.tenant_requests;
--   drop trigger if exists tenant_requests_lock_immutable_fields on public.tenant_requests;
--   drop function if exists public.tenant_requests_lock_immutable_fields();
--   drop policy if exists "tenant_requests_insert_tenant" on public.tenant_requests;
--   drop policy if exists "tenant_requests_select" on public.tenant_requests;
--   drop trigger if exists tenant_requests_touch_updated_at on public.tenant_requests;
--   drop function if exists public.tenant_requests_set_updated_at();
--   drop table if exists public.tenant_requests;
-- This does not touch maintenance_requests, tenant_property_access,
-- property_conversations, property_messages, property_contacts,
-- property_contact_links, or any earlier milestone's objects — none of
-- those are created or altered by this migration.

-- ===================================================================
-- SECTION A — tenant_requests (reconciled milestone-24 design, new
-- category vocabulary)
-- ===================================================================
create table if not exists public.tenant_requests (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  -- on delete restrict, not cascade — neither tenant_property_access nor
  -- property_conversations rows are ever physically deleted by any code
  -- path in this repo (both are retired via a status column), so this
  -- is defense-in-depth against a future regression, matching
  -- milestone-24's own Round 6 fix.
  tenant_access_id uuid not null references public.tenant_property_access(id) on delete restrict,
  conversation_id uuid not null references public.property_conversations(id) on delete restrict,
  -- Stable, machine-readable category identifiers — see
  -- lib/maintenance/categories.ts for the id -> display-label mapping
  -- every consumer (the tenant portal's category picker, the landlord
  -- Requests inbox, the new-request notification email) uses. This is
  -- the ONE column whose vocabulary differs from milestone-24's
  -- original design — see this file's header for why that's safe here.
  category text not null check (category in ('heating_ac', 'plumbing', 'toilet', 'electrical', 'appliance', 'lock_door', 'leak_water', 'other')),
  title text not null check (length(btrim(title)) > 0),
  -- The tenant's original description ("tenant-reported symptom" in the
  -- M0 architecture's vocabulary) — stored once, immutable after
  -- insert (enforced below, not just by convention). The SAME text is
  -- also posted as the first message in the linked conversation.
  description text not null check (length(btrim(description)) > 0),
  status text not null default 'New' check (status in ('New', 'In Progress', 'Resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists tenant_requests_conversation_unique on public.tenant_requests(conversation_id);
create index if not exists tenant_requests_property_idx on public.tenant_requests(property_id, created_at desc);
create index if not exists tenant_requests_owner_idx on public.tenant_requests(owner_id);
create index if not exists tenant_requests_tenant_access_idx on public.tenant_requests(tenant_access_id);
create index if not exists tenant_requests_status_idx on public.tenant_requests(status);

-- Idempotent correction, matching the repo-wide "drop constraint if
-- exists / add constraint" convention, in case this file is re-run
-- against a database that already has an earlier version of it.
alter table public.tenant_requests drop constraint if exists tenant_requests_tenant_access_id_fkey;
alter table public.tenant_requests add constraint tenant_requests_tenant_access_id_fkey
  foreign key (tenant_access_id) references public.tenant_property_access(id) on delete restrict;

alter table public.tenant_requests drop constraint if exists tenant_requests_conversation_id_fkey;
alter table public.tenant_requests add constraint tenant_requests_conversation_id_fkey
  foreign key (conversation_id) references public.property_conversations(id) on delete restrict;

-- Idempotent correction for the category vocabulary specifically (in
-- case an earlier run of THIS file, or a hand-applied milestone-24, is
-- already present with the old six-value check) — re-runnable safely
-- either way.
alter table public.tenant_requests drop constraint if exists tenant_requests_category_check;
alter table public.tenant_requests add constraint tenant_requests_category_check
  check (category in ('heating_ac', 'plumbing', 'toilet', 'electrical', 'appliance', 'lock_door', 'leak_water', 'other'));

alter table public.tenant_requests enable row level security;

-- SELECT: owner of the property, or the active tenant on the specific
-- access row this request belongs to — identical membership rule to
-- property_conversations_select (M10).
drop policy if exists "tenant_requests_select" on public.tenant_requests;
create policy "tenant_requests_select" on public.tenant_requests for select to authenticated using (
  (select auth.uid()) = owner_id
  or exists (
    select 1 from public.tenant_property_access tpa
    where tpa.id = tenant_access_id and tpa.status = 'Active' and tpa.tenant_user_id = (select auth.uid())
  )
);

-- INSERT: only the active tenant on tenant_access_id — never the owner
-- (the owner's own request-logging path is maintenance_requests, a
-- completely separate table/policy, untouched by this migration).
-- Scalar-subquery equalities (not EXISTS-with-bare-column-names) for
-- every column name that also exists on tenant_property_access /
-- property_conversations — see milestone-24's own comment on this
-- exact policy for the full "why," unchanged here. NEW in this file
-- (milestone-24's original design omitted this): also re-checks
-- owner_has_tenant_connect(owner_id), the same downgrade-safety re-check
-- property_messages_insert already does on every write — a tenant
-- request is conversation-backed (it can only exist tied to a
-- 'Maintenance' conversation, enforced below), so if the owner's plan
-- no longer includes Tenant Connect, new requests should stop the same
-- way new messages already do, not just new invites.
drop policy if exists "tenant_requests_insert_tenant" on public.tenant_requests;
create policy "tenant_requests_insert_tenant" on public.tenant_requests for insert to authenticated with check (
  owner_id = (select tpa.owner_id from public.tenant_property_access tpa where tpa.id = tenant_access_id)
  and property_id = (select tpa.property_id from public.tenant_property_access tpa where tpa.id = tenant_access_id)
  and exists (
    select 1 from public.tenant_property_access tpa
    where tpa.id = tenant_access_id
      and tpa.status = 'Active'
      and tpa.tenant_user_id = (select auth.uid())
  )
  and tenant_access_id = (
    select pc.tenant_access_id from public.property_conversations pc
    where pc.id = conversation_id and pc.conversation_type = 'Maintenance'
  )
  and public.owner_has_tenant_connect(owner_id)
);

-- UPDATE: owner only, status (+ auto-maintained updated_at) only —
-- enforced by the trigger below, not just this policy.
drop policy if exists "tenant_requests_update_owner" on public.tenant_requests;
create policy "tenant_requests_update_owner" on public.tenant_requests for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);
-- No DELETE policy — a request is retired via status = 'Resolved', never removed.

create or replace function public.tenant_requests_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tenant_requests_touch_updated_at on public.tenant_requests;
create trigger tenant_requests_touch_updated_at
  before update on public.tenant_requests
  for each row
  execute function public.tenant_requests_set_updated_at();

-- Row-level RLS cannot restrict which COLUMNS an UPDATE touches, so
-- without this trigger an owner UPDATE matching the policy above could
-- rewrite ANY column, including the tenant's original title/
-- description/category, or reassign the request entirely by rewriting
-- its foreign keys. This is the actual enforcement of "owners may only
-- change status" — unchanged from milestone-24's own design.
create or replace function public.tenant_requests_lock_immutable_fields()
returns trigger
language plpgsql
as $$
begin
  new.property_id := old.property_id;
  new.owner_id := old.owner_id;
  new.tenant_access_id := old.tenant_access_id;
  new.conversation_id := old.conversation_id;
  new.category := old.category;
  new.title := old.title;
  new.description := old.description;
  new.created_at := old.created_at;
  return new;
end;
$$;

drop trigger if exists tenant_requests_lock_immutable_fields on public.tenant_requests;
create trigger tenant_requests_lock_immutable_fields
  before update on public.tenant_requests
  for each row
  execute function public.tenant_requests_lock_immutable_fields();

-- ===================================================================
-- SECTION B — tenant-facing views (unchanged from milestone-24's
-- design; re-verified column-for-column against the current leases/
-- properties table shape in supabase/schema.sql)
-- ===================================================================
create or replace function public.is_active_tenant_of_property(p_property_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tenant_property_access tpa
    where tpa.property_id = p_property_id
      and tpa.status = 'Active'
      and tpa.tenant_user_id = auth.uid()
  );
$$;

create or replace function public.is_active_tenant_of_lease(p_lease_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tenant_property_access tpa
    where tpa.lease_id = p_lease_id
      and tpa.status = 'Active'
      and tpa.tenant_user_id = auth.uid()
  );
$$;

-- Column lists are deliberately minimal — exactly what
-- app/tenant/page.tsx already selects. A tenant querying
-- public.properties/public.leases directly gets zero rows: neither base
-- table has any tenant-facing SELECT policy any more (see below).
drop view if exists public.tenant_property_view;
create view public.tenant_property_view as
select
  p.id,
  p.address,
  p.city
from public.properties p
where public.is_active_tenant_of_property(p.id);

drop view if exists public.tenant_lease_view;
create view public.tenant_lease_view as
select
  l.id,
  l.tenant_name,
  l.monthly_rent,
  l.start_date,
  l.end_date,
  l.rent_due_day
from public.leases l
where public.is_active_tenant_of_lease(l.id);

grant select on public.tenant_property_view to authenticated;
grant select on public.tenant_lease_view to authenticated;

-- Defensive idempotent cleanup — in case an earlier, different version
-- of a tenant-facing base-table policy was ever separately applied.
-- properties_select_own / leases_select_own (owner-only, pre-existing,
-- untouched) remain the ONLY select policies on the base tables.
drop policy if exists "properties_select_active_tenant" on public.properties;
drop policy if exists "leases_select_active_tenant" on public.leases;

-- ===================================================================
-- SECTION C — Guided Maintenance Intake foundation (M2 compatibility
-- only; NO application code reads or writes either table in M1 — see
-- this file's header). Kept as two separate, append-only-shaped tables
-- rather than columns on tenant_requests itself, so the question-tree
-- content/schema can evolve across many answers per session without
-- ever touching the request row, and so a request's own top-level
-- shape stays exactly what M1's application code already expects.
-- ===================================================================
create table if not exists public.maintenance_intake_sessions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.tenant_requests(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  tenant_access_id uuid not null references public.tenant_property_access(id) on delete restrict,
  tree_version text not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  -- 'resolved_in_intake' / 'escalated_urgent' are this file's concrete
  -- answer to the M1 brief's "make room to store... resolved-during-
  -- intake outcome" and "...urgent/safety escalation outcome" — the
  -- session record is where BOTH facts live; tenant_requests.status
  -- itself is deliberately left unchanged (still New/In Progress/
  -- Resolved only) since no M1 code path sets a new status value and
  -- adding one nothing writes yet would be exactly the "prematurely
  -- build" the M1 brief warns against. See
  -- docs/tenant-connect-maintenance-m1-foundation.md for the full
  -- reasoning.
  outcome text check (outcome in ('resolved_in_intake', 'escalated_to_dispatch', 'escalated_urgent', 'abandoned')),
  created_at timestamptz not null default now()
);
create index if not exists maintenance_intake_sessions_request_idx on public.maintenance_intake_sessions(request_id);
create index if not exists maintenance_intake_sessions_owner_idx on public.maintenance_intake_sessions(owner_id);
create index if not exists maintenance_intake_sessions_tenant_access_idx on public.maintenance_intake_sessions(tenant_access_id);

alter table public.maintenance_intake_sessions enable row level security;

drop policy if exists "maintenance_intake_sessions_select" on public.maintenance_intake_sessions;
create policy "maintenance_intake_sessions_select" on public.maintenance_intake_sessions for select to authenticated using (
  (select auth.uid()) = owner_id
  or exists (
    select 1 from public.tenant_property_access tpa
    where tpa.id = tenant_access_id and tpa.status = 'Active' and tpa.tenant_user_id = (select auth.uid())
  )
);

-- INSERT/UPDATE: tenant-only (M2's future intake flow), same
-- forged-FK-rejection shape as tenant_requests_insert_tenant above —
-- request_id must actually belong to a request tied to the caller's own
-- active tenant_access_id, never a different tenant's request.
-- Same owner_has_tenant_connect() re-check as tenant_requests_insert_tenant
-- above, for internal consistency — a session can only ever be created
-- under a request whose owner already has Tenant Connect (since the
-- request itself couldn't have been created otherwise), but re-checking
-- here directly guards against the owner's plan having lapsed between
-- the request's creation and this insert, same downgrade-safety
-- rationale as every other re-check in this file.
drop policy if exists "maintenance_intake_sessions_insert_tenant" on public.maintenance_intake_sessions;
create policy "maintenance_intake_sessions_insert_tenant" on public.maintenance_intake_sessions for insert to authenticated with check (
  owner_id = (select tr.owner_id from public.tenant_requests tr where tr.id = request_id)
  and tenant_access_id = (select tr.tenant_access_id from public.tenant_requests tr where tr.id = request_id)
  and exists (
    select 1 from public.tenant_property_access tpa
    where tpa.id = tenant_access_id and tpa.status = 'Active' and tpa.tenant_user_id = (select auth.uid())
  )
  and public.owner_has_tenant_connect(owner_id)
);

-- UPDATE is intentionally narrow in scope (the caller must still be the
-- session's own active tenant) but NOT column-locked by a trigger the
-- way tenant_requests is — no code writes here yet in M1, so there is
-- no live behavior to lock down. M2 should add an immutable-fields
-- trigger here (locking everything except completed_at/outcome) before
-- shipping the real intake UI — flagged explicitly in
-- docs/tenant-connect-maintenance-m1-foundation.md as required M2
-- hardening, not assumed to be needed defensively today.
drop policy if exists "maintenance_intake_sessions_update_tenant" on public.maintenance_intake_sessions;
create policy "maintenance_intake_sessions_update_tenant" on public.maintenance_intake_sessions for update to authenticated
using (
  exists (
    select 1 from public.tenant_property_access tpa
    where tpa.id = tenant_access_id and tpa.status = 'Active' and tpa.tenant_user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.tenant_property_access tpa
    where tpa.id = tenant_access_id and tpa.status = 'Active' and tpa.tenant_user_id = (select auth.uid())
  )
);
-- No DELETE policy — matches every other retire-never-delete table here.

create table if not exists public.maintenance_intake_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.maintenance_intake_sessions(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  tenant_access_id uuid not null references public.tenant_property_access(id) on delete restrict,
  question_key text not null,
  -- Mirrors the M0 architecture's four-way safety classification exactly
  -- (§6.1/§7 of docs/tenant-connect-maintenance-coordination-m0.md) —
  -- stored per-answer so a future audit of "did we ever ask a tenant to
  -- do something unsafe" is a real, queryable question, not a guess.
  safety_class text not null check (safety_class in ('safe_observation', 'safe_simple_action', 'professional_diagnosis_required', 'urgent_escalation')),
  answer_value jsonb not null default '{}'::jsonb,
  answered_at timestamptz not null default now()
);
create index if not exists maintenance_intake_answers_session_idx on public.maintenance_intake_answers(session_id);
create index if not exists maintenance_intake_answers_owner_idx on public.maintenance_intake_answers(owner_id);

alter table public.maintenance_intake_answers enable row level security;

drop policy if exists "maintenance_intake_answers_select" on public.maintenance_intake_answers;
create policy "maintenance_intake_answers_select" on public.maintenance_intake_answers for select to authenticated using (
  (select auth.uid()) = owner_id
  or exists (
    select 1 from public.tenant_property_access tpa
    where tpa.id = tenant_access_id and tpa.status = 'Active' and tpa.tenant_user_id = (select auth.uid())
  )
);

-- INSERT-only (append-only, no UPDATE/DELETE policy at all) — an
-- answer, once given, is a historical fact; a corrected answer is a NEW
-- row, never an edit. session_id must belong to a session the caller's
-- own active tenant_access_id actually owns.
-- Same re-check, one hop further down the chain (session -> request's
-- owner) — see maintenance_intake_sessions_insert_tenant's comment above.
drop policy if exists "maintenance_intake_answers_insert_tenant" on public.maintenance_intake_answers;
create policy "maintenance_intake_answers_insert_tenant" on public.maintenance_intake_answers for insert to authenticated with check (
  owner_id = (select mis.owner_id from public.maintenance_intake_sessions mis where mis.id = session_id)
  and tenant_access_id = (select mis.tenant_access_id from public.maintenance_intake_sessions mis where mis.id = session_id)
  and exists (
    select 1 from public.tenant_property_access tpa
    where tpa.id = tenant_access_id and tpa.status = 'Active' and tpa.tenant_user_id = (select auth.uid())
  )
  and public.owner_has_tenant_connect(owner_id)
);

-- ===================================================================
-- SECTION D — maintenance audit log (append-only; foundation only,
-- covers exactly the two actions M1 itself re-enables: a tenant
-- submitting a request, an owner changing its status)
-- ===================================================================
-- Same immutability convention as public.ai_usage_events: no
-- INSERT/UPDATE/DELETE policy for `authenticated` AT ALL — RLS denies
-- all three by default with no policy present. Unlike ai_usage_events
-- (which the application itself inserts into after a successful AI
-- call), every row here is written EXCLUSIVELY by the SECURITY DEFINER
-- trigger function below, which runs with the function owner's
-- privileges and so bypasses this table's RLS the same way
-- owner_has_tenant_connect() already does for its own cross-table read.
-- Nobody — not even the request's own owner or tenant — can directly
-- insert, forge, or alter an audit row through the API; every entry is
-- a true, server-derived record of an action that actually happened.
create table if not exists public.maintenance_audit_log (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.tenant_requests(id) on delete cascade,
  actor_kind text not null check (actor_kind in ('landlord', 'tenant', 'system')),
  actor_id uuid,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists maintenance_audit_log_request_idx on public.maintenance_audit_log(request_id, created_at);

alter table public.maintenance_audit_log enable row level security;

drop policy if exists "maintenance_audit_log_select" on public.maintenance_audit_log;
create policy "maintenance_audit_log_select" on public.maintenance_audit_log for select to authenticated using (
  exists (
    select 1 from public.tenant_requests tr
    where tr.id = request_id
      and (
        tr.owner_id = (select auth.uid())
        or exists (
          select 1 from public.tenant_property_access tpa
          where tpa.id = tr.tenant_access_id and tpa.status = 'Active' and tpa.tenant_user_id = (select auth.uid())
        )
      )
  )
);
-- No INSERT/UPDATE/DELETE policy for `authenticated` — see comment above.

create or replace function public.maintenance_audit_log_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    insert into public.maintenance_audit_log (request_id, actor_kind, actor_id, action, detail)
    values (new.id, 'tenant', auth.uid(), 'request_submitted', jsonb_build_object('category', new.category, 'status', new.status));
  elsif TG_OP = 'UPDATE' then
    insert into public.maintenance_audit_log (request_id, actor_kind, actor_id, action, detail)
    values (new.id, 'landlord', auth.uid(), 'status_changed', jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  return new;
end;
$$;

-- AFTER, not BEFORE — this must see the FINAL row (post the
-- tenant_requests_lock_immutable_fields BEFORE UPDATE trigger already
-- having force-restored every locked column), so an audit row can never
-- record a value the database itself then overwrote.
drop trigger if exists tenant_requests_write_audit_log on public.tenant_requests;
create trigger tenant_requests_write_audit_log
  after insert or update on public.tenant_requests
  for each row
  execute function public.maintenance_audit_log_write();

-- ===================================================================
-- SECTION E — owner_has_tenant_connect() plan-list fix (pre-existing,
-- currently-live production bug, discovered during this milestone's own
-- hands-on RLS verification — NOT part of the tenant_requests gap this
-- migration otherwise exists to close)
-- ===================================================================
-- FINDING: public.owner_has_tenant_connect(uuid) (defined at Milestone
-- 10, presumed live in production since that table/policy set predates
-- the tenant_requests gap entirely) only recognizes the LEGACY plan
-- names ('portfolio', 'portfolio_pro', 'owner'). lib/billing/
-- entitlements.ts's TENANT_CONNECT_ENABLED map — the single TypeScript
-- source of truth this SQL function is supposed to mirror exactly (see
-- its own Milestone 10 header comment) — has since been extended to
-- also grant Tenant Connect to the CURRENT Launch Pricing top-tier plan
-- names, 'manage' and 'automate'. The TS map was updated when those
-- plans were introduced; this SQL function was not.
--
-- IMPACT (real, today, independent of this migration): a landlord on
-- the current, live "Manage" or "Automate" plan sees Tenant Connect
-- enabled in the UI (the frontend gate reads entitlementsFor(), which is
-- correct) — but every actual database write gated by
-- owner_has_tenant_connect() is silently rejected by RLS:
-- tenant_access_insert_owner (inviting a tenant),
-- property_conversations_insert (starting a conversation),
-- property_messages_insert (posting a message). A Manage/Automate-plan
-- owner today cannot actually use Tenant Connect at all, despite the app
-- telling them they can.
--
-- HOW THIS WAS FOUND: supabase/tests/milestone-25-rls.test.sql's own
-- fixture deliberately uses plan = 'manage' (the real, current plan)
-- rather than copying milestone-24-rls.test.sql's fixture, which
-- happens to use the legacy 'portfolio' value — masking this exact bug.
-- Running the new test against a real local Postgres instance (loaded
-- from the full supabase/schema.sql) reproduced the failure directly:
-- "new row violates row-level security policy for table
-- property_conversations" on a plan the application itself already
-- treats as fully entitled.
--
-- WHY THIS BELONGS IN THIS MIGRATION, NOT A SEPARATE ONE: this is a
-- one-line CREATE OR REPLACE FUNCTION correcting an already-live
-- function to match an already-live, unchanged TS map — it grants
-- nothing new (Manage/Automate owners are already told, and already
-- billed, as Tenant Connect-entitled by the existing TS layer; this
-- only makes the database agree). It is not a new entitlement, not a
-- new paid plan, and not new M1 scope — it is exactly the "reuse the
-- existing Tenant Connect entitlement/gating architecture unless the
-- audit demonstrates a concrete technical reason not to" case the M1
-- brief itself anticipates, with the concrete technical reason being a
-- reproducible, currently-live RLS test failure. Fixing it here (rather
-- than filing it for a separate, later milestone) also lets Section A's
-- new owner_has_tenant_connect() re-checks be verified against correct
-- behavior in the same test run, instead of verifying against a
-- function already known to be wrong.
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
      and us.plan in ('portfolio', 'portfolio_pro', 'owner', 'manage', 'automate')
  );
$$;
