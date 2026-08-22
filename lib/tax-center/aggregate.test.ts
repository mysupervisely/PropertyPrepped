import { describe, expect, it } from 'vitest'
import { computePortfolioTaxSummary, computePropertyTaxSummary, filterTransactionsForYear, getAvailableTaxYears, sumByCategory } from './aggregate'
import { emptyManualFields, emptyMileageFields } from './manual-entry'
import type { CustomTaxItemInput, PropertyInput, TaxRecordInput, TransactionInput } from './types'

function taxRecord(overrides: Partial<TaxRecordInput> = {}): TaxRecordInput {
  return { ...emptyManualFields(), ...emptyMileageFields(), notes: null, document_id: null, ...overrides }
}

function customItem(overrides: Partial<CustomTaxItemInput> = {}): CustomTaxItemInput {
  return {
    id: 'item-1', propertyId: 'p1', taxYear: 2026, description: 'Custom item',
    amount: 100, group: 'operatingExpense', notes: null, documentId: null,
    ...overrides,
  }
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

// ---------------------------------------------------------------------
// Tax Center V3 — expanded categories, mileage, custom items
// ---------------------------------------------------------------------

describe('computePropertyTaxSummary — V3 new operating-expense-like categories', () => {
  it('professional, travel, and meals categories all flow into operatingExpenses, same as the original operatingExpense group', () => {
    const record = taxRecord({
      prof_legal_fees: 400, prof_accounting_fees: 600, // professional
      travel_parking: 45, travel_tolls: 12.5, // travel
      meals_business: 65, // meals
      permits_licenses: 150, bank_fees: 25, // new operatingExpense additions
    })
    const summary = computePropertyTaxSummary(propA, [], [], record)
    expect(summary.operatingExpenses).toBe(400 + 600 + 45 + 12.5 + 65 + 150 + 25)
  })

  it('a manual value in a new category still overrides tracked (always 0, since none of these have a tracked source) rather than adding to it', () => {
    const summary = computePropertyTaxSummary(propA, [], [], taxRecord({ prof_legal_fees: 400 }))
    expect(summary.categoryBreakdown.profLegalFees).toEqual({ tracked: 0, manual: 400, effective: 400, source: 'manual' })
  })

  it('blank V3 categories never appear as a fabricated amount', () => {
    const summary = computePropertyTaxSummary(propA, [], [], taxRecord({ prof_legal_fees: 400 }))
    expect(summary.categoryBreakdown.travelParking.effective).toBe(0)
    expect(summary.categoryBreakdown.travelParking.source).toBe('none')
  })
})

describe('computePropertyTaxSummary — V3 mortgage & financing separation', () => {
  it('mortgageInterest stays a pure figure — financing points/other never get folded into it', () => {
    const summary = computePropertyTaxSummary(propA, [], [], taxRecord({ mortgage_interest: 4800, financing_points: 900, financing_other: 40 }))
    expect(summary.mortgageInterest).toBe(4800) // never 4800 + 900 + 40
    expect(summary.financingOtherTotal).toBe(940) // 900 + 40, separate from mortgageInterest
  })

  it('financingOtherTotal is excluded from operatingExpenses and netOperatingResult, same as mortgageInterest', () => {
    const rows = [tx({ category: 'Rent', amount: 2000 })]
    const summary = computePropertyTaxSummary(propA, rows, [], taxRecord({ financing_points: 900, financing_other: 40 }))
    expect(summary.operatingExpenses).toBe(0)
    expect(summary.netOperatingResult).toBe(2000)
  })

  it('financingOtherTotal is 0 when neither points nor other financing was entered', () => {
    const summary = computePropertyTaxSummary(propA, [], [], taxRecord({ mortgage_interest: 4800 }))
    expect(summary.financingOtherTotal).toBe(0)
  })
})

describe('computePropertyTaxSummary — V3 capital & depreciable items', () => {
  it('every new capital category rolls into capitalImprovements, alongside the original capital_improvements field', () => {
    const record = taxRecord({
      capital_improvements: 15000, capital_appliances: 1200, capital_furniture: 800,
      capital_equipment: 500, capital_major_renovations: 20000, capital_roof: 9000, capital_hvac: 6500, capital_other: 200,
    })
    const summary = computePropertyTaxSummary(propA, [], [], record)
    expect(summary.capitalImprovements).toBe(15000 + 1200 + 800 + 500 + 20000 + 9000 + 6500 + 200)
  })

  it('capital items never appear in operatingExpenses or netOperatingResult, no matter how large', () => {
    const rows = [tx({ category: 'Rent', amount: 1000 })]
    const summary = computePropertyTaxSummary(propA, rows, [], taxRecord({ capital_roof: 25000 }))
    expect(summary.operatingExpenses).toBe(0)
    expect(summary.netOperatingResult).toBe(1000)
  })
})

describe('computePropertyTaxSummary — V3 mileage (a quantity, never a dollar amount)', () => {
  it('surfaces businessMileage and businessMileageNotes straight from the tax record', () => {
    const summary = computePropertyTaxSummary(propA, [], [], taxRecord({ business_mileage: 842.5, business_mileage_notes: 'Round trips to the property' }))
    expect(summary.businessMileage).toBe(842.5)
    expect(summary.businessMileageNotes).toBe('Round trips to the property')
  })

  it('mileage is never converted to a dollar figure — it never touches operatingExpenses, grossIncome, or any other total', () => {
    const before = computePropertyTaxSummary(propA, [], [], taxRecord())
    const after = computePropertyTaxSummary(propA, [], [], taxRecord({ business_mileage: 5000 })) // a large mileage figure
    expect(after.operatingExpenses).toBe(before.operatingExpenses)
    expect(after.grossIncome).toBe(before.grossIncome)
    expect(after.capitalImprovements).toBe(before.capitalImprovements)
    expect(after.netOperatingResult).toBe(before.netOperatingResult)
  })

  it('null when never entered, never estimated as 0 miles vs. "not entered"', () => {
    const summary = computePropertyTaxSummary(propA, [], [], taxRecord())
    expect(summary.businessMileage).toBeNull()
    expect(summary.businessMileageNotes).toBeNull()
  })
})

describe('computePropertyTaxSummary — V3 custom tax items', () => {
  it('an operatingExpense-group custom item adds to operatingExpenses, on top of (never replacing) standard categories', () => {
    const rows = [tx({ transaction_type: 'Expense', category: 'Repairs', amount: 300 })]
    const items = [customItem({ group: 'operatingExpense', amount: 250, description: 'Snow removal service' })]
    const summary = computePropertyTaxSummary(propA, rows, [], null, items)
    expect(summary.operatingExpenses).toBe(550) // 300 tracked Repairs + 250 custom, added once each
    expect(summary.customItems).toEqual(items)
  })

  it('professional/travel/meals-group custom items also count toward operatingExpenses', () => {
    const items = [
      customItem({ id: 'i1', group: 'professional', amount: 100 }),
      customItem({ id: 'i2', group: 'travel', amount: 50 }),
      customItem({ id: 'i3', group: 'meals', amount: 30 }),
      customItem({ id: 'i4', group: 'other', amount: 20 }),
    ]
    const summary = computePropertyTaxSummary(propA, [], [], null, items)
    expect(summary.operatingExpenses).toBe(200)
  })

  it('a financing-group custom item is excluded from operatingExpenses/netOperatingResult, and appears in financingOtherTotal instead', () => {
    const rows = [tx({ category: 'Rent', amount: 2000 })]
    const items = [customItem({ group: 'financing', amount: 500, description: 'Loan origination fee' })]
    const summary = computePropertyTaxSummary(propA, rows, [], taxRecord({ financing_points: 100 }), items)
    expect(summary.operatingExpenses).toBe(0)
    expect(summary.netOperatingResult).toBe(2000)
    expect(summary.financingOtherTotal).toBe(600) // 100 fixed + 500 custom
  })

  it('a capital-group custom item is excluded from operatingExpenses/netOperatingResult, and appears in capitalImprovements instead', () => {
    const rows = [tx({ category: 'Rent', amount: 2000 })]
    const items = [customItem({ group: 'capital', amount: 3000, description: 'New fence' })]
    const summary = computePropertyTaxSummary(propA, rows, [], taxRecord({ capital_improvements: 1000 }), items)
    expect(summary.operatingExpenses).toBe(0)
    expect(summary.netOperatingResult).toBe(2000)
    expect(summary.capitalImprovements).toBe(4000) // 1000 fixed + 3000 custom
  })

  it('custom items never alter any standard category\'s own tracked/manual/effective value', () => {
    const rows = [tx({ transaction_type: 'Expense', category: 'Repairs', amount: 300 })]
    const items = [customItem({ group: 'operatingExpense', amount: 999, description: 'Unrelated item' })]
    const withItems = computePropertyTaxSummary(propA, rows, [], null, items)
    const withoutItems = computePropertyTaxSummary(propA, rows, [], null, [])
    expect(withItems.categoryBreakdown.repairs).toEqual(withoutItems.categoryBreakdown.repairs)
  })

  it('a custom item is scoped to its own property — never leaks into another property\'s summary', () => {
    const items = [customItem({ propertyId: 'p1', amount: 500 }), customItem({ id: 'i2', propertyId: 'p2', amount: 700 })]
    const summaryA = computePropertyTaxSummary(propA, [], [], null, items)
    const summaryB = computePropertyTaxSummary(propB, [], [], null, items)
    expect(summaryA.customItems).toEqual([items[0]])
    expect(summaryA.operatingExpenses).toBe(500)
    expect(summaryB.customItems).toEqual([items[1]])
    expect(summaryB.operatingExpenses).toBe(700)
  })

  it('multiple custom items in the same group are each summed exactly once — never double-counted, never dropped', () => {
    const items = [
      customItem({ id: 'i1', group: 'capital', amount: 1000 }),
      customItem({ id: 'i2', group: 'capital', amount: 2000 }),
      customItem({ id: 'i3', group: 'capital', amount: 500 }),
    ]
    const summary = computePropertyTaxSummary(propA, [], [], null, items)
    expect(summary.capitalImprovements).toBe(3500)
  })

  it('defaults to [] when omitted — a caller that never passes custom items behaves exactly as before this milestone', () => {
    const rows = [tx({ transaction_type: 'Expense', category: 'Repairs', amount: 300 })]
    const summary = computePropertyTaxSummary(propA, rows, [], null)
    expect(summary.customItems).toEqual([])
    expect(summary.operatingExpenses).toBe(300)
  })
})

describe('computePortfolioTaxSummary — V3 aggregation', () => {
  it('sums financingOtherTotal across properties', () => {
    const summaryA = computePropertyTaxSummary(propA, [], [], taxRecord({ financing_points: 500 }))
    const summaryB = computePropertyTaxSummary(propB, [], [], taxRecord({ financing_other: 300 }))
    const portfolio = computePortfolioTaxSummary('2026', [summaryA, summaryB])
    expect(portfolio.financingOtherTotal).toBe(800)
  })

  it('counts custom tax items across every property (a count, not a dollar figure that could double-count)', () => {
    const itemsA = [customItem({ id: 'i1', propertyId: 'p1' }), customItem({ id: 'i2', propertyId: 'p1' })]
    const itemsB = [customItem({ id: 'i3', propertyId: 'p2' })]
    const summaryA = computePropertyTaxSummary(propA, [], [], null, itemsA)
    const summaryB = computePropertyTaxSummary(propB, [], [], null, itemsB)
    const portfolio = computePortfolioTaxSummary('2026', [summaryA, summaryB])
    expect(portfolio.customItemsCount).toBe(3)
  })

  it('expanded categories (professional/travel/meals) flow into the portfolio expenseByCategory map', () => {
    const summaryA = computePropertyTaxSummary(propA, [], [], taxRecord({ prof_legal_fees: 400 }))
    const summaryB = computePropertyTaxSummary(propB, [], [], taxRecord({ travel_parking: 50 }))
    const portfolio = computePortfolioTaxSummary('2026', [summaryA, summaryB])
    expect(portfolio.expenseByCategory.profLegalFees).toBe(400)
    expect(portfolio.expenseByCategory.travelParking).toBe(50)
  })
})
