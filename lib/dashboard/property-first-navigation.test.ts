import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Property-First UX Cleanup — navigation/structure regression guard.
//
// Same technique as lib/dashboard/dashboard-navigation.test.ts (this repo
// has no jsdom/React Testing Library — every existing test is a
// pure-function or, for page/component wiring like this, a source-read
// test). These checks exist so a future edit can't silently reintroduce
// the tabs this milestone removed ('Financials', 'People', a 'Lease'
// Property sub-tab) or drop the new ones ('Rent', top-level 'PropCrew')
// without a test failing.

const ROOT = join(__dirname, '..', '..')

function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

describe('Property-First UX Cleanup — app/page.tsx tab structure', () => {
  const source = readFile('app/page.tsx')

  it('the property workspace tabs are Overview / Rent / Property / PropCrew / Documents / Tax', () => {
    expect(source).toContain("const tabs: Tab[] = ['Overview', 'Rent', 'Property', 'PropCrew', 'Documents', 'Tax']")
  })

  it('Financials and People no longer exist as top-level tabs', () => {
    expect(source).not.toContain("type Tab = 'Overview' | 'Financials'")
    expect(source).not.toMatch(/activeTab === 'Financials'/)
    expect(source).not.toMatch(/activeTab === 'People'/)
  })

  it('Property sub-tabs no longer include Lease (moved to Rent)', () => {
    expect(source).toContain("const propertySubTabs: PropertySubTab[] = ['Mortgage', 'Insurance', 'Maintenance', 'Systems']")
  })

  it('Rent has its own Lease / Ledger / Tenant sub-tabs', () => {
    expect(source).toContain("const rentSubTabs: RentSubTab[] = ['Lease', 'Ledger', 'Tenant']")
  })

  it('PropCrew is promoted to a top-level tab, scoped to the open property', () => {
    expect(source).toMatch(/activeTab === 'PropCrew'/)
    expect(source).toContain('scopePropertyId={selected.id}')
  })

  it('openProperty()/goToNav() thread a rentSubTab param, not peopleSubTab', () => {
    expect(source).toContain('rentSubTab?: RentSubTab')
    expect(source).not.toContain('peopleSubTab?: PeopleSubTab')
  })

  it('the Documents tab has a prominent Add Document action offering Upload normally and Smart Upload', () => {
    expect(source).toContain('+ Add Document')
    expect(source).toContain('Upload normally')
    expect(source).toContain('Use Smart Upload')
  })

  it('property cards surface rent status and an alert count, not raw Equity', () => {
    expect(source).toContain('rentStatusByProperty')
    expect(source).toContain('attentionCountByProperty')
  })
})

describe('Property-First UX Cleanup — Smart Upload stays a single implementation', () => {
  const source = readFile('components/AuthHeader.tsx')

  it('exposes its existing Smart Upload trigger externally rather than a second modal', () => {
    expect(source).toContain('registerSmartUploadTrigger')
    expect(source).toContain('setSmartUploadOpen(true)')
  })
})

describe('Property-First UX Cleanup — nav targets updated everywhere Tab/RentSubTab moved', () => {
  it('lib/dashboard/attention.ts routes Lease items to Rent, not Property', () => {
    const source = readFile('lib/dashboard/attention.ts')
    expect(source).toContain("nav: { tab: 'Rent', rentSubTab: 'Lease' }")
    expect(source).not.toContain("nav: { tab: 'Property', propSubTab: 'Lease' }")
  })

  it('lib/rent-ledger/ledger.ts routes rent-status and vacancy items to Rent, not Financials/Property-Lease', () => {
    const source = readFile('lib/rent-ledger/ledger.ts')
    expect(source).not.toContain("nav: { tab: 'Financials' }")
    expect(source).not.toContain("tab: 'Property', propSubTab: 'Lease' } as NavTarget")
  })

  it('lib/dashboard/activity.ts routes financial/lease/propcrew activity off the removed tabs', () => {
    const source = readFile('lib/dashboard/activity.ts')
    expect(source).not.toContain("nav: { tab: 'Financials' }")
    expect(source).not.toContain("nav: { tab: 'Property', propSubTab: 'Lease' }")
    expect(source).not.toContain("nav: { tab: 'People', peopleSubTab: 'PropCrew' }")
  })
})
