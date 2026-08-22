// PropRoster — Tax Center V2: manual tax entry + source-of-truth model.
//
// Core product principle (see this milestone's own spec): PropRoster
// has two possible sources for a tax-related number —
//   - "Tracked in PropRoster": summed live from financial_transactions,
//     exactly like Tax Center V1.
//   - "Manual tax entry": a landlord-entered annual figure, stored in
//     the new property_tax_records table (one row per property+tax
//     year — see supabase/milestone-22-tax-center-v2.sql).
//
// Override rule (the simpler of the two options the spec allows,
// explicitly chosen to avoid V2 complexity/ambiguity): the manual value,
// if entered, REPLACES the tracked value for Tax Center purposes — never
// added to it. This is the only rule that can never double-count: a
// landlord who enters a manual "Property Taxes" figure because their
// ledger under-counts it is not also having the ledger's (wrong, lower)
// figure silently added back in.
//
//   Effective Tax Center amount = manual value if entered, else tracked value
//
// TAX_CATEGORIES is the full V2 category list — a superset of Tax
// Center V1's OPERATING_EXPENSE_CATEGORIES (categories.ts), extended
// with the categories V2 asks for that have no financial_transactions
// equivalent at all (Cleaning, Landscaping, Pest control, Advertising/
// leasing) and with financing (Mortgage Interest — manual-only, always;
// PropRoster has no reliable tracked source for interest anywhere, see
// categories.ts's SCHEDULE_E_MORTGAGE_NOTE) and capital improvements
// (tracked from the existing 'CapEx' ledger category, with a manual
// override available too).

import { OPERATING_EXPENSE_CATEGORIES } from './categories'

// Tax Center V3: expanded manual tax categories (this milestone's own
// spec: "More capability, less visible complexity" — organized into
// clear groups rather than one long flat list). Three brand-new groups
// —'professional' (legal/accounting/bookkeeping/software/office/phone/
// memberships/education/other — none of these exist in
// FINANCIAL_CATEGORIES, so every one is manual-only, same as Cleaning/
// Landscaping/etc already were in V2), 'travel' (parking/tolls/airfare/
// rental car/lodging/other — also entirely manual-only; mileage itself
// is deliberately NOT one of these — see MileageFields below), and
// 'meals' (kept distinct from travel per spec, one category) — plus two
// new categories each added to the existing 'operatingExpense',
// 'financing', and 'capital' groups. Every new category flows through
// the EXACT SAME computeCategoryValue()/buildCategoryBreakdown() override
// rule already used for every V2 category — there is still only one
// place manual/tracked combination logic lives, so nothing new can
// double-count.
export type TaxCategoryGroup = 'income' | 'operatingExpense' | 'professional' | 'travel' | 'meals' | 'financing' | 'capital'

export type TaxCategoryDef = {
  key: string
  label: string
  group: TaxCategoryGroup
  /** The financial_transactions category this reads a tracked value from, or null if PropRoster has no tracked equivalent at all (always manual-only). */
  trackedCategory: string | null
  /** The property_tax_records column this category's manual value lives in. */
  manualField: string
}

