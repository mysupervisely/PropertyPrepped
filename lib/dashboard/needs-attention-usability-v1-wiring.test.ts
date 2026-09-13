import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// Property + Attention Usability V1 — Part 3-A (Tap/Click).
//
// Investigation finding: every attention-item type already carries a
// canonical NavTarget (lib/dashboard/attention.ts, lib/rent-ledger/
// ledger.ts, lib/tenant-connect/requests.ts — all already covered by
// their own existing tests), and the Dashboard's "Needs Your Attention"
// rows already wire tap/click to goToNav(item.propertyId, item.nav),
// which forwards straight into the SAME openProperty() deep-link
// mechanism the rest of the app already uses. So Part 3-A ("tap an
// item, land on the right place to work on it") required NO change to
// the navigation itself — this file locks in that it stays true, rather
// than re-testing the nav targets themselves (already covered
// elsewhere).
//
// UPDATE (approved follow-up): Part 3-B/C/D (swipe-to-dismiss, its
// persistence, and the accessible fallback) are now implemented —
// dismissible rows (date-driven attention items and vacancy items) are
// wrapped in components/DismissibleAttentionRow.tsx, which takes over
// the tap/click handler as its own `onOpen` prop rather than a plain
// button onClick; tap/click behavior itself (goToNav, same NavTarget)
// is otherwise unchanged. See lib/dashboard/attention-dismissal-wiring-
// v1.test.ts for the dismissal feature's own dedicated wiring tests
// (persistence, filtering, count/View-all, canonical-state-untouched
// confirmation, owner scoping).

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const pageSource = readFile('app/page.tsx')

function sliceFunction(name: string, nextFnMarker: string): string {
  const fnStart = pageSource.indexOf(name)
  expect(fnStart, `expected to find ${name} in app/page.tsx`).toBeGreaterThan(-1)
  const fnEnd = pageSource.indexOf(nextFnMarker, fnStart)
  expect(fnEnd).toBeGreaterThan(fnStart)
  return pageSource.slice(fnStart, fnEnd)
}

describe('goToNav — the one function every attention-item click goes through', () => {
  it('forwards straight into openProperty() using the item\'s own canonical NavTarget — no separate routing logic', () => {
    const fnBody = sliceFunction('function goToNav(propertyId: string, nav: NavTarget)', 'const selected =')
    expect(fnBody).toContain('openProperty(propertyId, nav.tab, nav.docsSubTab, nav.propSubTab, nav.rentSubTab)')
  })
})

