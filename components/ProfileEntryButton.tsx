'use client'

// PropRoster — Simplification + Maintenance Workspace V2, Phase D.2:
// Profile entry point. Phase E1.1 gave it a second, mobile-only job.
// Property Overview + Pricing Polish V1: that mobile-only job is now its
// ONLY job, at every breakpoint.
//
// Conceptually distinct from the other navigation surfaces this
// header/shell now carries:
//   - Profile avatar (this component)  = the landlord's own identity AND
//     the single trigger for the account/tools menu (AuthNavMenu).
//   - AuthNavMenu                      = THE primary navigation
//     mechanism at every breakpoint — Dashboard/Documents/Maintenance/
//     Tax Center/PropCrew/Investment Tools, plus the account links
//     (Profile/Pricing) and Log out. Mobile V2 removed the fixed
//     mobile bottom navigation bar that used to duplicate four of
//     these same destinations (components/MobileBottomNav.tsx, now
//     deleted) — it had become redundant with this menu and the
//     Dashboard's own customizable Quick Actions.
//
// Phase E1.1 made the mobile avatar open AuthNavMenu instead of linking
// straight to /profile, because the mobile header's own hamburger had
// just been removed. Desktop never got the same treatment — it kept
// BOTH a plain "/profile" avatar link AND a separate visible hamburger
// button (AuthNavMenu's own internal trigger), which read as two
// competing menu controls for the same panel. This pass removes that
// redundancy by giving desktop the exact same behavior mobile already
// had: one avatar, one button, one trigger, at every width. Profile
// itself isn't lost — it's still one of AuthNavMenu's own account links,
// exactly like it already is on mobile today. AuthNavMenu's own internal
// hamburger trigger is removed alongside this (see AuthNavMenu.tsx) —
// this button is now the ONLY way to open that panel, everywhere.
//
// Single real element, no breakpoint split, no resize listener.
//
// Architecture still leaves a clean path for the future Profile/My
// Card surface (Show QR Code/Share My Card/Edit Card/Account &
// Settings) to live behind this SAME button later — not built here.

import { useProfileAvatarInfo } from '../lib/user-profile/use-profile-avatar'

export function ProfileEntryButton({ menuOpen, onOpenMenu }: { menuOpen: boolean; onOpenMenu: () => void }) {
  const { avatarUrl, initials } = useProfileAvatarInfo()

  // Mobile Header Avatar V1: the fallback (no photo on file yet) is now
  // the landlord's own initials — a real, personal identity marker,
  // never a generic silhouette icon and never a broken image.
  const avatarContent = avatarUrl ? (
    <img src={avatarUrl} alt="" className="profileEntryAvatarImg" />
  ) : (
    <span className="profileEntryFallback" aria-hidden="true">{initials}</span>
  )

  return (
    <div className="profileEntry">
      <button
        type="button"
        className="profileEntryButton"
        aria-label="Open account menu"
        aria-haspopup="true"
        aria-expanded={menuOpen}
        onClick={onOpenMenu}
      >
        {avatarContent}
      </button>
    </div>
  )
}
