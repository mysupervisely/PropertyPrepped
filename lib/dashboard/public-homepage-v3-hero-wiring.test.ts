import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Public Homepage V3 (Marketing-First Hero) — real-iPhone follow-up.
//
// The first pass (real Netlify preview, reviewed on a real iPhone) put
// public/hero-property.jpg in a separate, full-strength photo card: a
// two-column grid on desktop, a giant standalone image block below the
// copy on mobile. Real-device feedback: that read as a property listing
// photo, not an atmosphere, and made the hero scroll-heavy on phones.
// This pass keeps the exact same image and exact same hero copy but
// turns the photo into a single soft BACKGROUND LAYER behind the text
// (.landingHeroBg, absolutely positioned, aria-hidden, faded) — there is
// no separate content block for it anymore, on any viewport.
//
// This pass also restructures the "why PropRoster" section from three
// elaborate pillars into four short, calm entries (Organize / Coordinate
// / Automate / Understand) that now carry the hero promise forward,
// since the standalone photo block that used to sit between them and the
// hero is gone. Copy is verbatim, as specified.
//
// Workflow, secondary features, pricing, privacy note, and final CTA are
// untouched (out of scope for this pass) and are not re-asserted here —
// see homepage-pricing-free-property.test.ts and
// tenant-facing-experience-v1-wiring.test.ts for those.
//
// Same no-jsdom, source-read wiring-test convention as every other test
// in this repo.

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const landingSource = readFile('components/LandingPage.tsx')
const cssSource = readFile('app/globals.css')

const heroStart = landingSource.indexOf('<section className="landingHero">')
const heroEnd = landingSource.indexOf('</section>', heroStart) + '</section>'.length
const heroSlice = landingSource.slice(heroStart, heroEnd)

describe('5. Public Homepage V3: hero copy is byte-for-byte unchanged', () => {
  it('H1, supporting headline, supporting paragraph, primary CTA, and free-property note all match exactly', () => {
    expect(heroSlice).toContain('<h1>Your properties. Organized.</h1>')
    expect(heroSlice).toContain('<p className="landingHeroTagline">Keep control of your properties without managing every little detail.</p>')
    expect(heroSlice).toContain('<p className="landingHeroSub">PropRoster helps organize the information and numbers behind your properties, simplify communication with tenants and your trusted PropCrew, and automate routine coordination.</p>')
    expect(heroSlice).toContain('>Start Free</button>')
    expect(heroSlice).toContain('<p className="landingHeroFreeNote">Start with your first property free. No credit card required.</p>')
  })
})

describe('6-7. Public Homepage V3: Start Free remains the only hero CTA', () => {
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
})

describe('1. Public Homepage V3: hero-property.jpg is still used', () => {
  it('the hero renders public/hero-property.jpg — the same reserved asset, not a new/different image, not altered', () => {
    expect(heroSlice).toContain('src="/hero-property.jpg"')
  })

  it('no new image asset was added — still exactly one <img> in the whole landing page', () => {
    expect((landingSource.match(/<img\b/g) || []).length).toBe(1)
  })

  it('decorative-only: empty alt text plus aria-hidden on its wrapper, so it is never required to understand the page and is never announced to a screen reader', () => {
    const imgMatch = heroSlice.match(/<img\b[^>]*\/>/)
    expect(imgMatch).not.toBeNull()
    expect(imgMatch![0]).toMatch(/alt=""/)
    expect(heroSlice).toContain('className="landingHeroBg" aria-hidden="true"')
  })

  it('the image has explicit width/height (matching the real 1536x1024 file) so it never causes layout shift', () => {
    expect(heroSlice).toMatch(/width=\{1536\}/)
    expect(heroSlice).toMatch(/height=\{1024\}/)
  })

  it('loads eagerly at high priority — it is above the fold, not a lazy-loaded background image', () => {
    expect(heroSlice).toContain('loading="eager"')
    expect(heroSlice).toContain('fetchPriority="high"')
  })
})

