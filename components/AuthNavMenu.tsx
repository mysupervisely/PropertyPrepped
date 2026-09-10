'use client'

// PropRoster — authenticated navigation foundation, now the PRIMARY
// navigation mechanism for the whole app (Authenticated Header
// Simplification): the header itself only shows a hamburger, the
// wordmark and Smart Upload (see components/AuthHeader.tsx) — every
// other destination, plus the account-level actions that used to be
// boxed buttons scattered across two hand-built topbars, live here
// instead. Additive only (nothing existing is removed, only relocated)
// and deliberately small — do not overbuild.
//
// Only real, live destinations are listed (do not create dead links to
// unfinished features) — no Tax Center, Savings Center, Smart Upload,
// etc. "+ Add Property" is a real action (opens the same add-property
// flow the dashboard's "My Properties" section also exposes directly —
// see app/page.tsx), not a nav destination, so it gets its own visual
// treatment; "Log out" is visually separated at the bottom since it ends
// the session rather than navigating anywhere.
//
// Deliberately does NOT show the signed-in user's email — Part 9's
// privacy requirement ("do not expose the authentication email in the
// hamburger menu unless there is a compelling account-management
// reason"); that's the Profile page's job, not global navigation's.

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthUser } from '../lib/useAuthUser'
// Simplification + Maintenance Workspace V2, Phase D.2: the profile
// photo moved out to its own, separate ProfileEntryButton — see that
// component's header comment for why "me" and "PropRoster tools" are
// now two different buttons instead of one doing both jobs. This
// menu's own trigger goes back to being a plain glyph.

// Property-First Simplification V2: pared down further to the
// hierarchy the milestone specifies — Dashboard/Documents/Tax
// Center/PropCrew/Investment Tools as the major, equal-weight
// destinations (properties themselves dominate Dashboard; Documents,
// Tax Center and PropCrew are the portfolio-wide views that genuinely
// need one, per the "property is the center of the product" principle),
// then Profile/Pricing visually de-emphasized as account-level
// destinations (see .authNavMenuSecondary in globals.css).
//
// REMOVED from this list (not deleted from the app — see each route's
// own file for what's preserved):
// - Rent Ledger: rent management now belongs inside a property's own
//   Rent tab (app/page.tsx). /rent-ledger still exists and works as a
//   compatibility route for old links/bookmarks; it's just no longer a
//   primary navigation destination.
// - Portfolio Import: no longer a permanent top-level feature. Its
//   functionality (and AI pipeline) is untouched — it's now offered
//   contextually from the Add Property flow ("Import existing
//   portfolio" — see app/page.tsx's Add Property modal) instead of
//   living in this menu.
// Search stays out of this list entirely (a header icon — see
// components/AuthHeader.tsx).
const NAV_LINKS: { href: string; label: string }[] = [
  { href: '/', label: 'Dashboard' },
  // Documents + Navigation + Realtor Connect Polish: the portfolio-wide
  // document library — every property_documents row the caller owns,
  // including ones Smart Upload/Portfolio Import left unassigned.
  { href: '/documents', label: 'Documents' },
  // Tenant Connect + Maintenance Coordination M3: portfolio-wide view
  // across every property's maintenance_requests, same table each
  // property workspace's own Rent > Tenant tab already reads/writes —
  // not a second maintenance system.
  { href: '/maintenance', label: 'Maintenance' },
  // Tax Center V1: organizes the SAME ledger data property-level Rent
  // ledgers write to, by tax year.
  { href: '/tax-center', label: 'Tax Center' },
  // PropCrew stays portfolio-wide (Part 3): the same provider can serve
  // multiple properties, so a single master directory — distinct from
  // Rent Ledger, which genuinely duplicated property-level data.
  { href: '/propcrew', label: 'PropCrew' },
  { href: '/investment-tools', label: 'Investment Tools' },
]

// Account-level destinations — visually separated/lower priority (its
// own divider + .authNavMenuSecondary styling), never equal-weight
// top-level destinations.
const ACCOUNT_LINKS: { href: string; label: string }[] = [
  { href: '/profile', label: 'Profile' },
  { href: '/pricing', label: 'Pricing' },
]

