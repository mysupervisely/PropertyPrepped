'use client'

// PropRoster — Property Profile 2.0, Section 3: authenticated navigation
// foundation. Additive only (Part 3: "preserve all current live routes"
// — nothing existing is removed from either topbar) and deliberately
// small (Part 3: "do not overbuild") — this is the [ ☰ ] element the
// header moves toward, wired in wherever the app's two current topbars
// live (app/page.tsx), not yet rolled out to every route's own
// independent topbar (Investment Tools, Pricing, Billing) — that broader
// rollout is future work, called out explicitly in the completion report
// rather than attempted here.
//
// Only real, live destinations are listed (Part 3: "do not create dead
// links to unfinished features") — no Tax Center, Savings Center, Smart
// Upload, etc.

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

const NAV_LINKS: { href: string; label: string }[] = [
  { href: '/', label: 'Dashboard' },
  { href: '/investment-tools', label: 'Investment Tools' },
  { href: '/propcrew', label: 'PropCrew' },
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
        </nav>
      )}
    </div>
  )
}
