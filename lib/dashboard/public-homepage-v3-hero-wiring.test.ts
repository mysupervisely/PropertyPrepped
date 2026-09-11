import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Public Homepage V3 (Marketing-First Hero): a focused, hero-only pass —
// reintroduces a real property photo (public/hero-property.jpg, already
// vetted and reserved for exactly this purpose since Public Homepage V2,
// see public/README.md) in a two-column "copy left, home right" layout on
// desktop that stacks (copy first, photo below) on mobile. Every word of
// hero copy is UNCHANGED from Public Homepage V2 — this is a layout/visual
// change only, never a copy or positioning rewrite. Pillars, workflow,
// secondary features, pricing, privacy note, and final CTA are untouched
// (out of scope for this pass) and are not re-asserted here — see
// homepage-pricing-free-property.test.ts and
// tenant-facing-experience-v1-wiring.test.ts for those.
//
// Same no-jsdom, source-read wiring-test convention as every other test in
// this repo.

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const landingSource = readFile('components/LandingPage.tsx')
const cssSource = readFile('app/globals.css')

const heroStart = landingSource.indexOf('<section className="landingHero">')
const heroEnd = landingSource.indexOf('</section>', heroStart) + '</section>'.length
const heroSlice = landingSource.slice(heroStart, heroEnd)

describe('Public Homepage V3: hero copy is byte-for-byte unchanged from V2', () => {
  it('H1, supporting headline, supporting paragraph, primary CTA, and free-property note all match exactly', () => {
    expect(heroSlice).toContain('<h1>Your properties. Organized.</h1>')
    expect(heroSlice).toContain('<p className="landingHeroTagline">Keep control of your properties without managing every little detail.</p>')
    expect(heroSlice).toContain('<p className="landingHeroSub">PropRoster helps organize the information and numbers behind your properties, simplify communication with tenants and your trusted PropCrew, and automate routine coordination.</p>')
    expect(heroSlice).toContain('>Start Free</button>')
    expect(heroSlice).toContain('<p className="landingHeroFreeNote">Start with your first property free. No credit card required.</p>')
  })

  it('exactly one primary CTA in the hero — no second competing CTA, no "View Demo"', () => {
    expect((heroSlice.match(/>Start Free<\/button>/g) || []).length).toBe(1)
    expect(heroSlice).not.toMatch(/view demo/i)
    expect(heroSlice).not.toMatch(/watch demo/i)
    expect(heroSlice).not.toMatch(/see it in action/i)
  })
})

describe('Public Homepage V3: brand/positioning guardrails hold across the whole file', () => {
  it('never claims to be a property-management company or "AI property management," and never overstates automation', () => {
    expect(landingSource).not.toMatch(/property management made simple/i)
    expect(landingSource).not.toMatch(/ai property management/i)
    expect(landingSource).not.toMatch(/fully automat/i)
  })

  it('the landlord-stays-in-control framing is still present (Tenant Connect pillar, untouched by this pass)', () => {
    expect(landingSource).toContain('Keep control. Lose the coordination.')
  })
})

describe('Public Homepage V3: a real property photo, reusing the exact reserved asset', () => {
  it('the hero renders public/hero-property.jpg — the file Public Homepage V2 explicitly kept in reserve for this — not a new/different image', () => {
    expect(heroSlice).toContain('src="/hero-property.jpg"')
  })

  it('no people are implied — a plain, descriptive alt text, not a stock-photo-style caption', () => {
    const imgMatch = heroSlice.match(/<img[^>]*alt="([^"]*)"[^>]*>/)
    expect(imgMatch).not.toBeNull()
    const alt = imgMatch![1]
    expect(alt.length).toBeGreaterThan(0)
    // "single-family home" is standard real-estate terminology, not a
    // claim about people being pictured — stripped before checking for
    // actual no-people violations.
    const altWithoutRealEstateTerms = alt.replace(/single-family/gi, '')
    expect(altWithoutRealEstateTerms).not.toMatch(/\bpeople\b|\btenant\b|\bagent\b|\brealtor\b|\bperson\b|\bfamily\b/i)
  })

  it('the image has explicit width/height (matching the real 1536x1024 file) so it never causes layout shift', () => {
    expect(heroSlice).toMatch(/width=\{1536\}/)
    expect(heroSlice).toMatch(/height=\{1024\}/)
  })

  it('loads eagerly at high priority — it is above the fold, not a lazy-loaded background image', () => {
    expect(heroSlice).toContain('loading="eager"')
    expect(heroSlice).toContain('fetchPriority="high"')
  })

  it('only one <img> exists in the whole landing page — the hero photo is the sole photograph, not a gallery', () => {
    expect((landingSource.match(/<img\b/g) || []).length).toBe(1)
  })
})

