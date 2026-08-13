'use client'

// PropRoster: consistent "Pricing" nav item for every authenticated
// top bar in the app (the signed-out landing page has its own bespoke
// nav — see components/LandingPage.tsx — and is left as-is).
//
// A single shared component rather than a copy-pasted <Link> in every
// header so the styling/behavior can't drift between pages, and so the
// "current section" state is never hand-wired per page: it self-detects
// via usePathname(), so every call site is just <PricingNavLink /> with
// no per-page logic, including on /pricing's own header.

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function PricingNavLink() {
  const pathname = usePathname()
  const isActive = pathname === '/pricing'
  return (
    <Link
      href="/pricing"
      className={`secondary${isActive ? ' navCurrent' : ''}`}
      aria-current={isActive ? 'page' : undefined}
    >
      Pricing
    </Link>
  )
}
