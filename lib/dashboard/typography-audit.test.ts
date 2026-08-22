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
  it('the base h1 rule uses an em-relative letter-spacing', () => {
    const match = CSS.match(/\nh1 \{ font-size: clamp\([^}]*\}/)
    expect(match).not.toBeNull()
    expect(match![0]).toMatch(/letter-spacing: -0\.\d+em/)
    expect(match![0]).not.toMatch(/letter-spacing: -\d+px/)
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
