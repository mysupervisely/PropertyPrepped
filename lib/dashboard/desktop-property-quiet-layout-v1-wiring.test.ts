import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Desktop Property Page Quiet Layout V1.
//
// A focused, presentation-only pass on the authenticated Property
// Overview tab at DESKTOP widths only: PR #67 (Property Overview +
// Pricing Polish V1) already replaced the old stack of equally-weighted
// bordered .overviewPanel cards with quiet .overviewInfoSection groups;
// this milestone adds two further refinements on top of that same
// markup — a subtle vertical hairline centered in the existing
// .overviewInfoGrid column gap (Expenses & tax | Property facts, and
// Notes | Timeline), and a horizontal-band treatment for Tenancy
// (.tenancyGrid) instead of another stack of full-width bordered rows —
// both scoped to `@media (min-width: 901px)` only. No field, value,
// conditional, handler, calculation, or the pre-existing mobile
// presentation below 901px is touched. Same no-jsdom, source-read
// wiring-test convention as every other app/page.tsx test in this repo.

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const pageSource = readFile('app/page.tsx')
const cssSource = readFile('app/globals.css')

const overviewStart = pageSource.indexOf("activeTab === 'Overview' &&")
const overviewEnd = pageSource.indexOf("{activeTab === 'Documents' &&")
const overviewSlice = pageSource.slice(overviewStart, overviewEnd)

describe('Property Snapshot is preserved exactly — still the one strongest container', () => {
  it('still exactly one .overviewPanel.propertySnapshotCard on the page', () => {
    expect((pageSource.match(/className="overviewPanel propertySnapshotCard"/g) || []).length).toBe(1)
  })

  it('every canonical Property Snapshot field is still read straight from the Property Intelligence engine — no new formula introduced', () => {
    for (const field of ['performance.estimatedValue', 'performance.equity', 'performance.contractMonthlyRent', 'performance.mortgageBalance', 'performance.actualIncomeYtd', 'performance.operatingExpensesYtd', 'performance.noiYtd', 'priorYearPerformance.capRatePercent', 'priorYearPerformance.netCashFlowMonthly', 'priorYearPerformance.noiAnnual', 'performance.contractAnnualRent']) {
      expect(pageSource).toContain(field)
    }
  })

  it('metricMoney/metricCompactMoney/metricPercent are still the only presentation helpers used inside the snapshot card — no new inline arithmetic', () => {
    const cardIdx = pageSource.indexOf('<div className="overviewPanel propertySnapshotCard">')
    const cardEnd = pageSource.indexOf('</details>\n          </div>', cardIdx)
    const cardSlice = pageSource.slice(cardIdx, cardEnd)
    expect(cardSlice).not.toMatch(/selected\.monthly_rent\s*-\s*selected\.monthly_expenses/)
    expect(cardSlice).not.toMatch(/performance\.\w+\.value\s*[-+*/]/)
  })
})

