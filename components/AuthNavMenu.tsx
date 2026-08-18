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

const NAV_LINKS: { href: string; label: string }[] = [
  { href: '/', label: 'Dashboard' },
  // Milestone 15: Global Search — secondary to the header itself (no
  // clutter there), reachable from every authenticated page via the
  // hamburger, same as every other destination here.
  { href: '/search', label: 'Search' },
  // Milestone 18: Rent Ledger — a recordkeeping tool, not a payment
  // processor (see lib/rent-ledger/). Secondary to the header itself,
  // same reasoning as Search above: reachable from every authenticated
  // page via the hamburger, never in the global header.
  { href: '/rent-ledger', label: 'Rent Ledger' },
  { href: '/investment-tools', label: 'Investment Tools' },
  { href: '/propcrew', label: 'PropCrew' },
  // Milestone 14: secondary to the header's own "+ Smart Upload" (also
  // linked from inside that modal's Entry screen) — onboarding an
  // existing portfolio of historical documents, not the everyday
  // add-one-thing action, so it lives here rather than in the header.
  { href: '/smart-import', label: 'Smart Import' },
  { href: '/profile', label: 'Profile' },
  { href: '/pricing', label: 'Pricing' },
]

export function AuthNavMenu() {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="authNavMenu" ref={containerRef}>
      <button type="button" className="authNavMenuButton" aria-label="Open navigation menu" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span aria-hidden="true">☰</span>
      </button>
      {open && (
        <nav className="authNavMenuPanel" aria-label="Main navigation">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} onClick={() => setOpen(false)}>{link.label}</Link>
          ))}
          <Link href="/?add=property" className="authNavMenuAction" onClick={() => setOpen(false)}>+ Add Property</Link>
          <div className="authNavMenuDivider" role="separator" />
          <button type="button" className="authNavMenuLogout" onClick={() => { setOpen(false); void supabase?.auth.signOut() }}>Log out</button>
        </nav>
      )}
    </div>
  )
}
