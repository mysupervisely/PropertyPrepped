import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Simplification + Maintenance Workspace V2, Phase D.2: Profile entry
// point. Source-read regression guards, matching this repo's
// established no-jsdom convention (see lib/uploads/upload-reliability-
// wiring.test.ts, lib/property-photos/upload-wiring.test.ts for the
// direct precedent this file follows).
//
// What this protects, as of Property Overview + Pricing Polish V1: the
// landlord's profile avatar (components/ProfileEntryButton.tsx) is the
// SINGLE trigger for the shared account/tools menu (AuthNavMenu), at
// every breakpoint. Before this milestone, desktop showed both a plain
// "/profile" avatar link AND a separate hamburger button
// (.authNavMenuButton) opening the same panel — real, user-visible
// redundancy. Mobile already had this consolidated (Phase E1.1); this
// milestone replicated that exact same pattern to desktop rather than
// inventing a new navigation mechanism — see ProfileEntryButton.tsx's
// own header comment for the full reasoning.

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const authHeaderSource = readFile('components/AuthHeader.tsx')
const profileEntryButtonSource = readFile('components/ProfileEntryButton.tsx')
const authNavMenuSource = readFile('components/AuthNavMenu.tsx')
const useProfileAvatarSource = readFile('lib/user-profile/use-profile-avatar.ts')
const globalsCss = readFile('app/globals.css')

describe('Profile avatar is the single trigger for the shared account/tools menu, at every breakpoint', () => {
  it('AuthHeader renders ProfileEntryButton unconditionally (every authenticated page, not gated behind hideMobileNav), wired to the same lifted menu state AuthNavMenu uses', () => {
    expect(authHeaderSource).toContain("import { ProfileEntryButton } from './ProfileEntryButton'")
    expect(authHeaderSource).toContain('<ProfileEntryButton menuOpen={navMenuOpen} onOpenMenu={() => setNavMenuOpen((o) => !o)} />')
    expect(authHeaderSource).toContain('<AuthNavMenu onDashboardNavigate={onBrandClick} open={navMenuOpen} onOpenChange={setNavMenuOpen} />')
  })

  it('renders exactly one real button element — no separate desktop Link and mobile button anymore', () => {
    expect(profileEntryButtonSource).not.toContain('profileEntryButtonDesktop')
    expect(profileEntryButtonSource).not.toContain('profileEntryButtonMobile')
    expect(profileEntryButtonSource).not.toContain("import Link from 'next/link'")
    const buttonMatches = profileEntryButtonSource.match(/<button/g) || []
    expect(buttonMatches.length).toBe(1)
  })

  it('the single button opens the shared AuthNavMenu panel — same onOpenMenu callback AuthHeader wires to setNavMenuOpen, proper button semantics and an accessible label', () => {
    expect(profileEntryButtonSource).toContain('type="button"')
    expect(profileEntryButtonSource).toContain('className="profileEntryButton"')
    expect(profileEntryButtonSource).toContain('aria-label="Open account menu"')
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

describe('AuthNavMenu no longer has its own visible trigger — it is purely externally controlled', () => {
  it('no longer fetches or renders the profile photo itself', () => {
    expect(authNavMenuSource).not.toMatch(/avatarUrl|authNavAvatar|photo_path/)
  })

  it('the old hamburger button (glyph trigger) is gone — ProfileEntryButton is the only opener', () => {
    // The class name may still appear in an explanatory comment
    // documenting the removal (it does) — what must be gone is the
    // actual rendered button.
    expect(authNavMenuSource).not.toMatch(/<button[^>]*authNavMenuButton/)
    expect(authNavMenuSource).not.toContain('<span aria-hidden="true">☰</span>')
  })

  it('Profile remains reachable inside the panel — consolidating triggers loses no destination', () => {
    expect(authNavMenuSource).toContain("{ href: '/profile', label: 'Profile' }")
  })

  it('still driven purely by the open/onOpenChange props, keeping outside-click and Escape-adjacent panel behavior unchanged', () => {
    expect(authNavMenuSource).toContain('open, onOpenChange')
    expect(authNavMenuSource).toContain('function handleClickOutside(e: MouseEvent)')
  })
})

describe('Dead CSS from the old two-trigger (avatar + hamburger) header is gone, replaced by one dedicated class', () => {
  it('the old desktop/mobile split and the hamburger button rule are no longer defined', () => {
    expect(globalsCss).not.toMatch(/\.profileEntryButtonDesktop\s*\{/)
    expect(globalsCss).not.toMatch(/\.profileEntryButtonMobile\s*\{/)
    expect(globalsCss).not.toMatch(/\.authNavMenuButton\s*\{/)
    expect(globalsCss).not.toContain('.authNavMenuButtonHasAvatar')
    expect(globalsCss).not.toContain('.authNavAvatar {')
  })

  it('the single profile entry button class exists, keyboard-focusable with a visible focus state, and gives a real, comfortable tap target', () => {
    expect(globalsCss).toContain('.profileEntryButton { display: block; width: 36px; height: 36px;')
    expect(globalsCss).toMatch(/\.profileEntryButton:focus-visible\s*\{[^}]*outline/)
    expect(globalsCss).toContain('.profileEntryFallback')
  })
})
