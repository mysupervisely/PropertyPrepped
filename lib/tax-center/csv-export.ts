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
//
// Tax Center V3: the CPA-facing export is deliberately MORE detailed than
// the simplified on-screen portfolio table (per this milestone's own
// spec) — every expanded category (professional/travel/meals/financing/
// capital) gets its own column+source pair, plus dedicated sections for
// business mileage (a quantity, never a dollar figure) and custom tax
// items (each its own row: property, description, amount, group,
// source=Manual always, notes). Nothing here can double-count: every
// category/custom-item total below is read straight from
// computePropertyTaxSummary's already-computed, already-deduplicated
// fields — this module never re-sums or re-derives anything itself.

import { categoriesInGroup, OPERATING_EXPENSE_LIKE_GROUPS } from './manual-entry'
import { CUSTOM_ITEM_GROUP_LABELS } from './custom-items'
import type { PortfolioTaxSummary, PropertyTaxSummary } from './types'

// V3: the "Expense totals by category" tables (portfolio + per-property
// detail) now cover every operating-expense-like group — operatingExpense
// (unchanged from V2) plus professional/travel/meals — so the expanded
// categories are fully represented in the CPA-facing export even though
// the simplified on-screen main table stays focused on the single
// "Operating Expenses" total (see the milestone's own "Do not clutter
// the main table" instruction).
const EXPENSE_CATEGORIES = OPERATING_EXPENSE_LIKE_GROUPS.flatMap((g) => categoriesInGroup(g))
const CAPITAL_CATEGORIES = categoriesInGroup('capital')
const FINANCING_ONLY_CATEGORIES = categoriesInGroup('financing').filter((c) => c.key !== 'mortgageInterest')

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
  rows.push(['Operating expenses (includes property expenses, professional/administrative, travel, and meals)', money(portfolio.operatingExpenses)])
  rows.push(['Net rental income (before tax-specific adjustments)', money(portfolio.netOperatingResult)])
  rows.push(['Capital / depreciable items (not immediately deductible — see notes)', money(portfolio.capitalImprovements)])
  rows.push(['Mortgage interest (manual entry only — never estimated)', money(portfolio.mortgageInterest)])
  rows.push(['Other financing (points/loan costs, other financing expenses — organizational only)', money(portfolio.financingOtherTotal)])
  rows.push(['Mortgage payments logged (reference only — not a deductible total, principal is never deductible)', money(portfolio.mortgagePayments)])
  rows.push(['Custom tax items recorded (count, not a separate dollar total — already included above)', String(portfolio.customItemsCount)])
  rows.push([])

  rows.push(['Portfolio Expense Totals by Category (effective — tracked, manually overridden where entered; includes Property Expenses, Professional & Administrative, Travel & Vehicle, and Meals)'])
  rows.push(['Category', 'Amount'])
  for (const category of EXPENSE_CATEGORIES) {
    rows.push([category.label, money(portfolio.expenseByCategory[category.key] || 0)])
  }
  rows.push([])

  rows.push(['Property-Level Detail'])
  const header: string[] = [
    'Property', 'City', 'Gross Income', 'Operating Expenses', 'Net Operating Result',
    'Capital / Depreciable Items', 'Mortgage Interest (manual only)', 'Other Financing (manual only)',
    'Mortgage Payments (reference only)', 'Business Mileage', 'Business Mileage Notes', 'Tax Readiness',
  ]
  for (const category of EXPENSE_CATEGORIES) {
    header.push(category.label, `${category.label} Source`)
  }
  rows.push(header)

  for (const p of properties) {
    const row: string[] = [
      p.address, p.city, money(p.grossIncome), money(p.operatingExpenses), money(p.netOperatingResult),
      money(p.capitalImprovements), money(p.mortgageInterest), money(p.financingOtherTotal),
      money(p.mortgagePayments), p.businessMileage !== null ? String(p.businessMileage) : '', p.businessMileageNotes || '',
      p.readiness.status,
    ]
    for (const category of EXPENSE_CATEGORIES) {
      const value = p.categoryBreakdown[category.key]
      row.push(money(value?.effective || 0), sourceLabel(value?.source || 'none'))
    }
    rows.push(row)
  }
  rows.push([])

  // V3: Capital / Depreciable Items detail — its own table (never folded
  // into the wide Property-Level Detail table above, since capital
  // items are always kept visually and structurally separate from
  // ordinary operating expenses, per this and the prior milestone's own
  // "never imply immediately deductible" requirement).
  rows.push(['Capital / Depreciable Items Detail (not immediately deductible — typically depreciated over time; review with your tax professional)'])
  const capitalHeader = ['Property', 'City']
  for (const category of CAPITAL_CATEGORIES) capitalHeader.push(category.label, `${category.label} Source`)
  rows.push(capitalHeader)
  for (const p of properties) {
    const row = [p.address, p.city]
    for (const category of CAPITAL_CATEGORIES) {
      const value = p.categoryBreakdown[category.key]
      row.push(money(value?.effective || 0), sourceLabel(value?.source || 'none'))
    }
    rows.push(row)
  }
  rows.push([])

  // V3: Other Financing detail (points/loan costs, other financing) —
  // separate from mortgage interest, which already has its own column
  // above and is never mixed with these.
  if (FINANCING_ONLY_CATEGORIES.length > 0) {
    rows.push(['Other Financing Detail (organizational only — never mortgage interest, never includes principal)'])
    const financingHeader = ['Property', 'City']
    for (const category of FINANCING_ONLY_CATEGORIES) financingHeader.push(category.label, `${category.label} Source`)
    rows.push(financingHeader)
    for (const p of properties) {
      const row = [p.address, p.city]
      for (const category of FINANCING_ONLY_CATEGORIES) {
        const value = p.categoryBreakdown[category.key]
        row.push(money(value?.effective || 0), sourceLabel(value?.source || 'none'))
      }
      rows.push(row)
    }
    rows.push([])
  }

  // V3: Custom Tax Items — every property/year-specific manual item a
  // landlord added via "+ Add Other Tax Item," one row each. Source is
  // always "Manual" (there is no tracked equivalent for a custom item by
  // definition — see lib/tax-center/custom-items.ts's module comment).
  const anyCustomItems = properties.some((p) => p.customItems.length > 0)
  if (anyCustomItems) {
    rows.push(['Custom Tax Items'])
    rows.push(['Property', 'City', 'Description', 'Amount', 'Group', 'Source', 'Notes'])
    for (const p of properties) {
      for (const item of p.customItems) {
        rows.push([p.address, p.city, item.description, money(item.amount), CUSTOM_ITEM_GROUP_LABELS[item.group], 'Manual', item.notes || ''])
      }
    }
    rows.push([])
  }

  return rows.map((row) => row.map(esc).join(',')).join('\n')
}
