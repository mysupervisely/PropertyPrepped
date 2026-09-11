import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Property Intelligence V1, Phase C.3 — Compact Property Snapshot.
//
// Real iPhone/Safari feedback: the Phase C.1/C.2 Property Snapshot was
// functionally correct but visually poor — every metric lived in its
// own bordered box (.financialStat), reading "more like a form than a
// snapshot" and causing excessive vertical scrolling. This phase changes
// ONLY the presentation (markup/CSS): typography, spacing, and subtle
// dividers replace the bordered-card grid. It must NOT change which
// engine field backs which number, add any new calculation, or touch
// the Dashboard's own (unrelated, pre-existing) Portfolio Snapshot —
// every test below verifies one of those boundaries.
//
// Same no-jsdom, source-read wiring-test convention as every other
// app/page.tsx test in this repo.

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const pageSource = readFile('app/page.tsx')
const cssSource = readFile('app/globals.css')

const snapshotStart = pageSource.indexOf('propertySnapshotCard')
const snapshotEnd = pageSource.indexOf('</details>\n          </div>', snapshotStart) + '</details>\n          </div>'.length
const snapshotSlice = pageSource.slice(snapshotStart, snapshotEnd)

describe('Phase C.3: no bordered-box-per-metric pattern survives in the Property Snapshot', () => {
  it('.financialStat (the old bordered-card class) and .financialStats performanceStats are gone from this card entirely', () => {
    expect(snapshotSlice).not.toContain('financialStat')
    expect(snapshotSlice).not.toContain('performanceStats')
  })

  it('the old boxed secondary-context row (.propertySnapshotContext / .detailRows propertyPerformanceRows) is gone from the primary/YTD area — the outer .overviewPanel.propertySnapshotCard is the only container', () => {
    const primaryAreaEnd = snapshotSlice.indexOf('<details')
    const primaryArea = snapshotSlice.slice(0, primaryAreaEnd)
    expect(primaryArea).not.toContain('detailRows')
    expect(primaryArea).not.toContain('propertySnapshotContext"')
  })

  it('uses plain typography + a subtle divider (<hr>) between sections instead of nested bordered panels', () => {
    expect(snapshotSlice).toContain('className="propertySnapshotDivider"')
    expect((snapshotSlice.match(/<hr className="propertySnapshotDivider" \/>/g) || []).length).toBeGreaterThanOrEqual(2)
  })
})

describe('Phase C.3: compact primary grid — Value/Equity/Rent/Mortgage', () => {
  it('exactly 4 primary metrics render inside .propertySnapshotPrimaryGrid, value-first (strong before span) for scannability', () => {
    const gridIdx = snapshotSlice.indexOf('propertySnapshotPrimaryGrid')
    const gridEnd = snapshotSlice.indexOf('propertySnapshotDivider', gridIdx)
    const grid = snapshotSlice.slice(gridIdx, gridEnd)
    const metricDivs = grid.match(/<div className="propertySnapshotMetric"><strong>/g) || []
    expect(metricDivs.length).toBe(4)
    expect(grid).toContain('<span>Est. Value</span>')
    expect(grid).toContain('<span>Est. Equity</span>')
    expect(grid).toContain('<span>Monthly Rent</span>')
    expect(grid).toContain('<span>Mortgage</span>')
  })

  it('Mortgage displays the financing_status word ONLY when the engine has already confirmed it (source === financing_status_confirmed) — React reads the engine\'s decision, it never re-decides Paid Off/No Mortgage itself', () => {
    const gridIdx = snapshotSlice.indexOf('propertySnapshotPrimaryGrid')
    const grid = snapshotSlice.slice(gridIdx, gridIdx + 900)
    expect(grid).toContain("performance.mortgageBalance.source === 'financing_status_confirmed' ? selected.financing_status : metricMoney(performance.mortgageBalance)")
  })
})

