import { describe, expect, it } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// Property + Attention Usability V1 — Part 3-A (Tap/Click).
//
// Investigation finding: every attention-item type already carries a
// canonical NavTarget (lib/dashboard/attention.ts, lib/rent-ledger/
// ledger.ts, lib/tenant-connect/requests.ts — all already covered by
// their own existing tests), and the Dashboard's "Needs Your Attention"
// rows already wire onClick to goToNav(item.propertyId, item.nav), which
// forwards straight into the SAME openProperty() deep-link mechanism the
// rest of the app already uses. So Part 3-A ("tap an item, land on the
// right place to work on it") required NO code change — this file locks
// in that it stays true, rather than re-testing the nav targets
// themselves (already covered elsewhere).
//
// Part 3-B/C/D (swipe-to-dismiss, its persistence, and the accessible
// fallback) are explicitly NOT implemented in this same change — see
// this milestone's own completion report for the proposed dismissal
// schema, held for approval before any migration is created or applied.
// The last describe block below is a regression guard proving exactly
// that boundary was respected.

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

describe('Needs Your Attention rows — every group is clickable via goToNav', () => {
  const attentionRowsBody = sliceFunction('const attentionRows = [', 'const NEEDS_ATTENTION_PREVIEW_LIMIT')

  it('date-driven attention items (Lease/Insurance/Mortgage/Maintenance/Rent/System/TenantRequest) navigate via goToNav', () => {
    expect(attentionRowsBody).toMatch(/attentionItems\.map\(\(item\) => \(\s*<button key=\{`attn-\$\{item\.type\}-\$\{item\.id\}`\} className="dashboardItemRow" onClick=\{\(\) => goToNav\(item\.propertyId, item\.nav\)\}>/)
  })

  it('vacancy items navigate via goToNav (same mechanism, no separate routing)', () => {
    expect(attentionRowsBody).toMatch(/vacancyItems\.map\(\(item: VacancyItem\) => \(\s*<button key=\{`vac-\$\{item\.id\}`\} className="dashboardItemRow" onClick=\{\(\) => goToNav\(item\.propertyId, item\.nav\)\}>/)
  })

  it('open maintenance items navigate via goToNav (same mechanism, no separate routing)', () => {
    expect(attentionRowsBody).toMatch(/openMaintenanceItems\.map\(\(item\) => \(\s*<button key=\{`maint-\$\{item\.id\}`\} className="dashboardItemRow" onClick=\{\(\) => goToNav\(item\.propertyId, item\.nav\)\}>/)
  })

  it('no new routing architecture was introduced — goToNav/openProperty remain the only property-navigation path from the dashboard', () => {
    // Every dashboardItemRow-styled button on the dashboard goes through
    // either goToNav or openProperty directly — never a raw route change,
    // a new Link, or a second navigation helper.
    const dashboardRowButtons = attentionRowsBody.match(/<button key=\{[\s\S]*?\} className="dashboardItemRow" onClick=\{[^}]*\}>/g) || []
    expect(dashboardRowButtons.length).toBeGreaterThanOrEqual(3)
    for (const button of dashboardRowButtons) {
      expect(button).toMatch(/onClick=\{\(\) => goToNav\(item\.propertyId, item\.nav\)\}/)
    }
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

describe('Scope boundary: dismissal (swipe/persistence/accessible fallback) is NOT part of this change', () => {
  // This milestone's own report proposes a notification_dismissals-style
  // migration for approval, per the explicit "STOP before implementing
  // the persistence/schema portion of Part 3" instruction. This guard
  // proves that boundary was actually respected in the diff, not just
  // stated in prose.
  it('no attention-dismissal UI or persistence call exists anywhere in app/page.tsx yet', () => {
    expect(pageSource).not.toMatch(/dismissAttention|attentionDismiss|swipeToDismiss/i)
    expect(pageSource).not.toContain('attention_dismissals')
    expect(pageSource).not.toContain('notification_dismissals')
    // dashboardItemRow (the attention/vacancy/maintenance row markup) has
    // exactly one interactive affordance — the row's own onClick — no
    // second control layered on top of it yet.
    expect(pageSource).not.toMatch(/dashboardItemRow[\s\S]{0,400}swipe/i)
  })

  it('no new migration file for attention dismissal was created', () => {
    const migrationFiles = readdirSync(join(ROOT, 'supabase')).filter((f) => f.endsWith('.sql'))
    expect(migrationFiles.some((f) => /dismiss/i.test(f))).toBe(false)
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
