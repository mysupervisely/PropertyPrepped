// PropRoster — Tax Center V1: shared types.
//
// Deliberately structural/minimal input types (not the full app/page.tsx
// row shapes) — every aggregation/readiness function only ever reads
// the fields it actually needs, so a caller can pass in exactly the
// already-loaded RLS-scoped rows it has without reshaping them first.

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

export type ReadinessStatus = 'Ready' | 'Needs Review' | 'Missing Information'

export type ReadinessResult = {
  status: ReadinessStatus
  items: string[]
}

export type PropertyTaxSummary = {
  propertyId: string
  address: string
  city: string
  /** Sum of INCOME_CATEGORIES transactions for the year. */
  grossIncome: number
  /** Sum of OPERATING_EXPENSE_CATEGORIES transactions for the year — excludes Mortgage and CapEx, mirroring app/page.tsx's existing NOI calculation. */
  operatingExpenses: number
  /** Net rental income before tax-specific adjustments: grossIncome - operatingExpenses. Not a final tax figure. */
  netOperatingResult: number
  /** Sum of CapEx-categorized transactions — shown separately, never folded into operatingExpenses. */
  capitalImprovements: number
  /** Sum of Mortgage-categorized transactions — reference only, never treated as a deductible expense or as interest. */
  mortgagePayments: number
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
  expenseByCategory: Record<string, number>
  propertiesNeedingAttention: { propertyId: string; address: string; status: ReadinessStatus }[]
}