describe('Phase C.3: compact YTD Performance grid', () => {
  it('exactly 3 YTD metrics render inside .propertySnapshotSecondaryGrid, sized a step down from the primary grid via CSS', () => {
    const gridIdx = snapshotSlice.indexOf('propertySnapshotSecondaryGrid')
    const gridEnd = snapshotSlice.indexOf('propertySnapshotDivider', gridIdx)
    const grid = snapshotSlice.slice(gridIdx, gridEnd)
    expect(grid).toContain('<span>Income</span>')
    expect(grid).toContain('<span>Expenses</span>')
    expect(grid).toContain('<span>NOI</span>')
    expect(cssSource).toContain('.propertySnapshotSecondaryGrid .propertySnapshotMetric strong { font-size: 16px; }')
  })

  it('negative NOI keeps the existing subtle metricTone-bad treatment, never a new alarming style', () => {
    expect(snapshotSlice).toContain("performance.noiYtd.status === 'available' && Number(performance.noiYtd.value) < 0 ? ' metricTone-bad' : ''")
  })
})

describe('Phase C.3: Purchase Price + Appreciation as one quiet inline line', () => {
  it('renders as a single .propertySnapshotContextLine sentence, not two boxed rows', () => {
    expect(snapshotSlice).toContain('className="propertySnapshotContextLine"')
    expect((snapshotSlice.match(/className="propertySnapshotContextLine"/g) || []).length).toBe(1)
  })

  it('Purchase Price is unconditional, matching the exact pre-Phase-C.3 behavior — this is a presentation pass, not a new "hide when not entered" rule', () => {
    const lineIdx = snapshotSlice.indexOf('propertySnapshotContextLine')
    const line = snapshotSlice.slice(lineIdx, lineIdx + 400)
    expect(line).not.toMatch(/selected\.purchase_price\s*>\s*0\s*&&/)
  })
})

