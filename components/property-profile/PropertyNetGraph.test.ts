import { it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { PropertyNetGraph } from './PropertyNetGraph'
it('renders amounts and shared-scale bars, with no fabricated return percentage', () => {
  const html = renderToStaticMarkup(PropertyNetGraph({ year: '2026', totals: { income: 6500, expenses: 2500, net: 4000, interestMissing: false } }))
  expect(html).toContain('2026 recorded net')
  expect(html).toContain('+$4,000')
  expect(html).toContain('+$6,500')
  expect(html).toContain('−$2,500')
  expect(html).toContain('width:100%')
  expect(html).toContain('width:38.46153846153847%')
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
