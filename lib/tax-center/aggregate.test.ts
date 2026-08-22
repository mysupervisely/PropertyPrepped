import { describe, expect, it } from 'vitest'
import { computePortfolioTaxSummary, computePropertyTaxSummary, filterTransactionsForYear, getAvailableTaxYears, sumByCategory } from './aggregate'
import { emptyManualFields } from './manual-entry'
import type { PropertyInput, TaxRecordInput, TransactionInput } from './types'

function taxRecord(overrides: Partial<TaxRecordInput> = {}): TaxRecordInput {
  return { ...emptyManualFields(), notes: null, document_id: null, ...overrides }
}

const propA: PropertyInput = { id: 'p1', address: '5531 Turtle Crossing Loop', city: 'Tampa', property_type: 'Rental Property' }
const propB: PropertyInput = { id: 'p2', address: '17 Amaryllis Ln', city: 'Brandon', property_type: 'Rental Property' }

function tx(overrides: Partial<TransactionInput> = {}): TransactionInput {
  return {
    id: 'tx1', property_id: 'p1', transaction_date: '2026-03-01', transaction_type: 'Income',
    category: 'Rent', amount: 1000, document_id: null,
    ...overrides,
  }
}

describe('getAvailableTaxYears', () => {
  it('always includes the current year even with no data', () => {
    const years = getAvailableTaxYears([], new Date('2026-06-01'))
    expect(years).toEqual(['2026'])
  })

  it('includes every year with transaction data, newest first', () => {
    const years = getAvailableTaxYears([
      tx({ transaction_date: '2024-05-01' }),
      tx({ transaction_date: '2025-01-01' }),
    ], new Date('2026-06-01'))
    expect(years).toEqual(['2026', '2025', '2024'])
  })

  it('never lists the same year twice', () => {
    const years = getAvailableTaxYears([
      tx({ transaction_date: '2026-01-01' }),
      tx({ transaction_date: '2026-11-01' }),
    ], new Date('2026-06-01'))
    expect(years).toEqual(['2026'])
  })
})

describe('filterTransactionsForYear', () => {
  it('keeps only transactions dated within the given year', () => {
    const rows = [tx({ id: 'a', transaction_date: '2025-12-31' }), tx({ id: 'b', transaction_date: '2026-01-01' }), tx({ id: 'c', transaction_date: '2026-12-31' })]
    expect(filterTransactionsForYear(rows, '2026').map((t) => t.id)).toEqual(['b', 'c'])
  })
})

describe('sumByCategory', () => {
  it('groups and sums by category, never fabricating a category with no rows', () => {
    const rows = [tx({ category: 'Repairs', amount: 100 }), tx({ category: 'Repairs', amount: 50 }), tx({ category: 'Insurance', amount: 200 })]
    expect(sumByCategory(rows)).toEqual({ Repairs: 150, Insurance: 200 })
  })
})

describe('computePropertyTaxSummary — income aggregation', () => {
  it('sums Rent and Other Income as gross income', () => {
    const rows = [tx({ category: 'Rent', amount: 2000 }), tx({ category: 'Other Income', amount: 150 })]
    const summary = computePropertyTaxSummary(propA, rows, [])
    expect(summary.grossIncome).toBe(2150)
  })

  it('never counts an Expense-type transaction as income even if oddly categorized', () => {
    const rows = [tx({ transaction_type: 'Expense', category: 'Rent', amount: 500 })]
    const summary = computePropertyTaxSummary(propA, rows, [])
    expect(summary.grossIncome).toBe(0)
  })
})

