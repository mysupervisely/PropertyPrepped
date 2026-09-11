import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Property-First Simplification V2 — mobile typography audit regression
// guard.
//
// Root cause: the global `h1` rule used a FIXED, non-proportional
// letter-spacing (-2px) alongside a responsive clamp() font-size. At the
// clamp's mobile floor (34px), a flat -2px is ~-5.9% of the font size —
// nearly double the tightness of .welcomeIntro h1's already-safe
// -0.6px/24px (~-2.5%) — which is what made long headings like "Bring
// an existing portfolio into PropRoster." and "Your identity, not your
// settings." read as visually cramped on phones. The fix converts these
// to em-relative values so they scale proportionally with font-size at
// every width, instead of patching individual headings/strings.

const ROOT = join(__dirname, '..', '..')
const CSS = readFileSync(join(ROOT, 'app/globals.css'), 'utf8')

describe('Global h1 letter-spacing is proportional (em-relative), not a fixed px value', () => {
  // Simplification V2, Phase B: the base h1 rule now reads its
  // font-size/letter-spacing/weight through the shared --text-display/
  // --tracking-tight/--weight-semibold tokens instead of inline literal
  // values — same numeric letter-spacing as before (-0.02em), just
  // centralized. The regression this guard actually protects against
  // (a fixed-px letter-spacing under a responsive clamp()) still can't
  // happen: it's enforced at the token definition now, not per-rule.
  it('the base h1 rule uses the shared --tracking-tight token for letter-spacing, not an inline value', () => {
    const match = CSS.match(/\nh1 \{ font-size: var\(--text-display\)[^}]*\}/)
    expect(match).not.toBeNull()
    expect(match![0]).toMatch(/letter-spacing: var\(--tracking-tight\)/)
    expect(match![0]).not.toMatch(/letter-spacing: -\d+px/)
  })

  it('--tracking-tight itself is an em-relative value, never a fixed px — this is what actually keeps every token consumer (h1 included) proportional', () => {
    const rootMatch = CSS.match(/--tracking-tight:\s*([^;]+);/)
    expect(rootMatch).not.toBeNull()
    expect(rootMatch![1].trim()).toMatch(/^-0\.\d+em$/)
  })

  it('the landing hero h1 (its own clamp()) is also em-relative, base and mobile override alike', () => {
    expect(CSS).toMatch(/\.landingHeroHeadline h1 \{[^}]*letter-spacing: -0\.\d+em/)
    expect(CSS).toMatch(/\.landingHeroHeadline h1 \{ letter-spacing: -0\.\d+em; \}/)
  })

  it('no copy/markup workaround (non-breaking spaces, manual <br> mid-sentence) was used to paper over the spacing instead of fixing the CSS', () => {
    const smartImportIntro = readFileSync(join(ROOT, 'app/smart-import/page.tsx'), 'utf8')
    expect(smartImportIntro).toContain('<h1>Bring an existing portfolio into PropRoster.</h1>')
    expect(smartImportIntro).not.toContain('&nbsp;')
  })
})
