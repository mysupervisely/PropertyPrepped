import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Simplification + Maintenance Workspace V2, Phase E1: mobile header
// one-row fix + primary nav reduction (Dashboard/Maintenance/PropCrew/
// Tax Center) + dashboard simplification (Needs Your Attention/
// Portfolio Snapshot/Recent Activity). Source-read regression guards,
// matching this repo's established no-jsdom convention (see lib/
// uploads/upload-reliability-wiring.test.ts for the direct precedent
// this file follows).

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const headerSource = readFile('components/AuthHeader.tsx')
const authNavMenuSource = readFile('components/AuthNavMenu.tsx')
const profileButtonSource = readFile('components/ProfileEntryButton.tsx')
const pageSource = readFile('app/page.tsx')
const globalsCss = readFile('app/globals.css')

// Mobile V2 (navigation simplification) removed the fixed mobile
// bottom nav this describe block originally tested in detail
// (components/MobileBottomNav.tsx — Dashboard/Maintenance/PropCrew/
// Tax Center, exactly four destinations) — the component is deleted,
// so there is nothing left to assert about ITS internal logic
// (active-state matching, icon imports, the onDashboardNavigate
// single-page-app mechanism, etc). What actually matters —
// reachability of those four destinations — is covered by the
// "Removed destinations are mobile-primary-nav-only" describe block
// below (unchanged by this revision) and by
// lib/dashboard/mobile-header-dashboard-polish-e1-1-wiring.test.ts's
// own guard against AuthNavMenu's NAV_LINKS.
describe('The fixed mobile bottom nav is gone (Mobile V2), not merely restyled', () => {
  it('components/MobileBottomNav.tsx no longer exists', () => {
    expect(() => readFile('components/MobileBottomNav.tsx')).toThrow()
  })

  it('AuthHeader no longer imports or renders it (a historical mention in a comment explaining the removal is fine)', () => {
    expect(headerSource).not.toMatch(/import \{ MobileBottomNav \}/)
    expect(headerSource).not.toMatch(/<MobileBottomNav/)
  })

  it('the hideMobileNav prop (a no-op once the bar it hid no longer exists) is gone from AuthHeader and every call site', () => {
    expect(headerSource).not.toContain('hideMobileNav')
    for (const page of ['app/pricing/page.tsx', 'app/privacy/page.tsx', 'app/terms/page.tsx', 'app/admin/realtor-leads/page.tsx', 'app/admin/subscriptions/page.tsx']) {
      expect(readFile(page)).not.toContain('hideMobileNav')
    }
  })
})