describe('computePropertyTaxSummary — expense aggregation and separations', () => {
  it('sums ordinary operating expense categories into operatingExpenses', () => {
    const rows = [
      tx({ transaction_type: 'Expense', category: 'Repairs', amount: 300 }),
      tx({ transaction_type: 'Expense', category: 'Insurance', amount: 400 }),
      tx({ transaction_type: 'Expense', category: 'Taxes', amount: 1200 }),
    ]
    const summary = computePropertyTaxSummary(propA, rows, [])
    expect(summary.operatingExpenses).toBe(1900)
  })

  it('never folds CapEx into operatingExpenses — capital improvements are kept separate', () => {
    const rows = [
      tx({ transaction_type: 'Expense', category: 'Repairs', amount: 300 }),
      tx({ transaction_type: 'Expense', category: 'CapEx', amount: 15000 }),
    ]
    const summary = computePropertyTaxSummary(propA, rows, [])
    expect(summary.operatingExpenses).toBe(300)
    expect(summary.capitalImprovements).toBe(15000)
  })

  it('never folds Mortgage payments into operatingExpenses, income, or capital improvements', () => {
    const rows = [
      tx({ transaction_type: 'Expense', category: 'Mortgage', amount: 1800 }),
      tx({ transaction_type: 'Expense', category: 'Repairs', amount: 300 }),
    ]
    const summary = computePropertyTaxSummary(propA, rows, [])
    expect(summary.mortgagePayments).toBe(1800)
    expect(summary.operatingExpenses).toBe(300)
    expect(summary.capitalImprovements).toBe(0)
  })

  it('net operating result is gross income minus operating expenses only (mortgage/CapEx excluded)', () => {
    const rows = [
      tx({ category: 'Rent', amount: 2000 }),
      tx({ transaction_type: 'Expense', category: 'Repairs', amount: 300 }),
      tx({ transaction_type: 'Expense', category: 'Mortgage', amount: 1500 }),
      tx({ transaction_type: 'Expense', category: 'CapEx', amount: 5000 }),
    ]
    const summary = computePropertyTaxSummary(propA, rows, [])
    expect(summary.netOperatingResult).toBe(1700) // 2000 - 300, not affected by mortgage/CapEx
  })
})

describe('computePropertyTaxSummary — property isolation (security-adjacent boundary)', () => {
  it('never includes another property\'s transactions in a property\'s own summary, even when both are passed in together', () => {
    const rows = [
      tx({ property_id: 'p1', category: 'Rent', amount: 1000 }),
      tx({ property_id: 'p2', category: 'Rent', amount: 9999 }),
    ]
    const summaryA = computePropertyTaxSummary(propA, rows, [])
    expect(summaryA.grossIncome).toBe(1000)
    const summaryB = computePropertyTaxSummary(propB, rows, [])
    expect(summaryB.grossIncome).toBe(9999)
  })
})

describe('computePropertyTaxSummary — missing-data handling', () => {
  it('a property with zero transactions for the year reports all-zero totals, not a fabricated estimate', () => {
    const summary = computePropertyTaxSummary(propA, [], [])
    expect(summary.grossIncome).toBe(0)
    expect(summary.operatingExpenses).toBe(0)
    expect(summary.capitalImprovements).toBe(0)
    expect(summary.mortgagePayments).toBe(0)
    expect(summary.readiness.status).toBe('Missing Information')
  })
})

describe('computePortfolioTaxSummary', () => {
  it('sums across properties and reports how many were included', () => {
    const summaryA = computePropertyTaxSummary(propA, [tx({ property_id: 'p1', category: 'Rent', amount: 1000 }), tx({ property_id: 'p1', transaction_type: 'Expense', category: 'Repairs', amount: 200 })], [])
    const summaryB = computePropertyTaxSummary(propB, [tx({ property_id: 'p2', category: 'Rent', amount: 1500 }), tx({ property_id: 'p2', transaction_type: 'Expense', category: 'Repairs', amount: 100 })], [])
    const portfolio = computePortfolioTaxSummary('2026', [summaryA, summaryB])
    expect(portfolio.propertiesIncluded).toBe(2)
    expect(portfolio.grossIncome).toBe(2500)
    expect(portfolio.operatingExpenses).toBe(300)
    expect(portfolio.netOperatingResult).toBe(2200)
    expect(portfolio.expenseByCategory.repairs).toBe(300)
    expect(Object.values(portfolio.expenseByCategory).reduce((a, b) => a + b, 0)).toBe(300) // every other category totals to 0 — nothing fabricated
  })

  it('lists properties needing attention (anything not Ready), by status', () => {
    const ready = computePropertyTaxSummary(propA, [tx({ property_id: 'p1', category: 'Rent', amount: 1000 })], [])
    const missing = computePropertyTaxSummary(propB, [], [])
    const portfolio = computePortfolioTaxSummary('2026', [ready, missing])
    expect(portfolio.propertiesNeedingAttention).toEqual([{ propertyId: 'p2', address: '17 Amaryllis Ln', status: 'Missing Information' }])
  })
})

