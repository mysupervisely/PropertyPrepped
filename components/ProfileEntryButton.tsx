'use client'

// PropRoster — Simplification + Maintenance Workspace V2, Phase D.2:
// Profile entry point. Phase E1.1 gave it a second, mobile-only job.
//
// Conceptually distinct from the other two navigation surfaces this
// header/shell now carries:
//   - Profile avatar (this component)  = ME — the landlord's own
//     identity, one tap away everywhere AuthHeader renders.
//   - AuthNavMenu                      = PROPROSTER TOOLS — Documents/
//     Maintenance/Tax Center/PropCrew/Investment Tools/Pricing.
//   - MobileBottomNav                  = PRIMARY EVERYDAY DESTINATIONS.
//
// Phase E1.1: the mobile header's separate hamburger trigger was
// removed to win back a full row at 390-393px (see globals.css's own
// "Phase E1.1" header-row comment) now that the bottom nav carries the
// four primary destinations. On mobile there is no longer a hamburger
// at all, so the avatar becomes that entry point too — tapping it
// OPENS the exact same AuthNavMenu panel a desktop hamburger still
// opens (no duplicated menu definition, no new component; onOpenMenu
// is the identical setNavMenuOpen already lifted into AuthHeader for
// that panel). Desktop is unchanged: the hamburger is still there, and
// the avatar still routes straight to /profile, exactly as Phase D.2
// shipped it.
//
// Two real elements, CSS-toggled by the same mobile breakpoint the
// bottom nav itself uses (matching MobileBottomNav's own display:none/
// @media pattern) rather than a resize listener or other viewport-
// detection JS — only one is ever in the layout/tab order at a time.
//
// Architecture still leaves a clean path for the future Profile/My
// Card surface (Show QR Code/Share My Card/Edit Card/Account &
// Settings) to live behind this SAME button later — not built here.

import Link from 'next/link'
import { PersonIcon } from './icons/NavIcons'
import { useProfileAvatarUrl } from '../lib/user-profile/use-profile-avatar'

export function ProfileEntryButton({ menuOpen, onOpenMenu }: { menuOpen: boolean; onOpenMenu: () => void }) {
  const avatarUrl = useProfileAvatarUrl()

  const avatarContent = avatarUrl ? (
    <img src={avatarUrl} alt="" className="profileEntryAvatarImg" />
  ) : (
    // Safe fallback when no profile photo is saved yet — a plain
    // neutral silhouette, never a broken image and never emoji.
    <span className="profileEntryFallback"><PersonIcon /></span>
  )

  return (
    <div className="profileEntry">
      <Link href="/profile" className="profileEntryButton profileEntryButtonDesktop" aria-label="Profile">
        {avatarContent}
      </Link>
      <button
        type="button"
        className="profileEntryButton profileEntryButtonMobile"
        aria-label="Account menu"
        aria-haspopup="true"
        aria-expanded={menuOpen}
        onClick={onOpenMenu}
      >
        {avatarContent}
      </button>
    </div>
  )
}
