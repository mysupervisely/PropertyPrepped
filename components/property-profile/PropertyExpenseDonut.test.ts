import { it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PropertyExpenseDonut } from './PropertyExpenseDonut'
import { computePropertyTaxSummary } from '../../lib/tax-center/aggregate'
const property = { id: 'a', address: 'Test property', city: 'Test', property_type: 'Rental Property' }
it('shows exact category amounts, a reconciled total and negative net without relying on color', () => {
  const summary = computePropertyTaxSummary(property, [{ id: '1', property_id: 'a', transaction_date: '2026-01-01', transaction_type: 'Expense', category: 'Taxes', amount: 2500, document_id: null }], [])
  const html = renderToStaticMarkup(PropertyExpenseDonut({ summary, year: '2026', financingStatus: 'No Mortgage' }))
  expect(html).toContain('Property taxes')
  expect(html).toContain('Recorded net')
  expect(html).toContain('−$2,500')
  expect(html).toContain('stroke-dasharray="100 0"')
  expect(html).toContain('2026 recorded property expenses')
})
it('uses a neutral empty ring rather than invented slices when expense records are missing', () => {
  const html = renderToStaticMarkup(PropertyExpenseDonut({ summary: computePropertyTaxSummary(property, [], []), year: '2026' }))
  expect(html).toContain('Not enough data')
  expect(html).toContain('No positive expense amounts recorded')
  expect(html).not.toContain('stroke-dasharray')
  expect(html).not.toContain('$0')
})

it('keeps the compact category details collapsed until opened', () => {
  const html = renderToStaticMarkup(PropertyExpenseDonut({ summary: computePropertyTaxSummary(property, [], []), year: '2026', compact: true }))
  expect(html).toContain('propertyExpenseCompact')
  expect(html).toContain('<details class="propertyExpenseDetails">')
  expect(html).toContain('<summary>Expense details</summary>')
  expect(html).not.toContain('<details open')
})
