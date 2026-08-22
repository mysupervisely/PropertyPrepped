// PropRoster — Tax Center: aggregation.
//
// Pure functions only — no Supabase, no React. Every "tracked" number is
// a sum of financial_transactions rows that already exist (the SAME
// ledger app/page.tsx's Financials tab reads/writes); every "effective"
// number additionally applies the V2 manual-override rule
// (lib/tax-center/manual-entry.ts's computeCategoryValue) when a
// property_tax_records row exists for that property/year. This module
// never invents, estimates, or infers a value for missing data (Section
// "Data Integrity") — a category with zero matching transactions and no
// manual entry simply totals to 0, it is never backfilled with a guess.

import { isIncomeCategory, isOperatingExpenseCategory, isCapitalExpenseCategory, isNonOperatingCategory } from './categories'
import { computePropertyReadiness } from './readiness'
import { buildCategoryBreakdown, categoriesInGroup, OPERATING_EXPENSE_LIKE_GROUPS } from './manual-entry'
import { capitalCustomItemsTotal, financingCustomItemsTotal, operatingExpenseCustomItemsTotal } from './custom-items'
import type { CustomTaxItemInput, MaintenanceRecordInput, PortfolioTaxSummary, PropertyInput, PropertyTaxSummary, TaxRecordInput, TransactionInput } from './types'

// V3: every category in these groups counts toward a property's ordinary
// operating-expense total (and therefore Net Result) — operatingExpense
// (unchanged from V2) plus the three new groups (professional/travel/
// meals). Financing and capital stay excluded, same as V2.
const OPERATING_EXPENSE_LIKE_CATEGORIES = OPERATING_EXPENSE_LIKE_GROUPS.flatMap((g) => categoriesInGroup(g))

/** Newest first is irrelevant here — always returned sorted descending (most recent tax year first), current year always included even with zero data yet, matching app/page.tsx's own existing `years` derivation for its Financials tab. */
export function getAvailableTaxYears(transactions: TransactionInput[], now: Date = new Date()): string[] {
  const currentYear = String(now.getFullYear())
  const years = new Set([currentYear, ...transactions.map((t) => t.transaction_date.slice(0, 4))])
  return Array.from(years).sort().reverse()
}

export function filterTransactionsForYear(transactions: TransactionInput[], year: string): TransactionInput[] {
  return transactions.filter((t) => t.transaction_date.startsWith(year))
}

export function sumByCategory(transactions: TransactionInput[]): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const t of transactions) {
    totals[t.category] = (totals[t.category] || 0) + Number(t.amount)
  }
  return totals
}

