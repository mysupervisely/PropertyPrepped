import { it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PropertyNetGraph } from './PropertyNetGraph'
it('renders recorded amounts and a dated year timeline, with no fabricated return percentage', () => {
  const html = renderToStaticMarkup(PropertyNetGraph({ year: '2026', totals: { income: 6500, expenses: 2500, net: 4000, interestMissing: false }, timeline: { year: 2026, month: 9, progress: 10 / 12, hasData: true, hasUndatedTotals: true, points: [{ progress: 0, income: 0, costs: 0 }, { progress: 10 / 12, income: 6500, costs: 2500 }] } }))
  expect(html).toContain('2026 recorded net')
  expect(html).toContain('+$4,000')
  expect(html).toContain('+$6,500')
  expect(html).toContain('−$2,500')
  expect(html).toContain('Jan')
  expect(html).toContain('Dec')
  expect(html).toContain('through Oct 2026')
  expect(html).toContain('Future months are empty')
  expect(html).toContain('annual totals not plotted')
  expect(html).toContain('<polyline')
  expect(html).not.toContain('<button')
})
it('keeps missing interest and no-data states visible', () => {
  const partial = renderToStaticMarkup(PropertyNetGraph({ year: '2026', totals: { income: 2000, expenses: 3000, net: -1000, interestMissing: true } }))
  expect(partial).toContain('Partial · interest missing')
  expect(partial).toContain('propertyNetNegative')
  const missing = renderToStaticMarkup(PropertyNetGraph({ year: '2026' }))
  expect(missing).toContain('Add financial records')
  expect(missing).not.toContain('$0')
})
