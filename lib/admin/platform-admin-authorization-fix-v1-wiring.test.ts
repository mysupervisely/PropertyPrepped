import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// PropRoster — Platform Admin Authorization Fix.
//
// Source-level guardrails proving platform-admin access is genuinely
// decoupled from billing plan, and that no account is hard-coded into
// application code — checked the same way the rest of this codebase
// verifies architectural guarantees (readFileSync + targeted assertions),
// consistent with lib/billing/subscription-management-v1-wiring.test.ts.

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const adminRoute = readFile('app/api/admin/subscriptions/route.ts')
const adminPage = readFile('app/admin/subscriptions/page.tsx')
const platformAdminLib = readFile('lib/admin/platform-admin.ts')
const usePlatformAdminHook = readFile('lib/admin/usePlatformAdmin.ts')
const migration = readFile('supabase/milestone-33-platform-admin.sql')

describe('Platform admin access is never derived from a billing plan', () => {
  it('the admin route never reads or checks user_subscriptions.plan for authorization', () => {
    expect(adminRoute).not.toMatch(/plan\s*===\s*['"]owner['"]/)
    expect(adminRoute).not.toMatch(/from\('user_subscriptions'\)\s*\n?\s*\.select\('plan'\)/)
  })

  it('the admin page never reads useSubscription for authorization — only usePlatformAdmin', () => {
    expect(adminPage).not.toContain('useSubscription')
    expect(adminPage).toContain('usePlatformAdmin')
    expect(adminPage).toContain('isPlatformAdmin')
  })

  it('the "authorized" gate itself is derived from isPlatformAdmin, not from any plan comparison', () => {
    const gateLine = adminPage.split('\n').find((line) => line.includes('const authorized ='))
    expect(gateLine).toBeDefined()
    expect(gateLine).toContain('isPlatformAdmin')
    expect(gateLine).not.toMatch(/plan/i)
  })

  it('the route enforces authorization via isCallerPlatformAdmin BEFORE the service-role admin client is ever created', () => {
    const authIdx = adminRoute.indexOf('isCallerPlatformAdmin(')
    const adminClientIdx = adminRoute.indexOf('createAdminClient()')
    expect(authIdx).toBeGreaterThan(-1)
    expect(adminClientIdx).toBeGreaterThan(authIdx)
  })
})

describe('The platform_admins table is a genuinely separate, minimally-writable mechanism', () => {
  it('carries no plan/billing columns — membership only', () => {
    expect(migration).toContain('create table if not exists public.platform_admins')
    expect(migration).not.toMatch(/plan\s+text/)
    expect(migration).not.toContain('stripe_customer_id')
  })

  it('has a select-own policy but NO insert/update/delete policy for authenticated — no client request can ever grant itself admin access', () => {
    expect(migration).toContain('platform_admins_select_own')
    expect(migration).not.toMatch(/create policy[^;]*platform_admins[^;]*for insert/)
    expect(migration).not.toMatch(/create policy[^;]*platform_admins[^;]*for update/)
    expect(migration).not.toMatch(/create policy[^;]*platform_admins[^;]*for delete/)
  })

  it('row level security is enabled on the table', () => {
    expect(migration).toContain('alter table public.platform_admins enable row level security')
  })
})

describe('No account is hard-coded into application code', () => {
  it('none of the new/changed platform-admin files contain a literal email address', () => {
    const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/
    for (const [name, source] of [
      ['route.ts', adminRoute],
      ['page.tsx', adminPage],
      ['platform-admin.ts', platformAdminLib],
      ['usePlatformAdmin.ts', usePlatformAdminHook],
      ['migration', migration],
    ] as const) {
      expect(source, `${name} should not contain a literal email address`).not.toMatch(EMAIL_PATTERN)
    }
  })

  it('the migration documents that admin assignment is a manual, out-of-repo SQL statement — never an insert baked into this file', () => {
    expect(migration).toMatch(/manual SQL statement|manual, out-of-repo|never committed/i)
  })
})

describe('Server-side enforcement, not just client-side hiding', () => {
  it('the client hook is explicitly documented as UX-only, not the security boundary', () => {
    expect(usePlatformAdminHook).toMatch(/UX|never the security boundary|not the security boundary/i)
  })

  it('the API route independently re-checks admin status server-side rather than trusting a client flag', () => {
    expect(adminRoute).toContain('isCallerPlatformAdmin')
    expect(adminRoute).not.toMatch(/req\.json\(\)/)
  })
})

describe('lib/admin/platform-admin.ts is the single shared primitive — not duplicated ad hoc', () => {
  it('the route imports isCallerPlatformAdmin from lib/admin/platform-admin rather than re-implementing the query inline', () => {
    expect(adminRoute).toContain("from '../../../../lib/admin/platform-admin'")
  })

  it('the client hook and the server helper both query the same platform_admins table', () => {
    expect(platformAdminLib).toContain("from('platform_admins')")
    expect(usePlatformAdminHook).toContain("from('platform_admins')")
  })
})
