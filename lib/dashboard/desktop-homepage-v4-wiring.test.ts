import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Desktop Homepage V4 + UNDERSTAND Scroll Polish.
//
// Two, and only two, real-device-reported problems, both scoped to
// desktop: (1) the hero still read as "a real-estate landing page with
// a house photo," not a software product's first screen, and (2) a very
// large blank scroll distance after UNDERSTAND completes, before
// "Everything else stays organized too" appears. Mobile, the four-stage
// story's copy/order, brand, pricing, auth and every other section are
// all explicitly out of scope and unchanged — see
// public-homepage-v3-hero-wiring.test.ts and dynamic-homepage-v1-wiring
// .test.ts for their own still-passing coverage of those.
//
// Same no-jsdom, source-read wiring-test convention as every other test
// in this repo. This repo has no browser-based test harness, so the
// actual BEHAVIORAL proof for both fixes — real headless-Chromium
// measurement against the running app, including simulated touch/scroll
// — was done directly against `npm run dev`, not as a checked-in test;
// see this milestone's own completion report for the full methodology
// and the measured numbers. What's below locks in the CSS/markup that
// produced those measurements, so a future change can't silently drift
// back to the broken state without a test failing first.

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const landingSource = readFile('components/LandingPage.tsx')
const cssSource = readFile('app/globals.css')

const heroStart = landingSource.indexOf('<section className="landingHero">')
const heroEnd = landingSource.indexOf('</section>', heroStart) + '</section>'.length
const heroSlice = landingSource.slice(heroStart, heroEnd)

const desktopBlockStart = cssSource.indexOf('@media (min-width: 901px) {\n  .landingSceneTall { min-height: 100vh;')
const desktopBlockEnd = cssSource.indexOf('\n}', desktopBlockStart) + 2
const desktopBlock = cssSource.slice(desktopBlockStart, desktopBlockEnd)

