import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Pre-Launch Calculator + Billing UX Polish, Issues 1/2/3/4 — structural
// regression guard.
//
// Root cause of the Home Purchase Calculator's Down Payment/Closing
// Costs display bug (and the identical Rental Property Analyzer Down
// Payment bug): both pages render <aside className="evaluatorResults">
// BEFORE <div className="evaluatorInputs"> inside .evaluatorLayout. The
// CSS (`grid-template-columns: minmax(0, 1fr) 340px`, plus a MOBILE-ONLY
// `.evaluatorResults { order: -1 }` override that only makes sense if
// results are normally second) assigns grid columns by SOURCE ORDER —
// so with results first, the results card got the wide flexible column
// and the actual input form got squeezed into the narrow fixed 340px
// one. Inside that, ModeField's %/$ toggle left almost no room for its
// own value input — a typed number was present in React state (the
// calculation always used it correctly) but had ~0px of space to
// actually render.
//
// There is no jsdom/React Testing Library in this repo (every existing
// test is a pure-function/testable-core test), so this can't be a
// rendered-DOM assertion. Instead — same technique already used in
// lib/document-intelligence/schemas.test.ts for a different structural
// invariant — this reads the page source directly and asserts the fix
// (inputs before results) stays in place, cheaply catching a regression
// back to the swapped order without needing new test infrastructure.

const ROOT = join(__dirname, '..', '..')

function readPage(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

describe('evaluatorLayout source order — .evaluatorInputs must render before .evaluatorResults', () => {
  it.each([
    ['Home Purchase Calculator', 'app/investment-tools/home-purchase/page.tsx'],
    ['Rental Property Analyzer', 'app/investment-tools/rental-analyzer/page.tsx'],
  ])('%s: <div className="evaluatorInputs"> comes before <aside className="evaluatorResults"> in source', (_name, path) => {
    const source = readPage(path)
    const inputsIndex = source.indexOf('className="evaluatorInputs"')
    const resultsIndex = source.indexOf('className="evaluatorResults"')
    expect(inputsIndex, 'evaluatorInputs must be present').toBeGreaterThan(-1)
    expect(resultsIndex, 'evaluatorResults must be present').toBeGreaterThan(-1)
    expect(inputsIndex).toBeLessThan(resultsIndex)
  })
})

describe('evaluatorLayout — a lone/long field spans the full evalGrid width instead of half', () => {
  it('Home Purchase Calculator: Address field uses fullField', () => {
    const source = readPage('app/investment-tools/home-purchase/page.tsx')
    const addressLabelIndex = source.indexOf('<span>Address</span>')
    expect(addressLabelIndex).toBeGreaterThan(-1)
    const precedingLabelOpen = source.lastIndexOf('<label', addressLabelIndex)
    const labelTagText = source.slice(precedingLabelOpen, addressLabelIndex)
    expect(labelTagText).toContain('fullField')
  })

  it('Rental Property Analyzer: Property Address field uses fullField (Issue 4)', () => {
    const source = readPage('app/investment-tools/rental-analyzer/page.tsx')
    const addressLabelIndex = source.indexOf('<span>Property Address</span>')
    expect(addressLabelIndex).toBeGreaterThan(-1)
    const precedingLabelOpen = source.lastIndexOf('<label', addressLabelIndex)
    const labelTagText = source.slice(precedingLabelOpen, addressLabelIndex)
    expect(labelTagText).toContain('fullField')
  })
})
