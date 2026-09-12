'use client'

// PropRoster — Authenticated Header Simplification + Smart Upload
// Foundation.
//
// The one shared header for every authenticated PropRoster page
// (dashboard, property workspace, Profile, PropCrew, Billing).
// Intentionally minimal: profile avatar + wordmark on the left, a single
// primary-action slot (Smart Upload) on the right — nothing else. No
// email, no Pricing/Investment Tools/PropCrew/Profile/Log out buttons,
// no per-property actions. All of those already live in the account/
// tools menu (AuthNavMenu, opened by tapping the avatar) or, for
// property-specific actions, in the page's own contextual content (see
// app/page.tsx's propertyHero for Edit/Investment Analysis/back).
//
// Property Overview + Pricing Polish V1: the avatar used to be paired
// with a separate, always-visible hamburger button on desktop — two
// controls opening the same panel. The avatar is now the single trigger
// at every breakpoint (see ProfileEntryButton's own header comment).
//
// This component now also owns the Smart Upload modal's open/closed
// state — SmartUploadButton stays a dumb presentational button, and
// every authenticated page gets the real workflow for free with no
// per-page wiring, the same way every page already gets the hamburger.
//
// The wordmark is a real navigation Link to "/" everywhere except the
// property workspace, where app/page.tsx is a single-page app and
// "return to the dashboard" is just clearing local selection state —
// pass onBrandClick for that one call site so it keeps its instant,
// no-reload behavior while every other page renders the exact same
// markup/CSS.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Wordmark } from './Wordmark'
import { AuthNavMenu } from './AuthNavMenu'
import { ProfileEntryButton } from './ProfileEntryButton'
import { MobileBottomNav } from './MobileBottomNav'
import { SmartUploadButton } from './SmartUploadButton'
import { SmartUploadModal } from './SmartUpload/SmartUploadModal'

export function AuthHeader({
  onBrandClick, onSmartUploadCompleted, registerSmartUploadTrigger, hideMobileNav,
}: {
  onBrandClick?: () => void
  onSmartUploadCompleted?: () => void
  registerSmartUploadTrigger?: (fn: () => void) => void
  // Pricing (a public/marketing surface even when the visitor happens
  // to be signed in) and the internal admin tool are not primary
  // landlord destinations this bottom nav's items describe — see each
  // call site for the explicit opt-out.
  hideMobileNav?: boolean
}) {
  const [smartUploadOpen, setSmartUploadOpen] = useState(false)
  // Phase D.1 lifted this out of AuthNavMenu itself so the mobile
  // bottom nav's old "More" button could open the exact same panel;
  // Phase E1 removed that bottom-nav item, making the header's own
  // hamburger the only opener again. Phase E1.1 removed the mobile
  // hamburger too (see globals.css's own header-row comment) — the
  // avatar (ProfileEntryButton) became the mobile opener. Property
  // Overview + Pricing Polish V1 removed the desktop hamburger as well
  // — the avatar is now the ONLY opener at every breakpoint, still
  // driving this SAME lifted state, never a second menu instance.
  const [navMenuOpen, setNavMenuOpen] = useState(false)
  // Property Overview + Pricing Polish V1, Stage 1: Smart Upload is now
  // core PropRoster functionality on every plan (Free/Organize/Manage) —
  // the old Manage-only entitlement gate and its upgrade-prompt this
  // header used to show here were removed. The AI pipeline's own
  // platform-level fair-use safeguard is still enforced server-side by
  // the analyze route regardless of this button — see
  // lib/billing/entitlements.ts's own comment.

  // Property-First UX Cleanup: exposes an external trigger for opening
  // THIS SAME Smart Upload modal — no second implementation, no rebuilt
  // AI pipeline — so a property's Documents tab can offer "Smart Upload"
  // as one path inside its own "+ Add Document" flow (the spec's "not a
  // completely separate top-level product") while every other page keeps
  // using the header button exactly as before.
  useEffect(() => {
    registerSmartUploadTrigger?.(() => setSmartUploadOpen(true))
  }, [registerSmartUploadTrigger])

  const brandContent = (
    <>
      <span className="brand"><Wordmark /></span>
      <span className="tagline">Your real estate portfolio, all in one place.</span>
    </>
  )

  return (
    <>
      <header className={`topbar authHeader${hideMobileNav ? '' : ' authHeaderWithBottomNav'}`}>
        <div className="topbarBrandGroup">
          {/* Phase D.2: the landlord's own profile entry point ("me").
              Property Overview + Pricing Polish V1: also the single
              trigger for the tools/account menu right next to it, at
              every breakpoint — see ProfileEntryButton's own header
              comment for the full reasoning. */}
          <ProfileEntryButton menuOpen={navMenuOpen} onOpenMenu={() => setNavMenuOpen((o) => !o)} />
          {/* Dashboard Navigation Bug fix: reuse the exact same
              onBrandClick this header already threads to the wordmark
              below for the identical single-page-app reason — see
              AuthNavMenu's own comment on onDashboardNavigate. */}
          <AuthNavMenu onDashboardNavigate={onBrandClick} open={navMenuOpen} onOpenChange={setNavMenuOpen} />
          {onBrandClick ? (
            <button className="brandButton" onClick={onBrandClick}>{brandContent}</button>
          ) : (
            <Link href="/" className="brandButton">{brandContent}</Link>
          )}
        </div>
        <div className="topbarActions">
          {/* Property-First UX Cleanup: Search moves out of the hamburger
              list and becomes a real header action/icon — "represented as
              a search action/icon rather than a large primary navigation
              destination." Same /search route and page, unchanged. */}
          <Link href="/search" className="headerSearchButton" aria-label="Search">🔍</Link>
          <SmartUploadButton onClick={() => setSmartUploadOpen(true)} />
        </div>
      </header>
      {/* Simplification + Maintenance Workspace V2, Phase D.1: GLOBAL
          mobile navigation — hidden on desktop entirely via CSS, and
          not rendered at all on pricing/the admin tool (hideMobileNav).
          Phase E1: down to four destinations (Dashboard/Maintenance/
          PropCrew/Tax Center) — see MobileBottomNav's own header
          comment. "More" is gone from this bar; the header's profile
          avatar above is the one way to reach that panel now, on
          every width. */}
      {!hideMobileNav && <MobileBottomNav onDashboardNavigate={onBrandClick} />}
      <SmartUploadModal open={smartUploadOpen} onClose={() => setSmartUploadOpen(false)} onCompleted={onSmartUploadCompleted} />
    </>
  )
}
