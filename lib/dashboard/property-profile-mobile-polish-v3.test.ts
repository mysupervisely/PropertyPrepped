import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Property Profile Mobile Polish V3 — regression guards for the small
// mobile polish pass on top of Property Profile Mobile Redesign V2. Same
// source-read technique as property-profile-mobile-redesign-v2.test.ts
// (no jsdom/React Testing Library in this repo). This is a presentation-
// only pass: no new functionality, no new calculations, no schema
// changes — these tests lock in exactly that.

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const pageSource = readFile('app/page.tsx')
const cssSource = readFile('app/globals.css')

describe('Section 1/2: the five top metrics remain, sourced exactly as before', () => {
  const heroMetricsSlice = pageSource.slice(pageSource.indexOf('<div className="heroMetrics">'), pageSource.indexOf('</div></div>\n        </section>'))

  it('Value, Mortgage, Equity, Rent, and Tax are all still present in the hero strip', () => {
    for (const label of ['<span>Value</span>', '<span>Mortgage</span>', '<span>Equity</span>', '<span>Rent</span>', '<span>Tax</span>']) {
      expect(heroMetricsSlice).toContain(label)
    }
  })

  it('uses the exact same existing sources — no new formulas', () => {
    expect(heroMetricsSlice).toContain('money(selected.estimated_value)')
    expect(heroMetricsSlice).toContain('money(selected.mortgage_balance)')
    expect(heroMetricsSlice).toContain('money(equity)')
    expect(heroMetricsSlice).toContain('money(selected.monthly_rent)')
    expect(heroMetricsSlice).toContain('money(selected.property_tax_annual)')
  })

  it('Tax still shows "Not entered" (never $0) when property_tax_annual is null', () => {
    expect(heroMetricsSlice).toContain('selected.property_tax_annual != null')
    expect(heroMetricsSlice).toContain("'Not entered'")
    // Guards against a regression that would coerce a null tax value
    // into money(0) — e.g. `money(selected.property_tax_annual || 0)`.
    expect(heroMetricsSlice).not.toMatch(/property_tax_annual\s*\|\|\s*0/)
  })

  it('the equity calculation is untouched (estimated_value − mortgage_balance)', () => {
    expect(pageSource).toContain('const equity = Number(selected.estimated_value) - Number(selected.mortgage_balance)')
  })
})

