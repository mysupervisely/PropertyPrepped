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

const navSource = readFile('components/MobileBottomNav.tsx')
const headerSource = readFile('components/AuthHeader.tsx')
const authNavMenuSource = readFile('components/AuthNavMenu.tsx')
const profileButtonSource = readFile('components/ProfileEntryButton.tsx')
const pageSource = readFile('app/page.tsx')
const globalsCss = readFile('app/globals.css')

describe('Mobile bottom nav is exactly four destinations', () => {
  it('Dashboard, Maintenance, PropCrew, Tax Center — in that order, nothing else', () => {
    const labels = [...navSource.matchAll(/<span>([^<]+)<\/span>/g)].map((m) => m[1])
    expect(labels).toEqual(['Dashboard', 'Maintenance', 'PropCrew', 'Tax Center'])
  })

  it('Properties is gone as a distinct destination — Dashboard now covers "/" unconditionally, no hasSelectedProperty split', () => {
    expect(navSource).not.toMatch(/>Properties</)
    expect(navSource).not.toContain('isProperties')
    expect(navSource).not.toContain('hasSelectedProperty')
    expect(navSource).toContain("const isDashboard = pathname === '/'")
  })

  it('Documents is gone as a bottom-nav destination (the route itself is untouched elsewhere — see the routes-not-deleted describe block below)', () => {
    expect(navSource).not.toMatch(/>Documents</)
    expect(navSource).not.toContain("href=\"/documents\"")
  })

  it('More is gone — no onMoreClick/moreOpen props, no sheet-trigger button in this component at all', () => {
    expect(navSource).not.toMatch(/>More</)
    expect(navSource).not.toContain('onMoreClick')
    expect(navSource).not.toContain('moreOpen')
  })

  it('routes to the real, existing, unchanged pages — /, /maintenance, /propcrew, /tax-center', () => {
    expect(navSource).toContain('href="/"')
    expect(navSource).toContain('href="/maintenance"')
    expect(navSource).toContain('href="/propcrew"')
    expect(navSource).toContain('href="/tax-center"')
  })

  it('active-state logic: each of the four items lights up on its own exact pathname, no cross-contamination', () => {
    expect(navSource).toContain("const isMaintenance = pathname === '/maintenance'")
    expect(navSource).toContain("const isPropCrew = pathname === '/propcrew'")
    expect(navSource).toContain("const isTaxCenter = pathname === '/tax-center'")
  })

  it('Dashboard still reuses the onDashboardNavigate/onBrandClick single-page-app mechanism (clicking it while already on "/" clears selectedId, not a same-route no-op)', () => {
    expect(navSource).toContain('if (onDashboardNavigate && pathname === \'/\') { e.preventDefault(); onDashboardNavigate() }')
  })

  it('uses hand-authored line icons, not emoji, for every destination', () => {
    expect(navSource).toContain("import { GridIcon, WrenchIcon, PeopleIcon, ReceiptIcon } from './icons/NavIcons'")
    expect(navSource).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u)
  })
})

describe('AuthHeader no longer threads bottom-nav-specific props into MobileBottomNav (Phase E1, unchanged by E1.1)', () => {
  it('MobileBottomNav is called with just onDashboardNavigate', () => {
    expect(headerSource).toContain('<MobileBottomNav onDashboardNavigate={onBrandClick} />')
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

  // Scoped to the dashboard's own JSX (from attentionRows through the
  // end of the file) rather than the whole large file — the property
  // WORKSPACE view (a completely different branch of this same
  // component, for a single selected property) has its own long-
  // standing, unrelated "QUICK ACTIONS" eyebrow (Documents/Photos/
  // Maintenance/Add transaction shortcuts inside one property), which
  // this guard must not flag.
  it('no Quick Actions section was added to the dashboard (Section 7 — explicitly out of scope)', () => {
    const dashboardSource = pageSource.slice(pageSource.indexOf('const attentionRows = ['))
    expect(dashboardSource).not.toMatch(/Quick Actions/i)
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

  it('MobileBottomNav is only ever mounted from AuthHeader — tenant/provider/public pages never import it directly', () => {
    const tenantSource = readFile('app/tenant/page.tsx')
    const providerSource = readFile('app/provider/[token]/page.tsx')
    expect(tenantSource).not.toContain('MobileBottomNav')
    expect(providerSource).not.toContain('MobileBottomNav')
  })
})

describe('No em dash in E1\'s new/modified user-facing copy', () => {
  it('the new Needs Your Attention / Recent Activity / bottom-nav copy uses no em dash', () => {
    for (const label of ['Needs Your Attention', 'Recent Activity', 'View all', 'Show less', 'Dashboard', 'Maintenance', 'PropCrew', 'Tax Center']) {
      expect(pageSource + navSource).not.toContain(`${label}—`)
    }
  })
})
