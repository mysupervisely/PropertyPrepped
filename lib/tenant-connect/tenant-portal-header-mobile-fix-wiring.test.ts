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

describe('Accept Invitation — TEMPORARY diagnostic (bc8527e) removed now that real-device testing confirms the flow works end-to-end', () => {
  const fnBody = tenantPageSource.slice(
    tenantPageSource.indexOf('async function acceptInvite'),
    tenantPageSource.indexOf('if (loading) return'),
  )

  it('the RPC arg key is exactly p_access_id, and accessId is passed unmodified — no transform between the rendered row id and the RPC call', () => {
    expect(fnBody).toContain("supabase.rpc('accept_tenant_invite', { p_access_id: accessId })")
  })

  it('the diagnostic (getUser/getSession + the appended error text) is gone — normal error handling only', () => {
    expect(fnBody).not.toMatch(/supabase\.auth\.getUser\(\)|supabase\.auth\.getSession\(\)|diag/)
    expect(fnBody).toContain('setError(err.message)')
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

describe('Tenant Portal tab bar — mobile overflow fix (real iPhone: "Documents", the 5th tab, was clipped off the right edge)', () => {
  it('all five tabs still render, unchanged', () => {
    expect(tenantPageSource).toContain("const TENANT_VIEWS: TenantView[] = ['My Rental', 'Lease', 'Rent', 'Requests', 'Documents']")
  })

  it('the tab bar stays horizontally scrollable and cannot itself grow past its container', () => {
    const rule = globalsCssSource.slice(
      globalsCssSource.indexOf('.tenantPortalTabs {'),
      globalsCssSource.indexOf('.tenantPortalTabs button {'),
    )
    expect(rule).toContain('overflow-x: auto')
    expect(rule).toContain('max-width: 100%')
    expect(rule).toContain('-webkit-overflow-scrolling: touch')
  })

  it('the shell is a hard backstop against page-level horizontal overflow', () => {
    const rule = globalsCssSource.slice(
      globalsCssSource.indexOf('.tenantPortalShell {'),
      globalsCssSource.indexOf('.tenantPortalShell {') + 200,
    )
    expect(rule).toContain('overflow-x: hidden')
  })

  it('desktop behavior is preserved — tabs still spread full-width via flex-grow when they fit', () => {
    expect(globalsCssSource).toContain('.tenantPortalTabs button { flex: 1 0 auto;')
  })

  it('text size is not shrunk excessively at phone width (still a readable button label size)', () => {
    const anchor = globalsCssSource.indexOf('.tenantPortalShell { padding: 0 14px 50px')
    const mobileBlock = globalsCssSource.slice(anchor, anchor + 300)
    const match = /\.tenantPortalTabs button \{ font-size: ([\d.]+)px/.exec(mobileBlock)
    expect(match).toBeTruthy()
    expect(Number(match![1])).toBeGreaterThanOrEqual(12)
  })
})
