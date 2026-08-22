// PropRoster — Tax Center V1: Tax Readiness.
//
// Every check here identifies something the landlord can actually go
// fix in the existing app (categorize an expense, attach a receipt,
// reconsider a renovation's category) — never a vague/scary warning,
// and never something PropRoster invents an opinion about (e.g. this
// never says an amount is "wrong," only that it's worth a second look
// before handing records to a CPA).

import { isOperatingExpenseCategory, isCapitalExpenseCategory } from './categories'
import type { MaintenanceRecordInput, ReadinessResult, TransactionInput } from './types'

export function computePropertyReadiness(
  yearTransactions: TransactionInput[],
  yearMaintenanceRecords: MaintenanceRecordInput[],
): ReadinessResult {
  const items: string[] = []

  if (yearTransactions.length === 0) {
    return { status: 'Missing Information', items: ['No income or expense records for this year yet.'] }
  }

  const uncategorized = yearTransactions.filter((t) => t.transaction_type === 'Expense' && t.category === 'Other')
  if (uncategorized.length > 0) {
    items.push(`${uncategorized.length} expense${uncategorized.length === 1 ? '' : 's'} categorized as "Other" — a more specific category may make this easier to review.`)
  }

  const undocumented = yearTransactions.filter((t) => t.transaction_type === 'Expense' && !t.document_id)
  if (undocumented.length > 0) {
    items.push(`${undocumented.length} expense${undocumented.length === 1 ? '' : 's'} without an attached receipt or document.`)
  }

  // A maintenance record marked 'Renovation' (typically a capital
  // improvement) whose linked ledger transaction was saved under an
  // ordinary operating category instead of 'CapEx' — a real, existing
  // data-quality signal (app/page.tsx's saveMaintenance() always writes
  // a fixed 'Maintenance' category, regardless of the record's own
  // category), not a guess about the user's specific situation.
  const misclassifiedRenovations = yearMaintenanceRecords.filter((m) => {
    if (m.category !== 'Renovation' || !m.financial_transaction_id) return false
    const linked = yearTransactions.find((t) => t.id === m.financial_transaction_id)
    return linked ? (isOperatingExpenseCategory(linked.category) && !isCapitalExpenseCategory(linked.category)) : false
  })
  if (misclassifiedRenovations.length > 0) {
    items.push(`${misclassifiedRenovations.length} renovation${misclassifiedRenovations.length === 1 ? '' : 's'} logged as a regular expense rather than a capital improvement — worth confirming with your tax professional.`)
  }

  return { status: items.length > 0 ? 'Needs Review' : 'Ready', items }
}

export type TaxDocumentInput = { id: string; property_id: string | null; category: string }

/** Portfolio-wide gap: Tax-category documents Smart Upload/Portfolio Import left unassigned — see the Documents library (Documents + Navigation + Realtor Connect Polish). Not tied to any one property, so reported once at the portfolio level. */
export function countUnassignedTaxDocuments(documents: TaxDocumentInput[]): number {
  return documents.filter((d) => d.category === 'Tax' && !d.property_id).length
}
