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

// Sections 1/2 originally locked in the hero's five-metric .heroMetrics
// strip (Value/Mortgage/Equity/Rent/Tax) and its 3+2 mobile layout.
// Property Intelligence V1, Phase C.1 (Unified Property Snapshot)
// deliberately removes .heroMetrics entirely — the hero is identity-only
// now (photo/address/city/status/actions); every financial number lives
// in exactly one place, the Property Snapshot on the Overview tab. See
// property-intelligence-v1-phase-c1-unified-snapshot.test.ts for the
// current, authoritative assertions on the hero and the unified snapshot.
describe('Section 1/2: the hero no longer duplicates financial numbers (superseded by Phase C.1)', () => {
  const heroIdx = pageSource.indexOf('<section className="propertyHero">')
  const heroSlice = pageSource.slice(heroIdx, pageSource.indexOf('</section>', heroIdx))

  it('.heroMetrics is gone — the hero is identity-only', () => {
    expect(heroSlice).not.toContain('heroMetrics')
    expect(heroSlice).not.toContain('money(selected.estimated_value)')
    expect(heroSlice).not.toContain('money(selected.mortgage_balance)')
    expect(heroSlice).not.toContain('money(selected.monthly_rent)')
  })

  it('no orphaned .heroMetrics CSS rules survive the removal', () => {
    expect(cssSource).not.toMatch(/\.heroMetrics\s*\{/)
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

// Section 3 originally locked in the pre-Phase-C.1 "Financial details"
// card (Monthly property expenses, Estimated cash flow, Purchase price,
// Appreciation, Annual property tax, HOA). Property Intelligence V1,
// Phase C.1 retired "Estimated cash flow" from presentation (it competed
// with the engine's period-safe Net Cash Flow/YTD NOI) and moved Purchase
// Price/Appreciation into the unified Property Snapshot above — this
// card, renamed "Expenses & tax", now holds only the remaining editable
// property-level inputs. See
// property-intelligence-v1-phase-c1-unified-snapshot.test.ts for the
// current, authoritative assertions on all of this.
describe('Section 3: "Expenses & tax" (formerly Financial Details) no longer duplicates or competes with the Property Snapshot (superseded by Phase C.1)', () => {
  const cardIndex = pageSource.indexOf('financialDetailsCard')
  const cardSlice = pageSource.slice(cardIndex, pageSource.indexOf('overviewPanel"><h3>Property facts'))

  it('does not repeat Value / Mortgage / Equity / Rent / Tax, and no longer shows Estimated cash flow, Purchase price, or Appreciation', () => {
    expect(cardSlice).not.toContain('<span>Value</span><strong>{money(selected.estimated_value)}</strong>')
    expect(cardSlice).not.toContain('<span>Mortgage</span><strong>{money(selected.mortgage_balance)}</strong>')
    expect(cardSlice).not.toContain('<span>Equity</span><strong>{money(equity)}</strong>')
    expect(cardSlice).not.toContain('Estimated cash flow')
    expect(cardSlice).not.toContain('Purchase price')
    expect(cardSlice).not.toContain('Appreciation')
  })

  it('keeps only Monthly property expenses, Annual property tax, and HOA — editable inputs, not performance figures', () => {
    expect(cardSlice).toContain('<h3>Expenses &amp; tax</h3>')
    expect(cardSlice).toContain('<span>Monthly property expenses</span><strong>{money(selected.monthly_expenses)}</strong>')
    expect(cardSlice).toContain('<span>Annual property tax</span>')
    expect(cardSlice).toContain('selected.hoa_monthly')
  })

  it('Annual property tax uses the same "Not entered" fallback as before, never a fabricated $0', () => {
    expect(cardSlice).toContain("selected.property_tax_annual != null ? money(selected.property_tax_annual) : 'Not entered'")
  })

  it('no cap-rate (or other) formula was introduced on this card — it stays a plain list of stored fields', () => {
    expect(cardSlice).not.toMatch(/capRate|cap_rate|CapRate/)
  })

  it('no longer has its own bottom "View full Investment Analysis" CTA — the hero link is the only Investment Analysis entry point now', () => {
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