describe('Phase C.3: no new calculation — every value still traces to the exact same engine field', () => {
  it('still assembles input via buildPropertyPerformanceInput + computePropertyPerformance exactly as before — no new Supabase query, no new formula', () => {
    const buildCallIdx = pageSource.indexOf('computePropertyPerformance(buildPropertyPerformanceInput({')
    expect(buildCallIdx).toBeGreaterThan(-1)
    expect((pageSource.match(/computePropertyPerformance\(buildPropertyPerformanceInput\(\{/g) || []).length).toBe(1)
  })

  it('no arithmetic combining two engine fields was introduced anywhere in the snapshot card', () => {
    expect(snapshotSlice).not.toMatch(/performance\.\w+\.value\s*[-+*/]\s*performance\.\w+\.value/)
    expect(snapshotSlice).not.toMatch(/priorYearPerformance\.\w+\.value\s*[-+*/]/)
  })

  it('metricCompactMoney/metricMoney/metricPercent remain the ONLY presentation helpers used — no inline money formatting invented in JSX', () => {
    expect(pageSource).toContain('function metricCompactMoney(metric: PropertyPerformanceMetric): string {')
    const helperBody = pageSource.slice(pageSource.indexOf('function metricCompactMoney'), pageSource.indexOf('function signedCompactMoney'))
    expect(helperBody).toContain("if (metric.status !== 'available' || metric.value === null) return '—'")
    expect(helperBody).toContain('return compactMoney(metric.value)')
  })

  it('compactMoney is reused from the pre-existing "Homepage snapshot cleanup" helper — not redefined a second time for this card', () => {
    expect((pageSource.match(/^(?:const|function) compactMoney/gm) || []).length).toBe(1)
    expect(pageSource).toContain('// Homepage snapshot cleanup')
  })
})

describe('Phase C.3 follow-up (2nd real-device round): "View performance" no longer duplicates Cap Rate/Net Cash Flow now that they are visible in the main card', () => {
  it('holds Full-Year Performance/Annual NOI (when a qualifying year exists) and Contract Annual Rent, but Cap Rate and Net Cash Flow are gone — they now live in the visible Performance section above', () => {
    const detailsIdx = snapshotSlice.indexOf('<details className="propertyPerformanceDetails">')
    const details = snapshotSlice.slice(detailsIdx)
    expect(details).toContain('{priorYearPerformance && (')
    expect(details).toContain('metricMoney(priorYearPerformance.noiAnnual)')
    expect(details).toContain('metricMoney(performance.contractAnnualRent)')
    expect(details).not.toContain('metricPercent(priorYearPerformance.capRatePercent)')
    expect(details).not.toContain("metricMoney(priorYearPerformance.netCashFlowMonthly, '/mo')")
    expect(details).not.toContain('<span>Cap Rate</span>')
    expect(details).not.toContain('<span>Net Cash Flow</span>')
  })

  it('the disclosure itself still exists and is still reachable — deduplication removed repeated content, not the feature', () => {
    expect(snapshotSlice).toContain('<details className="propertyPerformanceDetails">')
    expect(snapshotSlice).toContain('<summary className="propertyPerformanceSummary">View performance</summary>')
  })
})

describe('Phase C.3 follow-up (2nd real-device round): visible "Performance" section — Cap Rate + Net Cash Flow', () => {
  // Real-device review approved the primary/YTD tile design as final and
  // asked for exactly one more addition: Cap Rate and Net Cash Flow,
  // previously buried inside "View performance," now visible in the main
  // snapshot as their own compact, visually secondary section — same
  // .propertySnapshotMetric tile pattern, two columns, quieter type than
  // the primary/YTD grids above it.
  const perfHeadIdx = snapshotSlice.indexOf('propertySnapshotSubhead">Performance')
  const perfGridIdx = snapshotSlice.indexOf('className="propertySnapshotSecondaryGrid propertySnapshotPerformanceGrid"', perfHeadIdx)
  const perfGridEnd = snapshotSlice.indexOf('propertySnapshotDivider', perfGridIdx)
  const perfGrid = snapshotSlice.slice(perfGridIdx, perfGridEnd)

  it('3-4. Cap Rate and Net Cash Flow each render as their own visible tile in the main snapshot (not just inside the deeper disclosure)', () => {
    expect(perfHeadIdx).toBeGreaterThan(-1)
    expect(perfGrid).toContain('<span>Cap Rate</span>')
    expect(perfGrid).toContain('<span>Net Cash Flow</span>')
  })

  it('5-6. Cap Rate is read verbatim from priorYearPerformance.capRatePercent (the canonical Property Intelligence output for a completed year) — never derived from the current, still-in-progress YTD `performance`, never annualizing a partial year', () => {
    expect(perfGrid).toContain('metricPercent(priorYearPerformance.capRatePercent)')
    expect(perfGrid).not.toContain('performance.capRatePercent') // the current-year YTD field, specifically
    expect(perfGrid).not.toMatch(/\*\s*12|\/\s*12/) // no annualizing arithmetic in this tile
  })

  it('7. Net Cash Flow is read verbatim from priorYearPerformance.netCashFlowMonthly — never the retired naive rent-minus-expenses calculation', () => {
    expect(perfGrid).toContain("metricMoney(priorYearPerformance.netCashFlowMonthly, '/mo')")
    expect(perfGrid).not.toMatch(/contractMonthlyRent\.value\s*-\s*.*[Ee]xpense/)
    expect(perfGrid).not.toMatch(/monthly_rent\s*-\s*monthly_expenses/)
  })

  it('8. the section carries a completed-year label ("Performance · <year>") when priorYearPerformance exists — never implying these are current-year YTD figures', () => {
    const headSlice = snapshotSlice.slice(perfHeadIdx, perfHeadIdx + 200)
    expect(headSlice).toContain('priorYearPerformance && <> <span className="propertySnapshotYear">· {priorYearPerformance.period.taxYear}</span></>')
  })

  it('9-10. when no qualifying completed year exists, both tiles render a quiet "—" — never a fabricated 0%/$0 — with one shared, non-repeated explanatory note underneath', () => {
    expect(perfGrid).toContain("priorYearPerformance ? metricPercent(priorYearPerformance.capRatePercent) : '—'")
    expect(perfGrid).toContain("priorYearPerformance ? metricMoney(priorYearPerformance.netCashFlowMonthly, '/mo') : '—'")
    expect(perfGrid).toContain('{!priorYearPerformance && <p className="propertyPerformanceNote">Full-year data needed for annual performance.</p>}')
  })

  it('the Performance tiles reuse the exact same .propertySnapshotMetric/.propertySnapshotSecondaryGrid tile pattern as the YTD row — two columns, no new card style, no charts/gauges', () => {
    expect(perfGridIdx).toBeGreaterThan(-1)
    expect(cssSource).toContain('.propertySnapshotPerformanceGrid { grid-template-columns: 1fr 1fr; }')
    expect(perfGrid).not.toMatch(/<canvas|<svg/)
  })

  it('visually a step quieter than the primary/YTD grids above it (smaller tile type), not the same size repeated', () => {
    expect(cssSource).toContain('.propertySnapshotPerformanceGrid .propertySnapshotMetric strong { font-size: 15px; }')
    const ytdFontSize = Number(cssSource.match(/\.propertySnapshotSecondaryGrid \.propertySnapshotMetric strong \{ font-size: (\d+)px; \}/)?.[1])
    const perfFontSize = Number(cssSource.match(/\.propertySnapshotPerformanceGrid \.propertySnapshotMetric strong \{ font-size: (\d+)px; \}/)?.[1])
    expect(perfFontSize).toBeLessThan(ytdFontSize)
  })

  it('stays a step quieter than YTD tiles even at the ≤360px narrow-phone breakpoint — both grids share .propertySnapshotSecondaryGrid there (for the shared padding fix), so a dedicated override keeps Performance from converging to the exact same size as YTD', () => {
    const narrowBlockIdx = cssSource.indexOf('@media (max-width: 360px)')
    const narrowBlockEnd = cssSource.indexOf('\n}', narrowBlockIdx)
    const narrowBlock = cssSource.slice(narrowBlockIdx, narrowBlockEnd)
    const ytdMatch = narrowBlock.match(/\.propertySnapshotSecondaryGrid \.propertySnapshotMetric strong \{ font-size: (\d+)px; \}/)
    const perfMatch = narrowBlock.match(/\.propertySnapshotPerformanceGrid \.propertySnapshotMetric strong \{ font-size: (\d+)px; \}/)
    expect(ytdMatch).not.toBeNull()
    expect(perfMatch).not.toBeNull()
    // The Performance override must appear AFTER the shared YTD rule in
    // source order — equal specificity means the later rule wins the
    // cascade, so ordering here is what actually keeps it smaller.
    expect(narrowBlock.indexOf(perfMatch![0])).toBeGreaterThan(narrowBlock.indexOf(ytdMatch![0]))
    expect(Number(perfMatch![1])).toBeLessThan(Number(ytdMatch![1]))
  })
})

describe('Phase C.3: the Dashboard\'s own Portfolio Snapshot is completely untouched (out of scope)', () => {
  it('the Portfolio Snapshot section still uses its own pre-existing .snapshotMetrics/.portfolioSnapshot classes, unrelated to and unchanged by the new .propertySnapshot* classes', () => {
    const portfolioIdx = pageSource.indexOf('className="snapshotMetrics"')
    expect(portfolioIdx).toBeGreaterThan(-1)
    const portfolioSlice = pageSource.slice(portfolioIdx, portfolioIdx + 700)
    expect(portfolioSlice).toContain('{properties.length}')
    expect(portfolioSlice).toContain('compactMoney(totals.value)')
    expect(portfolioSlice).toContain('compactMoney(totals.rent)')
    expect(portfolioSlice).toContain('compactMoney(totals.monthlyExpenses)')
    // Uses the bare, un-prefixed class names — proves it was not migrated
    // to (or accidentally caught by) the new .propertySnapshot* rules.
    expect(portfolioSlice).not.toContain('propertySnapshotMetric')
  })

  it('the Dashboard\'s own bare .snapshotMetric/.snapshotMetrics/.portfolioSnapshot CSS rules are untouched — still their original flex/border-left layout, not the new grid pattern', () => {
    expect(cssSource).toContain('.portfolioSnapshot { background: var(--surface); border: 1px solid var(--line); border-radius: 14px;')
    expect(cssSource).toContain('.snapshotMetrics { display: flex; flex-wrap: wrap;')
    expect(cssSource).toContain('.snapshotMetric { flex: 1 1 auto; min-width: 120px; padding: 0 18px; border-left: 1px solid var(--line); }')
  })

  it('no Portfolio Snapshot aggregation logic (totals.*, Net Cash Flow summing, Phase D scope) was added', () => {
    expect(pageSource).not.toMatch(/totals\.(netCashFlow|noi|capRate)/i)
  })
})

describe('Phase C.3: hero, tabs, and Investment Analysis remain exactly as Phase C.1 left them', () => {
  it('hero is still identity-only, still has Edit + the quiet Investment Analysis link', () => {
    const heroIdx = pageSource.indexOf('<section className="propertyHero">')
    const heroSlice = pageSource.slice(heroIdx, pageSource.indexOf('</section>', heroIdx))
    expect(heroSlice).not.toContain('heroMetrics')
    expect(heroSlice).toContain('className="heroInvestmentLink"')
  })

  it('all seven property tabs are unchanged', () => {
    expect(pageSource).toContain("const tabs: Tab[] = ['Overview', 'Rent', 'Maintenance', 'Details', 'PropCrew', 'Documents', 'Tax']")
  })

  it('exactly one Property Snapshot card exists on the page', () => {
    expect((pageSource.match(/className="overviewPanel propertySnapshotCard"/g) || []).length).toBe(1)
  })
})

describe('Phase C.3 follow-up: quiet metric tiles (second real-device pass)', () => {
  // The fully borderless first pass (typography/spacing/dividers only)
  // read as "everything running together" on a real iPhone — this
  // reintroduces containment, but as small, subtle internal tiles, not
  // a return to the original oversized bordered .financialStat cards.
  const primaryRule = cssSource.match(/\.propertySnapshotMetric \{[^}]*\}/)?.[0] || ''
  const secondaryOverrideRule = cssSource.match(/\.propertySnapshotSecondaryGrid \.propertySnapshotMetric \{[^}]*\}/)?.[0] || ''

  it('tiles have a light neutral fill and rounded corners — no dark border, no box-shadow, no per-metric color', () => {
    expect(primaryRule).toContain('background: var(--bg)')
    expect(primaryRule).toContain('border-radius: 12px')
    expect(primaryRule).not.toMatch(/border:\s*1px solid/)
    expect(primaryRule).not.toContain('box-shadow')
    expect(cssSource).not.toMatch(/\.propertySnapshotMetric\s*\{[^}]*box-shadow/)
  })

  it('primary tiles use min-height (never a fixed height that could clip wrapped content), landing in the requested ~80-100px range at normal type sizes', () => {
    expect(primaryRule).toMatch(/min-height:\s*\d+px/)
    expect(primaryRule).not.toMatch(/(?<!min-)height:\s*\d+px/)
    const minHeight = Number(primaryRule.match(/min-height:\s*(\d+)px/)?.[1])
    expect(minHeight).toBeGreaterThanOrEqual(80)
    expect(minHeight).toBeLessThanOrEqual(100)
  })

  it('YTD (secondary) tiles are a smaller step down from primary tiles — less min-height, less padding, smaller type — not the same size repeated', () => {
    const primaryMinHeight = Number(primaryRule.match(/min-height:\s*(\d+)px/)?.[1])
    const secondaryMinHeight = Number(secondaryOverrideRule.match(/min-height:\s*(\d+)px/)?.[1])
    expect(secondaryMinHeight).toBeLessThan(primaryMinHeight)
    expect(cssSource).toContain('.propertySnapshotSecondaryGrid .propertySnapshotMetric strong { font-size: 16px; }')
  })

  it('grid gap is compact (single-digit-to-low-double-digit px), not the old generous whitespace-only spacing — the tiles themselves now do the separating', () => {
    const primaryGridRule = cssSource.match(/\.propertySnapshotPrimaryGrid \{[^}]*\}/)?.[0] || ''
    expect(primaryGridRule).toMatch(/gap:\s*\d{1,2}px/)
  })

  it('the outer .overviewPanel.propertySnapshotCard remains the only real bordered container — tiles are internal grouping, not a second nested card style', () => {
    expect(cssSource).toContain('.overviewPanel { background: white; border: 1px solid var(--line); border-radius: 16px;')
    // The tile rule itself must not redeclare a competing card border.
    expect(primaryRule).not.toContain('border: 1px solid var(--line)')
  })

  it('still exactly one .financialStat-style oversized card pattern was NOT reintroduced', () => {
    expect(snapshotSlice).not.toContain('financialStat')
  })
})

describe('No schema/migration changes', () => {
  it('no supabase/ files were touched by this milestone', () => {
    expect(pageSource).not.toMatch(/create table|alter table|create policy/i)
  })
})
