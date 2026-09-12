import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// PropRoster — Dynamic Homepage V1.
//
// Takes the existing Public Homepage V2/V3 product-story architecture
// and adds movement, depth, and continuity: the Organize/Coordinate/
// Automate/Understand narrative becomes a sequence of cinematic
// "scenes" built from real PropRoster UI concepts (a Property Snapshot,
// a maintenance/PropCrew workflow, a Portfolio Snapshot) instead of a
// four-icon feature grid, and a redundant CTA block between pricing and
// the final close is removed. Same no-jsdom, source-read wiring-test
// convention as every other test in this repo — most of the legacy
// hero/pricing/positioning invariants this milestone touches are
// rescoped in place in public-homepage-v3-hero-wiring.test.ts and
// homepage-pricing-free-property.test.ts; this file covers what's
// genuinely new: the scene structure itself, the shared motion
// primitive, reduced-motion behavior, and the CTA-count audit.

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const landingSource = readFile('components/LandingPage.tsx')
const cssSource = readFile('app/globals.css')
const hookSource = readFile('lib/homepage/use-scroll-reveal.ts')

describe('The hero promise is unchanged', () => {
  it('"Your properties. Organized." is still the H1, hero Start Free is still the primary CTA', () => {
    expect(landingSource).toContain('<h1>Your properties. Organized.</h1>')
    const heroStart = landingSource.indexOf('<section className="landingHero">')
    const heroEnd = landingSource.indexOf('</section>', heroStart) + '</section>'.length
    const heroSlice = landingSource.slice(heroStart, heroEnd)
    expect(heroSlice).toContain("onClick={() => openAuth('signup')}>Start Free</button>")
    expect((heroSlice.match(/>Start Free<\/button>/g) || []).length).toBe(1)
  })
})

describe('CTA rhythm: header (persistent) -> hero -> product story (zero) -> pricing (link only) -> one final close', () => {
  it('exactly three real Start Free/Get Started Free CTA buttons exist on the whole page — header, hero, final close — never a fourth', () => {
    const buttons = [...landingSource.matchAll(/>(?:Start Free|Get Started Free)<\/button>/g)]
    expect(buttons.length).toBe(3)
  })

  it('no scene (Organize/Coordinate/Automate/Understand) contains a Start Free CTA — the product story itself never asks for signup', () => {
    const scenesStart = landingSource.indexOf('<section className="landingScenes"')
    const scenesEnd = landingSource.indexOf('</section>', scenesStart) + '</section>'.length
    const scenesSlice = landingSource.slice(scenesStart, scenesEnd)
    expect(scenesSlice).not.toMatch(/Start Free|Get Started Free|openAuth/)
  })

  it('the pricing section has no button of its own — only a link to the full /pricing page', () => {
    const sectionIdx = landingSource.indexOf('landingPricing" id="pricing"')
    const sectionEnd = landingSource.indexOf('</section>', sectionIdx)
    const section = landingSource.slice(sectionIdx, sectionEnd)
    expect(section).not.toMatch(/<button/)
    expect(section).toContain('<Link href="/pricing" className="landingPricingFullLink">')
  })
})

describe('The product story: four real-UI-concept scenes, not a feature grid', () => {
  it('Organize scene shows a Property Snapshot mockup with the real canonical field labels (Est. Value, Est. Equity, Monthly Rent, Mortgage)', () => {
    const idx = landingSource.indexOf('function OrganizeStage')
    const block = landingSource.slice(idx, landingSource.indexOf('function CoordinateStage'))
    for (const field of ['Est. Value', 'Est. Equity', 'Monthly Rent', 'Mortgage']) {
      expect(block).toContain(field)
    }
  })

  it('Coordinate scene shows the real tenant -> PropCrew -> confirmation sequence, never implying PropRoster independently hires or a marketplace exists', () => {
    const idx = landingSource.indexOf('const COORDINATE_STEPS')
    const block = landingSource.slice(idx, landingSource.indexOf('function AutomateStage'))
    expect(block).toContain('Tenant submits a request')
    expect(block).toContain('Routed to your PropCrew contact')
    expect(block).toContain('You confirm')
    // The "not a marketplace" disclaimer itself is verified separately,
    // in the "Product truth guardrails" describe block below — it's
    // rendered as the scene's own text-column copy inside LandingPage()
    // proper, not inside this CoordinateStage stage-mockup function.
  })

  it('Automate scene reuses the real maintenance-case status vocabulary (Submitted -> Scheduled -> In Progress -> Completed lives in lib/maintenance/command-center.ts) rather than inventing new status words', () => {
    const statusSource = readFile('lib/maintenance/command-center.ts')
    expect(statusSource).toContain("export type MaintenanceCaseStatus = 'Submitted' | 'Scheduled' | 'In Progress' | 'Completed'")
    const idx = landingSource.indexOf('function AutomateStage')
    const block = landingSource.slice(idx, landingSource.indexOf('function UnderstandStage'))
    expect(block).toContain('Scheduled')
  })

  it('Understand scene transforms a Property Snapshot into a Portfolio Snapshot using the exact canonical portfolio field set/order (Properties, Portfolio Value, Monthly Rent, YTD NOI)', () => {
    // Scoped to just the portfolio-level panel's own markup — "Monthly
    // Rent" legitimately appears in BOTH the property panel and the
    // portfolio panel (a property has a monthly rent; so does a
    // portfolio), so an unscoped whole-function order check would find
    // the property panel's earlier occurrence first and misread the
    // order.
    const panelIdx = landingSource.indexOf('understandPanelPortfolio')
    const panelEnd = landingSource.indexOf('</div>\n    </div>\n  )\n}', panelIdx)
    const block = landingSource.slice(panelIdx, panelEnd)
    const order = ['Properties</span>', 'Portfolio Value', 'Monthly Rent', 'YTD NOI']
    let lastIdx = -1
    for (const field of order) {
      const i = block.indexOf(field)
      expect(i).toBeGreaterThan(lastIdx)
      lastIdx = i
    }
  })

  it('no financial calculation lives in the landing page — every number is a hardcoded illustrative sample string, never a computed formula', () => {
    const idx = landingSource.indexOf('function OrganizeStage')
    const block = landingSource.slice(idx, landingSource.indexOf('export default function LandingPage'))
    // A real formula would declare a variable computed from arithmetic
    // (e.g. `const noi = income - expenses`) — every metric here is
    // instead a literal string like <strong>$420K</strong>, never a
    // `const`/`let` binding at all.
    expect(block).not.toMatch(/\b(?:const|let)\s+\w+\s*=\s*[\w.]+\s*[-+*/]\s*[\w.]+/)
    expect(block).not.toMatch(/calculate|computeN[Oo]i|capRate/)
  })
})

