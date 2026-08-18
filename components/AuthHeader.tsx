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

import { useState } from 'react'
import Link from 'next/link'
import { Wordmark } from './Wordmark'
import { AuthNavMenu } from './AuthNavMenu'
import { SmartUploadButton } from './SmartUploadButton'
import { SmartUploadModal } from './SmartUpload/SmartUploadModal'

export function AuthHeader({ onBrandClick, onSmartUploadCompleted }: { onBrandClick?: () => void; onSmartUploadCompleted?: () => void }) {
  const [smartUploadOpen, setSmartUploadOpen] = useState(false)

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
          <AuthNavMenu />
          {onBrandClick ? (
            <button className="brandButton" onClick={onBrandClick}>{brandContent}</button>
          ) : (
            <Link href="/" className="brandButton">{brandContent}</Link>
          )}
        </div>
        <SmartUploadButton onClick={() => setSmartUploadOpen(true)} />
      </header>
      <SmartUploadModal open={smartUploadOpen} onClose={() => setSmartUploadOpen(false)} onCompleted={onSmartUploadCompleted} />
    </>
  )
}
