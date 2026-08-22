// PropRoster — Tax Center V1: CSV export.
//
// Same escaping/row-building convention as app/page.tsx's existing
// exportTransactionsCsv (Financials tab) — a quoted-field CSV, doubled
// internal quotes, comma-joined. Pure string building only; the actual
// Blob/download-anchor mechanics live in the page component, matching
// that same existing pattern.

import { OPERATING_EXPENSE_CATEGORIES } from './categories'
import type { PortfolioTaxSummary, PropertyTaxSummary } from './types'

function esc(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

function money(n: number): string {
  return n.toFixed(2)
}

export function buildTaxCenterCsv(year: string, portfolio: PortfolioTaxSummary, properties: PropertyTaxSummary[]): string {
  const rows: string[][] = []

  rows.push([`PropRoster Tax Center — ${year}`])
  rows.push(['This is an organization/reporting export, not a tax filing. Review with your tax professional.'])
  rows.push([])

  rows.push(['Portfolio Summary'])
  rows.push(['Properties included', String(portfolio.propertiesIncluded)])
  rows.push(['Gross rental income', money(portfolio.grossIncome)])
  rows.push(['Operating expenses', money(portfolio.operatingExpenses)])
  rows.push(['Net rental income (before tax-specific adjustments)', money(portfolio.netOperatingResult)])
  rows.push(['Capital improvements (not immediately deductible — see notes)', money(portfolio.capitalImprovements)])
  rows.push(['Mortgage payments logged (reference only — not a deductible total)', money(portfolio.mortgagePayments)])
  rows.push([])

  rows.push(['Portfolio Expense Totals by Category'])
  rows.push(['Category', 'Amount'])
  for (const category of OPERATING_EXPENSE_CATEGORIES) {
    rows.push([category, money(portfolio.expenseByCategory[category] || 0)])
  }
  rows.push([])

  rows.push(['Property-Level Detail'])
  rows.push([
    'Property', 'City', 'Gross Income', 'Operating Expenses', 'Net Operating Result',
    'Capital Improvements', 'Mortgage Payments (reference only)', 'Tax Readiness',
    ...OPERATING_EXPENSE_CATEGORIES.map((c) => `Expense: ${c}`),
  ])
  for (const p of properties) {
    rows.push([
      p.address, p.city, money(p.grossIncome), money(p.operatingExpenses), money(p.netOperatingResult),
      money(p.capitalImprovements), money(p.mortgagePayments), p.readiness.status,
      ...OPERATING_EXPENSE_CATEGORIES.map((c) => money(p.expenseByCategory[c] || 0)),
    ])
  }

  return rows.map((row) => row.map(esc).join(',')).join('\n')
}
