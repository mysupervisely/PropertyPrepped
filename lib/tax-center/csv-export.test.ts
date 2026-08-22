import { describe, expect, it } from 'vitest'
import { buildTaxCenterCsv } from './csv-export'
import { computePortfolioTaxSummary, computePropertyTaxSummary } from './aggregate'
import { emptyManualFields, emptyMileageFields } from './manual-entry'
import type { PropertyInput, TaxRecordInput, TransactionInput } from './types'

const propA: PropertyInput = { id: 'p1', address: '5531 Turtle Crossing Loop', city: 'Tampa', property_type: 'Rental Property' }

function tx(overrides: Partial<TransactionInput> = {}): TransactionInput {
  return {
    id: 'tx1', property_id: 'p1', transaction_date: '2026-03-01', transaction_type: 'Income',
    category: 'Rent', amount: 1000, document_id: null,
    ...overrides,
  }
}

function taxRecord(overrides: Partial<TaxRecordInput> = {}): TaxRecordInput {
  return { ...emptyManualFields(), ...emptyMileageFields(), notes: null, document_id: null, ...overrides }
}

describe('buildTaxCenterCsv', () => {
  it('includes the tax year and a not-tax-advice note', () => {
    const summary = computePropertyTaxSummary(propA, [tx()], [])
    const portfolio = computePortfolioTaxSummary('2026', [summary])
    const csv = buildTaxCenterCsv('2026', portfolio, [summary])
    expect(csv).toContain('2026')
    expect(csv.toLowerCase()).toContain('review with your tax professional')
  })

  it('includes portfolio and property-level totals', () => {
    const summary = computePropertyTaxSummary(propA, [
      tx({ category: 'Rent', amount: 2000 }),
      tx({ transaction_type: 'Expense', category: 'Repairs', amount: 300 }),
    ], [])
    const portfolio = computePortfolioTaxSummary('2026', [summary])
    const csv = buildTaxCenterCsv('2026', portfolio, [summary])
    expect(csv).toContain('5531 Turtle Crossing Loop')
    expect(csv).toContain('2000.00')
    expect(csv).toContain('300.00')
  })

  it('labels mortgage and capital improvement figures as reference-only / not deductible, never as plain expenses', () => {
    const summary = computePropertyTaxSummary(propA, [
      tx({ transaction_type: 'Expense', category: 'Mortgage', amount: 1500 }),
      tx({ transaction_type: 'Expense', category: 'CapEx', amount: 5000 }),
    ], [])
    const portfolio = computePortfolioTaxSummary('2026', [summary])
    const csv = buildTaxCenterCsv('2026', portfolio, [summary])
    expect(csv).toMatch(/Mortgage payments.*reference only.*not a deductible total/i)
    expect(csv).toMatch(/Capital.*depreciable.*not immediately deductible/i)
  })

  it('properly quotes/escapes a property address containing a comma', () => {
    const commaProp: PropertyInput = { id: 'p2', address: '17 Amaryllis Ln, Unit 4', city: 'Brandon', property_type: 'Rental Property' }
    const summary = computePropertyTaxSummary(commaProp, [tx({ property_id: 'p2' })], [])
    const portfolio = computePortfolioTaxSummary('2026', [summary])
    const csv = buildTaxCenterCsv('2026', portfolio, [summary])
    expect(csv).toContain('"17 Amaryllis Ln, Unit 4"')
  })

  it('reflects the effective (manual-overridden) amount, not the raw tracked ledger figure', () => {
    const summary = computePropertyTaxSummary(propA, [tx({ transaction_type: 'Expense', category: 'Taxes', amount: 500 })], [], taxRecord({ property_taxes: 6400 }))
    const portfolio = computePortfolioTaxSummary('2026', [summary])
    const csv = buildTaxCenterCsv('2026', portfolio, [summary])
    expect(csv).toContain('6400.00')
    expect(csv).not.toContain('500.00')
  })

  it('includes a Source column per category so a CPA can tell Tracked from Manual', () => {
    const summary = computePropertyTaxSummary(propA, [tx({ transaction_type: 'Expense', category: 'Repairs', amount: 300 })], [], taxRecord({ insurance: 900 }))
    const portfolio = computePortfolioTaxSummary('2026', [summary])
    const csv = buildTaxCenterCsv('2026', portfolio, [summary])
    expect(csv).toContain('Repairs Source')
    expect(csv).toContain('Insurance Source')
    const lines = csv.split('\n')
    const header = lines.find((l) => l.includes('Property') && l.includes('City'))!
    const dataRow = lines[lines.indexOf(header) + 1]
    const cols = header.split(',')
    const repairsSourceIdx = cols.indexOf('"Repairs Source"')
    const insuranceSourceIdx = cols.indexOf('"Insurance Source"')
    const dataCols = dataRow.split(',')
    expect(dataCols[repairsSourceIdx]).toBe('"Tracked"')
    expect(dataCols[insuranceSourceIdx]).toBe('"Manual"')
  })

  it('includes mortgage interest as its own line, separate from mortgage payments', () => {
    const summary = computePropertyTaxSummary(propA, [tx({ transaction_type: 'Expense', category: 'Mortgage', amount: 1800 })], [], taxRecord({ mortgage_interest: 4800 }))
    const portfolio = computePortfolioTaxSummary('2026', [summary])
    const csv = buildTaxCenterCsv('2026', portfolio, [summary])
    expect(csv).toMatch(/Mortgage interest.*manual entry only.*never estimated/i)
    expect(csv).toContain('4800.00')
    expect(csv).toContain('1800.00')
  })
})

