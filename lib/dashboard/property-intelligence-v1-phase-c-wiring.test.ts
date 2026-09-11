import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Property Intelligence V1, Phase C: source-read wiring guards for the new
// property Overview "Property Snapshot" + "View performance" disclosure —
// the same no-jsdom convention every other app/page.tsx wiring test in
// this repo already uses (the file is huge and never rendered in tests;
// every guard here reads its literal source instead).
//
// The single most important invariant this file protects: the UI is a
// CONSUMER of lib/property-intelligence, never a second implementation of
// its math. Every test either checks that a displayed number traces back
// to a Metric field on computePropertyPerformance()'s result, or that the
// raw formula functions (calculateNOI/capRate/equity) never appear in
// app/page.tsx at all.
//
// UPDATED for Phase C.1 (Unified Property Snapshot): the card grew a
// secondary/contextual row (Mortgage Balance, Purchase Price/
// Appreciation) between "YTD Performance" and "View performance", and
// "View performance" itself dropped YTD NOI and Mortgage Balance since
// those are now shown above it instead of being repeated. Assertions
// about that older internal shape are updated in place below; new
// Phase C.1-specific invariants (hero simplification, the rent-status
// contradiction fix, Investment Analysis de-emphasis, the retired
// "Estimated cash flow") live in
// property-intelligence-v1-phase-c1-unified-snapshot.test.ts.

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const pageSource = readFile('app/page.tsx')
const cssSource = readFile('app/globals.css')

// The Property Snapshot section, isolated from the rest of the (huge)
// Overview tab body — every test below scopes its assertions to this
// slice unless it's specifically checking something file-wide (e.g. "no
// raw formula functions imported anywhere").
const snapshotStart = pageSource.indexOf('propertySnapshotCard')
const snapshotEnd = pageSource.indexOf('</details>\n          </div>', snapshotStart) + '</details>\n          </div>'.length
const snapshotSlice = pageSource.slice(snapshotStart, snapshotEnd)

