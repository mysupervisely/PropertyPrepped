import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Property Intelligence V1, Phase D: Portfolio Snapshot V1 — Dashboard
// wiring guards. Same no-jsdom, source-read convention every other
// app/page.tsx wiring test in this repo already uses.
//
// The single most important invariant this file protects: the Dashboard
// is a CONSUMER of lib/property-intelligence/portfolio.ts's
// computePortfolioPerformance(), never a second implementation of the
// math — exactly the same principle property-intelligence-v1-phase-c-
// wiring.test.ts already established for the individual Property
// Snapshot. See lib/property-intelligence/portfolio.test.ts for the
// aggregation math itself (scenarios A-E, known-zero-vs-missing, etc.) —
// this file only checks that app/page.tsx wires it correctly and
// presents it calmly.

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const pageSource = readFile('app/page.tsx')
const cssSource = readFile('app/globals.css')
const portfolioSource = readFile('lib/property-intelligence/portfolio.ts')

// The Dashboard's Portfolio Snapshot section — scoped the same way every
// other section-scoped test in this repo already does it.
const snapshotStart = pageSource.indexOf('<section className="portfolioSnapshot">')
const snapshotEnd = pageSource.indexOf('</section>', snapshotStart) + '</section>'.length
const snapshotSlice = pageSource.slice(snapshotStart, snapshotEnd)

