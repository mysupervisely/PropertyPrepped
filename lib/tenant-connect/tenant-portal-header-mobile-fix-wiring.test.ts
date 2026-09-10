import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// PropRoster — Tenant Portal header mobile overflow fix. Split out from
// the now-removed Migration 30 whitespace-theory investigation (that
// theory was disproven by production diagnostics — see PR #60 history —
// but this CSS-only fix is independent of it and stands on its own).
// Source-read regression guard, matching this repo's established
// no-jsdom convention (see lib/tenant-connect/tenant-connect-v1-wiring.test.ts).

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const globalsCssSource = readFile('app/globals.css')
const tenantPageSource = readFile('app/tenant/page.tsx')

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

describe('Accept Invitation — TEMPORARY diagnostic (PR #60 real-device "This invite is not available to accept." investigation)', () => {
  it('the RPC arg key is exactly p_access_id, and accessId is passed unmodified — no transform between the rendered row id and the RPC call', () => {
    const fnBody = tenantPageSource.slice(
      tenantPageSource.indexOf('async function acceptInvite'),
      tenantPageSource.indexOf('if (loading) return'),
    )
    expect(fnBody).toContain("supabase.rpc('accept_tenant_invite', { p_access_id: accessId })")
  })

  it('the diagnostic never logs a token, refresh token, JWT, or any other secret — only access id / auth user id / auth email / session-exists', () => {
    const fnBody = tenantPageSource.slice(
      tenantPageSource.indexOf('async function acceptInvite'),
      tenantPageSource.indexOf('if (loading) return'),
    )
    expect(fnBody).not.toMatch(/access_token|refresh_token|\.session\.access_token/i)
    expect(fnBody).toContain('supabase.auth.getUser()')
    expect(fnBody).toContain('supabase.auth.getSession()')
    expect(fnBody).toContain('Boolean(sessionData.session)')
  })

  it('the diagnostic only appends to the existing error banner on failure — the success path is unchanged', () => {
    const fnBody = tenantPageSource.slice(
      tenantPageSource.indexOf('async function acceptInvite'),
      tenantPageSource.indexOf('if (loading) return'),
    )
    expect(fnBody).toContain("setError(err.message + diag)")
  })

  it('the button click passes the exact tenant_property_access.id of the rendered row, not the URL ?invite= param', () => {
    const jsxBody = tenantPageSource.slice(
      tenantPageSource.indexOf('{pendingRows.map((a)'),
      tenantPageSource.indexOf('{!selected ?'),
    )
    expect(jsxBody).toContain('onClick={() => void acceptInvite(a.id)}')
    expect(jsxBody).not.toMatch(/inviteHint|URLSearchParams/)
  })
})
