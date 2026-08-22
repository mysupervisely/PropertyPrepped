import { describe, expect, it } from 'vitest'
import { buildTaxCenterCsv } from './csv-export'
import { computePortfolioTaxSummary, computePropertyTaxSummary } from './aggregate'
import type { PropertyInput, TransactionInput } from './types'

const propA: PropertyInput = { id: 'p1', address: '5531 Turtle Crossing Loop', city: 'Tampa', property_type: 'Rental Property' }

function tx(overrides: Partial<TransactionInput> = {}): TransactionInput {
  return {
    id: 'tx1', property_id: 'p1', transaction_date: '2026-03-01', transaction_type: 'Income',
    category: 'Rent', amount: 1000, document_id: null,
    ...overrides,
  }
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
    expect(csv).toMatch(/Capital improvements.*not immediately deductible/i)
  })

  it('properly quotes/escapes a property address containing a comma', () => {
    const commaProp: PropertyInput = { id: 'p2', address: '17 Amaryllis Ln, Unit 4', city: 'Brandon', property_type: 'Rental Property' }
    const summary = computePropertyTaxSummary(commaProp, [tx({ property_id: 'p2' })], [])
    const portfolio = computePortfolioTaxSummary('2026', [summary])
    const csv = buildTaxCenterCsv('2026', portfolio, [summary])
    expect(csv).toContain('"17 Amaryllis Ln, Unit 4"')
  })
})
