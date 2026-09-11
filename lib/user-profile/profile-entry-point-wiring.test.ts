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
// "PropRoster tools" hamburger menu it used to be merged into — see
// components/ProfileEntryButton.tsx's own header comment for the full
// reasoning. The regression this originally guarded against was the
// one Phase D.1 introduced: hiding the combined avatar+hamburger button
// on mobile also hid the avatar. Phase E1.1 deliberately gave the
// avatar a SECOND, mobile-only job (opening the shared AuthNavMenu
// panel, since the mobile hamburger is gone) — the tests below reflect
// that: the desktop element still just navigates to /profile, and the
// mobile element opens the existing panel rather than a duplicated one.

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const authHeaderSource = readFile('components/AuthHeader.tsx')
const profileEntryButtonSource = readFile('components/ProfileEntryButton.tsx')
const authNavMenuSource = readFile('components/AuthNavMenu.tsx')
const useProfileAvatarSource = readFile('lib/user-profile/use-profile-avatar.ts')
const globalsCss = readFile('app/globals.css')

describe('Profile avatar is its own entry point (desktop: navigate; mobile: open the shared tools menu, Phase E1.1)', () => {
  it('AuthHeader renders ProfileEntryButton unconditionally (every authenticated page, not gated behind hideMobileNav), wired to the same lifted menu state the hamburger uses', () => {
    expect(authHeaderSource).toContain("import { ProfileEntryButton } from './ProfileEntryButton'")
    expect(authHeaderSource).toContain('<ProfileEntryButton menuOpen={navMenuOpen} onOpenMenu={() => setNavMenuOpen((o) => !o)} />')
  })

  it('the desktop element links straight to the existing Profile page — no new profile experience built', () => {
    expect(profileEntryButtonSource).toContain('<Link href="/profile" className="profileEntryButton profileEntryButtonDesktop"')
  })

  // Phase E1.1: the mobile hamburger is gone (see the describe block
  // below), so the avatar's mobile element takes over that job —
  // opening the SAME AuthNavMenu panel via the onOpenMenu prop AuthHeader
  // already threads in, never a second/duplicated menu definition. Two
  // real elements, CSS-toggled by viewport (ProfileEntryButton.tsx's own
  // header comment) — only one is ever in the layout/tab order.
  it('the mobile element opens the existing shared menu, not a new one — same onOpenMenu callback AuthHeader wires to setNavMenuOpen', () => {
    expect(profileEntryButtonSource).toContain('className="profileEntryButton profileEntryButtonMobile"')
    expect(profileEntryButtonSource).toContain('aria-haspopup="true"')
    expect(profileEntryButtonSource).toContain('aria-expanded={menuOpen}')
    expect(profileEntryButtonSource).toContain('onClick={onOpenMenu}')
    expect(profileEntryButtonSource).not.toContain('NAV_LINKS')
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