// Phase E1.1 superseded Phase E1's own header decision here: E1 made
// the hamburger reachable on mobile again (since "More" left the
// bottom bar); E1.1 then removed the mobile hamburger a second time,
// this time for real, in favor of the profile avatar as the mobile
// menu opener. Property Overview + Pricing Polish V1 went one step
// further and removed the hamburger ENTIRELY, from every breakpoint —
// see lib/user-profile/profile-entry-point-wiring.test.ts for that side
// of the invariant. Documents/Investment Tools/Pricing/+Add Property/
// Log out are still reachable on every width — just via the avatar.
describe('The hamburger trigger is gone at every breakpoint, in favor of the avatar', () => {
  it('no hamburger-hiding media query remains — there is no hamburger left to hide', () => {
    expect(globalsCss).not.toMatch(/\.authNavMenuButton\s*\{/)
  })
})

describe('Removed destinations are mobile-primary-nav-only — the routes/features themselves still exist', () => {
  it('/documents, /propcrew, /tax-center are real, unchanged Next.js routes', () => {
    expect(() => readFile('app/documents/page.tsx')).not.toThrow()
    expect(() => readFile('app/propcrew/page.tsx')).not.toThrow()
    expect(() => readFile('app/tax-center/page.tsx')).not.toThrow()
  })

  it('the hamburger menu (AuthNavMenu) still lists Documents, Tax Center, PropCrew, Investment Tools — reachable from every width via the header trigger', () => {
    expect(authNavMenuSource).toContain("{ href: '/documents', label: 'Documents' }")
    expect(authNavMenuSource).toContain("{ href: '/tax-center', label: 'Tax Center' }")
    expect(authNavMenuSource).toContain("{ href: '/propcrew', label: 'PropCrew' }")
    expect(authNavMenuSource).toContain("{ href: '/investment-tools', label: 'Investment Tools' }")
  })

  it('a property\'s own Documents tab (contextual, property-level navigation) is untouched', () => {
    expect(pageSource).toContain("openProperty(property.id, 'Documents', 'Documents')")
  })
})

describe('Profile avatar remains a distinct, always-present entry point (Phase D.2; Property Overview + Pricing Polish V1 made it the single menu trigger at every breakpoint — see profile-entry-point-wiring.test.ts)', () => {
  it('AuthHeader still renders ProfileEntryButton unconditionally', () => {
    expect(headerSource).toContain('<ProfileEntryButton menuOpen={navMenuOpen} onOpenMenu={() => setNavMenuOpen((o) => !o)} />')
  })

  it('the avatar opens the shared tools/account menu at every breakpoint — Profile itself is still reachable, as one of that menu\'s account links', () => {
    expect(profileButtonSource).toContain('onClick={onOpenMenu}')
    expect(profileButtonSource).not.toContain('href="/profile"')
  })
})

describe('Mobile header one-row fix (Phase E1.1, Section 1)', () => {
  // Phase E1.1 removed the mobile hamburger (freeing real row width)
  // and shortened Smart Upload's mobile label, then relaxed the
  // remaining shrink values back toward comfortable sizing rather than
  // the tightest fit Phase E1 needed — "intentionally designed, not
  // squeezed." Still a real, measured-with-Chromium fix, just updated
  // numbers and one fewer element to fit.
  it('a Phase E1.1 mobile rule sizes the avatar/wordmark/gaps for a comfortable one-row header (no hamburger sizing here anymore — it is hidden on mobile, not shrunk)', () => {
    const rule = globalsCss.match(/@media \(max-width: 430px\) \{\s*\.topbar \{ gap: 10px; \}[\s\S]*?\n\}/)?.[0] || ''
    expect(rule).toContain('.topbarBrandGroup { gap: 8px; }')
    expect(rule).toContain('.profileEntryButton { width: 34px; height: 34px; }')
    expect(rule).toContain('.brand { font-size: 21px; }')
  })

  it('every shrunk control stays a real tap target (32px+, never smaller)', () => {
    expect(globalsCss).not.toMatch(/\.profileEntryButton \{ width: (2\d|[01]?\d)px/)
    expect(globalsCss).not.toMatch(/\.headerSearchButton \{ width: (2\d|[01]?\d)px/)
  })

  it('Phase B.1\'s wrap fallback (the safety net for genuinely narrow devices) is still present, unremoved', () => {
    expect(globalsCss).toContain('.topbar { flex-wrap: wrap; row-gap: 10px; }')
    expect(globalsCss).toContain('.topbarBrandGroup { flex: 1 1 auto; min-width: 0; }')
  })

  // Phase E1.1 deliberately reverses the old "never shortened" rule —
  // see lib/dashboard/mobile-auth-layout-reliability-v1-wiring.test.ts
  // for the full label-swap invariant (both text nodes present, aria-
  // label constant).
  it('Smart Upload\'s mobile label is now "Upload", CSS-toggled with a full "Smart Upload" label for desktop', () => {
    const smartUploadSource = readFile('components/SmartUploadButton.tsx')
    expect(smartUploadSource).toContain('<span className="smartUploadLabelShort">Upload</span>')
    expect(smartUploadSource).toContain('<span className="smartUploadLabelFull">Smart Upload</span>')
  })
})

describe('Dashboard: Needs Your Attention replaces the old standalone PropWatch card', () => {
  it('the old branded PropWatch section/eyebrow/two-panel grid is gone', () => {
    expect(pageSource).not.toContain('<p className="eyebrow">PropWatch</p>')
    expect(pageSource).not.toContain('propWatchCard')
    expect(pageSource).not.toContain('propWatchGrid')
  })

  it('attentionItems/vacancyItems/openMaintenanceItems — the exact same computed arrays — feed ONE flat attentionRows list, not deleted or re-derived', () => {
    expect(pageSource).toContain('const attentionRows = [')
    expect(pageSource).toContain('...attentionItems.map(')
    expect(pageSource).toContain('...vacancyItems.map(')
    expect(pageSource).toContain('...openMaintenanceItems.map(')
  })

  it('upcomingItems is still fully computed (PropWatch\'s underlying intelligence is not deleted) even though the dashboard no longer renders it as a separate panel', () => {
    expect(pageSource).toContain('upcomingItems: limitItems(sortByDaysUntilAscending(upcoming), UPCOMING_LIMIT)')
    expect(pageSource).not.toContain('<h3>Upcoming</h3>')
  })

  it('"View all" only renders when there is more than the compact preview subset — never a dead/no-op action', () => {
    expect(pageSource).toContain('const NEEDS_ATTENTION_PREVIEW_LIMIT = 3')
    expect(pageSource).toContain('attentionRows.length > NEEDS_ATTENTION_PREVIEW_LIMIT &&')
    expect(pageSource).toContain("{showAllAttention ? 'Show less' : 'View all'}")
  })

  it('a real, calm compact empty state when nothing needs attention — not a large empty card', () => {
    expect(pageSource).toContain('<p className="muted needsAttentionEmpty">You&apos;re all caught up.</p>')
  })

  // Section 7 originally kept a dashboard Quick Actions row explicitly
  // out of scope. Mobile V2 Area A reverses that scoping decision on
  // purpose — a mobile-only Quick Actions row (Add Expense/Add
  // Property/View Maintenance/Invite Tenant) was added to the
  // dashboard, each one routing to an existing workflow rather than
  // inventing a new one. This guard now checks the opposite of what it
  // used to: that the row exists, is CSS-scoped to mobile (hidden by
  // default, shown only under the mobile breakpoint), and that none of
  // its four actions duplicate backend logic that already exists
  // elsewhere in this file.
  //
  // Mobile V2 (Quick Actions redesign): the four rendered shortcuts are
  // no longer hardcoded JSX — they're data-driven from quickActions
  // (persisted, customizable, defaulting to DEFAULT_QUICK_ACTIONS) via
  // renderQuickAction()/quickActionNav() above. This guard now checks
  // that layer: the row exists, is CSS-scoped to mobile, is backed by
  // the shared lib/dashboard/quick-actions.ts catalog (not a second,
  // page-local one), and that every one of quickActionNav()'s own
  // branches points at a real, pre-existing route or handler rather
  // than inventing new navigation.
  it('a mobile-only, customizable dashboard Quick Actions row exists (Mobile V2) and every catalog action reuses an existing workflow rather than duplicating one', () => {
    expect(pageSource).toContain('<section className="mobileQuickActions">')
    expect(globalsCss).toContain('.mobileQuickActions { display: none; }')
    expect(pageSource).toContain("from '../lib/dashboard/quick-actions'")
    expect(pageSource).toContain('{quickActions.map((id) => renderQuickAction(id))}')
    expect(pageSource).toContain('function quickActionNav(id: QuickActionId)')
    expect(pageSource).toContain("case 'add_expense': return { kind: 'link', href: '/tax-center?add=expense' }")
    expect(pageSource).toContain("case 'tax_center': return { kind: 'link', href: '/tax-center' }")
    expect(pageSource).toContain("case 'maintenance': return { kind: 'link', href: '/maintenance' }")
    expect(pageSource).toContain("case 'propcrew': return { kind: 'link', href: '/propcrew' }")
    expect(pageSource).toContain("case 'add_property': return { kind: 'link', href: '/?add=property' }")
    expect(pageSource).toContain("case 'smart_upload': return { kind: 'button', onClick: openSmartUpload }")
    expect(pageSource).toContain("case 'invite_tenant': return { kind: 'button', onClick: startTenantConnectQuickAction }")
    expect(pageSource).toContain("case 'tenant_messages': return { kind: 'button', onClick: startTenantConnectQuickAction }")
  })

  it('a "Customize" control opens a sheet requiring exactly 4 selections, with a Restore Defaults option, and never renders the default set until a save actually succeeds', () => {
    expect(pageSource).toContain('<button type="button" className="mobileQuickActionsCustomize" onClick={openQuickActionsCustomize}>Customize</button>')
    expect(pageSource).toContain('disabled={quickActionsSaving || quickActionsDraft.length !== QUICK_ACTION_SELECTION_SIZE}')
    expect(pageSource).toContain('onClick={restoreDefaultQuickActions}')
    expect(pageSource).toContain('setQuickActions(next)')
    expect(pageSource).toContain('setQuickActionsCustomizeOpen(false)')
  })
})

describe('Portfolio Snapshot is unchanged in substance (Section 4) — same four-metric shape, quieter toggle only', () => {
  it('still exactly four metrics, no charts — Property Intelligence V1, Phase D (Portfolio Snapshot V1) replaced WHICH four (Properties/Portfolio Value/Monthly Rent/YTD NOI, canonical-data-backed) but not the "four quiet tiles, no analytics panel" shape this section originally established; see property-intelligence-v1-phase-d-wiring.test.ts for everything about the new content', () => {
    expect(pageSource).toContain('<span>Portfolio Value</span>')
    expect(pageSource).toContain('<span>Monthly Rent</span>')
    expect(pageSource).not.toMatch(/<canvas|<svg.*chart|Chart\.js|recharts/i)
  })

  it('the Hide/Show toggle still works the same way, just visually quieter (no bordered white pill)', () => {
    expect(pageSource).toContain('onClick={toggleSnapshotExpanded} aria-expanded={snapshotExpanded}')
    expect(globalsCss).toContain('.snapshotToggle { flex-shrink: 0; border: 0; background: transparent;')
  })
})

describe('My Properties stays Dashboard\'s portfolio entry point (Section 5)', () => {
  it('property cards still open the same property workspace, unredesigned', () => {
    expect(pageSource).toContain('<h2>My Properties</h2>')
    expect(pageSource).toContain('onClick={() => openProperty(property.id)}')
  })
})

describe('Recent Activity: collapsible, default collapsed, same underlying data (Section 6)', () => {
  it('is a native <details>/<summary> disclosure — collapsed by default (no `open` attribute), no viewport-detection JS', () => {
    expect(pageSource).toContain('<details className="recentActivityDetails">')
    expect(pageSource).not.toContain('<details className="recentActivityDetails" open>')
  })

  it('renders the exact same recentActivity array this page already computed — not redesigned/re-derived', () => {
    const idx = pageSource.indexOf('<details className="recentActivityDetails">')
    const body = pageSource.slice(idx, pageSource.indexOf('</details>', idx))
    expect(body).toContain('recentActivity.map((item) =>')
    expect(body).toContain('relativeTime(item.timestamp)')
  })

  it('a plain CSS Show/Hide affordance, no JS-driven label swap', () => {
    expect(globalsCss).toContain("content: 'Show'")
    expect(globalsCss).toContain(".recentActivityDetails[open] .recentActivitySummary::after { content: 'Hide'; }")
  })
})

describe('No horizontal overflow / tenant-provider-public isolation (unchanged invariants, re-asserted for E1)', () => {
  it('.shell still clips horizontal overflow', () => {
    expect(globalsCss).toContain('.shell { max-width: 1220px; margin: 0 auto; padding: 0 28px 70px; overflow-x: hidden; }')
  })

  // Superseded by Mobile V2 — MobileBottomNav is deleted, so there is
  // no longer anything for tenant/provider/public pages to NOT import;
  // this now just confirms the removal is total (no stray reference
  // left anywhere outside this file's own historical comments).
  it('no page imports or references the deleted MobileBottomNav component', () => {
    const tenantSource = readFile('app/tenant/page.tsx')
    const providerSource = readFile('app/provider/[token]/page.tsx')
    expect(tenantSource).not.toContain('MobileBottomNav')
    expect(providerSource).not.toContain('MobileBottomNav')
    expect(pageSource).not.toContain('MobileBottomNav')
  })
})

describe('No em dash in E1\'s new/modified user-facing copy', () => {
  // navSource (components/MobileBottomNav.tsx) is gone — its four
  // labels now live in AuthNavMenu's NAV_LINKS instead, checked there.
  it('the new Needs Your Attention / Recent Activity / hamburger-nav copy uses no em dash', () => {
    for (const label of ['Needs Your Attention', 'Recent Activity', 'View all', 'Show less', 'Dashboard', 'Maintenance', 'PropCrew', 'Tax Center']) {
      expect(pageSource + authNavMenuSource).not.toContain(`${label}—`)
    }
  })
})