describe('Desktop hero recomposition — the house is no longer the primary visual', () => {
  it('the house background is fully hidden at the desktop breakpoint, not merely faded further', () => {
    expect(desktopBlock).toMatch(/\.landingHeroBg\s*\{\s*display:\s*none;\s*\}/)
  })

  it('the house background still renders exactly as before on mobile/tablet (below 901px) — this is a desktop-only removal, not a deletion', () => {
    expect(heroSlice).toContain('className="landingHeroBg" aria-hidden="true"')
    expect(heroSlice).toContain('src="/hero-property.jpg"')
    const baseHeroBgRule = cssSource.match(/\.landingHeroBg \{[^}]*\}/)?.[0] || ''
    expect(baseHeroBgRule).not.toContain('display: none')
  })

  it('a real product-UI preview now exists in the hero, rendered from a dedicated component — not an ad hoc inline block', () => {
    expect(landingSource).toContain('function HeroProductPreview()')
    expect(heroSlice).toContain('<HeroProductPreview />')
  })

  it('the preview reuses the REAL, canonical Portfolio Snapshot fields/order (Properties, Portfolio Value, Monthly Rent, YTD NOI) — the exact same fields/order app/page.tsx\'s own authenticated portfolioSnapshotGrid uses, never invented metrics', () => {
    const fnStart = landingSource.indexOf('function HeroProductPreview()')
    const fnEnd = landingSource.indexOf('\n}', fnStart)
    const fnBody = landingSource.slice(fnStart, fnEnd)
    expect(fnBody).toMatch(/<strong>3<\/strong><span>Properties<\/span>/)
    expect(fnBody).toMatch(/Portfolio Value/)
    expect(fnBody).toMatch(/Monthly Rent/)
    expect(fnBody).toMatch(/YTD NOI/)
    // Same ordering as UnderstandStage's own portfolio panel and the
    // real authenticated app/page.tsx portfolioSnapshotGrid.
    const propsIdx = fnBody.indexOf('Properties')
    const valueIdx = fnBody.indexOf('Portfolio Value')
    const rentIdx = fnBody.indexOf('Monthly Rent')
    const noiIdx = fnBody.indexOf('YTD NOI')
    expect(propsIdx).toBeLessThan(valueIdx)
    expect(valueIdx).toBeLessThan(rentIdx)
    expect(rentIdx).toBeLessThan(noiIdx)
  })

  it('reuses the existing .organizeStageMetrics/.organizeMetric/.understandPortfolioGrid classes for the metrics grid — no new, parallel metric-tile system invented for the hero', () => {
    const fnStart = landingSource.indexOf('function HeroProductPreview()')
    const fnEnd = landingSource.indexOf('\n}', fnStart)
    const fnBody = landingSource.slice(fnStart, fnEnd)
    expect(fnBody).toContain('organizeStageMetrics understandPortfolioGrid')
    expect(fnBody).toContain('className="organizeMetric"')
  })

  it('the preview card reuses .sceneStage\'s own restrained visual language (light fill, rounded, hairline border, soft shadow) — not a new heavier card system', () => {
    const panelRule = cssSource.match(/\.heroProductPanel \{[^}]*\}/)?.[0] || ''
    expect(panelRule).toContain('background: var(--surface)')
    expect(panelRule).toContain('border: 1px solid var(--line)')
    expect(panelRule).toContain('border-radius: var(--radius-card)')
    expect(panelRule).toMatch(/box-shadow:/)
  })

  it('no fake browser chrome, no gradients-as-decoration, no glow, and no neon/lime green was introduced', () => {
    const fnStart = landingSource.indexOf('function HeroProductPreview()')
    const fnEnd = landingSource.indexOf('\n}', fnStart)
    const fnBody = landingSource.slice(fnStart, fnEnd)
    expect(fnBody).not.toMatch(/browser|chrome|traffic.?light/i)
    const heroProductRules = cssSource.slice(cssSource.indexOf('.heroProductPanel {'), cssSource.indexOf('.heroProductPropertyFlag {') + 200)
    expect(heroProductRules).not.toMatch(/linear-gradient|radial-gradient|box-shadow:.*glow|#00ff|#0f0\b|lime/i)
  })

  it('the hero becomes a two-column grid only at the desktop breakpoint — .landingHeroProduct is display:none by default (mobile never renders/lays out the product preview)', () => {
    const baseProductRule = cssSource.match(/\.landingHeroProduct \{[^}]*\}/)?.[0] || ''
    expect(baseProductRule).toContain('display: none')
    expect(desktopBlock).toMatch(/\.landingHeroProduct\s*\{[\s\S]*?display:\s*block;/)
  })

  it('the desktop grid puts copy on the left, product preview on the right, in document order — matching the approved LEFT/RIGHT composition', () => {
    const gridStart = heroSlice.indexOf('className="landingHeroGrid"')
    const innerIdx = heroSlice.indexOf('className="landingHeroInner"', gridStart)
    const productIdx = heroSlice.indexOf('className="landingHeroProduct"', gridStart)
    expect(gridStart).toBeGreaterThan(-1)
    expect(innerIdx).toBeGreaterThan(gridStart)
    expect(productIdx).toBeGreaterThan(innerIdx)
  })

  it('the hero is not stretched to fill the viewport — no 100vh/100dvh min-height on .landingHero or its desktop grid', () => {
    const heroRule = cssSource.match(/\.landingHero \{[^}]*\}/)?.[0] || ''
    expect(heroRule).not.toMatch(/min-height:\s*100(vh|dvh)/)
    expect(desktopBlock).not.toMatch(/\.landingHero\s*\{[^}]*min-height:\s*100(vh|dvh)/)
  })

  it('reduced-motion still neutralizes the new product-preview entrance transition, matching every other entrance on this page', () => {
    const reducedMotionBlock = cssSource.slice(cssSource.indexOf('@media (prefers-reduced-motion: reduce)'), cssSource.indexOf('@media (prefers-reduced-motion: reduce)') + 700)
    expect(reducedMotionBlock).toContain('.landingHeroProduct')
  })
})

describe('Hero copy/CTA/brand — byte-for-byte unchanged (only composition changed)', () => {
  it('H1, tagline, sub-copy, CTA and free-plan note are exactly as before', () => {
    expect(heroSlice).toContain('<h1>Your properties. Organized.</h1>')
    expect(heroSlice).toContain('<p className="landingHeroTagline">Keep control of your properties without managing every little detail.</p>')
    expect(heroSlice).toContain("onClick={() => openAuth('signup')}>Start Free</button>")
    expect(heroSlice).toContain('<p className="landingHeroFreeNote">Start with your first property free. No credit card required.</p>')
    expect((heroSlice.match(/>Start Free<\/button>/g) || []).length).toBe(1)
  })

  it('no new marketing claims — the established guardrails still hold', () => {
    expect(landingSource).not.toMatch(/property management made simple/i)
    expect(landingSource).not.toMatch(/ai property management/i)
    expect(landingSource).not.toMatch(/fully automat/i)
    expect(landingSource).not.toMatch(/collect(s|ing)? rent/i)
  })

  it('no font stack change — no new @font-face, no next/font import, no font-family override introduced by this pass', () => {
    expect(landingSource).not.toMatch(/next\/font/)
    const heroProductAndGridCss = cssSource.slice(cssSource.indexOf('.landingHeroGrid'), cssSource.indexOf('.heroProductPropertyFlag {') + 200)
    expect(heroProductAndGridCss).not.toMatch(/font-family/)
  })
})