export const TAX_CATEGORIES: TaxCategoryDef[] = [
  { key: 'rentalIncome', label: 'Rental income', group: 'income', trackedCategory: 'Rent', manualField: 'rental_income' },
  { key: 'otherIncome', label: 'Other rental-related income', group: 'income', trackedCategory: 'Other Income', manualField: 'other_income' },

  { key: 'propertyTaxes', label: 'Property taxes', group: 'operatingExpense', trackedCategory: 'Taxes', manualField: 'property_taxes' },
  { key: 'insurance', label: 'Insurance', group: 'operatingExpense', trackedCategory: 'Insurance', manualField: 'insurance' },
  { key: 'hoa', label: 'HOA / association fees', group: 'operatingExpense', trackedCategory: 'HOA', manualField: 'hoa' },
  { key: 'repairs', label: 'Repairs', group: 'operatingExpense', trackedCategory: 'Repairs', manualField: 'repairs' },
  { key: 'maintenance', label: 'Maintenance', group: 'operatingExpense', trackedCategory: 'Maintenance', manualField: 'maintenance' },
  { key: 'utilities', label: 'Utilities', group: 'operatingExpense', trackedCategory: 'Utilities', manualField: 'utilities' },
  { key: 'managementFees', label: 'Property management fees', group: 'operatingExpense', trackedCategory: 'Management', manualField: 'management_fees' },
  { key: 'legalProfessional', label: 'Legal & professional fees', group: 'operatingExpense', trackedCategory: 'Legal & Professional', manualField: 'legal_professional' },
  { key: 'supplies', label: 'Supplies', group: 'operatingExpense', trackedCategory: 'Supplies', manualField: 'supplies' },
  // No financial_transactions category exists for these four — Tax
  // Center V1 had no way to show them at all. Manual-only until/unless
  // the Financials ledger ever grows matching categories.
  { key: 'cleaning', label: 'Cleaning', group: 'operatingExpense', trackedCategory: null, manualField: 'cleaning' },
  { key: 'landscaping', label: 'Landscaping', group: 'operatingExpense', trackedCategory: null, manualField: 'landscaping' },
  { key: 'pestControl', label: 'Pest control', group: 'operatingExpense', trackedCategory: null, manualField: 'pest_control' },
  { key: 'advertising', label: 'Advertising / leasing', group: 'operatingExpense', trackedCategory: null, manualField: 'advertising' },
  { key: 'otherExpenses', label: 'Other operating expenses', group: 'operatingExpense', trackedCategory: 'Other', manualField: 'other_expenses' },
  // V3: two more Property & Operating Expenses categories — no ledger
  // equivalent for either, manual-only.
  { key: 'permitsLicenses', label: 'Permits / licenses', group: 'operatingExpense', trackedCategory: null, manualField: 'permits_licenses' },
  { key: 'bankFees', label: 'Bank / financial fees', group: 'operatingExpense', trackedCategory: null, manualField: 'bank_fees' },

  // V3: Professional & Administrative — a new group, entirely
  // manual-only (organizational categories; PropRoster never guarantees
  // deductibility of any of these — see this milestone's own spec).
  { key: 'profLegalFees', label: 'Legal fees', group: 'professional', trackedCategory: null, manualField: 'prof_legal_fees' },
  { key: 'profAccountingFees', label: 'Accounting / CPA fees', group: 'professional', trackedCategory: null, manualField: 'prof_accounting_fees' },
  { key: 'profTaxPrepFees', label: 'Tax preparation fees', group: 'professional', trackedCategory: null, manualField: 'prof_tax_prep_fees' },
  { key: 'profBookkeeping', label: 'Bookkeeping', group: 'professional', trackedCategory: null, manualField: 'prof_bookkeeping' },
  { key: 'profSoftwareSubscriptions', label: 'Software / subscriptions', group: 'professional', trackedCategory: null, manualField: 'prof_software_subscriptions' },
  { key: 'profOfficeExpenses', label: 'Office expenses', group: 'professional', trackedCategory: null, manualField: 'prof_office_expenses' },
  { key: 'profPhoneInternet', label: 'Phone / internet', group: 'professional', trackedCategory: null, manualField: 'prof_phone_internet' },
  { key: 'profMemberships', label: 'Professional memberships', group: 'professional', trackedCategory: null, manualField: 'prof_memberships' },
  { key: 'profEducation', label: 'Education related to rental activity', group: 'professional', trackedCategory: null, manualField: 'prof_education' },
  { key: 'profOther', label: 'Other professional / administrative', group: 'professional', trackedCategory: null, manualField: 'prof_other' },

  // V3: Travel & Vehicle — dollar categories only. Business mileage is
  // deliberately NOT a TAX_CATEGORIES entry — it's a QUANTITY (miles),
  // never a dollar amount, and PropRoster never converts it to one (no
  // hardcoded IRS mileage rate anywhere in this codebase) — see
  // MileageFields/emptyMileageFields below, which the panel/aggregate
  // layers handle entirely separately from this dollar-amount list.
  { key: 'travelParking', label: 'Parking', group: 'travel', trackedCategory: null, manualField: 'travel_parking' },
  { key: 'travelTolls', label: 'Tolls', group: 'travel', trackedCategory: null, manualField: 'travel_tolls' },
  { key: 'travelAirfare', label: 'Airfare', group: 'travel', trackedCategory: null, manualField: 'travel_airfare' },
  { key: 'travelRentalCar', label: 'Rental car', group: 'travel', trackedCategory: null, manualField: 'travel_rental_car' },
  { key: 'travelLodging', label: 'Lodging / hotel', group: 'travel', trackedCategory: null, manualField: 'travel_lodging' },
  { key: 'travelOther', label: 'Other travel expenses', group: 'travel', trackedCategory: null, manualField: 'travel_other' },

  // V3: Meals — kept as its own group, distinct from Travel & Vehicle,
  // per this milestone's spec. Never assumes any deductible percentage;
  // the stored amount is always the landlord's own recorded actual total.
  { key: 'mealsBusiness', label: 'Business meals', group: 'meals', trackedCategory: null, manualField: 'meals_business' },

  // Financing: interest only, manual-only, always — see the module
  // comment above and categories.ts's SCHEDULE_E_MORTGAGE_NOTE. Never
  // derived from mortgages.monthly_payment or any ledger 'Mortgage'
  // transaction, and never includes principal.
  { key: 'mortgageInterest', label: 'Mortgage interest', group: 'financing', trackedCategory: null, manualField: 'mortgage_interest' },
  // V3: two more financing categories — organizational only, never
  // folded into mortgageInterest itself (kept as its own field/column,
  // used everywhere the app already surfaces "mortgage interest"
  // specifically — see aggregate.ts's financingOtherTotal for these).
  { key: 'financingPoints', label: 'Points / loan costs', group: 'financing', trackedCategory: null, manualField: 'financing_points' },
  { key: 'financingOther', label: 'Other financing expenses', group: 'financing', trackedCategory: null, manualField: 'financing_other' },

  // Capital: tracked from the existing CapEx ledger category, with a
  // manual override available — always kept separate from operating
  // expenses, both here and in the aggregation layer.
  { key: 'capitalImprovements', label: 'Capital improvements', group: 'capital', trackedCategory: 'CapEx', manualField: 'capital_improvements' },
  // V3: seven more capital/depreciable categories — same treatment as
  // capitalImprovements: never summed into operatingExpenses, never
  // implied to be immediately deductible.
  { key: 'capitalAppliances', label: 'Appliances', group: 'capital', trackedCategory: null, manualField: 'capital_appliances' },
  { key: 'capitalFurniture', label: 'Furniture', group: 'capital', trackedCategory: null, manualField: 'capital_furniture' },
  { key: 'capitalEquipment', label: 'Equipment', group: 'capital', trackedCategory: null, manualField: 'capital_equipment' },
  { key: 'capitalMajorRenovations', label: 'Major renovations', group: 'capital', trackedCategory: null, manualField: 'capital_major_renovations' },
  { key: 'capitalRoof', label: 'Roof', group: 'capital', trackedCategory: null, manualField: 'capital_roof' },
  { key: 'capitalHvac', label: 'HVAC', group: 'capital', trackedCategory: null, manualField: 'capital_hvac' },
  { key: 'capitalOther', label: 'Other capital / depreciable items', group: 'capital', trackedCategory: null, manualField: 'capital_other' },
]

