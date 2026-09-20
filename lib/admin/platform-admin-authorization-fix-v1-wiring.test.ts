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
const realtorLeadsPage = readFile('app/admin/realtor-leads/page.tsx')
const diagnosticsRoute = readFile('app/api/document-intelligence/analyze/route.ts')
const reconcileRoute = readFile('app/api/admin/reconcile-current-period-end/route.ts')

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

  it('the reconciliation route also reuses isCallerPlatformAdmin — a second admin surface, not a second admin mechanism', () => {
    expect(reconcileRoute).toContain("from '../../../../lib/admin/platform-admin'")
    expect(reconcileRoute).toContain('isCallerPlatformAdmin')
  })
})

describe('Completing the migration: realtor-leads no longer uses plan as an admin credential', () => {
  it('the realtor-leads page uses usePlatformAdmin, not useSubscription/plan', () => {
    expect(realtorLeadsPage).not.toContain('useSubscription')
    expect(realtorLeadsPage).not.toMatch(/plan\s*===\s*['"]owner['"]/)
    expect(realtorLeadsPage).toContain('usePlatformAdmin')
    expect(realtorLeadsPage).toContain('isPlatformAdmin')
  })

  it('the migration replaces BOTH realtor_leads admin RLS policies (select and update) to check platform_admins instead of plan', () => {
    const selectIdx = migration.indexOf('"realtor_leads_admin_select"')
    const updateIdx = migration.indexOf('"realtor_leads_admin_update"')
    expect(selectIdx).toBeGreaterThan(-1)
    expect(updateIdx).toBeGreaterThan(-1)
    const block = migration.slice(selectIdx, updateIdx + 2000)
    expect(block).not.toMatch(/plan\s*=\s*'owner'/)
    expect((block.match(/from public\.platform_admins/g) || []).length).toBeGreaterThanOrEqual(2)
  })
})

describe('Completing the migration: document-intelligence diagnostics no longer uses plan as an admin credential', () => {
  it('diagnosticsAuthorized is derived from isCallerPlatformAdmin, not resolveEffectivePlan/plan', () => {
    const lineIdx = diagnosticsRoute.split('\n').findIndex((line) => line.includes('diagnosticsAuthorized ='))
    expect(lineIdx).toBeGreaterThan(-1)
    const line = diagnosticsRoute.split('\n')[lineIdx]
    expect(line).toContain('isCallerPlatformAdmin')
    expect(line).not.toContain("=== 'owner'")
  })

  it('the entitlements computation itself is untouched — still fully plan-based, exactly as before (only the admin gate moved)', () => {
    expect(diagnosticsRoute).toContain('resolveEffectivePlan(subForEntitlements)')
    expect(diagnosticsRoute).toContain('entitlementsFor(effectivePlan)')
  })
})

describe('supabase/schema.sql\'s realtor_leads reference copy was kept in sync (not just the standalone milestone file)', () => {
  const schemaSource = readFile('supabase/schema.sql')

  it('the consolidated schema reference no longer contains a plan-based realtor_leads admin policy', () => {
    const selectIdx = schemaSource.indexOf('"realtor_leads_admin_select"')
    const updateIdx = schemaSource.indexOf('"realtor_leads_admin_update"')
    expect(selectIdx).toBeGreaterThan(-1)
    expect(updateIdx).toBeGreaterThan(-1)
    const block = schemaSource.slice(selectIdx, updateIdx + 800)
    expect(block).not.toMatch(/plan\s*=\s*'owner'/)
    expect(block).toContain('public.platform_admins')
  })
})

describe('Repository-wide regression: no customer subscription plan — including the internal owner plan — can grant platform-admin access anywhere', () => {
  // This is the direct regression test the follow-up asked for: every
  // known authorization surface in the app is asserted here to never
  // read user_subscriptions.plan (or resolveEffectivePlan's result) as
  // an admin credential. A future PR that reintroduces
  // `plan === 'owner'` as an authorization check on any of these files
  // will fail this test.
  // Route files carry no unrelated "owner" display copy, so a blanket
  // file-wide check is precise enough for them.
  const routeSurfaces: Record<string, string> = {
    'app/api/admin/subscriptions/route.ts': adminRoute,
    'app/api/admin/reconcile-current-period-end/route.ts': reconcileRoute,
  }

  it('neither admin route gates access on a plan comparison', () => {
    for (const [name, source] of Object.entries(routeSurfaces)) {
      expect(source, `${name} should not gate access on a billing plan`).not.toMatch(/plan\s*===\s*['"]owner['"]/)
      expect(source, `${name} should not gate access on resolveEffectivePlan`).not.toMatch(/resolveEffectivePlan.*===\s*['"]owner['"]/)
    }
  })

  // The two pages both render a subscriber/lead's own "owner" PLAN as
  // display copy elsewhere on the page (legitimate — e.g. the admin
  // subscriptions table's plan column) — so their AUTHORIZATION gate
  // specifically (the `const authorized = ...` line) is checked instead
  // of the whole file, the same precise pattern already used above for
  // app/admin/subscriptions/page.tsx.
  it('neither admin page\'s "authorized" gate is derived from a plan comparison', () => {
    for (const [name, source] of [['app/admin/subscriptions/page.tsx', adminPage], ['app/admin/realtor-leads/page.tsx', realtorLeadsPage]] as const) {
      const gateLine = source.split('\n').find((line) => line.includes('const authorized ='))
      expect(gateLine, `${name} should define \`const authorized =\``).toBeDefined()
      expect(gateLine, `${name}'s authorized gate should not reference plan`).not.toMatch(/plan/i)
    }
  })

  it('the document-intelligence diagnostics gate specifically does not use its own (legitimately plan-based) effectivePlan variable for authorization', () => {
    const authLine = diagnosticsRoute.split('\n').find((line) => line.includes('diagnosticsAuthorized ='))
    expect(authLine).not.toContain('effectivePlan')
  })

  it('every known admin surface instead uses the same shared isCallerPlatformAdmin/usePlatformAdmin primitive', () => {
    expect(adminRoute).toContain('isCallerPlatformAdmin')
    expect(reconcileRoute).toContain('isCallerPlatformAdmin')
    expect(diagnosticsRoute).toContain('isCallerPlatformAdmin')
    expect(adminPage).toContain('usePlatformAdmin')
    expect(realtorLeadsPage).toContain('usePlatformAdmin')
  })
})
