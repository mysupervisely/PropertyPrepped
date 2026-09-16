import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Desktop Homepage V4 + UNDERSTAND Scroll Polish — superseded by Public
// Landing Page Polish & Privacy Fix.
//
// This file originally covered a specific historical fix: reducing the
// UNDERSTAND scene's sticky/tall-scroll-wrapper reserved height from
// 220vh to 112vh. Public Landing Page Polish & Privacy Fix found that
// this same sticky/tall-wrapper mechanism was STILL the root cause of a
// large dead-scroll-space bug the founder reported ("the page doesn't
// flow") — confirmed by inspecting computed styles through a real
// incremental scroll, not just a one-shot screenshot. Rather than tuning
// the reserved height further, that milestone removed the sticky/
// crossfade mechanism entirely, replacing the four-scene Organize/
// Coordinate/Automate/Understand sequence with a Story/Showcase/
// Capabilities/Tenant Connect/Tax Center structure that never reserves
// scroll space ahead of content — see
// lib/dashboard/public-landing-page-polish-v1-wiring.test.ts for that
// structure's own coverage.
//
// What survives below: the parts of this file that describe behavior
// Public Landing Page Polish & Privacy Fix deliberately did NOT change
// (hero-property.jpg's mobile-only rendering, no font-stack change, the
// desktop hero still not stretched to fill the viewport) plus explicit
// regression guards that the specific sticky/tall-wrapper mechanism is
// gone, not just retuned — a stronger guarantee against the same class
// of bug recurring than re-measuring a vh value would be.

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const landingSource = readFile('components/LandingPage.tsx')
const cssSource = readFile('app/globals.css')

const heroStart = landingSource.indexOf('<section className="landingHero">')
const heroEnd = landingSource.indexOf('</section>', heroStart) + '</section>'.length
const heroSlice = landingSource.slice(heroStart, heroEnd)

describe('Desktop hero — the house is no longer the primary visual', () => {
  it('the house background is fully hidden at the desktop breakpoint, not merely faded further', () => {
    const desktopBlockStart = cssSource.indexOf('.landingHeroBg { display: none; }')
    expect(desktopBlockStart).toBeGreaterThan(-1)
    const enclosingMediaStart = cssSource.lastIndexOf('@media (min-width: 901px)', desktopBlockStart)
    expect(enclosingMediaStart).toBeGreaterThan(-1)
    expect(enclosingMediaStart).toBeLessThan(desktopBlockStart)
  })

  it('the house background still renders exactly as before on mobile/tablet (below 901px) — this is a desktop-only removal, not a deletion', () => {
    expect(heroSlice).toContain('className="landingHeroBg" aria-hidden="true"')
    expect(heroSlice).toContain('src="/hero-property.jpg"')
    const baseHeroBgRule = cssSource.match(/\.landingHeroBg \{[^}]*\}/)?.[0] || ''
    expect(baseHeroBgRule).not.toContain('display: none')
  })

  it('a real product-UI preview exists in the hero, rendered from a dedicated component — not an ad hoc inline block', () => {
    expect(landingSource).toContain('function HeroProductPreview()')
    expect(heroSlice).toContain('<HeroProductPreview />')
  })

  it('the hero becomes a two-column grid only at the desktop breakpoint — .landingHeroProduct is display:none by default (mobile never renders/lays out the product preview)', () => {
    const baseProductRule = cssSource.match(/\.landingHeroProduct \{[^}]*\}/)?.[0] || ''
    expect(baseProductRule).toContain('display: none')
  })

  it('the hero is not stretched to fill the viewport — no 100vh/100dvh min-height on .landingHero or its desktop grid', () => {
    const heroRule = cssSource.match(/\.landingHero \{[^}]*\}/)?.[0] || ''
    expect(heroRule).not.toMatch(/min-height:\s*100(vh|dvh)/)
  })

  it('reduced-motion still neutralizes the product-preview entrance transition, matching every other entrance on this page', () => {
    const reducedMotionBlock = cssSource.slice(cssSource.indexOf('@media (prefers-reduced-motion: reduce)'), cssSource.indexOf('@media (prefers-reduced-motion: reduce)') + 700)
    expect(reducedMotionBlock).toContain('.landingHeroProduct')
  })
})

describe('Hero copy/CTA/brand', () => {
  it('exactly one "Start Free" button in the hero — no second competing CTA', () => {
    expect(heroSlice).toContain("onClick={() => openAuth('signup')}>Start Free</button>")
    expect((heroSlice.match(/>Start Free<\/button>/g) || []).length).toBe(1)
  })

  it('no new marketing claims — the established guardrails still hold', () => {
    expect(landingSource).not.toMatch(/property management made simple/i)
    expect(landingSource).not.toMatch(/ai property management/i)
    expect(landingSource).not.toMatch(/fully automat/i)
    expect(landingSource).not.toMatch(/collect(s|ing)? rent/i)
  })

  it('no font stack change — no new @font-face, no next/font import, no font-family override', () => {
    expect(landingSource).not.toMatch(/next\/font/)
    const heroProductAndGridCss = cssSource.slice(cssSource.indexOf('.landingHeroGrid'), cssSource.indexOf('.heroProductPropertyFlag {') + 200)
    expect(heroProductAndGridCss).not.toMatch(/font-family/)
  })
})

describe('UNDERSTAND\'s dead-scroll-space bug — fixed by removing the sticky/tall-wrapper mechanism entirely, not by re-tuning its reserved height', () => {
  it('the sticky/tall-wrapper mechanism (.landingSceneTall, .landingSceneStageSticky, .landingSceneTextSticky, .landingSceneMarker*) no longer exists anywhere in the CSS', () => {
    for (const selector of ['.landingSceneTall', '.landingSceneStageSticky', '.landingSceneTextSticky', '.landingSceneMarkerTop', '.landingSceneMarkerBottom']) {
      expect(cssSource).not.toContain(selector)
    }
  })

  it('no rule in the landing-page CSS section reserves an inflated min-height (100vh+) tied to a scroll-linked crossfade — the exact shape of bug this class of mechanism produced', () => {
    const landingCssStart = cssSource.indexOf('.landingPage {')
    const landingCssEnd = cssSource.indexOf('/* Milestone 8: AI Document Intelligence */')
    const landingCss = cssSource.slice(landingCssStart, landingCssEnd)
    expect(landingCss).not.toMatch(/min-height:\s*1(00|12|20)vh/)
  })

  it('the old UnderstandStage two-panel crossfade component is gone — replaced by a normal-flow product showcase with no reserved scroll runway', () => {
    expect(landingSource).not.toContain('function UnderstandStage')
    expect(landingSource).not.toContain('understandPanelHidden')
    expect(landingSource).not.toContain('understandPanelVisible')
  })
})

describe('No unrelated product logic, schema, or authenticated app code was touched', () => {
  it('the auth functions this component depends on are still the same, untouched functions', () => {
    expect(landingSource).toContain('async function submitAuth()')
    expect(landingSource).toContain("function openAuth(mode: 'signin' | 'signup')")
  })

  it('pricing is still read from the same canonical source, never re-typed', () => {
    expect(landingSource).toContain("import { PLANS, PUBLIC_PLAN_ORDER, PLAN_FEATURE_HIGHLIGHTS, EARLY_ACCESS_PRICING } from '../lib/billing/plans'")
  })
})