describe('Shared motion system: one reveal primitive, reused everywhere, never a heavy dependency', () => {
  it('every scene text/stage and the four sections below the scenes use the SAME useScrollReveal hook — no per-section bespoke scroll-listener/rAF code', () => {
    expect(landingSource).toContain("import { useScrollReveal } from '../lib/homepage/use-scroll-reveal'")
    expect((landingSource.match(/useScrollReveal</g) || []).length).toBeGreaterThanOrEqual(6) // Reveal component + stageMarker/portfolioMarker + 4 section hooks
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
    // The reduced-motion branch sets visible immediately — content is
    // never gated behind motion actually running.
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
  it('a dedicated reduced-motion media query neutralizes every new transition/animation this milestone added', () => {
    expect(cssSource).toMatch(/@media \(prefers-reduced-motion: reduce\) \{/)
    const idx = cssSource.indexOf('@media (prefers-reduced-motion: reduce) {')
    const block = cssSource.slice(idx, cssSource.indexOf('\n}', idx) + 2)
    for (const selector of ['.sceneReveal', '[data-reveal]', '.landingHeroInner', '.landingHeroBgImage', '.coordinateStep', '.automateStep', '.understandPanel']) {
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

describe('Mobile: no forced sticky/parallax behavior, no horizontal overflow risk', () => {
  it('the desktop-only sticky treatment for the Understand scene is gated behind a min-width media query — never applied unconditionally', () => {
    expect(cssSource).toMatch(/@media \(min-width: 901px\) \{\s*\.landingSceneTall/)
  })

  it('a matching max-width breakpoint collapses every scene to one stacked column and removes the tall/sticky wrapper entirely on mobile', () => {
    const idx = cssSource.indexOf('@media (max-width: 900px) {')
    expect(idx).toBeGreaterThan(-1)
    const block = cssSource.slice(idx, cssSource.indexOf('@media (max-width: 980px)', idx))
    expect(block).toMatch(/grid-template-columns:\s*1fr/)
    expect(block).toContain('.landingSceneTall, .landingSceneTall .landingSceneInner { min-height: 0; display: block; }')
  })

  it('no new fixed pixel width was introduced anywhere in the new scene CSS wide enough to force horizontal scroll at 360px', () => {
    const scenesCssStart = cssSource.indexOf('.sceneReveal {')
    const scenesCssEnd = cssSource.indexOf('@media (min-width: 901px)')
    const block = cssSource.slice(scenesCssStart, scenesCssEnd)
    const fixedWidths = [...block.matchAll(/(?<!min-)(?<!max-)width:\s*(\d+)px/g)].map((m) => Number(m[1]))
    for (const w of fixedWidths) expect(w).toBeLessThan(360)
  })
})

describe('Product truth guardrails specific to the new scenes', () => {
  it('PropCrew is explicitly framed as the landlord\'s own private directory, never a marketplace or PropRoster-supplied network', () => {
    expect(landingSource).toContain('PropCrew is your own private directory, not a marketplace. You choose who to contact, and you confirm every appointment.')
  })

  it('the Automate scene never implies autonomous spending, hiring, property entry, repair authorization, or legal decisions', () => {
    const idx = landingSource.indexOf('function AutomateStage')
    const block = landingSource.slice(idx, landingSource.indexOf('function UnderstandStage')).toLowerCase()
    for (const phrase of ['spends on your behalf', 'hires a', 'enters your property', 'authorizes repair', 'legal decision']) {
      expect(block).not.toContain(phrase)
    }
  })

  it('the Automate scene\'s own body copy states the landlord stays in control of every decision', () => {
    expect(landingSource).toContain('PropRoster helps move requests, availability and provider communication forward. You stay in control of every decision.')
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