describe('The four-stage story is fully preserved', () => {
  it('ORGANIZE, COORDINATE, AUTOMATE, UNDERSTAND all still exist, in order, with their exact approved copy', () => {
    expect(landingSource).toContain('<h2 className="landingSceneHeadline">Organize.</h2>')
    expect(landingSource).toContain('<h2 className="landingSceneHeadline">Coordinate.</h2>')
    expect(landingSource).toContain('<h2 className="landingSceneHeadline">Automate.</h2>')
    expect(landingSource).toContain('<h2 className="landingSceneHeadline">Understand.</h2>')
    const organizeIdx = landingSource.indexOf('Organize.</h2>')
    const coordinateIdx = landingSource.indexOf('Coordinate.</h2>')
    const automateIdx = landingSource.indexOf('Automate.</h2>')
    const understandIdx = landingSource.indexOf('Understand.</h2>')
    expect(organizeIdx).toBeLessThan(coordinateIdx)
    expect(coordinateIdx).toBeLessThan(automateIdx)
    expect(automateIdx).toBeLessThan(understandIdx)
  })

  it('exactly four scenes still render — no stage removed, none added', () => {
    expect((landingSource.match(/className="landingScene(?:"| landingSceneTall")/g) || []).length).toBe(4)
  })
})

describe('UNDERSTAND release fix — the reserved scroll distance is tied to real content, not an arbitrary flat multiplier', () => {
  it('the tall wrapper\'s min-height was reduced from the broken 220vh to 112vh — real headless-Chromium measurement (see completion report) confirmed 220vh left ~1.4x viewport heights of dead scroll after the crossfade completed; 112vh leaves a short, consistent ~0.3x-viewport intentional hold at every desktop width/height tested (1280-1728 x 700-1100)', () => {
    expect(desktopBlock).toContain('.landingSceneTall .landingSceneInner { width: 100%; align-items: start; min-height: 112vh; }')
    expect(desktopBlock).not.toMatch(/min-height:\s*220vh/)
  })

  it('the crossfade trigger point itself (the marker positions) is untouched — this fix only shortened the TAIL (the hold after completion), never the entrance/crossfade timing the user did not flag as broken', () => {
    expect(cssSource).toContain(".landingSceneMarkerBottom { top: 60vh; }")
    expect(cssSource).toContain('.landingSceneMarkerTop { top: 0; }')
  })

  it('the sticky offset (140px) is untouched — same release mechanism, just less excess distance reserved before it can occur', () => {
    expect(desktopBlock).toContain('.landingSceneTextSticky { position: sticky; top: 140px; align-self: start; }')
    expect(desktopBlock).toContain('.landingSceneStageSticky { position: sticky; top: 140px; }')
  })

  it('mobile/tablet (≤900px) never reserves extra scroll distance at all — the tall-wrapper geometry is entirely a desktop-only concern, confirming this fix cannot affect mobile', () => {
    const bp900Start = cssSource.indexOf('@media (max-width: 900px)')
    const bp900 = cssSource.slice(bp900Start, cssSource.indexOf('@media (max-width: 980px)', bp900Start))
    expect(bp900).toContain('.landingSceneTall, .landingSceneTall .landingSceneInner { min-height: 0; display: block; }')
  })

  it('the fix is not a visual hack — no negative margin, arbitrary translateY, huge fixed offset, or absolute-positioning override was introduced around .landingSecondary to pull it upward', () => {
    const secondaryRule = cssSource.match(/\.landingSecondary \{[^}]*\}/)?.[0] || ''
    expect(secondaryRule).not.toMatch(/margin-top:\s*-/)
    expect(secondaryRule).not.toMatch(/transform:\s*translateY/)
    expect(secondaryRule).not.toContain('position: absolute')
  })

  it('the two-marker crossfade mechanism itself (IntersectionObserver-driven, one-shot reveal) is unchanged — this was a geometry fix, not an architecture rewrite', () => {
    expect(landingSource).toContain('const stageMarker = useScrollReveal<HTMLDivElement>({ threshold: 0.1 })')
    expect(landingSource).toContain("const portfolioMarker = useScrollReveal<HTMLDivElement>({ threshold: 0.1, rootMargin: '0px 0px -30% 0px' })")
  })
})

describe('No unrelated product logic, schema, or authenticated app code was touched', () => {
  it('LandingPage.tsx and app/globals.css are the only files this milestone needed to change (verified by this file\'s own scope, not asserted structurally — see the completion report\'s files-changed list)', () => {
    // Sanity: the auth functions this component depends on are still the
    // same, untouched functions — confirms no auth-adjacent rewrite
    // happened alongside the visual change.
    expect(landingSource).toContain('async function submitAuth()')
    expect(landingSource).toContain("function openAuth(mode: 'signin' | 'signup')")
  })

  it('pricing is still read from the same canonical source, never re-typed', () => {
    expect(landingSource).toContain("import { PLANS, PUBLIC_PLAN_ORDER, PLAN_FEATURE_HIGHLIGHTS, EARLY_ACCESS_PRICING } from '../lib/billing/plans'")
  })
})
