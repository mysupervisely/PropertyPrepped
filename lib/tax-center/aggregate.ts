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
import { buildCategoryBreakdown, categoriesInGroup } from './manual-entry'
import type { MaintenanceRecordInput, PortfolioTaxSummary, PropertyInput, PropertyTaxSummary, TaxRecordInput, TransactionInput } from './types'

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
): PropertyTaxSummary {
  const propertyTransactions = yearTransactions.filter((t) => t.property_id === property.id)
  const propertyMaintenance = yearMaintenanceRecords.filter((m) => m.property_id === property.id)

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
  const operatingExpenses = categoriesInGroup('operatingExpense').reduce((sum, c) => sum + categoryBreakdown[c.key].effective, 0)
  const capitalImprovements = categoriesInGroup('capital').reduce((sum, c) => sum + categoryBreakdown[c.key].effective, 0)
  const mortgageInterest = categoriesInGroup('financing').reduce((sum, c) => sum + categoryBreakdown[c.key].effective, 0)
  const mortgagePayments = mortgageTx.reduce((sum, t) => sum + Number(t.amount), 0)

  const incomeByCategory: Record<string, number> = {}
  for (const c of categoriesInGroup('income')) incomeByCategory[c.key] = categoryBreakdown[c.key].effective
  const expenseByCategory: Record<string, number> = {}
  for (const c of categoriesInGroup('operatingExpense')) expenseByCategory[c.key] = categoryBreakdown[c.key].effective

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
    categoryBreakdown,
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
    expenseByCategory,
    propertiesNeedingAttention: propertySummaries
      .filter((p) => p.readiness.status !== 'Ready')
      .map((p) => ({ propertyId: p.propertyId, address: p.address, status: p.readiness.status })),
  }
}
