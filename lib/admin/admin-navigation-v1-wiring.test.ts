import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// PropRoster — Admin Navigation V1.
//
// Source-level guardrails for the new "Admin" account-menu entry and the
// /admin landing hub — checked the same way the rest of this codebase
// verifies navigation/authorization wiring (readFileSync + targeted
// assertions; no component-rendering test library is installed in this
// project), consistent with lib/admin/platform-admin-authorization-fix-
// v1-wiring.test.ts.

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const authNavMenu = readFile('components/AuthNavMenu.tsx')
const mobileBottomNav = readFile('components/MobileBottomNav.tsx')
const adminHubPage = readFile('app/admin/page.tsx')
const adminSubscriptionsPage = readFile('app/admin/subscriptions/page.tsx')
const realtorLeadsPage = readFile('app/admin/realtor-leads/page.tsx')
const adminSubscriptionsRoute = readFile('app/api/admin/subscriptions/route.ts')

describe('The Admin entry lives in the account/tools menu, gated on platform-admin status only', () => {
  it('AuthNavMenu imports and uses usePlatformAdmin — never useSubscription/plan — to decide whether to render the Admin link', () => {
    expect(authNavMenu).toContain("from '../lib/admin/usePlatformAdmin'")
    expect(authNavMenu).toContain('usePlatformAdmin(user)')
    expect(authNavMenu).not.toContain('useSubscription')
    expect(authNavMenu).not.toMatch(/plan\s*===\s*['"]owner['"]/)
  })

  it('the Admin link render is conditioned on isPlatformAdmin and points to /admin', () => {
    const lineIdx = authNavMenu.split('\n').findIndex((line) => line.includes('isPlatformAdmin &&'))
    expect(lineIdx).toBeGreaterThan(-1)
    const nextLine = authNavMenu.split('\n')[lineIdx + 1]
    expect(nextLine).toContain('href="/admin"')
    expect(nextLine).toContain('>Admin<')
  })

  it('a subscription plan value never appears anywhere near the Admin link\'s condition — plan alone cannot make it render', () => {
    const idx = authNavMenu.indexOf('isPlatformAdmin &&')
    const slice = authNavMenu.slice(Math.max(0, idx - 200), idx + 200)
    expect(slice).not.toMatch(/\bplan\b/i)
  })

  it('the Admin entry is NOT added to the primary mobile bottom nav — that bar stays the same four landlord destinations for every account type', () => {
    expect(mobileBottomNav).not.toContain('href="/admin"')
    expect(mobileBottomNav).not.toContain('usePlatformAdmin')
  })
})

describe('usePlatformAdmin denies by default for signed-out / not-yet-resolved users', () => {
  const hookSource = readFile('lib/admin/usePlatformAdmin.ts')

  it('resolves isPlatformAdmin to false immediately when there is no user, without querying anything', () => {
    const idx = hookSource.indexOf('if (!supabase || !user)')
    expect(idx).toBeGreaterThan(-1)
    const slice = hookSource.slice(idx, idx + 150)
    expect(slice).toContain('setIsPlatformAdmin(false)')
  })
})

describe('/admin (the new landing hub) fails closed for non-admins, exactly like its siblings', () => {
  it('gates on usePlatformAdmin/isPlatformAdmin, not a billing plan', () => {
    expect(adminHubPage).toContain('usePlatformAdmin')
    expect(adminHubPage).toContain('isPlatformAdmin')
    expect(adminHubPage).not.toContain('useSubscription')
    expect(adminHubPage).not.toMatch(/plan\s*===\s*['"]owner['"]/)
  })

  it('shows the same "Not available" fail-closed screen as /admin/subscriptions and /admin/realtor-leads for a non-admin', () => {
    expect(adminHubPage).toContain('This page isn’t available on your account.')
    expect(adminSubscriptionsPage).toContain('This page isn’t available on your account.')
    expect(realtorLeadsPage).toContain('This page isn’t available on your account.')
  })

  it('requires sign-in before ever reaching the admin check', () => {
    const signInIdx = adminHubPage.indexOf('Sign in required')
    const adminCheckIdx = adminHubPage.indexOf('if (!isPlatformAdmin)')
    expect(signInIdx).toBeGreaterThan(-1)
    expect(adminCheckIdx).toBeGreaterThan(signInIdx)
  })

  it('for a designated platform admin, renders links to both existing admin tools', () => {
    expect(adminHubPage).toContain('href="/admin/subscriptions"')
    expect(adminHubPage).toContain('href="/admin/realtor-leads"')
  })

  it('the hub page itself never queries any admin data table directly (no service-role client, no cross-account query) — it only links out to pages that each independently authorize', () => {
    expect(adminHubPage).not.toContain('createAdminClient')
    expect(adminHubPage).not.toContain("from('user_subscriptions')")
    expect(adminHubPage).not.toContain("from('realtor_leads')")
  })
})

describe('Regression: existing /admin/subscriptions and /admin/realtor-leads authorization is unchanged by this milestone', () => {
  it('the subscriptions API route still gates on isCallerPlatformAdmin before the admin client, unchanged', () => {
    const authIdx = adminSubscriptionsRoute.indexOf('isCallerPlatformAdmin(')
    const adminClientIdx = adminSubscriptionsRoute.indexOf('createAdminClient()')
    expect(authIdx).toBeGreaterThan(-1)
    expect(adminClientIdx).toBeGreaterThan(authIdx)
  })

  it('the realtor-leads page still gates on usePlatformAdmin, unchanged', () => {
    expect(realtorLeadsPage).toContain('usePlatformAdmin')
    expect(realtorLeadsPage).not.toContain('useSubscription')
  })

  it('neither existing admin page/route was given a new authorization path — all three (hub, subscriptions, realtor-leads) share the one usePlatformAdmin/isCallerPlatformAdmin primitive', () => {
    for (const source of [adminHubPage, adminSubscriptionsPage, realtorLeadsPage]) {
      expect(source).toContain('usePlatformAdmin')
    }
  })
})