describe('Property Intelligence V1, Phase C — wiring', () => {
  it('the Property Snapshot section exists and is found inside the Overview tab, before the "Expenses & tax" card (the old Financial Details card, renamed and slimmed by Phase C.1)', () => {
    expect(snapshotStart).toBeGreaterThan(-1)
    expect(snapshotSlice.length).toBeGreaterThan(0)
    const expensesCardIdx = pageSource.indexOf('financialDetailsCard')
    expect(expensesCardIdx).toBeGreaterThan(snapshotStart)
  })

  it('1. renders the three primary metrics with their required labels', () => {
    expect(snapshotSlice).toContain('<span>Estimated Value</span>')
    expect(snapshotSlice).toContain('<span>Estimated Equity</span>')
    expect(snapshotSlice).toContain('<span>Monthly Rent</span>')
  })

  it('every primary/YTD/secondary metric is read from the Phase B.1 engine result, never recomputed inline', () => {
    expect(snapshotSlice).toContain('metricMoney(performance.estimatedValue)')
    expect(snapshotSlice).toContain('metricMoney(performance.equity)')
    expect(snapshotSlice).toContain('metricMoney(performance.contractMonthlyRent)')
    expect(snapshotSlice).toContain('metricMoney(performance.actualIncomeYtd)')
    expect(snapshotSlice).toContain('metricMoney(performance.operatingExpensesYtd)')
    expect(snapshotSlice).toContain('metricMoney(performance.noiYtd)')
    expect(snapshotSlice).toContain('metricMoney(performance.mortgageBalance)')
  })

  it('2. Monthly Rent uses contractMonthlyRent (active-lease-prioritized per Phase B.1) — never actual income, never a raw property field read directly in this section', () => {
    const rentLineIdx = snapshotSlice.indexOf('<span>Monthly Rent</span>')
    const rentLine = snapshotSlice.slice(rentLineIdx, rentLineIdx + 120)
    expect(rentLine).toContain('performance.contractMonthlyRent')
    expect(rentLine).not.toContain('selected.monthly_rent')
    expect(rentLine).not.toContain('actualIncomeYtd')
  })

  it('3. missing metrics never render as a misleading $0 or 0% — metricMoney/metricPercent return a quiet placeholder for anything not available', () => {
    const helpersIdx = pageSource.indexOf('function metricMoney')
    const helpersEnd = pageSource.indexOf('function metricPercent')
    const percentEnd = pageSource.indexOf('\n}', helpersEnd) + 2
    const helpersSource = pageSource.slice(helpersIdx, percentEnd)
    expect(helpersSource).toContain("if (metric.status !== 'available' || metric.value === null) return '—'")
    // Exactly two guarded early-returns (one per helper) — no third path
    // that could fall through to a bare money(0)/0% for a null value.
    expect((helpersSource.match(/return '—'/g) || []).length).toBe(2)
  })

  it('4. YTD Income / Expenses / NOI display with correct, distinct labels', () => {
    expect(snapshotSlice).toContain('<span>Income</span>')
    expect(snapshotSlice).toContain('<span>Expenses</span>')
    expect(snapshotSlice).toContain('<span>NOI</span>')
    // The section heading itself says "YTD Performance," not "Annual" or
    // a bare "Performance" that could be misread as a full-year figure.
    expect(snapshotSlice).toContain('YTD Performance')
  })

  it('5. current-year YTD NOI is never labeled "Annual NOI" anywhere in this section', () => {
    expect(snapshotSlice).not.toMatch(/Annual NOI/)
    // The underlying engine field for a genuine full-year figure
    // (performance.noiAnnual) is deliberately NOT surfaced as its own
    // labeled row here — YTD NOI (performance.noiYtd) is the number this
    // phase shows; Cap Rate/Net Cash Flow are what noiAnnual unlocks.
    expect(snapshotSlice).not.toContain('performance.noiAnnual')
  })

  it("Phase C.1: YTD NOI is not repeated a second time inside 'View performance' — it's already shown once, in the YTD Performance row", () => {
    const detailsIdx = snapshotSlice.indexOf('<details className="propertyPerformanceDetails">')
    const detailsSlice = snapshotSlice.slice(detailsIdx)
    expect(detailsSlice).not.toContain('<span>YTD NOI</span>')
    expect(detailsSlice).not.toContain('performance.noiYtd')
  })

  it('6-7. Cap Rate is read from the engine\'s capRatePercent and never hardcoded/derived, so it can never show a fake 0%', () => {
    expect(snapshotSlice).toContain('<span>Cap Rate</span><strong>{metricPercent(performance.capRatePercent)}</strong>')
    expect(snapshotSlice).not.toMatch(/capRatePercent\s*[:=]/) // never assigned/computed here, only read
  })

  it('8. Net Cash Flow is read from the engine\'s netCashFlowMonthly and never hardcoded/derived', () => {
    expect(snapshotSlice).toContain("<span>Net Cash Flow</span><strong>{metricMoney(performance.netCashFlowMonthly, '/mo')}</strong>")
  })

  it('9. Estimated Equity has a quiet, conditional explanation when unavailable — never an alarming banner, never shown when equity IS available', () => {
    expect(snapshotSlice).toContain("performance.equity.status !== 'available' && <p className=\"propertyPerformanceNote\">Add a property value and mortgage balance to estimate equity.</p>")
  })

  it('10. the "View performance" disclosure exists as a native, collapsed-by-default <details>/<summary> — no new JS state', () => {
    expect(snapshotSlice).toContain('<details className="propertyPerformanceDetails">')
    expect(snapshotSlice).toContain('<summary className="propertyPerformanceSummary">View performance</summary>')
    expect(snapshotSlice).not.toMatch(/useState.*[Pp]erformance[Oo]pen/)
  })

  it('11a. no financial formula is written inside the Property Snapshot section itself (no arithmetic operators combining performance.* fields)', () => {
    // Money/percent formatting calls and the negative-value tone check
    // are fine (Number(...) < 0 is a display decision, not a formula);
    // an actual formula would look like `a.value - b.value` or
    // `a.value / b.value` combining two engine fields directly in JSX.
    expect(snapshotSlice).not.toMatch(/performance\.\w+\.value\s*[-+*/]\s*performance\.\w+\.value/)
  })

  it('11b. app/page.tsx never imports the raw calculation primitives (calculateNOI/capRate/equity) — only the Phase B.1 wrapper functions', () => {
    expect(pageSource).not.toContain("from '../lib/investment-calculations'")
    expect(pageSource).not.toContain('calculateNOI(')
    expect(pageSource).not.toMatch(/\bcapRate\(/)
    expect(pageSource).toContain("import { buildPropertyPerformanceInput } from '../lib/property-intelligence/resolve'")
    expect(pageSource).toContain("import { computePropertyPerformance } from '../lib/property-intelligence/calculate'")
  })

  it('11c. the engine input is assembled from data this page already loaded — no new Supabase query added for Phase C', () => {
    const buildCallIdx = pageSource.indexOf('computePropertyPerformance(buildPropertyPerformanceInput({')
    expect(buildCallIdx).toBeGreaterThan(-1)
    const buildCallBlock = pageSource.slice(buildCallIdx, pageSource.indexOf('}))', buildCallIdx))
    expect(buildCallBlock).not.toMatch(/supabase\s*\.\s*from\(/)
    expect(buildCallBlock).toContain('leases: selectedLeases')
    expect(buildCallBlock).toContain('currentMortgage: selectedMortgages[0]')
  })

  it('12. the Property Snapshot stat grid has an explicit mobile breakpoint that collapses to a single column — no fixed multi-column layout that could overflow at 320-430px', () => {
    expect(cssSource).toMatch(/@media \(max-width: 560px\) \{\s*\.performanceStats\.financialStats \{ grid-template-columns: 1fr; \}/)
  })

  it('reuses the existing .financialStats/.financialStat card pattern rather than a new, parallel stat-card design', () => {
    expect(snapshotSlice).toContain('className="financialStats performanceStats"')
    // 5 plain financialStat cards (Value/Equity/Rent/Income/Expenses) plus
    // 1 more with a conditional metricTone-bad modifier (NOI) — still the
    // same .financialStat base class either way, never a new card style.
    expect((snapshotSlice.match(/className="financialStat"/g) || []).length).toBe(5)
    expect(snapshotSlice).toMatch(/className=\{`financialStat\$\{/)
  })

  it('negative NOI/Net Cash Flow use the existing subtle metricTone-bad class, never a new alarming/danger style', () => {
    expect(snapshotSlice).toContain("Number(performance.noiYtd.value) < 0 ? ' metricTone-bad' : ''")
    expect(snapshotSlice).toContain("Number(performance.netCashFlowMonthly.value) < 0 ? 'metricTone-bad' : undefined")
  })

  it('no lime/neon green or new color literals were introduced — every class used already exists in the shared design system', () => {
    expect(snapshotSlice).not.toMatch(/#[0-9a-fA-F]{3,8}/) // no inline hex colors in the JSX itself
  })

  describe('Phase C.1: secondary/contextual row (Mortgage Balance, Purchase Price)', () => {
    const contextIdx = snapshotSlice.indexOf('propertySnapshotContext')
    const contextSlice = snapshotSlice.slice(contextIdx, snapshotSlice.indexOf('<details', contextIdx))

    it('exists between YTD Performance and View performance, reusing the existing .detailRows pattern (not a new stat-card design)', () => {
      expect(contextIdx).toBeGreaterThan(-1)
      expect(contextIdx).toBeGreaterThan(snapshotSlice.indexOf('YTD Performance'))
      expect(contextIdx).toBeLessThan(snapshotSlice.indexOf('<details'))
      expect(snapshotSlice).toContain('className="detailRows propertyPerformanceRows propertySnapshotContext"')
    })

    it('shows Mortgage Balance read from the engine, with its existing staleness note', () => {
      expect(contextSlice).toContain('<span>Mortgage Balance</span><strong>{metricMoney(performance.mortgageBalance)}</strong>')
      expect(contextSlice).toContain('performance.mortgageBalance.potentiallyStale')
      expect(contextSlice).toContain('Based on the mortgage balance saved in PropRoster.')
    })

    it('shows Purchase Price and Appreciation using the SAME appreciationFor() calculation as before, relabeled "(est.)" so it never reads as an appraisal', () => {
      expect(contextSlice).toContain('<span>Purchase Price</span><strong>{money(selected.purchase_price)}</strong>')
      expect(contextSlice).toContain('Appreciation (est.)')
      expect(contextSlice).toContain('appreciation.amount')
      // Called exactly once (the pre-existing computation above the JSX
      // return) — not a second call/formula added for this row.
      expect(pageSource.match(/const appreciation = appreciationFor\(/g)?.length).toBe(1)
    })
  })
})
