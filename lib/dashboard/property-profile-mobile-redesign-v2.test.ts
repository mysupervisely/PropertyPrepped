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

describe('All six property sections exist and are always rendered in the tab nav', () => {
  it('the Tab type and tabs array are exactly the six existing sections, unchanged', () => {
    expect(pageSource).toContain("type Tab = 'Overview' | 'Rent' | 'Details' | 'PropCrew' | 'Documents' | 'Tax'")
    expect(pageSource).toContain("const tabs: Tab[] = ['Overview', 'Rent', 'Details', 'PropCrew', 'Documents', 'Tax']")
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

describe('No horizontal scrolling/swiping for the six-section property navigation', () => {
  it('.tabs is a non-scrolling grid, not the old horizontally-scrolling flex row', () => {
    const rule = cssSource.match(/\.tabs\s*\{[^}]*\}/)?.[0] || ''
    expect(rule).toContain('display: grid')
    expect(rule).not.toContain('overflow-x')
    expect(rule).not.toContain('display: flex')
  })

  it('mobile breakpoints keep .tabs a fixed-column grid (3 columns = 2 rows of 3), never overflow-x, all the way down to the smallest reviewed width', () => {
    const mobileBlocks = [...cssSource.matchAll(/@media \(max-width: (760|460)px\) \{([\s\S]*?)\n\}/g)]
    expect(mobileBlocks.length).toBeGreaterThan(0)
    const tabsRulesInMobileBlocks = mobileBlocks
      .map((m) => m[2].match(/\.tabs(?:\s+button)?\s*\{[^}]*\}/g) || [])
      .flat()
    expect(tabsRulesInMobileBlocks.some((r) => r.includes('grid-template-columns: repeat(3'))).toBe(true)
    for (const rule of tabsRulesInMobileBlocks) expect(rule).not.toContain('overflow-x')
  })

  it('no carousel/"more menu" class names were introduced for the property nav', () => {
    expect(pageSource).not.toMatch(/propertyTabsCarousel|propertyTabsMore|propertyTabsOverflow/)
  })
})

describe('Hero metric strip', () => {
  const heroMetricsLine = pageSource.slice(pageSource.indexOf('<div className="heroMetrics">'), pageSource.indexOf('</div></div>\n        </section>'))

  it('contains exactly Value, Mortgage, Equity, Rent, and Tax', () => {
    for (const label of ['<span>Value</span>', '<span>Mortgage</span>', '<span>Equity</span>', '<span>Rent</span>', '<span>Tax</span>']) {
      expect(heroMetricsLine).toContain(label)
    }
  })

  it('every value is sourced from real property data (selected.*/equity), never a hardcoded dollar figure', () => {
    expect(heroMetricsLine).toContain('money(selected.estimated_value)')
    expect(heroMetricsLine).toContain('money(selected.mortgage_balance)')
    expect(heroMetricsLine).toContain('money(equity)')
    expect(heroMetricsLine).toContain('money(selected.monthly_rent)')
    expect(heroMetricsLine).toContain('money(selected.property_tax_annual)')
    expect(heroMetricsLine).not.toMatch(/\$[\d,]{3,}/) // no literal dollar-figure strings
  })

  it('Tax shows a truthful "Not entered" fallback rather than fabricating or defaulting to $0 when property_tax_annual is null', () => {
    expect(heroMetricsLine).toContain("selected.property_tax_annual != null")
    expect(heroMetricsLine).toContain("'Not entered'")
  })

  it('the equity value reuses the existing calculation (estimated_value − mortgage_balance), not a new one', () => {
    expect(pageSource).toContain('const equity = Number(selected.estimated_value) - Number(selected.mortgage_balance)')
  })
})

describe('Financial Details card (Overview)', () => {
  const overviewIndex = pageSource.indexOf('financialDetailsCard')
  const cardSlice = pageSource.slice(overviewIndex, overviewIndex + 2200)

  it('shows Value / Mortgage / Equity / Rent (Monthly) / Tax (Annual), all from real data', () => {
    expect(cardSlice).toContain('<span>Value</span><strong>{money(selected.estimated_value)}</strong>')
    expect(cardSlice).toContain('<span>Mortgage</span><strong>{money(selected.mortgage_balance)}</strong>')
    expect(cardSlice).toContain('<span>Equity</span><strong>{money(equity)}</strong>')
    expect(cardSlice).toContain('<span>Rent (Monthly)</span>')
    expect(cardSlice).toContain('<span>Tax (Annual)</span>')
  })

  it('reuses the pre-existing monthlyCashFlow calculation — no new cash-flow formula was introduced', () => {
    expect(pageSource).toContain('const monthlyCashFlow = Number(selected.monthly_rent) - Number(selected.monthly_expenses)')
    // Exactly this one calculation of monthlyCashFlow exists in the file.
    expect(pageSource.match(/const monthlyCashFlow =/g)?.length).toBe(1)
    expect(cardSlice).toContain('{money(monthlyCashFlow)}/mo')
  })

  it('links out to the existing Investment Analysis workflow (property-evaluator), not a new page', () => {
    expect(cardSlice).toContain('View full Investment Analysis')
    expect(cardSlice).toContain('/investment-tools/property-evaluator?propertyId=')
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
