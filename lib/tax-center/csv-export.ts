// PropRoster — Tax Center: CSV export.
//
// Same escaping/row-building convention as app/page.tsx's existing
// exportTransactionsCsv (Financials tab) — a quoted-field CSV, doubled
// internal quotes, comma-joined. Pure string building only; the actual
// Blob/download-anchor mechanics live in the page component, matching
// that same existing pattern.
//
// Tax Center V2: every amount below is the EFFECTIVE Tax Center amount
// (manual override applied where entered — lib/tax-center/manual-entry.ts),
// never the raw tracked ledger alone. A parallel "Source" column next to
// every property-level category amount tells the landlord or CPA
// whether that figure came from PropRoster's tracked ledger or a manual
// entry, per this milestone's own "include source information" ask.

import { categoriesInGroup } from './manual-entry'
import type { PortfolioTaxSummary, PropertyTaxSummary } from './types'

const EXPENSE_CATEGORIES = categoriesInGroup('operatingExpense')

function esc(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

function money(n: number): string {
  return n.toFixed(2)
}

function sourceLabel(source: 'tracked' | 'manual' | 'none'): string {
  if (source === 'manual') return 'Manual'
  if (source === 'tracked') return 'Tracked'
  return '—'
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
  rows.push(['Mortgage interest (manual entry only — never estimated)', money(portfolio.mortgageInterest)])
  rows.push(['Mortgage payments logged (reference only — not a deductible total, principal is never deductible)', money(portfolio.mortgagePayments)])
  rows.push([])

  rows.push(['Portfolio Expense Totals by Category (effective — tracked, manually overridden where entered)'])
  rows.push(['Category', 'Amount'])
  for (const category of EXPENSE_CATEGORIES) {
    rows.push([category.label, money(portfolio.expenseByCategory[category.key] || 0)])
  }
  rows.push([])

  rows.push(['Property-Level Detail'])
  const header: string[] = [
    'Property', 'City', 'Gross Income', 'Operating Expenses', 'Net Operating Result',
    'Capital Improvements', 'Mortgage Interest (manual only)', 'Mortgage Payments (reference only)', 'Tax Readiness',
  ]
  for (const category of EXPENSE_CATEGORIES) {
    header.push(category.label, `${category.label} Source`)
  }
  rows.push(header)

  for (const p of properties) {
    const row: string[] = [
      p.address, p.city, money(p.grossIncome), money(p.operatingExpenses), money(p.netOperatingResult),
      money(p.capitalImprovements), money(p.mortgageInterest), money(p.mortgagePayments), p.readiness.status,
    ]
    for (const category of EXPENSE_CATEGORIES) {
      const value = p.categoryBreakdown[category.key]
      row.push(money(value?.effective || 0), sourceLabel(value?.source || 'none'))
    }
    rows.push(row)
  }

  return rows.map((row) => row.map(esc).join(',')).join('\n')
}
