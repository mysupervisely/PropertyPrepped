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
