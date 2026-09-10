'use client'

// PropRoster — Simplification + Maintenance Workspace V2, Phase D.2:
// Profile entry point.
//
// Conceptually distinct from the other two navigation surfaces this
// header/shell now carries:
//   - Profile avatar (this component)  = ME — the landlord's own
//     identity, one tap away everywhere AuthHeader renders.
//   - AuthNavMenu ("More")             = PROPROSTER TOOLS — Documents/
//     Maintenance/Tax Center/PropCrew/Investment Tools/Pricing.
//   - MobileBottomNav                  = PRIMARY EVERYDAY DESTINATIONS.
// This button does NOT open the full nav menu (that would just
// duplicate "More" under a second trigger) — it is a direct entry
// point to the landlord's own Profile page.
//
// Before Phase D.1 this same avatar image lived inside AuthNavMenu's
// own hamburger button (doubling as both "who am I" and "open the
// tools menu"). Phase D.1's mobile-nav CSS then hid that whole button
// on mobile (the bottom nav's "More" replaces its menu-trigger job) —
// which also hid the avatar, since it was the same element. That's the
// literal "header lost the user's profile/avatar entry point"
// regression this component fixes: the avatar is now its own control,
// always visible, never tied to whether the hamburger trigger shows.
//
// For this phase the tap target routes straight to /profile — the
// existing Profile page, unchanged. It is deliberately built as a
// small, self-contained, labeled component (not inlined into
// AuthHeader) so a later phase can upgrade it to open a short profile
// menu in place (My Profile / My Card / Show QR Code / Share My Card /
// Edit Card / Account & Settings) without touching AuthHeader or
// duplicating the avatar-photo lookup again. That menu is explicitly
// NOT built in D.2 — see this milestone's own future-work notes.

import Link from 'next/link'
import { PersonIcon } from './icons/NavIcons'
import { useProfileAvatarUrl } from '../lib/user-profile/use-profile-avatar'

export function ProfileEntryButton() {
  const avatarUrl = useProfileAvatarUrl()

  return (
    <div className="profileEntry">
      <Link href="/profile" className="profileEntryButton" aria-label="Profile">
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="profileEntryAvatarImg" />
        ) : (
          // Safe fallback when no profile photo is saved yet — a plain
          // neutral silhouette, never a broken image and never emoji.
          <span className="profileEntryFallback"><PersonIcon /></span>
        )}
      </Link>
    </div>
  )
}
