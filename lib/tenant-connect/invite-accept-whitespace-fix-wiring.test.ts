import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// PropRoster — Tenant Invite Acceptance Whitespace Hardening (Migration
// 30). Source-read regression guards, matching this repo's established
// no-jsdom convention (see lib/tenant-connect/tenant-connect-v1-wiring.test.ts
// and lib/tenant-connect/tenant-facing-experience-v1-wiring.test.ts for
// the direct precedent this file extends). Covers the real-device bug:
// a correctly-delivered, correctly-recognized invite still failed
// acceptance with "This invite is not available to accept." because
// accept_tenant_invite()'s SQL comparison trimmed neither side, unlike
// every application-side write to tenant_property_access.tenant_email.

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const migrationSource = readFile('supabase/milestone-30-tenant-invite-accept-whitespace-fix.sql')
const schemaSource = readFile('supabase/schema.sql')
const globalsCssSource = readFile('app/globals.css')
const tenantPageSource = readFile('app/tenant/page.tsx')

describe('Migration 30 — accept_tenant_invite() and tenant_access_select both trim before comparing emails', () => {
  it('is explicitly marked as not yet applied to production', () => {
    expect(migrationSource).toContain('NOT YET APPLIED TO PRODUCTION')
  })

  it('accept_tenant_invite() compares lower(btrim(tenant_email)) to lower(btrim(v_email)), not a bare lower() compare', () => {
    expect(migrationSource).toContain("lower(btrim(tenant_email)) = lower(btrim(v_email))")
    expect(migrationSource).not.toMatch(/where id = p_access_id[\s\S]*?lower\(tenant_email\) = lower\(v_email\)/)
  })

  it("tenant_access_select's Invited-branch predicate gets the identical btrim() treatment — visibility and acceptance stay consistent", () => {
    expect(migrationSource).toContain(
      "status = 'Invited' and lower(btrim(tenant_email)) = lower(btrim((select auth.jwt() ->> 'email')))",
    )
  })

  it('SECURITY: still requires authentication, still requires status = Invited, still keyed to the one specific p_access_id row — this migration only widens what counts as "the same email", never who can accept what', () => {
    expect(migrationSource).toContain("if v_email is null then")
    expect(migrationSource).toContain("raise exception 'Not authenticated.'")
    expect(migrationSource).toContain("and status = 'Invited'")
    expect(migrationSource).toContain('where id = p_access_id')
    expect(migrationSource).toContain("raise exception 'This invite is not available to accept.'")
  })

  it('never touches lease_id/owner_id/property_id matching, and never removes the unique-live-invite index', () => {
    expect(migrationSource).not.toMatch(/alter table public\.tenant_property_access\s+drop/)
    expect(migrationSource).not.toMatch(/drop index/)
  })

  it('schema.sql (the canonical live-schema mirror) carries the exact same btrim() fix, not just the standalone migration file', () => {
    expect(schemaSource).toContain("lower(btrim(tenant_email)) = lower(btrim(v_email))")
    expect(schemaSource).toContain(
      "status = 'Invited' and lower(btrim(tenant_email)) = lower(btrim((select auth.jwt() ->> 'email')))",
    )
    expect(schemaSource).not.toMatch(/lower\(tenant_email\) = lower\(v_email\)/)
    expect(schemaSource).not.toMatch(/lower\(tenant_email\) = lower\(\(select auth\.jwt\(\) ->> 'email'\)\)/)
  })
})

describe('Tenant Portal header — mobile overflow fix (iPhone: Wordmark | Tenant Portal | Landlord Dashboard | Log out ran past the viewport)', () => {
  it('the header still renders all four elements — nothing is removed, only re-flowed', () => {
    expect(tenantPageSource).toContain('<header className="tenantPortalHeader">')
    expect(tenantPageSource).toContain('<span className="tenantPortalHeaderLabel">Tenant Portal</span>')
    expect(tenantPageSource).toContain('Landlord Dashboard</Link>')
    expect(tenantPageSource).toContain('>Log out</button>')
  })

  it('the header is allowed to wrap onto a second row instead of overflowing horizontally', () => {
    const headerRule = globalsCssSource.slice(
      globalsCssSource.indexOf('.tenantPortalHeader {'),
      globalsCssSource.indexOf('.tenantPortalHeaderLabel {'),
    )
    expect(headerRule).toContain('flex-wrap: wrap')
  })

  it('at phone width, the redundant text label collapses and the remaining actions get room, rather than a full nav redesign', () => {
    const anchor = globalsCssSource.indexOf('.tenantPortalShell { padding: 0 14px 50px')
    const mobileBlock = globalsCssSource.slice(anchor, anchor + 900)
    expect(mobileBlock).toContain('.tenantPortalHeaderLabel { display: none; }')
    expect(mobileBlock).toContain('.tenantPortalSwitchContext, .tenantPortalLogout')
  })

  it('no new mobile nav component was introduced — this is a CSS-only reflow of the existing header markup', () => {
    expect(tenantPageSource).not.toMatch(/tenantPortalMobileMenu|TenantPortalMenu|hamburger/i)
  })
})
