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

export type TaxCategoryGroup = 'income' | 'operatingExpense' | 'financing' | 'capital'

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

  // Financing: interest only, manual-only, always — see the module
  // comment above and categories.ts's SCHEDULE_E_MORTGAGE_NOTE. Never
  // derived from mortgages.monthly_payment or any ledger 'Mortgage'
  // transaction, and never includes principal.
  { key: 'mortgageInterest', label: 'Mortgage interest', group: 'financing', trackedCategory: null, manualField: 'mortgage_interest' },

  // Capital: tracked from the existing CapEx ledger category, with a
  // manual override available — always kept separate from operating
  // expenses, both here and in the aggregation layer.
  { key: 'capitalImprovements', label: 'Capital improvements', group: 'capital', trackedCategory: 'CapEx', manualField: 'capital_improvements' },
]

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
}

export type PropertyTaxRecord = ManualTaxFields & {
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