describe('2-3. Public Homepage V3: the photo is an integrated background layer, not a standalone card', () => {
  it('no dedicated image-card/frame classes survive anywhere in the file — the old .landingHeroVisual/.landingHeroImageFrame/.landingHeroGrid two-column wrapper are gone', () => {
    expect(landingSource).not.toMatch(/landingHeroVisual|landingHeroImageFrame|landingHeroGrid|landingHeroContent\b/)
    expect(cssSource).not.toMatch(/landingHeroVisual|landingHeroImageFrame|landingHeroGrid/)
  })

  it('the image sits inside one absolutely positioned background layer behind the copy, not beside or below it in a second content block', () => {
    expect(heroSlice).toContain('className="landingHeroBg" aria-hidden="true"')
    expect(heroSlice).toContain('className="landingHeroBgImage"')
    expect(heroSlice).toContain('className="landingHeroBgFade"')
    expect(heroSlice).toContain('className="landingHeroInner"')
    const bgRule = cssSource.match(/\.landingHeroBg \{[^}]*\}/)?.[0] || ''
    expect(bgRule).toContain('position: absolute')
    expect(bgRule).toContain('inset: 0')
    const innerRule = cssSource.match(/\.landingHeroInner \{[^}]*\}/)?.[0] || ''
    expect(innerRule).toContain('position: relative')
  })

  it('the image itself carries no frame/border/shadow/rounded-corner treatment — nothing left to read as a "photo card"', () => {
    const imageRule = cssSource.match(/\.landingHeroBgImage \{[^}]*\}/)?.[0] || ''
    expect(imageRule).not.toMatch(/border-radius|box-shadow|border:/)
  })

  it('a fade overlay sits on top of the photo, softening it into the page rather than a hard-edged rectangle', () => {
    const fadeRule = cssSource.slice(cssSource.indexOf('.landingHeroBgFade {'), cssSource.indexOf('.landingHeroInner {'))
    expect(fadeRule).toContain('linear-gradient')
    // At least two stacked gradients (horizontal fade + vertical feather) —
    // a single flat overlay would still leave a hard top/bottom edge.
    expect((fadeRule.match(/linear-gradient\(/g) || []).length).toBeGreaterThanOrEqual(2)
  })

  it('the photo is visually softened (reduced opacity, blurred) — "atmosphere," not a crisp, full-strength photograph', () => {
    const imageRule = cssSource.match(/\.landingHeroBgImage \{[^}]*\}/)?.[0] || ''
    const opacityMatch = imageRule.match(/opacity:\s*([\d.]+)/)
    expect(opacityMatch).not.toBeNull()
    expect(Number(opacityMatch![1])).toBeLessThan(0.5)
    expect(imageRule).toMatch(/filter:\s*blur\(/)
  })

  it('the fade is anchored to the actual text column width (absolute px stops), not a viewport percentage that could let a narrower screen reveal photo detail under the paragraph text', () => {
    const fadeRule = cssSource.slice(cssSource.indexOf('.landingHeroBgFade {'), cssSource.indexOf('.landingHeroInner {'))
    expect(fadeRule).toMatch(/linear-gradient\(100deg,\s*rgba\(245, 247, 249, 1\) 0px/)
    expect(fadeRule).toMatch(/px\)/)
  })
})

describe('4. Public Homepage V3: mobile does not stack a standalone house image below the CTA', () => {
  it('no separate mobile image block exists — the ≤980px breakpoint only re-tunes the SAME background layer\'s opacity/position/fade, it never reintroduces a stacked <img> or a second content section', () => {
    const bp980Start = cssSource.indexOf('@media (max-width: 980px)')
    const bp980 = cssSource.slice(bp980Start, cssSource.indexOf('@media (max-width: 560px)', bp980Start))
    expect(bp980).toContain('.landingHeroBgImage')
    expect(bp980).toContain('.landingHeroBgFade')
    expect(bp980).not.toMatch(/<img/)
  })

  it('the free-property note is the last thing in .landingHeroInner — nothing (image or otherwise) is appended after it inside the hero\'s content column', () => {
    const innerStart = heroSlice.indexOf('className="landingHeroInner"')
    const innerSlice = heroSlice.slice(innerStart)
    const freeNoteIdx = innerSlice.indexOf('landingHeroFreeNote')
    const afterFreeNote = innerSlice.slice(freeNoteIdx, innerSlice.indexOf('</div>', freeNoteIdx))
    expect(afterFreeNote).not.toMatch(/<img|landingHeroBg/)
  })

  it('the mobile-tuned background layer is faded more heavily than desktop, not less — the whole point is to recede further at narrow widths, never to intensify into a dominant image', () => {
    const desktopOpacity = Number((cssSource.match(/\.landingHeroBgImage \{[^}]*opacity:\s*([\d.]+)/) || [])[1])
    const bp980Start = cssSource.indexOf('@media (max-width: 980px)')
    const bp980 = cssSource.slice(bp980Start, cssSource.indexOf('@media (max-width: 560px)', bp980Start))
    const mobileOpacity = Number((bp980.match(/\.landingHeroBgImage \{[^}]*opacity:\s*([\d.]+)/) || [])[1])
    expect(mobileOpacity).toBeLessThan(desktopOpacity)
  })
})

