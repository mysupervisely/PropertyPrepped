import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// PropRoster — PR #60 final mobile/routing polish. Source-read
// regression guards, matching this repo's established no-jsdom
// convention (see lib/dashboard/dashboard-navigation.test.ts for the
// direct precedent). Covers the two app/page.tsx fixes in this pass:
// tenant-first routing, and the "Invalid Date" on a tenant-submitted
// maintenance request in Needs Your Attention.

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const homeSource = readFile('app/page.tsx')

describe('Tenant-first routing — an authenticated user with active tenant access and zero owned properties lands on /tenant, not an empty landlord dashboard', () => {
  it('checks tenant_property_access for an Active row, scoped by RLS, before ever redirecting', () => {
    const idx = homeSource.indexOf('// Tenant-first routing (PR #60 mobile/routing polish). Owner and')
    expect(idx).toBeGreaterThan(-1)
    const block = homeSource.slice(idx, idx + 1600)
    expect(block).toContain("supabase.from('tenant_property_access').select('id').eq('status', 'Active').limit(1)")
    expect(block).toContain("window.location.href = '/tenant'")
  })

  it('never redirects while properties are still loading, or before the portfolio has genuinely finished loading', () => {
    const idx = homeSource.indexOf('// Tenant-first routing (PR #60 mobile/routing polish). Owner and')
    const block = homeSource.slice(idx, idx + 1600)
    expect(block).toContain('if (!supabase || !user || !hasLoadedPortfolio) return')
  })

  it('never redirects a dual-role account (owns at least one property) — landlord routing is unchanged', () => {
    const idx = homeSource.indexOf('// Tenant-first routing (PR #60 mobile/routing polish). Owner and')
    const block = homeSource.slice(idx, idx + 1600)
    expect(block).toContain('if (properties.length > 0) return')
  })

  it('fires at most once per sign-in (bounded by a ref reset alongside autoRetriedRef, not on every properties.length change)', () => {
    expect(homeSource).toContain('const tenantFirstRoutingCheckedRef = useRef(false)')
    expect(homeSource).toContain('tenantFirstRoutingCheckedRef.current = false')
    expect(homeSource).toContain('if (tenantFirstRoutingCheckedRef.current) return')
    expect(homeSource).toContain('tenantFirstRoutingCheckedRef.current = true')
  })

  it('this is a routing decision only — no role column, no mutation, never writes to tenant_property_access or properties', () => {
    const idx = homeSource.indexOf('// Tenant-first routing (PR #60 mobile/routing polish). Owner and')
    const block = homeSource.slice(idx, idx + 1600)
    expect(block).not.toMatch(/\.insert\(|\.update\(|\.delete\(/)
  })
})

describe('"Invalid Date" fix — a tenant-submitted maintenance request\'s timestamp now renders correctly in Needs Your Attention', () => {
  it('dateOnly() now handles a full ISO timestamp (tenant_requests.created_at) as well as a bare DATE string', () => {
    const idx = homeSource.indexOf('const dateOnly = (value: string) => {')
    expect(idx).toBeGreaterThan(-1)
    const block = homeSource.slice(idx, idx + 300)
    expect(block).toContain('value.length > 10 ? new Date(value) : new Date(`${value}T12:00:00`)')
  })

  it('falls back to a safe, human-readable placeholder instead of ever rendering "Invalid Date" again', () => {
    const idx = homeSource.indexOf('const dateOnly = (value: string) => {')
    const block = homeSource.slice(idx, idx + 300)
    expect(block).toContain('Number.isNaN(parsed.getTime())')
    expect(block).not.toMatch(/Invalid Date/)
  })

  it('does not touch appointment proposed_local_start_at / Scheduling Coordination V1 timezone logic', () => {
    const idx = homeSource.indexOf('const dateOnly = (value: string) => {')
    const block = homeSource.slice(idx, idx + 300)
    expect(block).not.toMatch(/proposed_local_start_at|matchProposedTime/)
  })

  it('the underlying field is still tenant_requests.created_at, passed straight through by buildTenantRequestDateItems — the fix is in the formatter, not a new field', () => {
    const requestsSource = readFile('lib/tenant-connect/requests.ts')
    expect(requestsSource).toContain('date: r.created_at,')
  })
})
