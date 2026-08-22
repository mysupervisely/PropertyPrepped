// PropRoster — Tax Center V1: aggregation.
//
// Pure functions only — no Supabase, no React. Every number here is a
// sum of financial_transactions rows that already exist (the SAME
// ledger app/page.tsx's Financials tab reads/writes); this module never
// invents, estimates, or infers a value for missing data (Section "Data
// Integrity") — a category with zero matching transactions simply
// totals to 0 / doesn't appear, it is never backfilled with a guess.

import { isIncomeCategory, isOperatingExpenseCategory, isCapitalExpenseCategory, isNonOperatingCategory } from './categories'
import { computePropertyReadiness } from './readiness'
import type { MaintenanceRecordInput, PortfolioTaxSummary, PropertyInput, PropertyTaxSummary, TransactionInput } from './types'

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

function sumWhere(transactions: TransactionInput[], predicate: (t: TransactionInput) => boolean): number {
  return transactions.filter(predicate).reduce((sum, t) => sum + Number(t.amount), 0)
}

export function computePropertyTaxSummary(
  property: PropertyInput,
  yearTransactions: TransactionInput[],
  yearMaintenanceRecords: MaintenanceRecordInput[],
): PropertyTaxSummary {
  const propertyTransactions = yearTransactions.filter((t) => t.property_id === property.id)
  const propertyMaintenance = yearMaintenanceRecords.filter((m) => m.property_id === property.id)

  const incomeTx = propertyTransactions.filter((t) => t.transaction_type === 'Income' && isIncomeCategory(t.category))
  const operatingExpenseTx = propertyTransactions.filter((t) => t.transaction_type === 'Expense' && isOperatingExpenseCategory(t.category))
  const capitalTx = propertyTransactions.filter((t) => t.transaction_type === 'Expense' && isCapitalExpenseCategory(t.category))
  const mortgageTx = propertyTransactions.filter((t) => t.transaction_type === 'Expense' && isNonOperatingCategory(t.category))

  const grossIncome = incomeTx.reduce((sum, t) => sum + Number(t.amount), 0)
  const operatingExpenses = operatingExpenseTx.reduce((sum, t) => sum + Number(t.amount), 0)
  const capitalImprovements = capitalTx.reduce((sum, t) => sum + Number(t.amount), 0)
  const mortgagePayments = mortgageTx.reduce((sum, t) => sum + Number(t.amount), 0)

  return {
    propertyId: property.id,
    address: property.address,
    city: property.city,
    grossIncome,
    operatingExpenses,
    netOperatingResult: grossIncome - operatingExpenses,
    capitalImprovements,
    mortgagePayments,
    incomeByCategory: sumByCategory(incomeTx),
    expenseByCategory: sumByCategory(operatingExpenseTx),
    transactionCount: propertyTransactions.length,
    readiness: computePropertyReadiness(propertyTransactions, propertyMaintenance),
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
    expenseByCategory,
    propertiesNeedingAttention: propertySummaries
      .filter((p) => p.readiness.status !== 'Ready')
      .map((p) => ({ propertyId: p.propertyId, address: p.address, status: p.readiness.status })),
  }
}