export function computePropertyTaxSummary(
  property: PropertyInput,
  yearTransactions: TransactionInput[],
  yearMaintenanceRecords: MaintenanceRecordInput[],
  taxRecord: TaxRecordInput | null = null,
  // V3: every custom tax item for the YEAR being summarized (across every
  // property, same convention as yearTransactions/yearMaintenanceRecords)
  // — filtered down to this one property below. Defaults to [] so every
  // existing caller (and every V1/V2 test) that never passes this is
  // completely unaffected — byte-identical behavior to before this
  // milestone when omitted.
  yearCustomItems: CustomTaxItemInput[] = [],
): PropertyTaxSummary {
  const propertyTransactions = yearTransactions.filter((t) => t.property_id === property.id)
  const propertyMaintenance = yearMaintenanceRecords.filter((m) => m.property_id === property.id)
  const propertyCustomItems = yearCustomItems.filter((i) => i.propertyId === property.id)

  const incomeTx = propertyTransactions.filter((t) => t.transaction_type === 'Income' && isIncomeCategory(t.category))
  const operatingExpenseTx = propertyTransactions.filter((t) => t.transaction_type === 'Expense' && isOperatingExpenseCategory(t.category))
  const capitalTx = propertyTransactions.filter((t) => t.transaction_type === 'Expense' && isCapitalExpenseCategory(t.category))
  const mortgageTx = propertyTransactions.filter((t) => t.transaction_type === 'Expense' && isNonOperatingCategory(t.category))

  const trackedByCategory: Record<string, number> = {}
  for (const t of [...incomeTx, ...operatingExpenseTx, ...capitalTx]) {
    trackedByCategory[t.category] = (trackedByCategory[t.category] || 0) + Number(t.amount)
  }
  const categoryBreakdown = buildCategoryBreakdown(trackedByCategory, taxRecord)

  const grossIncome = categoriesInGroup('income').reduce((sum, c) => sum + categoryBreakdown[c.key].effective, 0)
  // V3: operatingExpenses now rolls up operatingExpense + professional +
  // travel + meals (OPERATING_EXPENSE_LIKE_CATEGORIES), plus any custom
  // tax item tagged with one of those same groups — see custom-items.ts.
  // Financing and capital are still never included here, exactly as V2.
  const operatingExpenses = OPERATING_EXPENSE_LIKE_CATEGORIES.reduce((sum, c) => sum + categoryBreakdown[c.key].effective, 0)
    + operatingExpenseCustomItemsTotal(propertyCustomItems)
  // V3: capitalImprovements now includes every capital/depreciable
  // category (appliances/furniture/equipment/major renovations/roof/
  // HVAC/other, alongside the original capitalImprovements category)
  // plus any custom item tagged Capital / Depreciable — still never
  // folded into operatingExpenses, still never implied deductible.
  const capitalImprovements = categoriesInGroup('capital').reduce((sum, c) => sum + categoryBreakdown[c.key].effective, 0)
    + capitalCustomItemsTotal(propertyCustomItems)
  // mortgageInterest stays a PURE, SPECIFIC figure — only the
  // mortgageInterest category itself, never summed with the new
  // financingPoints/financingOther categories or any custom "Financing"
  // item (those live in financingOtherTotal below instead). This is the
  // one figure every existing main-table/CSV/print column already reads
  // as "mortgage interest," so its meaning must never silently widen.
  const mortgageInterest = categoryBreakdown.mortgageInterest.effective
  // V3: points/loan costs + other financing (fixed) + any custom
  // "Financing" item — organizational detail only, excluded from
  // operatingExpenses/netOperatingResult, same treatment mortgageInterest
  // itself already has. Shown separately in property detail/exports.
  const financingOtherTotal = categoriesInGroup('financing')
    .filter((c) => c.key !== 'mortgageInterest')
    .reduce((sum, c) => sum + categoryBreakdown[c.key].effective, 0)
    + financingCustomItemsTotal(propertyCustomItems)
  const mortgagePayments = mortgageTx.reduce((sum, t) => sum + Number(t.amount), 0)

  const incomeByCategory: Record<string, number> = {}
  for (const c of categoriesInGroup('income')) incomeByCategory[c.key] = categoryBreakdown[c.key].effective
  const expenseByCategory: Record<string, number> = {}
  for (const c of OPERATING_EXPENSE_LIKE_CATEGORIES) expenseByCategory[c.key] = categoryBreakdown[c.key].effective

  return {
    propertyId: property.id,
    address: property.address,
    city: property.city,
    grossIncome,
    operatingExpenses,
    netOperatingResult: grossIncome - operatingExpenses,
    capitalImprovements,
    mortgagePayments,
    mortgageInterest,
    financingOtherTotal,
    categoryBreakdown,
    businessMileage: taxRecord?.business_mileage ?? null,
    businessMileageNotes: taxRecord?.business_mileage_notes ?? null,
    customItems: propertyCustomItems,
    hasManualRecord: taxRecord !== null,
    notes: taxRecord?.notes ?? null,
    documentId: taxRecord?.document_id ?? null,
    incomeByCategory,
    expenseByCategory,
    transactionCount: propertyTransactions.length,
    readiness: computePropertyReadiness(propertyTransactions, propertyMaintenance, taxRecord),
  }
}

export function computePortfolioTaxSummary(year: string, propertySummaries: PropertyTaxSummary[]): PortfolioTaxSummary {
  const expenseByCategory: Record<string, number> = {}
  for (const p of propertySummaries) {
    for (const [category, amount] of Object.entries(p.expenseByCategory)) {
      expenseByCategory[category] = (expenseByCategory[category] || 0) + amount
    }
  }

  return {
    year,
    propertiesIncluded: propertySummaries.length,
    grossIncome: propertySummaries.reduce((sum, p) => sum + p.grossIncome, 0),
    operatingExpenses: propertySummaries.reduce((sum, p) => sum + p.operatingExpenses, 0),
    netOperatingResult: propertySummaries.reduce((sum, p) => sum + p.netOperatingResult, 0),
    capitalImprovements: propertySummaries.reduce((sum, p) => sum + p.capitalImprovements, 0),
    mortgagePayments: propertySummaries.reduce((sum, p) => sum + p.mortgagePayments, 0),
    mortgageInterest: propertySummaries.reduce((sum, p) => sum + p.mortgageInterest, 0),
    financingOtherTotal: propertySummaries.reduce((sum, p) => sum + p.financingOtherTotal, 0),
    customItemsCount: propertySummaries.reduce((sum, p) => sum + p.customItems.length, 0),
    expenseByCategory,
    propertiesNeedingAttention: propertySummaries
      .filter((p) => p.readiness.status !== 'Ready')
      .map((p) => ({ propertyId: p.propertyId, address: p.address, status: p.readiness.status })),
  }
}
