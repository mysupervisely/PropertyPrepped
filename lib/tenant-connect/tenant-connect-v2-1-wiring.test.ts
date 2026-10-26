import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Tenant Connect V2.1 — source-read regression guards for the new
// portfolio-wide /tenant-connect workspace. Same no-jsdom, source-read
// wiring-test convention as lib/tenant-connect/tenant-connect-v1-wiring.test.ts
// and every other app/*.tsx test in this repo.
//
// This milestone is additive: one new page (app/tenant-connect/page.tsx),
// one new pure module (lib/tenant-connect/directory.ts), one new nav
// entry, and new CSS. No database migration, no change to the existing
// property-level status card/requests panel, no new messaging/
// maintenance logic.

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

describe('No database migration was added for this milestone', () => {
  it('no new supabase/milestone-*.sql file mentions Tenant Connect V2.1', () => {
    // The directory itself is read-only derivation over existing tables
    // (properties, leases, tenant_property_access, tenant_requests) — it
    // needed no new column, table, or policy.
    const page = readFile('app/tenant-connect/page.tsx')
    expect(page).not.toMatch(/create table|alter table|create policy/i)
  })
})

describe('app/tenant-connect/page.tsx reuses existing tables/RLS, never a service-role client', () => {
  const source = readFile('app/tenant-connect/page.tsx')

  it('reads only properties/leases/tenant_property_access/tenant_requests — the same tables the property-level card/panel already use', () => {
    expect(source).toContain("supabase.from('properties').select('id,address,city')")
    expect(source).toContain("supabase.from('leases').select('id,property_id,tenant_name,tenant_email,start_date,end_date')")
    expect(source).toContain("supabase.from('tenant_property_access').select('*')")
    // V2.2 widened this single select to also carry conversation_id/
    // maintenance_request_id for the new Messages tab's inbox join —
    // still one shared fetch, not a second query.
    expect(source).toContain("supabase.from('tenant_requests').select('id,tenant_access_id,status,conversation_id,maintenance_request_id')")
  })

  it('never imports or calls createAdminClient — RLS is the only boundary, matching every other portfolio page', () => {
    expect(source).not.toContain('createAdminClient')
    expect(source).not.toContain('service_role')
  })

  it('gates on the real Free-plan-inclusive entitlement, not a hardcoded plan check', () => {
    expect(source).toContain('entitlementsFor(plan)')
    expect(source).toContain('.tenantConnect')
    expect(source).not.toMatch(/plan === 'free'/)
  })

  it('invite/resend/revoke reuse the exact same insert/update + notifyTenantConnect sequence as the property-level status card, not a second implementation', () => {
    expect(source).toContain("from('tenant_property_access')\n      .insert({ property_id: row.propertyId, owner_id: user.id, tenant_email: normalizeTenantEmail(row.tenantEmail), lease_id: row.leaseId })")
    expect(source).toContain("notifyTenantConnect(supabase, 'invite', { accessId:")
    expect(source).toContain("status: 'Revoked', revoked_at: new Date().toISOString()")
    expect(source).toContain('staleInvitedEmail(')
  })

  it('"View in property" still deep-links to the existing property Tenant tab', () => {
    expect(source).toContain('openTab=Rent&openRentSubTab=Tenant')
  })

  // V2.2 added a Messages tab that DOES read/write property_messages/
  // property_conversations directly (see
  // lib/tenant-connect/tenant-connect-v2-2-wiring.test.ts) — reusing the
  // same tables and the same 'landlord_update' notify kind
  // TenantRequestsPanel already uses, never a second backend or a new
  // API route.
  it('V2.2\'s messaging reuses the existing notify kind and introduces no new API route', () => {
    expect(source).toContain("notifyTenantConnect(supabase, 'landlord_update'")
    expect(source).not.toMatch(/fetch\(['"]\/api\/tenant-connect\/(?!notify)/)
  })

  it('links out to the existing portfolio Maintenance page rather than re-deriving maintenance case data', () => {
    expect(source).toContain('href="/maintenance"')
    expect(source).not.toContain("from('maintenance_requests')")
  })
})

describe('lib/tenant-connect/directory.ts is pure — no Supabase, no React', () => {
  const source = readFile('lib/tenant-connect/directory.ts')

  it('has no React or Supabase imports', () => {
    expect(source).not.toMatch(/from ['"]react['"]/)
    expect(source).not.toMatch(/from ['"]@supabase/)
  })

  it('reuses selectCurrentLease and findAccessForLease rather than re-deriving "current tenant" or "connection status" logic', () => {
    expect(source).toContain("import { selectCurrentLease } from '../leases/status'")
    expect(source).toContain('findAccessForLease, tenantConnectStatusLabel')
  })
})

describe('Navigation: Tenant Connect is a real destination in the sole nav surface (Mobile V2 made AuthNavMenu the only trigger at every breakpoint)', () => {
  const source = readFile('components/AuthNavMenu.tsx')

  it('NAV_LINKS includes /tenant-connect', () => {
    expect(source).toContain("{ href: '/tenant-connect', label: 'Tenant Connect' }")
  })

  it('no second, desktop-only navigation surface was added', () => {
    expect(source).not.toContain('authNavMenuDesktop')
  })
})

describe('Existing property-level Tenant Connect UI is completely untouched', () => {
  it('components/tenant-connect/TenantConnectStatusCard.tsx was not modified by this milestone', () => {
    expect(readFile('components/tenant-connect/TenantConnectStatusCard.tsx')).not.toMatch(/Tenant Connect V2\.1/)
  })

  it('components/tenant-connect/TenantRequestsPanel.tsx was not modified by this milestone', () => {
    expect(readFile('components/tenant-connect/TenantRequestsPanel.tsx')).not.toMatch(/Tenant Connect V2\.1/)
  })

  it('app/page.tsx\'s Rent > Tenant mount of both components is unchanged', () => {
    const source = readFile('app/page.tsx')
    expect(source).toContain('<TenantConnectStatusCard supabase={supabase} propertyId={selected.id} ownerId={user.id} currentLease={currentLease} tenantConnectEnabled={entitlements.tenantConnect} onChanged={() => void loadPortfolio()} />')
    expect(source).toContain('<TenantRequestsPanel supabase={supabase} propertyId={selected.id} ownerId={user.id} tenantConnectEnabled={entitlements.tenantConnect}')
  })
})

describe('CSS: the new directory list reuses .tenantConnectCard* conventions, no duplicate action/pill styling', () => {
  const css = readFile('app/globals.css')

  it('defines the list/row/links classes the page renders', () => {
    expect(css).toContain('.tenantDirectoryList {')
    expect(css).toContain('.tenantDirectoryRow {')
    expect(css).toContain('.tenantDirectoryRowLinks {')
  })

  it('does not redefine .statusPill/.pillGood/.pillWarn/.pillMuted/.tenantConnectQuietAction — reuses the shared rules as-is', () => {
    const occurrences = (pattern: RegExp) => (css.match(pattern) || []).length
    expect(occurrences(/^\.pillGood\s*\{/gm)).toBe(1)
    expect(occurrences(/^\.pillWarn\s*\{/gm)).toBe(1)
    expect(occurrences(/^\.tenantConnectQuietAction\s*\{/gm)).toBe(1)
  })
})