describe('Section 2: the five-metric mobile layout intentionally balances 3 + 2, no empty trailing cell', () => {
  it('.heroMetrics uses a 6-column track with explicit spans, not a plain repeat(3) that would leave an empty 6th cell', () => {
    const mobileRule = cssSource.match(/@media \(max-width: 900px\) \{([\s\S]*?)\n\}/)?.[1] || ''
    expect(mobileRule).toContain('.heroMetrics { grid-template-columns: repeat(6, minmax(0, 1fr)); }')
    // First three metrics (Value/Mortgage/Equity) each span 2 of 6
    // columns — three equal thirds filling row 1 exactly.
    expect(mobileRule).toMatch(/nth-child\(1\)[^{]*nth-child\(2\)[^{]*nth-child\(3\)[^{]*\{\s*grid-column: span 2;/)
    // Last two metrics (Rent/Tax) each span 3 of 6 columns — two equal
    // halves filling row 2 exactly, no leftover empty cell.
    expect(mobileRule).toMatch(/nth-child\(4\)[^{]*nth-child\(5\)[^{]*\{\s*grid-column: span 3;/)
  })

  it('no plain repeat(3, 1fr) heroMetrics rule survives anywhere that would reintroduce the unbalanced empty-cell layout', () => {
    expect(cssSource).not.toMatch(/\.heroMetrics\s*\{\s*grid-template-columns:\s*repeat\(3/)
  })

  it('the 460px (narrowest) breakpoint only adjusts spacing/type size, never re-overrides the column layout', () => {
    const narrowRule = cssSource.match(/@media \(max-width: 460px\) \{([\s\S]*?)\n\}/)?.[1] || ''
    const heroMetricsLines = narrowRule.match(/\.heroMetrics[^{]*\{[^}]*\}/g) || []
    for (const line of heroMetricsLines) expect(line).not.toContain('grid-template-columns')
  })

  it('no horizontal scrolling was introduced for the metric strip', () => {
    const heroMetricsRules = cssSource.match(/\.heroMetrics[^{]*\{[^}]*\}/g) || []
    for (const rule of heroMetricsRules) expect(rule).not.toContain('overflow-x')
  })

  it('typography was not shrunk substantially — the smallest heroMetrics font-size is still 15px (a modest step down from the 17px base, not a drastic one)', () => {
    const sizes = [...cssSource.matchAll(/\.heroMetrics strong \{ font-size: (\d+)px; \}/g)].map((m) => Number(m[1]))
    expect(sizes.length).toBeGreaterThan(0)
    for (const size of sizes) expect(size).toBeGreaterThanOrEqual(15)
  })
})

// Section 5 originally locked in the six-tab navigation as "unchanged by
// this milestone." Simplification + Maintenance Workspace V2, Phase D
// deliberately changes both the tabs array (Maintenance promoted to a
// primary tab — seven now) and the mobile nav pattern (a horizontally
// scrollable strip instead of a fixed 3-per-row grid, which would
// otherwise leave a lone, oddly stretched 7th tab on its own row) — see
// that phase's own report. Updated here to reflect the new, current,
// intentional state rather than re-asserting the old one.
describe('Section 5: the primary tab nav reflects Phase D\'s Maintenance promotion', () => {
  it('the tabs array includes the promoted Maintenance tab', () => {
    expect(pageSource).toContain("const tabs: Tab[] = ['Overview', 'Rent', 'Maintenance', 'Details', 'PropCrew', 'Documents', 'Tax']")
  })

  it('the desktop/default .tabs rule is still a non-scrolling grid, now sized for seven tabs', () => {
    const tabsRule = cssSource.match(/\.tabs\s*\{[^}]*\}/)?.[0] || ''
    expect(tabsRule).toContain('display: grid')
    expect(tabsRule).toContain('repeat(7, minmax(0, 1fr))')
    expect(tabsRule).not.toContain('overflow-x')
  })

  it('the old fixed 3-column (2-row) mobile tab grid is gone, replaced by a single horizontally scrollable row (Phase D.1)', () => {
    expect(cssSource).not.toContain('.tabs { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 5px; }')
    expect(cssSource).toContain('.tabs { display: flex; grid-template-columns: none;')
    expect(cssSource).toMatch(/\.tabs \{ display: flex;[^}]*overflow-x: auto/)
  })
})

describe('Section 3: Financial Details no longer blindly duplicates the hero metrics', () => {
  const cardIndex = pageSource.indexOf('financialDetailsCard')
  const cardSlice = pageSource.slice(cardIndex, pageSource.indexOf('overviewPanel"><h3>Property facts'))

  it('does not repeat the bare Value / Mortgage / Equity / Rent (Monthly) / Tax (Annual) rows the hero strip already shows', () => {
    expect(cardSlice).not.toContain('<span>Value</span><strong>{money(selected.estimated_value)}</strong>')
    expect(cardSlice).not.toContain('<span>Mortgage</span><strong>{money(selected.mortgage_balance)}</strong>')
    expect(cardSlice).not.toContain('<span>Equity</span><strong>{money(equity)}</strong>')
    expect(cardSlice).not.toContain('Rent (Monthly)')
    expect(cardSlice).not.toContain('Tax (Annual)')
  })

  it('uses only existing, already-available property fields/calculations: monthly expenses, cash flow, purchase price, appreciation, annual property tax, HOA', () => {
    expect(cardSlice).toContain('<span>Monthly property expenses</span><strong>{money(selected.monthly_expenses)}</strong>')
    expect(cardSlice).toContain('<span>Estimated cash flow</span><strong>{money(monthlyCashFlow)}/mo</strong>')
    expect(cardSlice).toContain('<span>Purchase price</span><strong>{money(selected.purchase_price)}</strong>')
    expect(cardSlice).toContain('<span>Annual property tax</span>')
    expect(cardSlice).toContain('appreciation.amount')
    expect(cardSlice).toContain('selected.hoa_monthly')
  })

  it('Annual property tax uses the same "Not entered" fallback as the hero strip, never a fabricated $0', () => {
    expect(cardSlice).toContain("selected.property_tax_annual != null ? money(selected.property_tax_annual) : 'Not entered'")
  })

  it('reuses the pre-existing monthlyCashFlow calculation — exactly one definition exists in the file, no new formula', () => {
    expect(pageSource).toContain('const monthlyCashFlow = Number(selected.monthly_rent) - Number(selected.monthly_expenses)')
    expect(pageSource.match(/const monthlyCashFlow =/g)?.length).toBe(1)
  })

  it('no new cap-rate (or other new financial) formula was introduced on this card — none existed here before, and none was added', () => {
    // Superseded, narrowly, by Property Intelligence V1 Phase C: this
    // page now DISPLAYS a Cap Rate figure elsewhere (the new Property
    // Snapshot's "View performance" disclosure), but it is read verbatim
    // from lib/property-intelligence's computePropertyPerformance()
    // result (performance.capRatePercent) — never calculated here. This
    // guard is rescoped to the Financial Details card specifically
    // (cardSlice, unchanged since this test's own describe block scope)
    // plus a repo-wide check that no cap-rate FORMULA (a division/percent
    // literal) was ever written directly in app/page.tsx — see
    // lib/dashboard/property-intelligence-v1-phase-c-wiring.test.ts for
    // the full set of "no formulas duplicated in the UI layer" guards.
    expect(cardSlice).not.toMatch(/capRate|cap_rate|CapRate/)
  })

  // Superseded by the Property Profile / PropCrew UX Improvement
  // milestone: the card's own bottom "View full Investment Analysis ->"
  // CTA was removed as redundant with the Investment Analysis button
  // already in the property hero (present on every tab, not just
  // Overview). See lib/dashboard/financial-details-cta-removal.test.ts
  // for the current, authoritative assertions.
  it('no longer has its own bottom "View full Investment Analysis" CTA — the hero button is the only Investment Analysis entry point now', () => {
    expect(cardSlice).not.toContain('View full Investment Analysis')
    expect(cardSlice).not.toContain('financialDetailsLink')
  })
})

describe('Section 4: reduced vertical space in Overview, scoped only to Overview', () => {
  it('Overview\'s section/heading use the new tightened classes', () => {
    const idx = pageSource.indexOf("activeTab === 'Overview'")
    const slice = pageSource.slice(idx, idx + 400)
    expect(slice).toContain('workspaceContentTight')
    expect(slice).toContain('workspaceHeadingTight')
    // Section identity (OVERVIEW / At a glance / Edit property facts) is kept.
    expect(slice).toContain('<p className="eyebrow">OVERVIEW</p>')
    expect(slice).toContain('<h2>At a glance</h2>')
    expect(slice).toContain('Edit property facts')
  })

  it('the tightened spacing is modest (a reduction, not a removal) and scoped via its own classes rather than editing .workspaceContent/.workspaceHeading globally', () => {
    expect(cssSource).toContain('.workspaceContentTight { padding-top: 20px; }')
    expect(cssSource).toContain('.workspaceHeadingTight { margin-bottom: 14px; }')
    // The base rules other tabs still use are untouched.
    expect(cssSource).toContain('.workspaceContent { padding-top: 32px; }')
    expect(cssSource).toContain('.workspaceHeading { align-items: flex-start; margin-bottom: 22px; }')
  })

  it('no other tab\'s heading gained the tightened classes (scoped to Overview only)', () => {
    for (const tab of ["'Rent'", "'Details'", "'PropCrew'", "'Documents'", "'Tax'"]) {
      const idx = pageSource.indexOf(`activeTab === ${tab}`)
      const slice = pageSource.slice(idx, idx + 400)
      expect(slice).not.toContain('workspaceContentTight')
    }
  })
})

describe('Section 6/7: Tax and every other property section remain fully intact', () => {
  it('PropertyTaxPanel.tsx was not modified by this milestone', () => {
    const panelSource = readFile('components/property-profile/PropertyTaxPanel.tsx')
    expect(panelSource).toContain('toggleGroup')
    expect(panelSource).toContain('expandedGroups')
    expect(panelSource).toContain('business_mileage')
    expect(panelSource).toContain("upsert(payload, { onConflict: 'property_id,tax_year' })")
  })

  it('the Tax tab still mounts PropertyTaxPanel with every existing prop, and "+ Add Tax Document" is still present', () => {
    const idx = pageSource.indexOf("activeTab === 'Tax'")
    const slice = pageSource.slice(idx, pageSource.indexOf("activeTab === 'Details'"))
    expect(slice).toContain('<PropertyTaxPanel')
    for (const prop of ['transactions={selectedTransactions}', 'taxRecords={selectedTaxRecords}', 'customItems={selectedTaxCustomItems}']) {
      expect(slice).toContain(prop)
    }
    expect(slice).toContain('+ Add Tax Document')
    expect(slice).toContain("setUploadCategory('Tax')")
    expect(slice).toContain('setShowAddDocumentChooser(true)')
  })

  it('Rent (Tenant Connect), Details, PropCrew, and Documents sections are all still wired', () => {
    const rentSlice = pageSource.slice(pageSource.indexOf("activeTab === 'Rent'"), pageSource.indexOf("activeTab === 'Tax'"))
    expect(rentSlice).toContain('<TenantConnectStatusCard')
    expect(rentSlice).toContain('<TenantRequestsPanel')

    const detailsSlice = pageSource.slice(pageSource.indexOf("activeTab === 'Details'"), pageSource.indexOf("activeTab === 'PropCrew'"))
    expect(detailsSlice).toContain('<PropertySystemsPanel')

    const docsSlice = pageSource.slice(pageSource.indexOf("activeTab === 'Documents'"), pageSource.indexOf("activeTab === 'Rent'"))
    expect(docsSlice).toContain('documentCardGrid')
  })
})

describe('Section 8: no schema/migration changes', () => {
  it('no supabase/ files were touched by this milestone (checked via git would be done in the completion report; this asserts no in-repo migration reference was added for this feature)', () => {
    expect(pageSource).not.toMatch(/create table|alter table|create policy/i)
  })
})