describe('Public Homepage V3: two-column desktop layout, single-column mobile stack', () => {
  it('the hero wraps copy and visual in a dedicated grid container, not the old single centered column', () => {
    expect(heroSlice).toContain('className="landingHeroGrid"')
    expect(heroSlice).toContain('className="landingHeroContent"')
    expect(heroSlice).toContain('className="landingHeroVisual"')
  })

  it('desktop: two explicit grid columns, copy and image vertically centered together', () => {
    const gridRule = cssSource.match(/\.landingHeroGrid \{[^}]*\}/)?.[0] || ''
    expect(gridRule).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax\(0,\s*1fr\)/)
    expect(gridRule).toContain('align-items: center')
  })

  it('the ≤980px breakpoint (the same one the pillar/workflow grids already collapse at) stacks the hero to one column with copy first', () => {
    const bp980Start = cssSource.indexOf('@media (max-width: 980px)')
    const bp980 = cssSource.slice(bp980Start, cssSource.indexOf('@media (max-width: 560px)', bp980Start))
    expect(bp980).toMatch(/\.landingHeroGrid \{ grid-template-columns:\s*1fr/)
    // Copy comes before the visual in DOM order regardless of viewport —
    // confirms the stack is copy-first, not image-first, at narrow widths.
    expect(heroSlice.indexOf('landingHeroContent')).toBeLessThan(heroSlice.indexOf('landingHeroVisual'))
  })

  it('the hero contains its own decorative backdrop offset so it can never cause horizontal scroll at any width', () => {
    const heroRule = cssSource.match(/\.landingHero \{[^}]*\}/)?.[0] || ''
    expect(heroRule).toContain('overflow: hidden')
  })

  it('the stacked (≤980px) hero removes the offset backdrop shape entirely rather than risking it look cramped at narrow widths', () => {
    const bp980Start = cssSource.indexOf('@media (max-width: 980px)')
    const bp980 = cssSource.slice(bp980Start, cssSource.indexOf('@media (max-width: 560px)', bp980Start))
    expect(bp980).toContain('.landingHeroVisual::before { content: none; }')
  })
})

describe('Public Homepage V3: no new colors, only existing brand tokens', () => {
  it('the new hero visual rules reuse existing tokens (--brand-soft) — no hex literal introduced', () => {
    const newRules = cssSource.slice(cssSource.indexOf('.landingHeroVisual'), cssSource.indexOf('.landingHeroImage { display'))
    expect(newRules).not.toMatch(/#[0-9a-fA-F]{3,8}/)
    expect(newRules).toContain('var(--brand-soft)')
  })
})

describe('Public Homepage V3: everything else on the page is untouched (out of scope)', () => {
  it('the three ORGANIZE/COORDINATE/AUTOMATE/UNDERSTAND pillars are unchanged', () => {
    expect(landingSource).toContain('Your Property, Organized')
    expect(landingSource).toContain('Tenant Connect')
    expect(landingSource).toContain('Live Tax Center')
  })

  it('pricing is still read from the same canonical lib/billing/plans.ts source, never re-typed', () => {
    expect(landingSource).toContain("import { PLANS, PUBLIC_PLAN_ORDER, PLAN_FEATURE_HIGHLIGHTS, EARLY_ACCESS_PRICING } from '../lib/billing/plans'")
  })

  it('auth (sign-in/sign-up) is completely untouched — same on-demand overlay, same submitAuth/openAuth functions', () => {
    expect(landingSource).toContain('async function submitAuth()')
    expect(landingSource).toContain("function openAuth(mode: 'signin' | 'signup')")
  })
})