describe('computePropertyTaxSummary — Tax Center V2 manual override', () => {
  it('with no manual record at all, totals are identical to V1 (tracked-only) behavior', () => {
    const rows = [tx({ category: 'Rent', amount: 2000 }), tx({ transaction_type: 'Expense', category: 'Repairs', amount: 300 })]
    const summary = computePropertyTaxSummary(propA, rows, [], null)
    expect(summary.grossIncome).toBe(2000)
    expect(summary.operatingExpenses).toBe(300)
    expect(summary.hasManualRecord).toBe(false)
    expect(summary.mortgageInterest).toBe(0)
  })

  it('a manual value overrides (replaces, never adds to) the tracked value for that category', () => {
    const rows = [tx({ transaction_type: 'Expense', category: 'Taxes', amount: 500 })]
    const record = taxRecord({ property_taxes: 6400 })
    const summary = computePropertyTaxSummary(propA, rows, [], record)
    expect(summary.categoryBreakdown.propertyTaxes).toEqual({ tracked: 500, manual: 6400, effective: 6400, source: 'manual' })
    expect(summary.operatingExpenses).toBe(6400) // never 500 + 6400
  })

  it('blank manual fields never disturb a category that has real tracked data', () => {
    const rows = [tx({ transaction_type: 'Expense', category: 'Repairs', amount: 300 })]
    const summary = computePropertyTaxSummary(propA, rows, [], taxRecord()) // every field null
    expect(summary.operatingExpenses).toBe(300)
  })

  it('mortgage interest is manual-only and never derived from mortgage payment transactions', () => {
    const rows = [tx({ transaction_type: 'Expense', category: 'Mortgage', amount: 1800 })]
    const withoutInterest = computePropertyTaxSummary(propA, rows, [], null)
    expect(withoutInterest.mortgageInterest).toBe(0)
    expect(withoutInterest.mortgagePayments).toBe(1800)

    const withInterest = computePropertyTaxSummary(propA, rows, [], taxRecord({ mortgage_interest: 4800 }))
    expect(withInterest.mortgageInterest).toBe(4800)
    expect(withInterest.mortgagePayments).toBe(1800) // unchanged — the two never mix
    expect(withInterest.operatingExpenses).toBe(0) // interest is financing, never operating expense
  })

  it('capital improvements: manual override replaces tracked CapEx, and stays out of operatingExpenses', () => {
    const rows = [tx({ transaction_type: 'Expense', category: 'CapEx', amount: 5000 })]
    const summary = computePropertyTaxSummary(propA, rows, [], taxRecord({ capital_improvements: 15000 }))
    expect(summary.capitalImprovements).toBe(15000)
    expect(summary.operatingExpenses).toBe(0)
  })

  it('manual-only categories (Cleaning, Landscaping, Pest control, Advertising) contribute to operatingExpenses only when manually entered', () => {
    const summary = computePropertyTaxSummary(propA, [], [], taxRecord({ cleaning: 150, landscaping: 200, pest_control: 75, advertising: 50 }))
    expect(summary.operatingExpenses).toBe(475)
  })

  it('hasManualRecord is true whenever a tax record exists, even if every field is blank', () => {
    const summary = computePropertyTaxSummary(propA, [], [], taxRecord())
    expect(summary.hasManualRecord).toBe(true)
  })

  it('surfaces notes and documentId from the tax record', () => {
    const summary = computePropertyTaxSummary(propA, [], [], taxRecord({ notes: 'From lender statement', document_id: 'doc-1' }))
    expect(summary.notes).toBe('From lender statement')
    expect(summary.documentId).toBe('doc-1')
  })
})

describe('computePortfolioTaxSummary — aggregation using effective values', () => {
  it('sums effective (post-override) amounts across properties, not raw tracked amounts', () => {
    const summaryA = computePropertyTaxSummary(propA, [tx({ property_id: 'p1', transaction_type: 'Expense', category: 'Taxes', amount: 500 })], [], taxRecord({ property_taxes: 6400 }))
    const summaryB = computePropertyTaxSummary(propB, [tx({ property_id: 'p2', transaction_type: 'Expense', category: 'Taxes', amount: 800 })], [], null)
    const portfolio = computePortfolioTaxSummary('2026', [summaryA, summaryB])
    expect(portfolio.expenseByCategory.propertyTaxes).toBe(7200) // 6400 (manual, replacing 500) + 800 (tracked) — never 500+6400+800
    expect(portfolio.mortgageInterest).toBe(0)
  })

  it('sums mortgage interest across properties, independent of mortgage payments', () => {
    const summaryA = computePropertyTaxSummary(propA, [], [], taxRecord({ mortgage_interest: 4800 }))
    const summaryB = computePropertyTaxSummary(propB, [], [], taxRecord({ mortgage_interest: 3200 }))
    const portfolio = computePortfolioTaxSummary('2026', [summaryA, summaryB])
    expect(portfolio.mortgageInterest).toBe(8000)
  })
})