// Groups whose effective category totals count toward a property's
// ordinary operating-expense total (and therefore Net Result) —
// exported so aggregate.ts and custom-items.ts apply the EXACT SAME rule
// to fixed categories and custom tax items alike. Financing and Capital
// are deliberately excluded — same treatment mortgageInterest/
// capitalImprovements already had in V2, now explicit and shared.
export const OPERATING_EXPENSE_LIKE_GROUPS: TaxCategoryGroup[] = ['operatingExpense', 'professional', 'travel', 'meals']

// Sanity check, enforced at module load in tests: every operating
// expense category this file defines a tracked mapping for actually
// exists in OPERATING_EXPENSE_CATEGORIES (categories.ts) — keeps the two
// category lists from silently drifting apart.
export const MANUAL_ONLY_CATEGORY_KEYS = TAX_CATEGORIES.filter((c) => c.trackedCategory === null).map((c) => c.key)

export type ManualTaxFields = {
  rental_income: number | null
  other_income: number | null
  property_taxes: number | null
  insurance: number | null
  hoa: number | null
  repairs: number | null
  maintenance: number | null
  utilities: number | null
  management_fees: number | null
  legal_professional: number | null
  supplies: number | null
  cleaning: number | null
  landscaping: number | null
  pest_control: number | null
  advertising: number | null
  other_expenses: number | null
  mortgage_interest: number | null
  capital_improvements: number | null
  // V3 additions — see TAX_CATEGORIES above for the full description of
  // each. Every field here is optional/nullable, same as every V2 field:
  // blank always means "no manual entry," never $0.
  permits_licenses: number | null
  bank_fees: number | null
  prof_legal_fees: number | null
  prof_accounting_fees: number | null
  prof_tax_prep_fees: number | null
  prof_bookkeeping: number | null
  prof_software_subscriptions: number | null
  prof_office_expenses: number | null
  prof_phone_internet: number | null
  prof_memberships: number | null
  prof_education: number | null
  prof_other: number | null
  travel_parking: number | null
  travel_tolls: number | null
  travel_airfare: number | null
  travel_rental_car: number | null
  travel_lodging: number | null
  travel_other: number | null
  meals_business: number | null
  financing_points: number | null
  financing_other: number | null
  capital_appliances: number | null
  capital_furniture: number | null
  capital_equipment: number | null
  capital_major_renovations: number | null
  capital_roof: number | null
  capital_hvac: number | null
  capital_other: number | null
}

