import { it, expect } from 'vitest'
import { propertyRecordedNet } from './property-net'
import { computePropertyTaxSummary } from '../tax-center/aggregate'
import { emptyManualFields, emptyMileageFields } from '../tax-center/manual-entry'
import type { TransactionInput } from '../tax-center/types'
const property = { id: 'a', address: 'Test', city: 'Test', property_type: 'Rental Property' }
const tx = (id: string, category: string, amount: number, property_id = 'a'): TransactionInput => ({ id, category, amount, property_id, transaction_type: category === 'Rent' ? 'Income' : 'Expense', transaction_date: '2026-01-01', document_id: null })
it('includes taxes, maintenance and entered interest once, using category overrides and isolating properties', () => {
  const record = { ...emptyManualFields(), ...emptyMileageFields(), notes: null, document_id: null, property_taxes: 800, mortgage_interest: 1200 }
  const summary = computePropertyTaxSummary(property, [tx('r', 'Rent', 6500), tx('t', 'Taxes', 600), tx('m', 'Maintenance', 500), tx('l', 'Mortgage', 4000), tx('c', 'CapEx', 1000), tx('b', 'Rent', 9000, 'b')], [{ id: 'm1', property_id: 'a', financial_transaction_id: 'm', service_date: '2026-01-01', category: 'Maintenance' }], record)
  expect(propertyRecordedNet(summary, 'Active Mortgage')).toEqual({ income: 6500, expenses: 2500, net: 4000, interestMissing: false })
})
it('flags missing interest rather than assuming the full mortgage payment is interest', () => {
  const summary = computePropertyTaxSummary(property, [tx('r', 'Rent', 2500), tx('m', 'Mortgage', 2000)], [])
  expect(propertyRecordedNet(summary, 'Active Mortgage')).toEqual({ income: 2500, expenses: 0, net: 2500, interestMissing: true })
  expect(propertyRecordedNet(summary, 'No Mortgage')?.interestMissing).toBe(false)
})
it('does not turn an empty file, mortgage-only or capital-only records into a zero profit', () => {
  for (const rows of [[], [tx('m', 'Mortgage', 2000)], [tx('c', 'CapEx', 1000)]]) expect(propertyRecordedNet(computePropertyTaxSummary(property, rows, []))).toBeNull()
})
it('supports losses, explicit zero interest and invalid-data placeholders', () => {
  const record = { ...emptyManualFields(), ...emptyMileageFields(), notes: null, document_id: null, mortgage_interest: 0 }
  const summary = computePropertyTaxSummary(property, [tx('m', 'Maintenance', 500)], [], record)
  expect(propertyRecordedNet(summary)?.net).toBe(-500)
  expect(propertyRecordedNet(summary)?.interestMissing).toBe(false)
  expect(propertyRecordedNet({ ...summary, operatingExpenses: NaN })).toBeNull()
})
