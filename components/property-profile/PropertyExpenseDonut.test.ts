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
  expect(html).toContain('r="52" fill="#8f1717"')
  expect(html).not.toContain('propertyExpenseCenter')
  expect(html).toContain('2026 recorded income and cost activity')
})
it('uses a neutral empty circle rather than invented slices when expense records are missing', () => {
  const html = renderToStaticMarkup(PropertyExpenseDonut({ summary: computePropertyTaxSummary(property, [], []), year: '2026' }))
  expect(html).toContain('Not enough data')
  expect(html).toContain('No income or cost amounts recorded')
  expect(html).not.toContain('stroke-dasharray')
  expect(html).not.toContain('$0')
})

it('keeps the compact category details collapsed until opened', () => {
  const html = renderToStaticMarkup(PropertyExpenseDonut({ summary: computePropertyTaxSummary(property, [], []), year: '2026', compact: true }))
  expect(html).toContain('propertyExpenseCompact')
  expect(html).toContain('<details class="propertyExpenseDetails">')
  expect(html).toContain('<summary>Income &amp; cost details</summary>')
  expect(html).not.toContain('<details open')
})

it('renders filled income and cost wedges with a visible compact legend', () => {
  const rows = [{ id: 'rent', property_id: 'a', transaction_date: '2026-01-01', transaction_type: 'Income' as const, category: 'Rent', amount: 6500, document_id: null }, { id: 'maintenance', property_id: 'a', transaction_date: '2026-01-01', transaction_type: 'Expense' as const, category: 'Maintenance', amount: 500, document_id: null }]
  const html = renderToStaticMarkup(PropertyExpenseDonut({ summary: computePropertyTaxSummary(property, rows, []), year: '2026', compact: true }))
  expect(html.match(/<path /g)).toHaveLength(2)
  expect(html).toContain('Rent income')
  expect(html).toContain('Repairs &amp; maintenance')
  expect(html).toContain('propertyPieKeys')
  expect(html).not.toContain('stroke-dasharray')
  expect(html).not.toContain('propertyExpenseCenter')
})
