import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Simplification + Maintenance Workspace V2, Phase D.2: Profile entry
// point. Source-read regression guards, matching this repo's
// established no-jsdom convention (see lib/uploads/upload-reliability-
// wiring.test.ts, lib/property-photos/upload-wiring.test.ts for the
// direct precedent this file follows).
//
// What this protects: the landlord's profile avatar is restored to the
// authenticated header as its OWN entry point ("me"), separate from the
// "PropRoster tools" hamburger menu ("More") it used to be merged into
// — see components/ProfileEntryButton.tsx's own header comment for the
// full reasoning. The regression this guards against is the exact one
// Phase D.1 introduced: hiding the combined avatar+hamburger button on
// mobile (correct for the hamburger's own job, since the bottom nav's
// "More" replaces it) also hid the avatar (wrong — a landlord's own
// identity entry point should never disappear just because a menu
// trigger it used to double as became redundant).

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const authHeaderSource = readFile('components/AuthHeader.tsx')
const profileEntryButtonSource = readFile('components/ProfileEntryButton.tsx')
const authNavMenuSource = readFile('components/AuthNavMenu.tsx')
const useProfileAvatarSource = readFile('lib/user-profile/use-profile-avatar.ts')
const globalsCss = readFile('app/globals.css')

describe('Profile avatar is its own entry point, not merged into the tools menu', () => {
  it('AuthHeader renders ProfileEntryButton unconditionally (every authenticated page, not gated behind hideMobileNav)', () => {
    expect(authHeaderSource).toContain("import { ProfileEntryButton } from './ProfileEntryButton'")
    expect(authHeaderSource).toContain('<ProfileEntryButton />')
  })

  it('ProfileEntryButton links straight to the existing Profile page — no new profile experience built', () => {
    expect(profileEntryButtonSource).toContain('href="/profile"')
  })

  it('ProfileEntryButton does NOT open the full nav menu — it is a real navigation Link, not a menu-toggle button', () => {
    expect(profileEntryButtonSource).toContain('<Link href="/profile"')
    expect(profileEntryButtonSource).not.toMatch(/onOpenChange|NAV_LINKS|aria-haspopup/)
  })

  it('falls back to a neutral person icon (never a broken image, never emoji) when no profile photo is saved', () => {
    expect(profileEntryButtonSource).toContain('PersonIcon')
    expect(profileEntryButtonSource).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u)
  })

  it('the avatar photo lookup lives in one shared hook, not duplicated between components', () => {
    expect(profileEntryButtonSource).toContain("import { useProfileAvatarUrl } from '../lib/user-profile/use-profile-avatar'")
    expect(useProfileAvatarSource).toContain("supabase.from('user_profiles').select('photo_path')")
    expect(useProfileAvatarSource).toContain("supabase!.storage.from('profile-photos').createSignedUrl(path, 3600)")
  })
})

describe('AuthNavMenu\'s own trigger reverts to a plain "PropRoster tools" button', () => {
  it('no longer fetches or renders the profile photo itself', () => {
    expect(authNavMenuSource).not.toMatch(/avatarUrl|authNavAvatar|photo_path/)
  })

  it('the trigger is a single, unconditional glyph button — not two visual states depending on whether a photo exists', () => {
    expect(authNavMenuSource).toContain('<button type="button" className="authNavMenuButton" aria-label="Open navigation menu" aria-haspopup="true" aria-expanded={open} onClick={() => onOpenChange(!open)}>')
    expect(authNavMenuSource).toContain('<span aria-hidden="true">☰</span>')
  })
})

describe('Dead CSS from the old combined avatar+hamburger button is gone, replaced by the new dedicated classes', () => {
  it('the old combined-button classes are no longer defined', () => {
    expect(globalsCss).not.toContain('.authNavMenuButtonHasAvatar')
    expect(globalsCss).not.toContain('.authNavAvatar {')
  })

  it('the new profile entry classes exist and give a real, comfortable tap target', () => {
    expect(globalsCss).toContain('.profileEntryButton { display: block; width: 36px; height: 36px;')
    expect(globalsCss).toContain('.profileEntryFallback')
  })
})