describe('Needs Your Attention rows — every group still navigates via goToNav', () => {
  const attentionRowsBody = sliceFunction('const attentionRows = [', 'const NEEDS_ATTENTION_PREVIEW_LIMIT')

  it('date-driven attention items (Lease/Insurance/Mortgage/Maintenance/Rent/System/TenantRequest) navigate via goToNav, now through DismissibleAttentionRow\'s onOpen', () => {
    expect(attentionRowsBody).toMatch(/attentionItems\.map\(\(item\) => \{[\s\S]*?<DismissibleAttentionRow[\s\S]*?onOpen=\{\(\) => goToNav\(item\.propertyId, item\.nav\)\}/)
  })

  it('vacancy items navigate via goToNav, same onOpen mechanism, no separate routing', () => {
    expect(attentionRowsBody).toMatch(/vacancyItems\.map\(\(item: VacancyItem\) => \{[\s\S]*?<DismissibleAttentionRow[\s\S]*?onOpen=\{\(\) => goToNav\(item\.propertyId, item\.nav\)\}/)
  })

  it('open maintenance items (not dismissible) are still a plain button navigating via goToNav, unchanged', () => {
    expect(attentionRowsBody).toMatch(/openMaintenanceItems\.map\(\(item\) => \(\s*<button key=\{`maint-\$\{item\.id\}`\} className="dashboardItemRow" onClick=\{\(\) => goToNav\(item\.propertyId, item\.nav\)\}>/)
  })

  it('no new routing architecture was introduced — goToNav/openProperty remain the only property-navigation path from the dashboard', () => {
    // Both dismissible groups' onOpen, and open-maintenance's own plain
    // onClick, all go through goToNav — never a raw route change, a new
    // Link, or a second navigation helper.
    const onOpenCalls = attentionRowsBody.match(/onOpen=\{[^}]*\}/g) || []
    expect(onOpenCalls.length).toBe(2) // attentionItems + vacancyItems
    for (const call of onOpenCalls) {
      expect(call).toMatch(/onOpen=\{\(\) => goToNav\(item\.propertyId, item\.nav\)\}/)
    }
    expect(attentionRowsBody).toMatch(/onClick=\{\(\) => goToNav\(item\.propertyId, item\.nav\)\}/) // open maintenance's own plain button
  })
})

describe('Every canonical attention type carries a sensible existing NavTarget (already tested at the builder level — this just names the destinations for this milestone\'s own record)', () => {
  it('Lease/Rent/TenantRequest point into the Rent tab (Lease/Ledger/Tenant sub-tabs, whichever already exists for that data)', () => {
    const attentionSource = readFile('lib/dashboard/attention.ts')
    expect(attentionSource).toContain("nav: { tab: 'Rent', rentSubTab: 'Lease' }")
    const ledgerSource = readFile('lib/rent-ledger/ledger.ts')
    expect(ledgerSource).toContain("nav: { tab: 'Rent', rentSubTab: 'Lease' }")
    const requestsSource = readFile('lib/tenant-connect/requests.ts')
    expect(requestsSource).toContain("nav: { tab: 'Rent', rentSubTab: 'Tenant' }")
  })

  it('Insurance/Mortgage/System point into Details, the existing property-facts area for each', () => {
    const attentionSource = readFile('lib/dashboard/attention.ts')
    expect(attentionSource).toContain("nav: { tab: 'Details', propSubTab: 'Insurance' }")
    expect(attentionSource).toContain("nav: { tab: 'Details', propSubTab: 'Mortgage' }")
    const ledgerSource = readFile('lib/rent-ledger/ledger.ts')
    expect(ledgerSource).toContain("nav: { tab: 'Details', propSubTab: 'Systems' }")
  })

  it('Maintenance points into the Maintenance tab', () => {
    const attentionSource = readFile('lib/dashboard/attention.ts')
    expect(attentionSource).toContain("nav: { tab: 'Maintenance' }")
  })
})

describe('Dismissal is implemented (approved follow-up) — high-level presence check; see attention-dismissal-wiring-v1.test.ts for the full wiring tests', () => {
  it('exactly one migration exists for attention dismissal, and it is the approved shape', () => {
    const migrationFiles = readdirSync(join(ROOT, 'supabase')).filter((f) => f.endsWith('.sql'))
    const dismissalMigrations = migrationFiles.filter((f) => /dismiss/i.test(f))
    expect(dismissalMigrations).toEqual(['milestone-32-attention-dismissals.sql'])
  })

  it('app/page.tsx reads attention_dismissals in exactly one place (loadPortfolio) and writes to it in exactly one place (clearAttentionItem) — never to any canonical business table as part of dismissal', () => {
    const tableCalls = pageSource.match(/from\('attention_dismissals'\)\.\w+/g) || []
    expect(tableCalls.sort()).toEqual(["from('attention_dismissals').insert", "from('attention_dismissals').select"])
  })
})

describe('Existing Dashboard behavior this milestone must not change', () => {
  it('the preview/expand/hide behavior for Needs Your Attention is untouched', () => {
    expect(pageSource).toContain("const [attentionVisible, setAttentionVisible] = useState(true)")
    expect(pageSource).toContain('NEEDS_ATTENTION_PREVIEW_LIMIT')
    expect(pageSource).toContain("You&apos;re all caught up.")
  })

  it('attentionItems/vacancyItems/openMaintenanceItems computation (useMemo) is untouched by this pass', () => {
    const memoStart = pageSource.indexOf('const { attentionItems, upcomingItems, openMaintenanceItems, recentActivity, vacancyItems, attentionCountByProperty, rentStatusByProperty } = useMemo(')
    expect(memoStart).toBeGreaterThan(-1)
  })
})
