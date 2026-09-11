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

  it('1. renders the four primary metrics with their required labels (Phase C.3: Mortgage joined Value/Equity/Rent as a primary metric, compacted from the old label-first order to value-first, label-second)', () => {
    expect(snapshotSlice).toContain('<span>Est. Value</span>')
    expect(snapshotSlice).toContain('<span>Est. Equity</span>')
    expect(snapshotSlice).toContain('<span>Monthly Rent</span>')
    expect(snapshotSlice).toContain('<span>Mortgage</span>')
  })

  it('every primary/YTD metric is read from the Phase B.1 engine result, never recomputed inline (Phase C.3: Value/Equity use the abbreviated metricCompactMoney presentation helper, Rent gets an explicit /mo suffix — neither is a new calculation)', () => {
    expect(snapshotSlice).toContain('metricCompactMoney(performance.estimatedValue)')
    expect(snapshotSlice).toContain('metricCompactMoney(performance.equity)')
    expect(snapshotSlice).toContain("metricMoney(performance.contractMonthlyRent, '/mo')")
    expect(snapshotSlice).toContain('metricMoney(performance.actualIncomeYtd)')
    expect(snapshotSlice).toContain('metricMoney(performance.operatingExpensesYtd)')
    expect(snapshotSlice).toContain('metricMoney(performance.noiYtd)')
    expect(snapshotSlice).toContain('metricMoney(performance.mortgageBalance)')
  })

  it('2. Monthly Rent uses contractMonthlyRent (active-lease-prioritized per Phase B.1) — never actual income, never a raw property field read directly in this section', () => {
    const rentLineIdx = snapshotSlice.indexOf('<span>Monthly Rent</span>')
    expect(rentLineIdx).toBeGreaterThan(-1)
    // Phase C.3 renders value-first, label-second, so the binding sits
    // BEFORE the <span> now, not after it.
    const rentLine = snapshotSlice.slice(rentLineIdx - 150, rentLineIdx)
    expect(rentLine).toContain('performance.contractMonthlyRent')
    expect(rentLine).not.toContain('selected.monthly_rent')
    expect(rentLine).not.toContain('actualIncomeYtd')
  })

  it('Phase C.3: Mortgage shows the financing_status word (e.g. "Paid Off") only when the engine has confirmed it via financing_status_confirmed — otherwise the real metricMoney figure, never a hardcoded string', () => {
    const mortgageLineIdx = snapshotSlice.indexOf('<span>Mortgage</span>')
    const mortgageLine = snapshotSlice.slice(mortgageLineIdx - 220, mortgageLineIdx)
    expect(mortgageLine).toContain("performance.mortgageBalance.source === 'financing_status_confirmed'")
    expect(mortgageLine).toContain('selected.financing_status')
    expect(mortgageLine).toContain('metricMoney(performance.mortgageBalance)')
    // Reads the raw property field for the label, never a second parallel
    // financing-status string invented in React.
    expect(mortgageLine).not.toMatch(/['"]Paid Off['"]|['"]No Mortgage['"]/)
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

  it('5. current-year YTD Performance never labels its own figures "Annual" — the CURRENT-year `performance.noiAnnual` is never surfaced (Phase C.2: an "Annual NOI" row now legitimately exists, but only from priorYearPerformance, a different, completed year)', () => {
    const primarySlice = snapshotSlice.slice(0, snapshotSlice.indexOf('propertySnapshotContext'))
    expect(primarySlice).not.toMatch(/Annual NOI/)
    expect(snapshotSlice).not.toContain('performance.noiAnnual') // the current-year field specifically
  })

  it("Phase C.1: YTD NOI is not repeated a second time inside 'View performance' — it's already shown once, in the YTD Performance row", () => {
    const detailsIdx = snapshotSlice.indexOf('<details className="propertyPerformanceDetails">')
    const detailsSlice = snapshotSlice.slice(detailsIdx)
    expect(detailsSlice).not.toContain('<span>YTD NOI</span>')
    expect(detailsSlice).not.toContain('performance.noiYtd')
  })

  it('6-7. Cap Rate is read from the engine\'s capRatePercent and never hardcoded/derived, so it can never show a fake 0% — Phase C.2: sourced from priorYearPerformance (the selected completed year), never the current, still-in-progress `performance`. Phase C.3 follow-up (2nd real-device round): Cap Rate is now a visible tile in the main snapshot (value-first), and renders a quiet "—" rather than any figure when no qualifying completed year exists', () => {
    expect(snapshotSlice).toContain('<strong>{priorYearPerformance ? metricPercent(priorYearPerformance.capRatePercent) : \'—\'}</strong><span>Cap Rate</span>')
    expect(snapshotSlice).not.toContain('metricPercent(performance.capRatePercent)') // the current-year field specifically
    expect(snapshotSlice).not.toMatch(/capRatePercent\s*[:=]/) // never assigned/computed here, only read
  })

  it('8. Net Cash Flow is read from the engine\'s netCashFlowMonthly and never hardcoded/derived — Phase C.2: from priorYearPerformance, same reasoning as Cap Rate. Phase C.3 follow-up: also now a visible main-snapshot tile, "—" when unavailable', () => {
    expect(snapshotSlice).toContain("metricMoney(priorYearPerformance.netCashFlowMonthly, '/mo') : '—'}</strong><span>Net Cash Flow</span>")
    expect(snapshotSlice).not.toContain("metricMoney(performance.netCashFlowMonthly, '/mo')")
  })

  it('Phase C.2: Annual NOI (full-year performance) is read from priorYearPerformance.noiAnnual, never hardcoded/derived, and only rendered when a qualifying year was actually selected. Phase C.3 follow-up: now lives only inside "View performance" (Cap Rate/Net Cash Flow moved to the visible Performance section), rendered with `&&` (nothing at all, not an explanatory fallback) when no qualifying year exists — the visible Performance section\'s own note already explains that once', () => {
    expect(snapshotSlice).toContain('<span>Annual NOI</span><strong>{metricMoney(priorYearPerformance.noiAnnual)}</strong>')
    expect(snapshotSlice).toContain('{priorYearPerformance && (')
    expect(snapshotSlice).not.toContain('No completed prior tax year has enough data on file yet for full-year performance.')
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

  it('11b. app/page.tsx never imports the raw calculation primitives (calculateNOI/capRate/equity) — only the Phase B.1/C.2 wrapper functions', () => {
    expect(pageSource).not.toContain("from '../lib/investment-calculations'")
    expect(pageSource).not.toContain('calculateNOI(')
    expect(pageSource).not.toMatch(/\bcapRate\(/)
    expect(pageSource).toContain("import { buildPropertyPerformanceInput } from '../lib/property-intelligence/resolve'")
    expect(pageSource).toContain("import { computePropertyPerformance, selectPriorYearPerformance } from '../lib/property-intelligence/calculate'")
  })

  it('11c. the engine input is assembled from data this page already loaded — no new Supabase query added for Phase C', () => {
    const buildCallIdx = pageSource.indexOf('computePropertyPerformance(buildPropertyPerformanceInput({')
    expect(buildCallIdx).toBeGreaterThan(-1)
    const buildCallBlock = pageSource.slice(buildCallIdx, pageSource.indexOf('}))', buildCallIdx))
    expect(buildCallBlock).not.toMatch(/supabase\s*\.\s*from\(/)
    expect(buildCallBlock).toContain('leases: selectedLeases')
    expect(buildCallBlock).toContain('currentMortgage: selectedMortgages[0]')
  })

  it('12. Phase C.3: the compact stat grids use relative (fr) column units and word-wrapping text, not a fixed pixel layout that could overflow at 320-430px — a dedicated narrow-width rule trims type size rather than collapsing to a single column (which real-device feedback showed makes the card scroll-heavy again)', () => {
    expect(cssSource).toMatch(/\.propertySnapshotPrimaryGrid \{ display: grid; grid-template-columns: 1fr 1fr;/)
    expect(cssSource).toMatch(/\.propertySnapshotSecondaryGrid \{ display: grid; grid-template-columns: repeat\(3, 1fr\);/)
    expect(cssSource).toContain('overflow-wrap: break-word')
    expect(cssSource).toMatch(/@media \(max-width: 360px\) \{[\s\S]*?\.propertySnapshotMetric strong \{ font-size: \d+px; \}/)
  })

  it('Phase C.3: every primary/YTD/Performance metric uses the shared .propertySnapshotMetric pattern — no metric gets its own bordered box, and the count matches exactly 4 primary + Income + Expenses + Cap Rate (one static count each), with NOI and Net Cash Flow using a dynamic conditional-tone template instead', () => {
    expect(snapshotSlice).toContain('className="propertySnapshotPrimaryGrid"')
    expect(snapshotSlice).toContain('className="propertySnapshotSecondaryGrid"')
    // Phase C.3 follow-up (2nd real-device round): the new visible
    // Performance section's Cap Rate tile also uses the plain string
    // form (7 = 4 primary + Income + Expenses + Cap Rate); NOI and
    // Net Cash Flow both use the dynamic template below since either
    // can carry a conditional metricTone-bad modifier.
    expect((snapshotSlice.match(/className="propertySnapshotMetric"/g) || []).length).toBe(7)
    expect(snapshotSlice).toMatch(/className=\{`propertySnapshotMetric\$\{/)
    // The old per-metric bordered-card class is gone from this card
    // entirely — real iPhone/Safari feedback called that "more like a
    // form than a snapshot."
    expect(snapshotSlice).not.toContain('className="financialStat"')
    expect(snapshotSlice).not.toContain('className="financialStats performanceStats"')
  })

  it('negative NOI/Net Cash Flow use the existing subtle metricTone-bad class, never a new alarming/danger style — both the current-year YTD NOI and the selected prior year\'s Annual NOI/Net Cash Flow (Phase C.3 follow-up: Net Cash Flow\'s tone check moved into the visible Performance tile\'s template, now guarded by `?.` since priorYearPerformance can be null)', () => {
    expect(snapshotSlice).toContain("Number(performance.noiYtd.value) < 0 ? ' metricTone-bad' : ''")
    expect(snapshotSlice).toContain("Number(priorYearPerformance.noiAnnual.value) < 0 ? 'metricTone-bad' : undefined")
    expect(snapshotSlice).toContain("priorYearPerformance?.netCashFlowMonthly.status === 'available' && Number(priorYearPerformance.netCashFlowMonthly.value) < 0 ? ' metricTone-bad' : ''")
  })

  it('no lime/neon green or new color literals were introduced — every class used already exists in the shared design system', () => {
    expect(snapshotSlice).not.toMatch(/#[0-9a-fA-F]{3,8}/) // no inline hex colors in the JSX itself
  })

  describe('Phase C.3: Mortgage is now a primary metric (compact grid); Purchase Price/Appreciation are one quiet inline context line', () => {
    it('Mortgage sits in the primary grid, between YTD Performance and View performance no longer exists as a separate boxed section', () => {
      expect(snapshotSlice).not.toContain('propertySnapshotContext"') // the old boxed secondary-row class is gone
      const mortgageIdx = snapshotSlice.indexOf('<span>Mortgage</span>')
      expect(mortgageIdx).toBeGreaterThan(-1)
      expect(mortgageIdx).toBeLessThan(snapshotSlice.indexOf('YTD Performance')) // primary grid comes before YTD Performance
    })

    it('Mortgage Balance staleness note is preserved (same engine field, same note, relocated below the primary grid) — but Phase C.3 follow-up (2nd real-device round) REMOVES the financing_status_confirmed explanatory note from the rendered UI entirely: it\'s internal data-quality/engineering context a landlord doesn\'t need repeated, and the "Paid Off"/"No Mortgage" primary tile already communicates what matters', () => {
      expect(snapshotSlice).toContain('performance.mortgageBalance.potentiallyStale')
      expect(snapshotSlice).toContain('Based on the mortgage balance saved in PropRoster.')
      // The financing-status word itself is still read for the primary
      // tile (that's the whole point of the tile) —
      expect(snapshotSlice).toContain("performance.mortgageBalance.source === 'financing_status_confirmed'")
      // — but the engine's own explanatory sentence for that confirmed
      // $0 (rendered, pre-follow-up, as this exact paragraph) is no
      // longer rendered anywhere in this card.
      expect(snapshotSlice).not.toContain("{performance.mortgageBalance.source === 'financing_status_confirmed' && <p className=\"propertyPerformanceNote\">{performance.mortgageBalance.notes?.[0]}</p>}")
      expect(snapshotSlice).not.toContain('{performance.mortgageBalance.notes?.[0]}')
    })

    it('Purchase Price and Appreciation use the SAME appreciationFor() calculation as before, now a single compact inline line ("Purchase $Xk · +$Yk appreciation") instead of two boxed rows', () => {
      const contextLineIdx = snapshotSlice.indexOf('propertySnapshotContextLine')
      expect(contextLineIdx).toBeGreaterThan(-1)
      expect(contextLineIdx).toBeGreaterThan(snapshotSlice.indexOf('YTD Performance'))
      expect(contextLineIdx).toBeLessThan(snapshotSlice.indexOf('<details'))
      const contextLine = snapshotSlice.slice(contextLineIdx, contextLineIdx + 400)
      expect(contextLine).toContain('Purchase <strong>{compactMoney(selected.purchase_price)}</strong>')
      expect(contextLine).toContain('appreciation.amount')
      expect(contextLine).toContain('appreciation')
      // Called exactly once (the pre-existing computation above the JSX
      // return) — not a second call/formula added for this row.
      expect(pageSource.match(/const appreciation = appreciationFor\(/g)?.length).toBe(1)
    })

    it('compactMoney used here is the SAME pre-existing helper the Dashboard Portfolio Snapshot already uses ("Homepage snapshot cleanup") — not a second, differently-tuned abbreviation rule', () => {
      expect(pageSource.match(/^(?:const|function) compactMoney/gm)?.length).toBe(1)
      expect(pageSource).toContain('Homepage snapshot cleanup')
    })
  })
})