// Simplification + Maintenance Workspace V2, Phase D.1: open/close is
// now a CONTROLLED prop pair rather than this component's own internal
// state — components/AuthHeader.tsx (this component's one real call
// site) needs to open the exact same panel from a second trigger, the
// new mobile bottom nav's "More" button, not a duplicate menu. See
// components/MobileBottomNav.tsx's own header comment for why "More"
// reuses this panel wholesale instead of building a second one.
export function AuthNavMenu({ onDashboardNavigate, open, onOpenChange }: { onDashboardNavigate?: () => void; open: boolean; onOpenChange: (open: boolean) => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const { user } = useAuthUser()

  // Tenant-Facing Experience V1 (dual-role) — Owner and Tenant are not
  // mutually exclusive account types, so a landlord account that ALSO
  // has tenant access somewhere (active, or a pending invite waiting to
  // be accepted) gets a lightweight way to reach that other context —
  // the "smallest clear navigation behavior necessary," not a role-
  // management system. RLS alone decides what this query actually
  // returns (tenant_access_select — see supabase/schema.sql); this is
  // purely "should the link render," never an access decision itself.
  const [hasTenantAccess, setHasTenantAccess] = useState(false)
  useEffect(() => {
    if (!supabase || !user) { setHasTenantAccess(false); return }
    let cancelled = false
    supabase.from('tenant_property_access').select('id').limit(1).then(({ data }) => {
      if (!cancelled) setHasTenantAccess(Boolean(data && data.length))
    })
    return () => { cancelled = true }
  }, [user?.id])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) onOpenChange(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="authNavMenu" ref={containerRef}>
      <button type="button" className="authNavMenuButton" aria-label="Open navigation menu" aria-haspopup="true" aria-expanded={open} onClick={() => onOpenChange(!open)}>
        <span aria-hidden="true">☰</span>
      </button>
      {/* Phase D.1: a backdrop behind the panel — only visually present
          at mobile widths (see globals.css), where the panel becomes a
          bottom sheet the "More" bottom-nav button can also open. Tap
          it to dismiss, same as the existing outside-click handler. */}
      {open && <div className="authNavMenuBackdrop" onClick={() => onOpenChange(false)} />}
      {open && (
        <nav className="authNavMenuPanel" aria-label="Main navigation">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={(e) => {
                onOpenChange(false)
                // Dashboard Navigation Bug fix: the property workspace
                // (app/page.tsx) is a single-page app living entirely at
                // "/" — a normal Link to "/" while ALREADY on "/" is a
                // same-route no-op in Next.js, so it never cleared the
                // page's own selectedId state, and "Dashboard" silently
                // failed to leave the property detail view (the user had
                // to use "All Properties" instead, which calls
                // setSelectedId(null) directly). onDashboardNavigate is
                // that exact same reset — app/page.tsx passes its
                // onBrandClick (already wired for the wordmark for this
                // identical reason) down through AuthHeader only when
                // it's rendering the property workspace, so this only
                // ever fires there; every other page (Pricing, Profile,
                // Search, …) has no callback and gets ordinary Link
                // navigation to "/", which already works correctly since
                // it's a real route change.
                if (link.href === '/' && onDashboardNavigate) {
                  e.preventDefault()
                  onDashboardNavigate()
                }
              }}
            >
              {link.label}
            </Link>
          ))}
          <div className="authNavMenuDivider" role="separator" />
          {ACCOUNT_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="authNavMenuSecondary" onClick={() => onOpenChange(false)}>{link.label}</Link>
          ))}
          {hasTenantAccess && (
            <Link href="/tenant" className="authNavMenuSecondary" onClick={() => onOpenChange(false)}>Tenant Portal</Link>
          )}
          <Link href="/?add=property" className="authNavMenuAction" onClick={() => onOpenChange(false)}>+ Add Property</Link>
          <div className="authNavMenuDivider" role="separator" />
          <button type="button" className="authNavMenuLogout" onClick={() => { onOpenChange(false); void supabase?.auth.signOut() }}>Log out</button>
        </nav>
      )}
    </div>
  )
}
