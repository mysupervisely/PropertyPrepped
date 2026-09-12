import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Property Profile Mobile Redesign V2 — regression guards for the
// individual property page (app/page.tsx) and its CSS (app/globals.css).
// Same source-read technique as property-first-simplification-v2.test.ts
// and property-first-navigation.test.ts (no jsdom/React Testing Library
// in this repo) — these lock in the redesign's core requirements: all
// six property sections visible without horizontal scroll, the hero
// metric strip, the Financial Details card, and the Tax tab's new
// "+ Add Tax Document" action reusing existing infrastructure.

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const pageSource = readFile('app/page.tsx')
const cssSource = readFile('app/globals.css')

describe('All seven property sections exist and are always rendered in the tab nav', () => {
  // Simplification + Maintenance Workspace V2, Phase D promotes
  // Maintenance from a Details sub-tab to its own primary Tab — the
  // six-section baseline this milestone originally locked in is now
  // seven; see that phase's own report for the full reasoning.
  it('the Tab type and tabs array include the promoted Maintenance tab', () => {
    expect(pageSource).toContain("type Tab = 'Overview' | 'Rent' | 'Maintenance' | 'Details' | 'PropCrew' | 'Documents' | 'Tax'")
    expect(pageSource).toContain("const tabs: Tab[] = ['Overview', 'Rent', 'Maintenance', 'Details', 'PropCrew', 'Documents', 'Tax']")
  })

  it('the nav renders every entry in `tabs` unconditionally — no filtering, no "more" menu, no truncation', () => {
    const navIndex = pageSource.indexOf('aria-label="Property sections"')
    expect(navIndex).toBeGreaterThan(-1)
    const navLine = pageSource.slice(pageSource.lastIndexOf('<nav', navIndex), pageSource.indexOf('</nav>', navIndex))
    expect(navLine).toContain('{tabs.map(')
    expect(navLine).not.toMatch(/tabs\.slice|tabs\.filter/)
  })

  it('the nav is semantic (role="tablist"/"tab", aria-selected) with an obvious active state', () => {
    const navIndex = pageSource.indexOf('aria-label="Property sections"')
    const navLine = pageSource.slice(pageSource.lastIndexOf('<nav', navIndex), pageSource.indexOf('</nav>', navIndex))
    expect(navLine).toContain('role="tablist"')
    expect(navLine).toContain('role="tab"')
    expect(navLine).toContain('aria-selected={activeTab === tab}')
    expect(navLine).toContain("activeTab === tab ? 'active' : ''")
  })

  it('existing tab state/routing (activeTab/setActiveTab, ?tab= deep links via openProperty) is unchanged', () => {
    expect(pageSource).toContain("const [activeTab, setActiveTab] = useState<Tab>('Overview')")
    expect(pageSource).toContain('const openProperty = (id: string, tab: Tab = ')
  })
})

// Originally "No horizontal scrolling/swiping for the six-section
// property navigation," then Phase D.1 deliberately introduced a
// horizontally scrollable mobile tab strip instead (seven equal-weight
// primary tabs no longer fit the old fixed 3-per-row grid). Mobile
// Property Section Selector V1 replaces THAT horizontal scroller in
// turn — on a real iPhone it let Documents/Tax/PropCrew disappear
// off-screen with no visual hint how many more sections existed. See
// lib/dashboard/mobile-property-section-selector-v1-wiring.test.ts for
// the current, authoritative assertions on the mobile selector;
// desktop's plain non-scrolling grid (below) is unchanged by that
// milestone.
describe('Property navigation at desktop/default width (superseded at mobile widths by Mobile Property Section Selector V1)', () => {
  it('.tabs is a non-scrolling grid at desktop/default width', () => {
    const rule = cssSource.match(/\.tabs\s*\{[^}]*\}/)?.[0] || ''
    expect(rule).toContain('display: grid')
    expect(rule).not.toContain('overflow-x')
    expect(rule).not.toContain('display: flex')
  })

  it('no carousel/"more menu" class names were introduced for the property nav', () => {
    expect(pageSource).not.toMatch(/propertyTabsCarousel|propertyTabsMore|propertyTabsOverflow/)
  })
})

// This describe block originally locked in the hero's .heroMetrics strip
// (Value/Mortgage/Equity/Rent/Tax). Property Intelligence V1, Phase C.1
// (Unified Property Snapshot) removes .heroMetrics entirely — the hero is
// identity-only now. See
// property-intelligence-v1-phase-c1-unified-snapshot.test.ts for the
// current, authoritative assertions on the hero and the unified snapshot
// that replaced it.
describe('Hero metric strip (superseded by Phase C.1 — hero is identity-only now)', () => {
  const heroIdx = pageSource.indexOf('<section className="propertyHero">')
  const heroSlice = pageSource.slice(heroIdx, pageSource.indexOf('</section>', heroIdx))

  it('.heroMetrics is gone — no financial figure is rendered in the hero', () => {
    expect(heroSlice).not.toContain('heroMetrics')
    expect(heroSlice).not.toMatch(/money\(selected\.(estimated_value|mortgage_balance|monthly_rent|property_tax_annual)\)/)
  })
})

