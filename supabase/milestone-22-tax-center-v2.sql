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
