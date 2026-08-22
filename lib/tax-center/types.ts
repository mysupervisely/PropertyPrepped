// PropRoster — Tax Center: shared types.
//
// Deliberately structural/minimal input types (not the full app/page.tsx
// row shapes) — every aggregation/readiness function only ever reads
// the fields it actually needs, so a caller can pass in exactly the
// already-loaded RLS-scoped rows it has without reshaping them first.

import type { CategoryValue, ManualTaxFields } from './manual-entry'

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

/** The manual tax record for one property + one tax year — mirrors supabase/milestone-22-tax-center-v2.sql's property_tax_records row shape (minus id/property_id/owner_id/tax_year, which the caller already has separately). */
export type TaxRecordInput = ManualTaxFields & {
  notes: string | null
  document_id: string | null
}

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
  /** Manual-entry-only mortgage interest for the year (Section "Mortgage Interest") — 0 if never entered, never estimated. */
  mortgageInterest: number
  /** Per-category breakdown (lib/tax-center/manual-entry.ts's TAX_CATEGORIES, keyed by category key) — tracked/manual/effective/source for every category, income and expense alike. */
  categoryBreakdown: Record<string, CategoryValue>
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
  expenseByCategory: Record<string, number>
  propertiesNeedingAttention: { propertyId: string; address: string; status: ReadinessStatus }[]
}
