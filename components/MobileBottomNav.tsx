'use client'

// PropRoster — Simplification + Maintenance Workspace V2, Phase D.1:
// Mobile App Navigation. Phase E1 reduced this from five destinations
// to four.
//
// A persistent, primary-destination bottom navigation bar for mobile —
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
// Phase E1: "Properties" was dropped as a bottom-nav destination — the
// Dashboard already IS the portfolio entry point (My Properties lives
// right there), so a second, separate "Properties" tab was redundant
// with Dashboard rather than genuinely different from it. Dashboard now
// lights up for "/" unconditionally (property workspace and dashboard
// view are still the SAME route in this single-page app, just no
// longer split into two nav destinations by selection state).
// "Documents" and "More" also left the bar — Documents stays reachable
// through the nav menu and contextual property areas, not deleted;
// "More" itself is gone because there is no longer a case only it can
// reach that isn't already one of the four remaining destinations or
// the nav menu (still reachable via the header's own hamburger on
// desktop, and the property tab row's PropCrew on a property page).
// PropCrew and Tax Center take the two freed slots — both real,
// existing, unchanged routes, promoted to primary nav because they are
// the intended next retention/workflow surfaces, not new features.
//
// Dashboard reuses the exact SAME onDashboardNavigate/onBrandClick
// mechanism the wordmark and AuthNavMenu's own "Dashboard" link already
// use (see AuthHeader.tsx) — clicking it while already on "/" clears
// selectedId directly instead of a same-route Link no-op.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { GridIcon, WrenchIcon, PeopleIcon, ReceiptIcon } from './icons/NavIcons'

export function MobileBottomNav({
  onDashboardNavigate,
}: {
  onDashboardNavigate?: () => void
}) {
  const pathname = usePathname()
  const navRef = useRef<HTMLElement>(null)

  // Lets CSS give .shell/.installHint extra bottom clearance only on
  // the pages that actually render this bar — see globals.css's
  // body.hasBottomNav rules. Pricing/admin (hideMobileNav) never mount
  // this component, so they never gain the class or the clearance,
  // matching their unchanged (no bottom nav) layout.
  useEffect(() => {
    document.body.classList.add('hasBottomNav')
    return () => { document.body.classList.remove('hasBottomNav') }
  }, [])

  // Property Intelligence V1, Phase C.2: publish this bar's REAL
  // rendered height as --bottom-nav-height instead of every other
  // fixed-position element (the PWA install hint) guessing it with a
  // hardcoded pixel constant — a real iPhone/Safari session proved that
  // constant wrong. getBoundingClientRect() (border-box, including
  // padding/border — the actual space this bar occupies) is used
  // instead of ResizeObserver's own contentRect so the published height
  // already accounts for the safe-area-inset-bottom padding baked into
  // this bar itself; consumers add nothing extra on top of it for that.
  // display:none at desktop widths naturally reports a height of 0, so
  // no separate width check is needed here — the measurement itself
  // already reflects whether the bar is actually visible.
  useEffect(() => {
    const el = navRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      document.documentElement.style.setProperty('--bottom-nav-height', `${el.getBoundingClientRect().height}px`)
    })
    observer.observe(el)
    return () => {
      observer.disconnect()
      document.documentElement.style.removeProperty('--bottom-nav-height')
    }
  }, [])

  // Phase E1: Dashboard is the one destination for "/" now (no more
  // Properties split) — a property workspace is still "/", it just no
  // longer has its own separate nav item, since "the Dashboard already
  // provides access to the portfolio/properties" (My Properties is
  // right there on it).
  const isDashboard = pathname === '/'
  const isMaintenance = pathname === '/maintenance'
  const isPropCrew = pathname === '/propcrew'
  const isTaxCenter = pathname === '/tax-center'

  return (
    <nav ref={navRef} className="mobileBottomNav" aria-label="Primary">
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
      <Link href="/maintenance" aria-current={isMaintenance ? 'page' : undefined} className={`mobileBottomNavItem${isMaintenance ? ' active' : ''}`}>
        <WrenchIcon />
        <span>Maintenance</span>
      </Link>
      <Link href="/propcrew" aria-current={isPropCrew ? 'page' : undefined} className={`mobileBottomNavItem${isPropCrew ? ' active' : ''}`}>
        <PeopleIcon />
        <span>PropCrew</span>
      </Link>
      <Link href="/tax-center" aria-current={isTaxCenter ? 'page' : undefined} className={`mobileBottomNavItem${isTaxCenter ? ' active' : ''}`}>
        <ReceiptIcon />
        <span>Tax Center</span>
      </Link>
    </nav>
  )
}
