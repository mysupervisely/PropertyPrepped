import { it, expect } from 'vitest'
import { propertyExpenseBreakdown } from './property-expense-breakdown'
import { computePropertyTaxSummary } from '../tax-center/aggregate'
import { emptyManualFields, emptyMileageFields } from '../tax-center/manual-entry'
import type { TransactionInput } from '../tax-center/types'
const property = { id: 'a', address: 'Test property', city: 'Test', property_type: 'Rental Property' }
const tx = (id: string, category: string, amount: number, property_id = 'a'): TransactionInput => ({ id, category, amount, property_id, transaction_type: category === 'Rent' ? 'Income' : 'Expense', transaction_date: '2026-01-01', document_id: null })
it('reconciles donut slices to resolved operating costs plus interest without mortgage/principal or capital duplication', () => {
  const rows = [tx('income', 'Rent', 6500), tx('tax', 'Taxes', 600), tx('insurance', 'Insurance', 200), tx('m', 'Maintenance', 300), tx('repair', 'Repairs', 100), tx('hoa', 'HOA', 50), tx('mortgage', 'Mortgage', 2000), tx('capital', 'CapEx', 4000), tx('other-property', 'Taxes', 9000, 'b')]
  const record = { ...emptyManualFields(), ...emptyMileageFields(), notes: null, document_id: null, property_taxes: 800, mortgage_interest: 1000 }
  const summary = computePropertyTaxSummary(property, rows, [{ id: 'm1', property_id: 'a', service_date: '2026-01-01', category: 'Maintenance', financial_transaction_id: 'm' }], record)
  const result = propertyExpenseBreakdown(summary, 'Active Mortgage')!
  expect(result.expenses).toBe(2450)
  expect(result.net).toBe(4050)
  expect(result.slices.reduce((sum, slice) => sum + slice.amount, 0)).toBe(result.expenses)
  expect(result.slices.find(slice => slice.key === 'maintenance')?.amount).toBe(400)
  expect(result.slices.find(slice => slice.key === 'taxes')?.amount).toBe(800)
})
it('includes custom operating costs in Other, while excluding financing and capital custom items', () => {
  const custom = ['operatingExpense', 'financing', 'capital'].map((group, i) => ({ id: String(i), propertyId: 'a', taxYear: 2026, description: 'Custom expense', amount: 100, group: group as 'operatingExpense' | 'financing' | 'capital', notes: null, documentId: null }))
  const summary = computePropertyTaxSummary(property, [tx('r', 'Rent', 1000)], [], null, custom)
  expect(propertyExpenseBreakdown(summary)?.slices).toEqual([{ key: 'other', label: 'Other operating costs', amount: 100, color: '#554343' }])
})
it('keeps absent data distinct from a recorded income file with no expense amounts', () => {
  expect(propertyExpenseBreakdown(computePropertyTaxSummary(property, [], []))).toBeNull()
  const result = propertyExpenseBreakdown(computePropertyTaxSummary(property, [tx('r', 'Rent', 1000)], []))!
  expect(result.slices).toEqual([])
  expect(result.interestMissing).toBe(true)
})
