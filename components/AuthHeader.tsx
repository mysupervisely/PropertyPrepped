'use client'

// PropRoster — Authenticated Header Simplification + Smart Upload
// Foundation.
//
// The one shared header for every authenticated PropRoster page
// (dashboard, property workspace, Profile, PropCrew, Billing).
// Intentionally minimal: hamburger + wordmark on the left, a single
// primary-action slot (Smart Upload) on the right — nothing else. No
// email, no Pricing/Investment Tools/PropCrew/Profile/Log out buttons,
// no per-property actions. All of those already live in the hamburger
// (AuthNavMenu) or, for property-specific actions, in the page's own
// contextual content (see app/page.tsx's propertyHero for Edit/
// Investment Analysis/back).
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
import { UpgradePrompt } from './UpgradePrompt'
import { supabase } from '../lib/supabase'
import { useAuthUser } from '../lib/useAuthUser'
import { useSubscription } from '../lib/useSubscription'
import { entitlementsFor } from '../lib/billing/entitlements'

export function AuthHeader({
  onBrandClick, onSmartUploadCompleted, registerSmartUploadTrigger, hasSelectedProperty, hideMobileNav,
}: {
  onBrandClick?: () => void
  onSmartUploadCompleted?: () => void
  registerSmartUploadTrigger?: (fn: () => void) => void
  // Simplification + Maintenance Workspace V2, Phase D.1: threaded from
  // app/page.tsx exactly the way onBrandClick already is — this is the
  // only page where "a property is currently open" is even a concept
  // (every other AuthHeader caller is its own separate route, never a
  // property workspace), so it's undefined/false everywhere else,
  // which is exactly correct there (see MobileBottomNav's own header
  // comment for why this decides Dashboard vs. Properties active state).
  hasSelectedProperty?: boolean
  // Pricing (a public/marketing surface even when the visitor happens
  // to be signed in) and the internal admin tool are not primary
  // landlord destinations this bottom nav's five items describe — see
  // each call site for the explicit opt-out.
  hideMobileNav?: boolean
}) {
  const [smartUploadOpen, setSmartUploadOpen] = useState(false)
  // Phase D.1: lifted out of AuthNavMenu itself so the new mobile
  // bottom nav's "More" button can open the exact same panel — one
  // menu, two triggers (the header's own hamburger, kept for desktop
  // where the bottom nav doesn't exist; see globals.css for how the
  // header trigger is hidden on mobile specifically when this bottom
  // nav is present, never on pages that opt out of it).
  const [navMenuOpen, setNavMenuOpen] = useState(false)
  // Launch Pricing: Smart Upload's entry point is global (this header
  // renders on every authenticated page), so the gate lives here rather
  // than being threaded through every page that renders AuthHeader.
  // UI-only — the real cost boundary is the analyze route's server-side
  // AI-allowance check (Section: AI Enforcement); this just avoids
  // opening a workflow the plan can't complete.
  const [showUpgrade, setShowUpgrade] = useState(false)
  const { user } = useAuthUser()
  const { plan } = useSubscription(user)
  const canUseSmartUpload = entitlementsFor(plan).canUseSmartUpload

  // Property-First UX Cleanup: exposes an external trigger for opening
  // THIS SAME Smart Upload modal — no second implementation, no rebuilt
  // AI pipeline — so a property's Documents tab can offer "Smart Upload"
  // as one path inside its own "+ Add Document" flow (the spec's "not a
  // completely separate top-level product") while every other page keeps
  // using the header button exactly as before. Re-registers whenever the
  // plan-gated behavior it wraps changes, so the exposed function is
  // never stale.
  useEffect(() => {
    registerSmartUploadTrigger?.(() => (canUseSmartUpload ? setSmartUploadOpen(true) : setShowUpgrade(true)))
  }, [registerSmartUploadTrigger, canUseSmartUpload])

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
          {/* Phase D.2: the landlord's own profile entry point ("me") —
              always visible, distinct from the tools menu right next to
              it. See ProfileEntryButton's own header comment for the
              full reasoning. */}
          <ProfileEntryButton />
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
          <SmartUploadButton onClick={() => (canUseSmartUpload ? setSmartUploadOpen(true) : setShowUpgrade(true))} />
        </div>
      </header>
      {/* Simplification + Maintenance Workspace V2, Phase D.1: GLOBAL
          mobile navigation — hidden on desktop entirely via CSS, and
          not rendered at all on pricing/the admin tool (hideMobileNav).
          "More" opens the exact same AuthNavMenu panel above, via the
          same lifted open state. */}
      {!hideMobileNav && (
        <MobileBottomNav
          onDashboardNavigate={onBrandClick}
          hasSelectedProperty={hasSelectedProperty}
          moreOpen={navMenuOpen}
          onMoreClick={() => setNavMenuOpen((o) => !o)}
        />
      )}
      <SmartUploadModal open={smartUploadOpen} onClose={() => setSmartUploadOpen(false)} onCompleted={onSmartUploadCompleted} />
      {showUpgrade && supabase && (
        <UpgradePrompt
          supabase={supabase}
          currentPlan={plan}
          onClose={() => setShowUpgrade(false)}
          headline="Smart Upload is included with Manage."
          targetPlanId="manage"
          description="Manage includes Smart Upload, Portfolio Import, AI Document Intelligence, Rent Ledger and PropWatch."
        />
      )}
    </>
  )
}