// V3: business mileage is a QUANTITY (miles), never a dollar amount —
// kept as its own type, entirely separate from ManualTaxFields (the
// override-rule dollar categories) so it can never be summed into any
// dollar total by accident. PropRoster never converts this to a dollar
// deduction (no hardcoded mileage rate anywhere in this codebase) —
// it's recorded for the landlord's own reference and their tax
// professional's use.
export type MileageFields = {
  business_mileage: number | null
  business_mileage_notes: string | null
}

export function emptyMileageFields(): MileageFields {
  return { business_mileage: null, business_mileage_notes: null }
}

export type PropertyTaxRecord = ManualTaxFields & MileageFields & {
  id: string
  property_id: string
  owner_id: string
  tax_year: number
  notes: string | null
  document_id: string | null
}

export function emptyManualFields(): ManualTaxFields {
  return {
    rental_income: null, other_income: null, property_taxes: null, insurance: null, hoa: null,
    repairs: null, maintenance: null, utilities: null, management_fees: null, legal_professional: null,
    supplies: null, cleaning: null, landscaping: null, pest_control: null, advertising: null,
    other_expenses: null, mortgage_interest: null, capital_improvements: null,
    permits_licenses: null, bank_fees: null,
    prof_legal_fees: null, prof_accounting_fees: null, prof_tax_prep_fees: null, prof_bookkeeping: null,
    prof_software_subscriptions: null, prof_office_expenses: null, prof_phone_internet: null,
    prof_memberships: null, prof_education: null, prof_other: null,
    travel_parking: null, travel_tolls: null, travel_airfare: null, travel_rental_car: null,
    travel_lodging: null, travel_other: null,
    meals_business: null,
    financing_points: null, financing_other: null,
    capital_appliances: null, capital_furniture: null, capital_equipment: null,
    capital_major_renovations: null, capital_roof: null, capital_hvac: null, capital_other: null,
  }
}

export type CategoryValue = {
  tracked: number
  manual: number | null
  effective: number
  source: 'tracked' | 'manual' | 'none'
}

/** The one place the override rule lives — see this module's top comment. */
export function computeCategoryValue(tracked: number, manual: number | null | undefined): CategoryValue {
  const normalizedManual = manual === undefined || manual === null ? null : manual
  if (normalizedManual !== null) {
    return { tracked, manual: normalizedManual, effective: normalizedManual, source: 'manual' }
  }
  return { tracked, manual: null, effective: tracked, source: tracked > 0 ? 'tracked' : 'none' }
}

export function buildCategoryBreakdown(
  trackedByCategory: Record<string, number>,
  taxRecord: ManualTaxFields | null | undefined,
): Record<string, CategoryValue> {
  const breakdown: Record<string, CategoryValue> = {}
  for (const def of TAX_CATEGORIES) {
    const tracked = def.trackedCategory ? (trackedByCategory[def.trackedCategory] || 0) : 0
    const manual = taxRecord ? (taxRecord as unknown as Record<string, number | null>)[def.manualField] : null
    breakdown[def.key] = computeCategoryValue(tracked, manual)
  }
  return breakdown
}

export function categoriesInGroup(group: TaxCategoryGroup): TaxCategoryDef[] {
  return TAX_CATEGORIES.filter((c) => c.group === group)
}