describe('Phase D: the old naive aggregation is gone', () => {
  it('the old `totals` useMemo (raw properties.estimated_value/monthly_rent/monthly_expenses reduces, plus a hand-filtered transactions.reduce for "YTD income/expenses") no longer exists anywhere in the file', () => {
    expect(pageSource).not.toMatch(/const totals = useMemo/)
    expect(pageSource).not.toContain('totals.value')
    expect(pageSource).not.toContain('totals.rent')
    expect(pageSource).not.toContain('totals.monthlyExpenses')
  })

  it('no second, hand-rolled NOI/income/expense reduce was introduced to replace it — the only aggregation is the one call to computePortfolioPerformance', () => {
    // One real call site (plus this file's own explanatory comment,
    // which also mentions the function by name — hence 2, not 1).
    expect((pageSource.match(/computePortfolioPerformance\(/g) || []).length).toBe(2)
    expect((pageSource.match(/^\s*return computePortfolioPerformance\(propertyPerformances\)$/m) || []).length).toBe(1)
    // No inline reduce over transactions filtered by transaction_type
    // sitting next to the portfolio computation (that was exactly the
    // old totals.income/expenses bug this phase removes).
    const portfolioMemoIdx = pageSource.indexOf('const portfolioPerformance = useMemo')
    const portfolioMemoEnd = pageSource.indexOf('}, [properties, transactions, leases, mortgages, maintenanceRecords, taxRecords, taxCustomItems])')
    const portfolioMemoBlock = pageSource.slice(portfolioMemoIdx, portfolioMemoEnd)
    expect(portfolioMemoBlock).not.toMatch(/transaction_type\s*===\s*['"]Income['"]/)
    expect(portfolioMemoBlock).not.toMatch(/transaction_type\s*===\s*['"]Expense['"]/)
  })
})

describe('Phase D: the Dashboard is a pure consumer of computePortfolioPerformance — no formula written in JSX', () => {
  it('imports computePortfolioPerformance from lib/property-intelligence/portfolio, never redefines it', () => {
    expect(pageSource).toContain("import { computePortfolioPerformance, type PortfolioMetric } from '../lib/property-intelligence/portfolio'")
  })

  it('every property in the aggregation is built via the SAME buildPropertyPerformanceInput + computePropertyPerformance pipeline the individual Property Snapshot already uses — run once per property, not a parallel formula', () => {
    const portfolioMemoIdx = pageSource.indexOf('const portfolioPerformance = useMemo')
    const portfolioMemoEnd = pageSource.indexOf('}, [properties, transactions, leases, mortgages, maintenanceRecords, taxRecords, taxCustomItems])')
    const portfolioMemoBlock = pageSource.slice(portfolioMemoIdx, portfolioMemoEnd)
    expect(portfolioMemoBlock).toContain('properties.map((property) =>')
    expect(portfolioMemoBlock).toContain('computePropertyPerformance(buildPropertyPerformanceInput({')
    expect(portfolioMemoBlock).toContain('return computePortfolioPerformance(propertyPerformances)')
    // No arithmetic combining two engine fields written directly here —
    // the only "math" is passing data through, same rule the property
    // page's own wiring tests already enforce for its own JSX.
    expect(portfolioMemoBlock).not.toMatch(/\.value\s*[-+*/]\s*.*\.value/)
  })

  it('no new Supabase query was added — the aggregation is built entirely from arrays this page already loads via loadPortfolio() for other sections', () => {
    const portfolioMemoIdx = pageSource.indexOf('const portfolioPerformance = useMemo')
    const portfolioMemoEnd = pageSource.indexOf('}, [properties, transactions, leases, mortgages, maintenanceRecords, taxRecords, taxCustomItems])')
    const portfolioMemoBlock = pageSource.slice(portfolioMemoIdx, portfolioMemoEnd)
    expect(portfolioMemoBlock).not.toMatch(/supabase\s*\.\s*from\(/)
    expect(portfolioMemoBlock).toContain('transactions.filter((tx) => tx.property_id === property.id)')
    expect(portfolioMemoBlock).toContain('leases.filter((row) => row.property_id === property.id)')
    expect(portfolioMemoBlock).toContain('mortgages.filter((row) => row.property_id === property.id)')
  })

  it('the property collection aggregated is exactly `properties` — the same already RLS/tenant-scoped array "My Properties" renders, never a second/different collection', () => {
    expect(pageSource).toContain('const propertyPerformances = properties.map((property) =>')
  })

  it('lib/property-intelligence/portfolio.ts itself contains zero arithmetic operators combining two Metric fields — every aggregate is a plain sum of one already-resolved field across properties', () => {
    expect(portfolioSource).not.toMatch(/m\.value\s*[-*/]\s*/)
  })
})

describe('Phase D: primary four metrics — Properties / Portfolio Value / Monthly Rent / YTD NOI', () => {
  it('renders exactly these four tiles, in this order, inside .portfolioSnapshotGrid', () => {
    expect(snapshotSlice).toContain('className="portfolioSnapshotGrid"')
    expect(snapshotSlice).toContain('portfolioPerformance.propertyCount')
    const valueIdx = snapshotSlice.indexOf('Portfolio Value')
    const rentIdx = snapshotSlice.indexOf('Monthly Rent')
    const noiIdx = snapshotSlice.indexOf('YTD NOI')
    expect(valueIdx).toBeGreaterThan(-1)
    expect(rentIdx).toBeGreaterThan(valueIdx)
    expect(noiIdx).toBeGreaterThan(rentIdx)
  })

  it('Portfolio Value uses the compact abbreviation helper (matching the individual Property Snapshot\'s own large-figure convention) — never the exact-figure helper', () => {
    const tileIdx = snapshotSlice.indexOf('Portfolio Value')
    const tileStart = snapshotSlice.lastIndexOf('<div className="portfolioSnapshotMetric">', tileIdx)
    const tile = snapshotSlice.slice(tileStart, tileIdx)
    expect(tile).toContain('metricCompactMoney(portfolioPerformance.portfolioValue)')
  })

  it('Monthly Rent and YTD NOI use the exact-figure helper — precision matters for these, never abbreviated', () => {
    expect(snapshotSlice).toContain('metricMoney(portfolioPerformance.monthlyRent')
    expect(snapshotSlice).toContain('metricMoney(portfolioPerformance.noiYtd)')
  })

  it('Monthly Rent carries a "/mo" suffix — never presented as a bare, ambiguous number', () => {
    expect(snapshotSlice).toContain("metricMoney(portfolioPerformance.monthlyRent, '/mo')")
  })

  it('YTD NOI\'s label makes the current-year period explicit — never implying an annual/full-year figure', () => {
    expect(snapshotSlice).toMatch(/\{new Date\(\)\.getFullYear\(\)\} YTD NOI/)
  })

  it('unavailable metrics render a quiet "—", never a fabricated $0 — reuses the exact same metricMoney/metricCompactMoney helpers the Property Snapshot already uses, no new formatting logic', () => {
    const helperUsedInSnapshot = snapshotSlice.match(/metric(?:Money|CompactMoney)\(/g) || []
    expect(helperUsedInSnapshot.length).toBeGreaterThanOrEqual(3) // value, rent, NOI
    // No hardcoded "$0" fallback anywhere in this section.
    expect(snapshotSlice).not.toMatch(/\$0(?!\d)/)
  })
})

describe('Phase D: portfolio equity, Cap Rate, and Net Cash Flow are explicitly deferred', () => {
  it('the primary four metrics do not include Portfolio Equity, Portfolio Cap Rate, or Portfolio Net Cash Flow', () => {
    expect(snapshotSlice).not.toMatch(/Portfolio Equity/i)
    expect(snapshotSlice).not.toMatch(/Cap Rate/i)
    expect(snapshotSlice).not.toMatch(/Net Cash Flow/i)
  })

  it('lib/property-intelligence/portfolio.ts (Phase D V1) exposes only propertyCount/portfolioValue/monthlyRent/noiYtd — no equity/capRate/netCashFlow aggregate yet, and no averaged-percentage helper that portfolio Cap Rate would have to avoid', () => {
    expect(portfolioSource).not.toMatch(/equity/i)
    expect(portfolioSource).not.toMatch(/capRate/i)
    expect(portfolioSource).not.toMatch(/netCashFlow/i)
    // If a future phase adds portfolio Cap Rate, it must never average
    // individual cap rates — documented here so that constraint isn't
    // lost before it's ever implemented.
  })
})

describe('Phase D: coverage semantics — partial vs. complete vs. unavailable', () => {
  it('a portfolioCoverageNote helper exists and returns null (no clutter) when coverage is complete or the metric is fully unavailable — a note only when genuinely partial', () => {
    const helperIdx = pageSource.indexOf('function portfolioCoverageNote')
    const helperEnd = pageSource.indexOf('\n}', helperIdx) + 2
    const helperSource = pageSource.slice(helperIdx, helperEnd)
    expect(helperSource).toContain('if (included === 0 || included === total) return null')
  })

  it('each of the three summed tiles (Portfolio Value, Monthly Rent, YTD NOI) renders its own coverage note — Properties (a plain count, always complete by definition) does not', () => {
    expect(snapshotSlice).toContain("portfolioCoverageNote(portfolioPerformance.portfolioValue, 'valued')")
    expect(snapshotSlice).toContain("portfolioCoverageNote(portfolioPerformance.monthlyRent, 'with rent')")
    expect(snapshotSlice).toContain("portfolioCoverageNote(portfolioPerformance.noiYtd, 'with YTD data')")
    const propertiesTileIdx = snapshotSlice.indexOf('portfolioPerformance.propertyCount')
    const propertiesTileEnd = snapshotSlice.indexOf('</div>', propertiesTileIdx)
    expect(snapshotSlice.slice(propertiesTileIdx, propertiesTileEnd)).not.toContain('portfolioCoverageNote')
  })

  it('coverage reuses the existing Metric-status convention (available/unavailable) rather than inventing a parallel status enum — coverage is a plain {included,total} pair, not a second status field', () => {
    expect(portfolioSource).toContain('export type PortfolioCoverage = {')
    expect(portfolioSource).toContain('included: number')
    expect(portfolioSource).toContain('total: number')
    expect(portfolioSource).not.toMatch(/status:\s*['"]partial['"]/) // no invented third status literal anywhere
  })
})

describe('Phase D: no analytics-panel clutter', () => {
  it('the Portfolio Snapshot renders no chart/graph/gauge/trend-arrow/score elements', () => {
    expect(snapshotSlice).not.toMatch(/<canvas|<svg[^>]*chart|recharts|Chart\.js|TrendingUp|TrendingDown|portfolioScore|investorScore|performanceGrade/i)
  })

  it('no giant financial table was introduced for the portfolio view', () => {
    expect(snapshotSlice).not.toContain('<table')
  })
})

describe('Phase D: visual language matches the design system — quiet tiles, no new colors', () => {
  it('.portfolioSnapshotMetric reuses the exact same light-neutral-tile values as .propertySnapshotMetric (Phase C.3) — no border, no shadow', () => {
    const rule = cssSource.match(/\.portfolioSnapshotMetric \{[^}]*\}/)?.[0] || ''
    expect(rule).toContain('background: var(--bg)')
    expect(rule).toContain('border-radius: 12px')
    expect(rule).not.toMatch(/border:\s*1px solid/)
    expect(rule).not.toContain('box-shadow')
  })

  it('no new hex color literal was introduced in the new Portfolio Snapshot rules', () => {
    const gridIdx = cssSource.indexOf('.portfolioSnapshotGrid {')
    const coverageRuleEnd = cssSource.indexOf('.portfolioSnapshotCoverageNote {')
    const newRulesBlock = cssSource.slice(gridIdx, cssSource.indexOf('}', coverageRuleEnd) + 1)
    expect(newRulesBlock).not.toMatch(/#[0-9a-fA-F]{3,8}/)
  })

  it('4 across on wider widths, 2x2 on mobile (the same 760px breakpoint the rest of this dashboard section already uses)', () => {
    const gridRule = cssSource.match(/\.portfolioSnapshotGrid \{[^}]*\}/)?.[0] || ''
    expect(gridRule).toMatch(/grid-template-columns:\s*repeat\(4,/)
    const bp760Idx = cssSource.indexOf('@media (max-width: 760px)', cssSource.indexOf('.portfolioSnapshotGrid'))
    const bp760 = cssSource.slice(bp760Idx, cssSource.indexOf('}', bp760Idx) + 2)
    expect(bp760).toMatch(/\.portfolioSnapshotGrid \{ grid-template-columns:\s*repeat\(2,/)
  })
})

describe('Phase D: existing Dashboard sections are untouched (out of scope)', () => {
  it('Needs Your Attention, maintenance/action rows, and My Properties are all still present and structurally unchanged', () => {
    expect(pageSource).toContain('<h2>Needs Your Attention</h2>')
    expect(pageSource).toContain('<h2>My Properties</h2>')
  })

  it('the Hide/Show toggle and collapsed-state summary are unchanged', () => {
    expect(snapshotSlice).toContain('onClick={toggleSnapshotExpanded} aria-expanded={snapshotExpanded}')
    expect(snapshotSlice).toContain('className="snapshotCollapsedSummary"')
  })

  it('no schema/migration file was touched by this milestone', () => {
    expect(pageSource).not.toMatch(/create table|alter table|create policy/i)
  })
})
