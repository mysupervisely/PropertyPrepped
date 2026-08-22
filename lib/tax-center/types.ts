// PropRoster — Tax Center: shared types.
//
// Deliberately structural/minimal input types (not the full app/page.tsx
// row shapes) — every aggregation/readiness function only ever reads
// the fields it actually needs, so a caller can pass in exactly the
// already-loaded RLS-scoped rows it has without reshaping them first.

import type { CategoryValue, ManualTaxFields, MileageFields } from './manual-entry'
import type { CustomTaxItem } from './custom-items'

export type TransactionInput = {
  id: string
  property_id: string
  transaction_date: string // YYYY-MM-DD
  transaction_type: 'Income' | 'Expense'
  category: string
  amount: number
  document_id: string | null
}

export type MaintenanceRecordInput = {
  id: string
  property_id: string
  service_date: string
  category: string
  financial_transaction_id: string | null
}

export type PropertyInput = {
  id: string
  address: string
  city: string
  property_type: string
}

export type TaxDocumentInput = {
  id: string
  property_id: string | null
  category: string
}

/** The manual tax record for one property + one tax year — mirrors property_tax_records' row shape (minus id/property_id/owner_id/tax_year, which the caller already has separately). V3 adds MileageFields (business_mileage is a quantity, never a dollar amount — see manual-entry.ts). */
export type TaxRecordInput = ManualTaxFields & MileageFields & {
  notes: string | null
  document_id: string | null
}

/** A property/tax-year's custom tax items, as computePropertyTaxSummary needs them — mirrors CustomTaxItem (lib/tax-center/custom-items.ts) exactly; already filtered to one property/year by the caller. */
export type CustomTaxItemInput = CustomTaxItem

export type ReadinessStatus = 'Ready' | 'Needs Review' | 'Missing Information'

export type ReadinessResult = {
  status: ReadinessStatus
  items: string[]
}

export type PropertyTaxSummary = {
  propertyId: string
  address: string
  city: string
  /** Effective (tracked, manual-overridden where entered) sum of income categories for the year. */
  grossIncome: number
  /** Effective sum of ordinary operating expense categories — excludes Mortgage, CapEx, and mortgage interest. */
  operatingExpenses: number
  /** Net rental income before tax-specific adjustments: grossIncome - operatingExpenses. Not a final tax figure. */
  netOperatingResult: number
  /** Effective capital improvements (tracked CapEx, manual-overridden where entered) — shown separately, never folded into operatingExpenses. */
  capitalImprovements: number
  /** Sum of Mortgage-categorized ledger transactions — reference only (principal+interest+escrow lumped together), never treated as a deductible expense or as interest. Unchanged from V1. */
  mortgagePayments: number
  /** Manual-entry-only mortgage interest for the year (Section "Mortgage Interest") — 0 if never entered, never estimated. Never includes financingOtherTotal below or any custom "Financing" item — this stays a pure, specific figure. */
  mortgageInterest: number
  /** V3: points/loan costs + other financing (fixed categories) + any custom items tagged "Financing" — organizational detail only, shown separately from mortgageInterest (never merged into it) and excluded from operatingExpenses/netOperatingResult, same treatment mortgageInterest itself already has. */
  financingOtherTotal: number
  /** Per-category breakdown (lib/tax-center/manual-entry.ts's TAX_CATEGORIES, keyed by category key) — tracked/manual/effective/source for every category, income and expense alike. Includes every V3 category (professional/travel/meals/new financing/new capital). */
  categoryBreakdown: Record<string, CategoryValue>
  /** V3: business mileage (a quantity — miles, never a dollar amount) and its own notes, straight from the property_tax_records row. Null when never entered; never estimated, never converted to a dollar figure anywhere in this codebase. */
  businessMileage: number | null
  businessMileageNotes: string | null
  /** V3: every property_tax_custom_items row for this property/year — already summed into operatingExpenses/capitalImprovements/financingOtherTotal above (see custom-items.ts), and surfaced here as-is so the UI/CSV/print can list each one individually without a second query or re-derivation. */
  customItems: CustomTaxItemInput[]
  /** True if a property_tax_records row exists for this property/year at all (regardless of which fields are populated) — used by readiness and the property page to know whether to show "no manual entry yet". */
  hasManualRecord: boolean
  /** Present only when hasManualRecord — surfaced so the UI/CSV/print can show it without a second query. */
  notes: string | null
  documentId: string | null
  incomeByCategory: Record<string, number>
  expenseByCategory: Record<string, number>
  transactionCount: number
  readiness: ReadinessResult
}

export type PortfolioTaxSummary = {
  year: string
  propertiesIncluded: number
  grossIncome: number
  operatingExpenses: number
  netOperatingResult: number
  capitalImprovements: number
  mortgagePayments: number
  mortgageInterest: number
  /** V3: sum of every property's financingOtherTotal (points/loan costs/other financing, fixed + custom) — organizational detail, excluded from operatingExpenses/netOperatingResult across the whole portfolio too. */
  financingOtherTotal: number
  /** V3: total count of custom tax items recorded across every included property/year — a count, not a dollar figure (the dollar amounts are already folded into operatingExpenses/capitalImprovements/financingOtherTotal above; a second dollar total here would just invite double-counting confusion). */
  customItemsCount: number
  expenseByCategory: Record<string, number>
  propertiesNeedingAttention: { propertyId: string; address: string; status: ReadinessStatus }[]
}
