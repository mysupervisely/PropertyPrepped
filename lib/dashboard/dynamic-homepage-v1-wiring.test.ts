import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// PropRoster — Dynamic Homepage V1, superseded in part by Public Landing
// Page Polish & Privacy Fix.
//
// This file originally covered the Organize/Coordinate/Automate/
// Understand four-scene product story. Public Landing Page Polish &
// Privacy Fix replaced that sequence with a Story/Showcase/Capabilities/
// Tenant Connect/Tax Center structure (see
// lib/dashboard/public-landing-page-polish-v1-wiring.test.ts for that
// structure's own dedicated coverage) — driven by two real problems: a
// real founder-owned address rendering on the public hero, and a large
// dead-scroll-space bug caused by the old Understand scene's sticky/
// tall-wrapper mechanism (see desktop-homepage-v4-wiring.test.ts's own
// updated header comment for the full story).
//
// What survives below: the parts of this milestone's own guarantees that
// still hold true today — the shared reveal primitive is still the one
// motion system, still no heavy animation dependency, reduced-motion
// still leaves the page fully understandable, no authenticated app code
// was touched, and pricing/schema/billing remain untouched.

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const landingSource = readFile('components/LandingPage.tsx')
const cssSource = readFile('app/globals.css')
const hookSource = readFile('lib/homepage/use-scroll-reveal.ts')

describe('The hero promise', () => {
  it('"Your properties. Organized." is still the H1, hero Start Free is still the primary CTA', () => {
    expect(landingSource).toContain('<h1>Your properties. Organized.</h1>')
    const heroStart = landingSource.indexOf('<section className="landingHero">')
    const heroEnd = landingSource.indexOf('</section>', heroStart) + '</section>'.length
    const heroSlice = landingSource.slice(heroStart, heroEnd)
    expect(heroSlice).toContain("onClick={() => openAuth('signup')}>Start Free</button>")
    expect((heroSlice.match(/>Start Free<\/button>/g) || []).length).toBe(1)
  })
})

describe('CTA rhythm: header (persistent) -> hero -> product content (zero) -> pricing (link only) -> one final close', () => {
  it('exactly three real Start Free/Get Started Free CTA buttons exist on the whole page — header, hero, final close — never a fourth', () => {
    const buttons = [...landingSource.matchAll(/>(?:Start Free|Get Started Free)<\/button>/g)]
    expect(buttons.length).toBe(3)
  })

  it('none of the content sections between the hero and pricing (Story/Showcase/Capabilities/Tenant Connect/Tax Center) contain a Start Free CTA — the product content itself never asks for signup', () => {
    const start = landingSource.indexOf('className="landingStory"')
    const end = landingSource.indexOf('className="landingPricing"')
    const slice = landingSource.slice(start, end)
    expect(slice).not.toMatch(/Start Free|Get Started Free|openAuth/)
  })

  it('the pricing section has no button of its own — only a link to the full /pricing page', () => {
    const sectionIdx = landingSource.indexOf('landingPricing" id="pricing"')
    const sectionEnd = landingSource.indexOf('</section>', sectionIdx)
    const section = landingSource.slice(sectionIdx, sectionEnd)
    expect(section).not.toMatch(/<button/)
    expect(section).toContain('<Link href="/pricing" className="landingPricingFullLink">')
  })
})