describe('Public Homepage V3: hero fills the full viewport width — no leftover two-column grid, no horizontal-scroll risk', () => {
  it('the hero section still clips its own background layer at the section edges', () => {
    const heroRule = cssSource.match(/\.landingHero \{[^}]*\}/)?.[0] || ''
    expect(heroRule).toContain('position: relative')
    expect(heroRule).toContain('overflow: hidden')
  })

  it('no new colors were introduced — the fade reuses the exact --bg token value as an rgba ramp, never a new hex literal', () => {
    const bgFadeBlock = cssSource.slice(cssSource.indexOf('.landingHeroBgFade {'), cssSource.indexOf('.landingHeroInner {'))
    expect(bgFadeBlock).not.toMatch(/#[0-9a-fA-F]{3,8}/)
    expect(bgFadeBlock).toContain('rgba(245, 247, 249')
  })
})

describe('8. Public Homepage V3: four pillars remain (Organize / Coordinate / Automate / Understand)', () => {
  it('all four headings and their exact approved one-line copy are present', () => {
    expect(landingSource).toContain("heading: 'Organize', body: 'Property information, documents, leases and numbers in one place.'")
    expect(landingSource).toContain("heading: 'Coordinate', body: 'Connect tenants with your trusted PropCrew without all the back-and-forth.'")
    expect(landingSource).toContain("heading: 'Automate', body: 'Simplify routine follow-ups and coordination while you stay in control.'")
    expect(landingSource).toContain("heading: 'Understand', body: 'See the financial picture of each property and your portfolio more clearly.'")
  })

  it('exactly four pillar entries render, each still using the shared calm icon-badge pattern — no giant bordered cards reintroduced', () => {
    expect((landingSource.match(/icon: <(?:Folder|People|Automate|Dollar)Icon \/>/g) || []).length).toBe(4)
    expect(landingSource).toContain('<IconBadge>{item.icon}</IconBadge>')
  })

  it('desktop renders all four in one row; the pillar cards carry no border/shadow/background — calm and lightweight, not a second feature-card grid', () => {
    const gridRule = cssSource.match(/\.landingPillarsGrid \{[^}]*\}/)?.[0] || ''
    expect(gridRule).toMatch(/grid-template-columns:\s*repeat\(4,/)
    const cardRuleStart = cssSource.indexOf('.landingPillarCard h2')
    const cardBlock = cssSource.slice(cssSource.indexOf('.landingPillarsGrid'), cardRuleStart + 300)
    expect(cardBlock).not.toMatch(/\.landingPillarCard \{[^}]*border:/)
    expect(cardBlock).not.toMatch(/\.landingPillarCard \{[^}]*box-shadow/)
  })
})

describe('9. Public Homepage V3: mobile pillar copy remains readable without hover', () => {
  it('the ≤980px breakpoint collapses four columns to an elegant 2x2, not four cramped slivers or a hover-dependent layout', () => {
    const bp980Start = cssSource.indexOf('@media (max-width: 980px)')
    const bp980 = cssSource.slice(bp980Start, cssSource.indexOf('@media (max-width: 560px)', bp980Start))
    expect(bp980).toMatch(/\.landingPillarsGrid \{ grid-template-columns:\s*repeat\(2,/)
  })

  it('no :hover-only rule reveals pillar body text — it is always in the DOM and always visible', () => {
    expect(cssSource).not.toMatch(/\.landingPillarCard[^{]*:hover[^{]*\{[^}]*display:\s*none/)
    expect(cssSource).not.toMatch(/\.landingPillarCard p \{[^}]*opacity:\s*0/)
  })
})

describe('10. Public Homepage V3: no horizontal overflow risk introduced', () => {
  it('the fade/background layer is fully contained (overflow: hidden on the hero, inset:0 on the layers) — it cannot push the document wider than the viewport', () => {
    const heroRule = cssSource.match(/\.landingHero \{[^}]*\}/)?.[0] || ''
    expect(heroRule).toContain('overflow: hidden')
    const bgRule = cssSource.match(/\.landingHeroBg \{[^}]*\}/)?.[0] || ''
    expect(bgRule).toContain('inset: 0')
  })
})

describe('Public Homepage V3: everything else on the page is untouched (out of scope)', () => {
  it('pricing is still read from the same canonical lib/billing/plans.ts source, never re-typed', () => {
    expect(landingSource).toContain("import { PLANS, PUBLIC_PLAN_ORDER, PLAN_FEATURE_HIGHLIGHTS, EARLY_ACCESS_PRICING } from '../lib/billing/plans'")
  })

  it('auth (sign-in/sign-up) is completely untouched — same on-demand overlay, same submitAuth/openAuth functions', () => {
    expect(landingSource).toContain('async function submitAuth()')
    expect(landingSource).toContain("function openAuth(mode: 'signin' | 'signup')")
  })

  it('the workflow ("How it works") section is untouched', () => {
    expect(landingSource).toContain('const WORKFLOW_STEPS')
    expect(landingSource).toContain('Let PropRoster help coordinate')
  })
})
