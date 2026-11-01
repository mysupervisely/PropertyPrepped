import { it, expect } from 'vitest'
import { propertyYearTimeline } from './property-year-timeline'
import { computePropertyTaxSummary } from '../tax-center/aggregate'
import { emptyManualFields, emptyMileageFields } from '../tax-center/manual-entry'
import type { TransactionInput } from '../tax-center/types'
const property = { id: 'a', address: 'Test', city: 'Test', property_type: 'Rental Property' }
const tx = (id: string, date: string, amount: number, category = 'Rent', property_id = 'a'): TransactionInput => ({ id, property_id, transaction_date: date, amount, category, transaction_type: category === 'Rent' ? 'Income' : 'Expense', document_id: null })
const now = new Date(2026, 9, 31, 12)
it('builds cumulative dated activity through October and leaves November and December empty', () => {
  const rows = [tx('jan', '2026-01-10', 2000), tx('oct', '2026-10-01', 2000), tx('repair', '2026-10-12', 500, 'Repairs'), tx('future', '2026-11-01', 2000), tx('prior', '2025-12-31', 5000), tx('other', '2026-10-01', 9000, 'Rent', 'b'), tx('mortgage', '2026-10-01', 2000, 'Mortgage'), tx('capital', '2026-10-01', 1000, 'CapEx')]
  const result = propertyYearTimeline('a', rows, computePropertyTaxSummary(property, rows, []), now)
  expect(result.progress).toBeCloseTo(10 / 12)
  expect(result.points).toHaveLength(11)
  expect(result.points[1]).toEqual({ progress: 1 / 12, income: 2000, costs: 0 })
  expect(result.points.at(-1)).toEqual({ progress: 10 / 12, income: 4000, costs: 500 })
})
it('never invents a month for annual interest or overrides', () => {
  const rows = [tx('jan', '2026-01-01', 2000)]
  const record = { ...emptyManualFields(), ...emptyMileageFields(), notes: null, document_id: null, rental_income: 10000, mortgage_interest: 3000 }
  const result = propertyYearTimeline('a', rows, computePropertyTaxSummary(property, rows, [], record), now)
  expect(result.hasUndatedTotals).toBe(true)
  expect(result.points.at(-1)?.income).toBe(2000)
  expect(result.points.at(-1)?.costs).toBe(0)
})
it('ignores invalid dates and amounts, and has no financial line without dated records', () => {
  const rows = [tx('bad', '2026-02-30', 2000), tx('nan', '2026-01-01', NaN), tx('negative', '2026-01-01', -200)]
  const result = propertyYearTimeline('a', rows, computePropertyTaxSummary(property, [], []), now)
  expect(result.hasData).toBe(false)
  expect(result.points.at(-1)?.income).toBe(0)
})
it('positions the current marker part way through a month and spans the full axis only in December', () => {
  const summary = computePropertyTaxSummary(property, [], [])
  expect(propertyYearTimeline('a', [], summary, new Date(2026, 9, 15, 12)).progress).toBeCloseTo((9 + 15 / 31) / 12)
  expect(propertyYearTimeline('a', [], summary, new Date(2026, 11, 31, 12)).progress).toBe(1)
})
