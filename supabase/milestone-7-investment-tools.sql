-- PropPrepped Milestone 7 upgrade
-- Run once in the Supabase SQL Editor. Additive only — does not modify or
-- drop any existing table, column, policy or data from earlier milestones.
--
-- Adds Investment Tools: saved property evaluator analyses. An analysis can
-- exist on its own (a prospective deal the user is still considering) or be
-- linked to a real property once purchased, via property_id.

create table if not exists public.investment_analyses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  property_id uuid references public.properties(id) on delete set null,

  name text not null default 'Untitled analysis',
  address text,
  status text not null default 'Analyzing' check (status in ('Analyzing', 'Considering', 'Offer Made', 'Under Contract', 'Purchased', 'Passed')),

  -- Property
  purchase_price numeric(14,2) not null default 0,
  market_value numeric(14,2) not null default 0,
  units integer not null default 1,

  -- Financing
  down_payment numeric(14,2) not null default 0,
  interest_rate numeric(7,4) not null default 0,
  loan_term_years integer not null default 30,
  closing_costs numeric(14,2) not null default 0,

  -- Income
  monthly_rent numeric(14,2) not null default 0,
  other_income numeric(14,2) not null default 0,

  -- Expenses
  property_taxes numeric(14,2) not null default 0,
  insurance numeric(14,2) not null default 0,
  hoa numeric(14,2) not null default 0,
  management numeric(14,2) not null default 0,
  maintenance numeric(14,2) not null default 0,
  vacancy numeric(14,2) not null default 0,
  utilities numeric(14,2) not null default 0,
  other_expenses numeric(14,2) not null default 0,

  -- Projection assumptions
  appreciation_rate numeric(7,4) not null default 0,
  rent_growth_rate numeric(7,4) not null default 0,
  expense_growth_rate numeric(7,4) not null default 0,

  -- Full form + computed-results snapshots, so a saved analysis reloads
  -- exactly as it looked when saved even as the calculation logic evolves.
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

-- Keep updated_at current on every edit.
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