describe('buildTaxCenterCsv — Tax Center V3', () => {
  it('includes expanded categories (professional/travel/meals) with their own Source column', () => {
    const summary = computePropertyTaxSummary(propA, [], [], taxRecord({ prof_legal_fees: 400, travel_parking: 45, meals_business: 65 }))
    const portfolio = computePortfolioTaxSummary('2026', [summary])
    const csv = buildTaxCenterCsv('2026', portfolio, [summary])
    expect(csv).toContain('"Legal fees"')
    expect(csv).toContain('"Legal fees Source"')
    expect(csv).toContain('"Parking"')
    expect(csv).toContain('"Business meals"')
    expect(csv).toContain('400.00')
    expect(csv).toContain('45.00')
    expect(csv).toContain('65.00')
  })

  it('includes a Capital / Depreciable Items Detail section with the new capital categories', () => {
    const summary = computePropertyTaxSummary(propA, [], [], taxRecord({ capital_roof: 9000, capital_hvac: 6500 }))
    const portfolio = computePortfolioTaxSummary('2026', [summary])
    const csv = buildTaxCenterCsv('2026', portfolio, [summary])
    expect(csv).toContain('Capital / Depreciable Items Detail')
    expect(csv).toContain('"Roof"')
    expect(csv).toContain('9000.00')
    expect(csv).toContain('"HVAC"')
    expect(csv).toContain('6500.00')
  })

  it('includes an Other Financing Detail section, separate from the Mortgage Interest column', () => {
    const summary = computePropertyTaxSummary(propA, [], [], taxRecord({ mortgage_interest: 4800, financing_points: 900 }))
    const portfolio = computePortfolioTaxSummary('2026', [summary])
    const csv = buildTaxCenterCsv('2026', portfolio, [summary])
    expect(csv).toContain('Other Financing Detail')
    expect(csv).toContain('"Points / loan costs"')
    expect(csv).toContain('900.00')
    // 4800 (mortgage interest) must not appear inside the financing-detail points column
    const financingSectionIndex = csv.indexOf('Other Financing Detail')
    const financingSection = csv.slice(financingSectionIndex)
    expect(financingSection).not.toContain('4800.00')
  })

  it('includes business mileage as a quantity (not a dollar amount) plus its own notes column', () => {
    const summary = computePropertyTaxSummary(propA, [], [], taxRecord({ business_mileage: 842.5, business_mileage_notes: 'Trips to inspect the property' }))
    const portfolio = computePortfolioTaxSummary('2026', [summary])
    const csv = buildTaxCenterCsv('2026', portfolio, [summary])
    expect(csv).toContain('Business Mileage')
    expect(csv).toContain('842.5')
    expect(csv).toContain('Trips to inspect the property')
    expect(csv).not.toContain('842.50') // never formatted as a dollar amount
  })

  it('omits the Custom Tax Items section entirely when there are none', () => {
    const summary = computePropertyTaxSummary(propA, [], [], null)
    const portfolio = computePortfolioTaxSummary('2026', [summary])
    const csv = buildTaxCenterCsv('2026', portfolio, [summary])
    expect(csv).not.toContain('Custom Tax Items')
  })

  it('lists each custom tax item on its own row — description, amount, group, source always Manual, and notes', () => {
    const items = [
      { id: 'i1', propertyId: 'p1', taxYear: 2026, description: 'New water heater', amount: 950, group: 'capital' as const, notes: 'Replaced after failure', documentId: null },
    ]
    const summary = computePropertyTaxSummary(propA, [], [], null, items)
    const portfolio = computePortfolioTaxSummary('2026', [summary])
    const csv = buildTaxCenterCsv('2026', portfolio, [summary])
    expect(csv).toContain('Custom Tax Items')
    expect(csv).toContain('New water heater')
    expect(csv).toContain('950.00')
    expect(csv).toContain('Capital / Depreciable')
    expect(csv).toContain('"Manual"')
    expect(csv).toContain('Replaced after failure')
  })

  it('the portfolio summary reports a custom-items COUNT, never a second dollar total that could double-count', () => {
    const items = [
      { id: 'i1', propertyId: 'p1', taxYear: 2026, description: 'Item A', amount: 100, group: 'other' as const, notes: null, documentId: null },
      { id: 'i2', propertyId: 'p1', taxYear: 2026, description: 'Item B', amount: 200, group: 'other' as const, notes: null, documentId: null },
    ]
    const summary = computePropertyTaxSummary(propA, [], [], null, items)
    const portfolio = computePortfolioTaxSummary('2026', [summary])
    const csv = buildTaxCenterCsv('2026', portfolio, [summary])
    expect(csv).toContain('Custom tax items recorded')
    expect(csv).toContain('"2"') // a count of 2, not a dollar amount like 300.00
  })
})
