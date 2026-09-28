'use client'

// Mobile auth polish pass: a small back-to-landing header shown above
// every sign-in gate / auth card (SignInRequiredCard, the Tenant Connect
// sign-in form, the Billing sign-in gate). Fixes two mobile-preview
// findings at once — no branding/back affordance on gate screens, and a
// bare card floating in a lot of empty space — with one shared element
// instead of repeating it per page.
//
// Hidden on desktop (see .authShellBrand's `display: none` base rule in
// globals.css, only turned on under the ≤760px media query): these gate
// screens already read fine on desktop, and the ask was mobile polish,
// not a desktop redesign.

import Link from 'next/link'
import { Wordmark } from '../Wordmark'

export function AuthBackHeader() {
  return (
    <Link href="/" className="authShellBrand" aria-label="Back to PropRoster">
      <span className="authBackArrow" aria-hidden="true">←</span>
      <span className="brand"><Wordmark /></span>
    </Link>
  )
}
