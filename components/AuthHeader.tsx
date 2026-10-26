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
import { SmartUploadButton } from './SmartUploadButton'
import { SmartUploadModal } from './SmartUpload/SmartUploadModal'
import { useAuthUser } from '../lib/useAuthUser'
import { useUnreadNotificationCount } from '../lib/notifications/useUnreadCount'

export function AuthHeader({
  onBrandClick, onSmartUploadCompleted, registerSmartUploadTrigger,
}: {
  onBrandClick?: () => void
  onSmartUploadCompleted?: () => void
  registerSmartUploadTrigger?: (fn: () => void) => void
}) {
  const [smartUploadOpen, setSmartUploadOpen] = useState(false)
  // Mobile V3 (Notifications & Activity Center): same independent
  // useAuthUser() call AuthNavMenu already makes for its own
  // hasTenantAccess check — no prop threading, every authenticated page
  // gets the bell for free, same as the hamburger/Smart Upload already
  // work.
  const { user } = useAuthUser()
  const unreadNotificationCount = useUnreadNotificationCount(user)
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
      <header className="topbar authHeader">
        <div className="topbarBrandGroup">
          {/* Phase D.2: the landlord's own profile entry point ("me").
              Property Overview + Pricing Polish V1: also the single
              trigger for the tools/account menu right next to it, at
              every breakpoint — see ProfileEntryButton's own header
              comment for the full reasoning. */}
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
          {/* Mobile V3: a discreet bell, same circular icon-button
              language as the search button right next to it — not a
              dropdown panel, just a link to the dedicated Activity
              Center (app/notifications/page.tsx), matching how every
              other header action in this app already works (Search is
              a plain link too). */}
          <Link href="/notifications" className="headerSearchButton headerBellButton" aria-label={unreadNotificationCount > 0 ? `Notifications, ${unreadNotificationCount} unread` : 'Notifications'}>
            🔔
            {unreadNotificationCount > 0 && <span className="headerBellBadge">{unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}</span>}
          </Link>
          <SmartUploadButton onClick={() => setSmartUploadOpen(true)} />
          <ProfileEntryButton menuOpen={navMenuOpen} onOpenMenu={() => setNavMenuOpen((o) => !o)} />
          {/* Dashboard Navigation Bug fix: reuse the exact same
              onBrandClick this header already threads to the wordmark
              below for the identical single-page-app reason — see
              AuthNavMenu's own comment on onDashboardNavigate. */}
          <AuthNavMenu onDashboardNavigate={onBrandClick} open={navMenuOpen} onOpenChange={setNavMenuOpen} />
        </div>
      </header>
      {/* Mobile V2 (Quick Actions + navigation simplification): the
          fixed mobile bottom navigation bar (Dashboard/Maintenance/
          PropCrew/Tax Center — formerly components/MobileBottomNav.tsx,
          now deleted) was removed. It had become redundant with the
          Dashboard's own customizable Quick Actions and this exact
          hamburger menu, which already lists every one of those four
          destinations (plus Documents and Investment Tools) in
          AuthNavMenu's own NAV_LINKS — removing the bar loses zero
          navigation reach. The avatar above is now the single mobile
          navigation entry point, at every breakpoint, the same as
          desktop already was. */}
      <SmartUploadModal open={smartUploadOpen} onClose={() => setSmartUploadOpen(false)} onCompleted={onSmartUploadCompleted} />
    </>
  )
}
