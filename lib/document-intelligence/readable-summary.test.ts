import { expect, it } from 'vitest'
import { summaryPoints } from './readable-summary'
it('keeps currency and dates intact while separating sentences', () => {
  expect(summaryPoints('Premium is $1,461.20. Coverage starts 1/12/2026.')).toEqual(['Premium is $1,461.20.', 'Coverage starts 1/12/2026.'])
})
it('supports existing bullet lists and empty summaries', () => {
  expect(summaryPoints('- First point\n• Second point')).toEqual(['First point', 'Second point'])
  expect(summaryPoints('')).toEqual([])
})