describe('Expenses & tax and Property facts are preserved', () => {
  it('both groups and every field are still present, unchanged', () => {
    expect(overviewSlice).toContain('<h3 className="overviewInfoGroupLabel">Expenses &amp; tax</h3>')
    expect(overviewSlice).toContain('Monthly property expenses')
    expect(overviewSlice).toContain('Annual property tax')
    expect(overviewSlice).toContain('HOA / month')
    expect(overviewSlice).toContain('<h3 className="overviewInfoGroupLabel">Property facts</h3>')
    for (const fact of ['Beds', 'Baths', 'Square feet', 'Year built', 'Lot size', 'Purchase date']) {
      expect(overviewSlice).toContain(`<span>${fact}</span>`)
    }
  })

  it('a subtle vertical divider is added for desktop .overviewInfoGrid columns — centered in the existing gap, not a new border/box treatment', () => {
    const rule = cssSource.match(/@media \(min-width: 901px\) \{[\s\S]*?\n\}/)?.[0] || ''
    expect(rule).toMatch(/\.overviewInfoGrid > \.overviewInfoGroup:not\(:first-child\) \{\s*border-left: 1px solid var\(--line\);/)
    // Centered via equal-and-opposite margin/padding, not extra visual gap.
    expect(rule).toMatch(/margin-left: -14px;/)
    expect(rule).toMatch(/padding-left: 14px;/)
  })

  it('below 901px, .overviewInfoGrid still collapses to a single column exactly as before — no desktop two-column layout forced onto mobile', () => {
    expect(cssSource).toMatch(/@media \(max-width: 900px\) \{\s*\.overviewInfoGrid \{ grid-template-columns: 1fr; gap: 22px; \}/)
  })
})

describe('Tenancy is preserved — same fields, same rent-status fix, quieter desktop container only', () => {
  const tenancyIdx = overviewSlice.indexOf('<h2 className="overviewSectionHeading">Tenancy</h2>')
  const tenancySlice = overviewSlice.slice(tenancyIdx, tenancyIdx + 2200)

  it('Occupancy, Tenant, Lease term, and the rent row (with its status pill) are all still present', () => {
    expect(tenancySlice).toContain('<span>Occupancy</span>')
    expect(tenancySlice).toContain('<span>Tenant</span>')
    expect(tenancySlice).toContain('<span>Lease term</span>')
    expect(tenancySlice).toContain('{formatPeriodLabel(currentRentPeriod)} rent')
    expect(tenancySlice).toContain("!(currentRentRow.status === 'Unknown' && rentAmountKnown)")
    expect(tenancySlice).toContain('Open Rent')
  })

  it('the rent-status business logic itself (lib/rent-ledger/status.ts) was not touched by this milestone', () => {
    const statusSource = readFile('lib/rent-ledger/status.ts')
    expect(statusSource).toContain("if (obligation.dueDate === null) return 'Unknown'")
    expect(statusSource).not.toMatch(/Not tracked yet|No payment recorded/)
  })

  it('desktop-only .tenancyGrid gives a horizontal band with a vertical divider between segments — no change to field order, count, or the .detailRows fallback used elsewhere', () => {
    expect(tenancySlice).toContain('className="detailRows tenancyGrid"')
    const rule = cssSource.match(/@media \(min-width: 901px\) \{[\s\S]*?\n\}/)?.[0] || ''
    expect(rule).toMatch(/\.tenancyGrid \{ display: grid;/)
    expect(rule).toMatch(/\.tenancyGrid > div:not\(:first-child\) \{ border-left: 1px solid var\(--line\); \}/)
  })

  it('below 901px, Tenancy is not in any new @media rule — it keeps the exact pre-existing stacked-row .detailRows presentation', () => {
    const belowRule = cssSource.match(/@media \(max-width: 900px\) \{[\s\S]*?\n\}/g) || []
    expect(belowRule.some((block) => block.includes('tenancyGrid'))).toBe(false)
  })
})

describe('Notes and Timeline are preserved', () => {
  it('both panels are still rendered with the same props, inside the same quiet .overviewInfoGrid section', () => {
    expect(overviewSlice).toContain('<h2 className="overviewSectionHeading">Notes &amp; history</h2>')
    expect(overviewSlice).toContain('<PropertyNotesPanel propertyId={selected.id} ownerId={user.id} notes={selectedNotes} onRefresh={() => void loadPortfolio()} compact />')
    expect(overviewSlice).toContain('<PropertyTimelinePanel events={selectedTimeline} limit={6} />')
  })
})

describe('Quick Actions is unchanged — already fit the quieter desktop hierarchy after PR #67, per instruction to leave it alone if so', () => {
  it('same container class, same four actions, same live count badges — nothing added, removed, or re-bordered', () => {
    expect(overviewSlice).toContain('className="overviewInfoSection quickActions"')
    expect(overviewSlice).toContain("Documents <span className=\"quickActionCount\">{selectedDocs.length}</span>")
    expect(overviewSlice).toContain("Photos <span className=\"quickActionCount\">{selectedPhotos.length}</span>")
    expect(overviewSlice).toContain("Maintenance <span className=\"quickActionCount\">{selectedMaintenance.length}</span>")
    expect(overviewSlice).toContain('Add transaction')
  })

  it('no new .quickActions CSS was added — still the quiet hairline + plain neutral buttons PR #67 already shipped', () => {
    expect(cssSource).not.toMatch(/\.quickActions\s*\{[^}]*background: var\(--brand\)/)
    expect((cssSource.match(/\.quickActionButtons\s*\{/g) || []).length).toBe(1)
  })
})

describe('Authenticated header/avatar navigation is untouched', () => {
  it('the avatar is still the single navigation trigger — no hamburger reintroduced', () => {
    const headerSource = readFile('components/AuthHeader.tsx')
    expect(headerSource.toLowerCase()).not.toMatch(/<button[^>]*classname="hamburger/)
    expect(headerSource).toContain('authHeaderWithBottomNav')
  })
})

describe('Mobile property navigation is NOT redesigned in this milestone', () => {
  it('the main property tabs are still the same seven-tab button-based nav — no <select>/dropdown treatment introduced', () => {
    const tabsIdx = pageSource.indexOf('<nav className="tabs" role="tablist"')
    const tabsEnd = pageSource.indexOf('</nav>', tabsIdx) + '</nav>'.length
    const tabsSlice = pageSource.slice(tabsIdx, tabsEnd)
    expect(tabsSlice).not.toContain('<select')
    expect(tabsSlice).toContain('role="tab"')
  })

  it('the mobile bottom navigation bar is untouched', () => {
    expect(cssSource).toContain('.mobileBottomNav { display: none; }')
    expect(cssSource).toContain('.mobileBottomNavItem.active { color: var(--brand); }')
  })
})

describe('Guardrails: no Property Intelligence engine, Stripe/billing/entitlements, database schema, or public homepage change', () => {
  it('no property-intelligence engine module was modified by this milestone', () => {
    const portfolioSource = readFile('lib/property-intelligence/portfolio.ts')
    expect(portfolioSource).not.toMatch(/Desktop Property Page Quiet Layout/)
  })

  it('no Stripe/billing/entitlements file was touched', () => {
    for (const file of ['lib/billing/stripe.ts', 'lib/billing/entitlements.ts', 'lib/billing/plans.ts', 'lib/billing/client.ts']) {
      const source = readFile(file)
      expect(source).not.toMatch(/Desktop Property Page Quiet Layout/)
    }
  })

  it('no schema/migration statement appears in any file this milestone touched', () => {
    expect(pageSource).not.toMatch(/create table|alter table|create policy/i)
    expect(cssSource).not.toMatch(/create table|alter table|create policy/i)
  })

  it('the public homepage (Dynamic Homepage V1) is untouched', () => {
    const landingSource = readFile('components/LandingPage.tsx')
    expect(landingSource).not.toMatch(/Desktop Property Page Quiet Layout/)
  })
})
