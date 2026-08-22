// PropRoster — Tax Center: Tax Readiness.
//
// Every check here identifies something the landlord can actually go
// fix in the existing app (categorize an expense, attach a receipt,
// enter mortgage interest, add a note to a manual override) — never a
// vague/scary warning, and never something PropRoster invents an
// opinion about. A blank manual field is never itself a readiness item
// — only genuinely incomplete-looking or inconsistent situations are.

import { isOperatingExpenseCategory, isCapitalExpenseCategory, isNonOperatingCategory } from './categories'
import { TAX_CATEGORIES } from './manual-entry'
import type { MaintenanceRecordInput, ReadinessResult, TaxRecordInput, TransactionInput } from './types'

export function computePropertyReadiness(
  yearTransactions: TransactionInput[],
  yearMaintenanceRecords: MaintenanceRecordInput[],
  taxRecord: TaxRecordInput | null = null,
): ReadinessResult {
  const items: string[] = []

  if (yearTransactions.length === 0 && !taxRecord) {
    return { status: 'Missing Information', items: ['No income, expense, or manual tax records for this year yet.'] }
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

  // Mortgage interest: only ever flagged when there's a real signal the
  // landlord is tracking a mortgage for this property at all (an actual
  // 'Mortgage'-categorized ledger transaction this year) AND interest
  // hasn't been manually entered — never flagged just because the field
  // is blank on a property with no mortgage activity at all.
  const hasMortgageActivity = yearTransactions.some((t) => t.transaction_type === 'Expense' && isNonOperatingCategory(t.category))
  const hasMortgageInterestEntry = taxRecord?.mortgage_interest !== null && taxRecord?.mortgage_interest !== undefined
  if (hasMortgageActivity && !hasMortgageInterestEntry) {
    items.push('Mortgage payments were logged this year, but mortgage interest hasn\'t been entered yet — add it from your lender\'s Form 1098 if you\'d like it included in your Tax Center summary.')
  }

  // A manual override with no supporting note or document — not an
  // error, just a nudge, and only shown when there's actually a manual
  // entry to speak of.
  if (taxRecord) {
    const hasAnyManualValue = TAX_CATEGORIES.some((c) => {
      const value = (taxRecord as unknown as Record<string, number | null>)[c.manualField]
      return value !== null && value !== undefined
    })
    const hasSupport = Boolean(taxRecord.notes?.trim()) || Boolean(taxRecord.document_id)
    if (hasAnyManualValue && !hasSupport) {
      items.push('Manual tax entries were added without a note or attached document — consider noting your source (e.g. a lender statement) for easier CPA review.')
    }
  }

  return { status: items.length > 0 ? 'Needs Review' : 'Ready', items }
}

export type TaxDocumentInput = { id: string; property_id: string | null; category: string }

/** Portfolio-wide gap: Tax-category documents Smart Upload/Portfolio Import left unassigned — see the Documents library (Documents + Navigation + Realtor Connect Polish). Not tied to any one property, so reported once at the portfolio level. */
export function countUnassignedTaxDocuments(documents: TaxDocumentInput[]): number {
  return documents.filter((d) => d.category === 'Tax' && !d.property_id).length
}