// This describe block originally locked in the pre-Phase-C.1 "Financial
// details" card's cash-flow row. Phase C.1 retired the naive
// monthlyCashFlow formula from presentation entirely (it competed with
// the Phase B.1 engine's period-safe Net Cash Flow/YTD NOI) and renamed
// this card "Expenses & tax." See
// property-intelligence-v1-phase-c1-unified-snapshot.test.ts for the
// current, authoritative assertions.
describe('"Expenses & tax" card, formerly "Financial Details" (superseded by Phase C.1)', () => {
  const overviewIndex = pageSource.indexOf('financialDetailsCard')
  const cardSlice = pageSource.slice(overviewIndex, overviewIndex + 900)

  it('no longer repeats the bare hero metrics, and no longer contains the retired Estimated cash flow row', () => {
    expect(cardSlice).not.toContain('<span>Value</span><strong>{money(selected.estimated_value)}</strong>')
    expect(cardSlice).not.toContain('<span>Mortgage</span><strong>{money(selected.mortgage_balance)}</strong>')
    expect(cardSlice).not.toContain('<span>Equity</span><strong>{money(equity)}</strong>')
    expect(cardSlice).not.toContain('Estimated cash flow')
    expect(pageSource).not.toMatch(/const monthlyCashFlow =/)
  })

  it('no longer links out to Investment Analysis from within the card — that link lives only in the hero now', () => {
    expect(cardSlice).not.toContain('View full Investment Analysis')
  })
})

describe('Tax tab', () => {
  const taxIndex = pageSource.indexOf("activeTab === 'Tax'")
  const taxSlice = pageSource.slice(taxIndex, pageSource.indexOf("activeTab === 'Details'"))

  it('still renders the existing PropertyTaxPanel with all of its existing props (calculation engine untouched)', () => {
    expect(taxSlice).toContain('<PropertyTaxPanel')
    for (const prop of ['supabase={supabase}', 'propertyId={selected.id}', 'ownerId={user.id}', 'transactions={selectedTransactions}', 'maintenanceRecords={selectedMaintenance}', 'documents={selectedDocs}', 'taxRecords={selectedTaxRecords}', 'customItems={selectedTaxCustomItems}', 'onRefresh={() => void loadPortfolio()}']) {
      expect(taxSlice).toContain(prop)
    }
  })

  it('PropertyTaxPanel.tsx itself (the calculation engine / override semantics / collapsible groups) was not modified by this milestone', () => {
    const panelSource = readFile('components/property-profile/PropertyTaxPanel.tsx')
    // Structural markers proving the manual-entry/override/collapsible-group machinery is intact.
    expect(panelSource).toContain('toggleGroup')
    expect(panelSource).toContain('expandedGroups')
    expect(panelSource).toContain('business_mileage')
    expect(panelSource).toContain("upsert(payload, { onConflict: 'property_id,tax_year' })")
  })

  it('"+ Add Tax Document" exists as a real action inside the Tax section', () => {
    expect(taxSlice).toContain('+ Add Tax Document')
  })

  it('"+ Add Tax Document" reuses the EXISTING add-document chooser/Smart Upload infrastructure — no new modal, no new upload state', () => {
    const buttonIndex = taxSlice.indexOf('+ Add Tax Document')
    const buttonContext = taxSlice.slice(Math.max(0, buttonIndex - 400), buttonIndex + 50)
    expect(buttonContext).toContain('setShowAddDocumentChooser(true)')
    expect(buttonContext).toContain("setUploadCategory('Tax')")
    // The SAME state the Documents tab's own "+ Add Document" button uses — not a second boolean/modal.
    expect(pageSource.match(/showAddDocumentChooser/g)!.length).toBeGreaterThan(2)
    expect(pageSource).not.toMatch(/showAddTaxDocumentChooser|showTaxUploadModal/)
  })

  it('never introduces a second document storage/table system — same storage bucket and table names as the rest of the app', () => {
    expect(pageSource).not.toMatch(/from\(['"]tax_documents['"]\)|from\(['"]property_tax_documents['"]\)/)
    expect(pageSource).not.toMatch(/storage\.from\(['"](?!property-documents|property-photos)/)
  })

  it('surfaces already-uploaded Tax-category documents as a lightweight, property-scoped supporting-documents list, each opening through the existing openDocument() flow', () => {
    expect(taxSlice).toContain('Supporting documents')
    expect(taxSlice).toContain("selectedDocs.filter((d) => d.category === 'Tax')")
    expect(taxSlice).toContain('void openDocument(doc)')
    // Not a second full document library/grid component.
    expect(taxSlice).not.toContain('documentCardGrid')
  })
})

describe('Rent / Details / PropCrew / Documents integrations remain intact (untouched by this milestone)', () => {
  it('Rent tab still wires the existing lease/ledger/tenant sub-tabs and Tenant Connect components', () => {
    const idx = pageSource.indexOf("activeTab === 'Rent'")
    const slice = pageSource.slice(idx, pageSource.indexOf("activeTab === 'Tax'"))
    expect(slice).toContain('<TenantConnectStatusCard')
    expect(slice).toContain('<TenantRequestsPanel')
    expect(slice).toContain("openLeaseForm()")
  })

  it('Details tab still wires Mortgage/Insurance/Maintenance/Systems/Ownership sub-tabs', () => {
    const idx = pageSource.indexOf("activeTab === 'Details'")
    const slice = pageSource.slice(idx, pageSource.indexOf("activeTab === 'PropCrew'"))
    expect(slice).toContain('<PropertySystemsPanel')
    expect(slice).toContain('propertySubTabs.map(')
  })

  it('PropCrew tab is untouched', () => {
    const idx = pageSource.indexOf("activeTab === 'PropCrew'")
    expect(idx).toBeGreaterThan(-1)
    const slice = pageSource.slice(idx, idx + 400)
    expect(slice).toContain('workspaceContent')
  })

  it('Documents tab still wires the existing categorized library, Photos sub-tab, and add-document chooser', () => {
    const idx = pageSource.indexOf("activeTab === 'Documents'")
    const slice = pageSource.slice(idx, pageSource.indexOf("activeTab === 'Rent'"))
    expect(slice).toContain('documentCardGrid')
    expect(slice).toContain("+ Add Document")
    expect(slice).toContain('addDocumentModal')
  })
})