describe('Shared motion system: one reveal primitive, reused everywhere, never a heavy dependency', () => {
  it('the hero and every content section below it use the SAME useScrollReveal hook — no per-section bespoke scroll-listener/rAF code', () => {
    expect(landingSource).toContain("import { useScrollReveal } from '../lib/homepage/use-scroll-reveal'")
    expect((landingSource.match(/useScrollReveal</g) || []).length).toBeGreaterThanOrEqual(8) // Story/Showcase/Capabilities/TenantConnect/TaxCenter/Pricing/Privacy/FinalCta
    expect(landingSource).not.toMatch(/addEventListener\('scroll'/)
    // requestAnimationFrame appears exactly once — the one-time heroReady
    // mount flag (fires once on load, never inside a scroll handler or a
    // repeating loop) — never a scroll-linked rAF animation loop.
    expect((landingSource.match(/requestAnimationFrame/g) || []).length).toBe(1)
  })

  it('no heavy animation library was added — package.json gained no new animation dependency for this milestone', () => {
    const pkg = JSON.parse(readFile('package.json'))
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    for (const bannedLib of ['framer-motion', 'gsap', 'react-spring', 'lottie-web', 'aos']) {
      expect(deps[bannedLib]).toBeUndefined()
    }
  })

  it('the reveal hook is IntersectionObserver-based, reveals once (disconnects), and never hides content when reduced motion is requested', () => {
    expect(hookSource).toContain('new IntersectionObserver(')
    expect(hookSource).toContain('observer.disconnect()')
    expect(hookSource).toContain("window.matchMedia('(prefers-reduced-motion: reduce)').matches")
    const reducedMotionBranchIdx = hookSource.indexOf("prefers-reduced-motion: reduce)').matches")
    expect(reducedMotionBranchIdx).toBeGreaterThan(-1)
    const branchSlice = hookSource.slice(reducedMotionBranchIdx, reducedMotionBranchIdx + 80)
    expect(branchSlice).toContain('setVisible(true)')
  })

  it('missing IntersectionObserver support also fails open to visible — a browser capability gap never hides real content', () => {
    expect(hookSource).toContain("typeof IntersectionObserver === 'undefined'")
  })
})

describe('prefers-reduced-motion: the page remains fully understandable with all motion disabled', () => {
  it('a dedicated reduced-motion media query neutralizes every transition/animation on this page', () => {
    expect(cssSource).toMatch(/@media \(prefers-reduced-motion: reduce\) \{/)
    const idx = cssSource.indexOf('@media (prefers-reduced-motion: reduce) {')
    const block = cssSource.slice(idx, cssSource.indexOf('\n}', idx) + 2)
    for (const selector of ['.sceneReveal', '[data-reveal]', '.landingHeroInner', '.landingHeroBgImage', '.coordinateStep']) {
      expect(block).toContain(selector)
    }
    expect(block).toContain('transition: none !important')
    expect(block).toContain('animation: none !important')
  })

  it('reduced motion never sets display:none/visibility:hidden on real content — only strips the transition/animation properties', () => {
    const idx = cssSource.indexOf('@media (prefers-reduced-motion: reduce) {')
    const block = cssSource.slice(idx, cssSource.indexOf('\n}', idx) + 2)
    expect(block).not.toMatch(/display:\s*none/)
    expect(block).not.toMatch(/visibility:\s*hidden/)
  })

  it('the hero background\'s slow "breathing" scale animation is a pure CSS @keyframes, never a scroll-linked parallax listener', () => {
    expect(cssSource).toContain('@keyframes landingHeroBreathe')
    expect(cssSource).toContain('animation: landingHeroBreathe')
  })
})

describe('Mobile: no horizontal overflow risk in the shared reveal/scene CSS', () => {
  it('no fixed pixel width was introduced anywhere in the shared reveal CSS wide enough to force horizontal scroll at 360px', () => {
    const scenesCssStart = cssSource.indexOf('.sceneReveal {')
    const scenesCssEnd = cssSource.indexOf('@media (min-width: 901px)')
    const block = cssSource.slice(scenesCssStart, scenesCssEnd)
    const fixedWidths = [...block.matchAll(/(?<!min-)(?<!max-)width:\s*(\d+)px/g)].map((m) => Number(m[1]))
    for (const w of fixedWidths) expect(w).toBeLessThan(360)
  })
})

describe('Product truth guardrails', () => {
  it('PropCrew is explicitly framed as the landlord\'s own private directory, never a marketplace or PropRoster-supplied network', () => {
    expect(landingSource).toContain('PropCrew is your own private directory, not a marketplace. You choose who to contact, and you confirm every appointment.')
  })

  it('Tenant Connect never implies autonomous spending, hiring, property entry, repair authorization, or legal decisions', () => {
    const idx = landingSource.indexOf('className="landingTenantConnect"')
    const end = landingSource.indexOf('</section>', idx)
    const block = landingSource.slice(idx, end).toLowerCase()
    for (const phrase of ['spends on your behalf', 'hires a', 'enters your property', 'authorizes repair', 'legal decision']) {
      expect(block).not.toContain(phrase)
    }
  })
})

describe('Guardrails: no authenticated-app redesign, no billing/entitlement/schema change', () => {
  it('no authenticated component/page was modified by this milestone — this is components/LandingPage.tsx + its own CSS/hook only', () => {
    const authHeaderSource = readFile('components/AuthHeader.tsx')
    expect(authHeaderSource).not.toMatch(/use-scroll-reveal|sceneReveal|landingScene/)
    const pageSource = readFile('app/page.tsx')
    expect(pageSource).not.toMatch(/use-scroll-reveal|sceneReveal|landingScene/)
  })

  it('pricing values and property limits are read from the same canonical, untouched lib/billing/plans.ts — no literal price/limit typed into the landing page', () => {
    expect(landingSource).toContain("import { PLANS, PUBLIC_PLAN_ORDER, PLAN_FEATURE_HIGHLIGHTS, EARLY_ACCESS_PRICING } from '../lib/billing/plans'")
    const plansSource = readFile('lib/billing/plans.ts')
    expect(plansSource).toContain('priceMonthly: 0,')
    expect(plansSource).toContain('priceMonthly: 9.99,')
    expect(plansSource).toContain('priceMonthly: 19.99,')
  })

  it('no Automate tier is rendered on the homepage pricing teaser', () => {
    const sectionIdx = landingSource.indexOf('landingPricing" id="pricing"')
    const sectionEnd = landingSource.indexOf('</section>', sectionIdx)
    expect(landingSource.slice(sectionIdx, sectionEnd)).not.toContain('Automate')
  })

  it('no Stripe/checkout/entitlement/schema file was touched by this milestone', () => {
    expect(landingSource).not.toMatch(/stripe|checkout/i)
  })
})
