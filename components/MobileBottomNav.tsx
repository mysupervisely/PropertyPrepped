'use client'

// PropRoster — Simplification + Maintenance Workspace V2, Phase D.1:
// Mobile App Navigation.
//
// A persistent, five-destination bottom navigation bar for mobile —
// GLOBAL navigation (which top-level landlord area am I in), distinct
// from a property's own tab row (CONTEXTUAL navigation inside one
// selected property — Overview/Rent/Maintenance/Details/PropCrew/
// Documents/Tax, unchanged, still rendered by app/page.tsx itself).
// Mounted from components/AuthHeader.tsx — the one shared header every
// primary landlord page already renders — so this needs no per-page
// wiring, the same way the hamburger/Smart Upload button already
// don't. Hidden entirely at desktop widths via CSS (mobileBottomNav
// media query in app/globals.css); AuthHeader itself decides whether
// to render it at all (hideMobileNav — pricing, the admin tool).
//
// Dashboard and Properties both resolve to "/" (app/page.tsx is a
// single-page app: dashboard view and an individual property's
// workspace are the SAME route, distinguished only by local selectedId
// state) — there is no separate "Properties" page to link to without
// inventing a duplicate of the one that already exists. Their ACTIVE
// state is what actually differs: Dashboard lights up on "/" with no
// property selected, Properties lights up on "/" while a property IS
// selected — "a property page can reasonably highlight Properties,"
// per this phase's own brief, and Maintenance is never highlighted
// globally just because the landlord happens to be on an individual
// property's own Maintenance tab (that tab is contextual navigation,
// not this bar's business).
//
// Dashboard reuses the exact SAME onDashboardNavigate/onBrandClick
// mechanism the wordmark and AuthNavMenu's own "Dashboard" link already
// use (see AuthHeader.tsx) — clicking it while already on "/" clears
// selectedId directly instead of a same-route Link no-op.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { GridIcon, HomeIcon, WrenchIcon, DocumentIcon, DotsIcon } from './icons/NavIcons'

// Global landlord destinations reachable only through "More" (the
// existing AuthNavMenu panel this button also opens — see
// AuthHeader.tsx) — used here only to decide when "More" itself should
// read as the active destination, not to build a second menu.
const MORE_PATH_PREFIXES = ['/tax-center', '/propcrew', '/investment-tools', '/profile', '/pricing', '/rent-ledger', '/account', '/search', '/smart-import']

export function MobileBottomNav({
  onDashboardNavigate, hasSelectedProperty, onMoreClick, moreOpen,
}: {
  onDashboardNavigate?: () => void
  hasSelectedProperty?: boolean
  onMoreClick: () => void
  moreOpen: boolean
}) {
  const pathname = usePathname()

  // Lets CSS give .shell/.installHint extra bottom clearance only on
  // the pages that actually render this bar — see globals.css's
  // body.hasBottomNav rules. Pricing/admin (hideMobileNav) never mount
  // this component, so they never gain the class or the clearance,
  // matching their unchanged (no bottom nav) layout.
  useEffect(() => {
    document.body.classList.add('hasBottomNav')
    return () => { document.body.classList.remove('hasBottomNav') }
  }, [])

  const isDashboard = pathname === '/' && !hasSelectedProperty
  const isProperties = pathname === '/' && Boolean(hasSelectedProperty)
  const isMaintenance = pathname === '/maintenance'
  const isDocuments = pathname === '/documents'
  const isMore = moreOpen || (pathname ? MORE_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`)) : false)

  return (
    <nav className="mobileBottomNav" aria-label="Primary">
      <Link
        href="/"
        aria-current={isDashboard ? 'page' : undefined}
        className={`mobileBottomNavItem${isDashboard ? ' active' : ''}`}
        onClick={(e) => {
          if (onDashboardNavigate && pathname === '/') { e.preventDefault(); onDashboardNavigate() }
        }}
      >
        <GridIcon />
        <span>Dashboard</span>
      </Link>
      <Link href="/" aria-current={isProperties ? 'page' : undefined} className={`mobileBottomNavItem${isProperties ? ' active' : ''}`}>
        <HomeIcon />
        <span>Properties</span>
      </Link>
      <Link href="/maintenance" aria-current={isMaintenance ? 'page' : undefined} className={`mobileBottomNavItem${isMaintenance ? ' active' : ''}`}>
        <WrenchIcon />
        <span>Maintenance</span>
      </Link>
      <Link href="/documents" aria-current={isDocuments ? 'page' : undefined} className={`mobileBottomNavItem${isDocuments ? ' active' : ''}`}>
        <DocumentIcon />
        <span>Documents</span>
      </Link>
      <button
        type="button"
        className={`mobileBottomNavItem${isMore ? ' active' : ''}`}
        aria-haspopup="true"
        aria-expanded={moreOpen}
        onClick={onMoreClick}
      >
        <DotsIcon />
        <span>More</span>
      </button>
    </nav>
  )
}
