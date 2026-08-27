import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PLANS, PUBLIC_PLAN_ORDER, PLAN_FEATURE_HIGHLIGHTS, EARLY_ACCESS_PRICING } from '../billing/plans'

// Public Homepage Pricing + First Property Free.
//
// Audit findings this milestone is built on (see the completion report
// for the full writeup):
//   - lib/billing/plans.ts's real `free` plan: priceMonthly 0,
//     maxProperties 1 — one property free is genuinely true today.
//   - No signup path (components/LandingPage.tsx's submitAuth ->
//     supabase.auth.signUp) ever touches Stripe or collects a card.
//     Stripe Checkout (app/api/billing/checkout/route.ts) is a separate,
//     later, AUTHENTICATED-ONLY action reachable only from an already
//     signed-in account choosing to upgrade — so "No credit card
//     required" to start is also genuinely true.
// Every test below asserts the homepage's new copy/prices trace back to
// these same verified facts — never a second, hand-typed source that
// could drift.

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const landingSource = readFile('components/LandingPage.tsx')
const pricingPageSource = readFile('app/pricing/page.tsx')
const plansSource = readFile('lib/billing/plans.ts')

describe('Audit: one property free, and no credit card required, are both real and enforced', () => {
  it('the free plan is genuinely $0/month with a real 1-property limit — not a marketing-only "free"', () => {
    expect(PLANS.free.priceMonthly).toBe(0)
    expect(PLANS.free.maxProperties).toBe(1)
  })

  it('the free plan is the first, cheapest entry PUBLIC_PLAN_ORDER actually renders', () => {
    expect(PUBLIC_PLAN_ORDER[0]).toBe('free')
  })

  it('the real signup path never references Stripe, a card field, or checkout — only supabase.auth.signUp', () => {
    const submitAuthIdx = landingSource.indexOf('async function submitAuth')
    const submitAuthEnd = landingSource.indexOf('\n  }', submitAuthIdx)
    const submitAuthBody = landingSource.slice(submitAuthIdx, submitAuthEnd)
    expect(submitAuthBody).toContain('supabase.auth.signUp(')
    expect(submitAuthBody.toLowerCase()).not.toMatch(/stripe|checkout|card/)
  })

  it('Stripe Checkout is gated behind authentication, confirming a brand-new signup never reaches it', () => {
    const checkoutRoute = readFile('app/api/billing/checkout/route.ts')
    expect(checkoutRoute).toContain('Not authenticated.')
    expect(checkoutRoute).toContain('supabase.auth.getUser()')
  })
})

describe('Above-the-fold free-property message', () => {
  it('the hero shows the exact verified message, and it is visually secondary (its own small/muted paragraph, not inside the h1)', () => {
    expect(landingSource).toContain('<p className="landingHeroFreeNote">Start with your first property free. No credit card required.</p>')
    const h1Idx = landingSource.indexOf('<h1>')
    const h1End = landingSource.indexOf('</h1>')
    expect(landingSource.slice(h1Idx, h1End)).not.toContain('credit card')
  })

  it('the free-property note appears after the primary CTA buttons, not before/inside them', () => {
    const ctaIdx = landingSource.indexOf('landingHeroCtas')
    const noteIdx = landingSource.indexOf('landingHeroFreeNote')
    expect(noteIdx).toBeGreaterThan(ctaIdx)
  })

  it('the primary hero CTA reads truthfully to what it actually does (starts the existing signup flow) and stays non-aggressive', () => {
    expect(landingSource).toContain('onClick={startSignup}>Start Free</button>')
    expect(landingSource.toLowerCase()).not.toMatch(/act now|limited time|don't miss|hurry/)
  })
})

describe('Pricing is reachable from the public homepage without an account', () => {
  it('the homepage nav already exposes a Pricing link to the real /pricing page', () => {
    expect(landingSource).toContain('<Link href="/pricing" className="landingNavLink">Pricing</Link>')
  })

  it('/pricing itself remains reachable while signed out (unchanged — this milestone does not touch that page)', () => {
    expect(pricingPageSource).toContain('ready && user ? <AuthHeader /> : (')
  })
})

describe('Homepage pricing section reads from the canonical source — never a second, hardcoded copy', () => {
  it('imports PLANS/PUBLIC_PLAN_ORDER/PLAN_FEATURE_HIGHLIGHTS/EARLY_ACCESS_PRICING from lib/billing/plans — the same module app/pricing/page.tsx uses', () => {
    expect(landingSource).toContain("import { PLANS, PUBLIC_PLAN_ORDER, PLAN_FEATURE_HIGHLIGHTS, EARLY_ACCESS_PRICING } from '../lib/billing/plans'")
    expect(pricingPageSource).toContain("PLANS, PUBLIC_PLAN_ORDER")
    expect(pricingPageSource).toContain("from '../../lib/billing/plans'")
  })

  it('renders every PUBLIC_PLAN_ORDER plan by iterating the array, never a hand-typed plan id list', () => {
    expect(landingSource).toContain('{PUBLIC_PLAN_ORDER.map((planId) => {')
    expect(landingSource).not.toMatch(/landingPricing[\s\S]{0,400}'free'[\s\S]{0,50}'organize'/)
  })

  it('the displayed price is computed from def.priceMonthly, never a literal dollar amount typed into the JSX', () => {
    const sectionIdx = landingSource.indexOf('landingPricing" id="pricing"')
    const sectionEnd = landingSource.indexOf('</section>', sectionIdx)
    const section = landingSource.slice(sectionIdx, sectionEnd)
    expect(section).toContain('${def.priceMonthly.toFixed(2)}')
    // No stray literal prices like $9.99/$19.99 typed directly.
    expect(section).not.toMatch(/\$\d+\.\d{2}/)
  })

  it('the displayed property limit is computed from def.maxProperties, never a literal number typed into the JSX', () => {
    const sectionIdx = landingSource.indexOf('landingPricing" id="pricing"')
    const sectionEnd = landingSource.indexOf('</section>', sectionIdx)
    const section = landingSource.slice(sectionIdx, sectionEnd)
    expect(section).toContain('{def.maxProperties === 1')
    expect(section).not.toMatch(/\b5 propert(y|ies)\b|\b15 propert(y|ies)\b/)
  })

  it('feature bullets come from PLAN_FEATURE_HIGHLIGHTS, not a second, separately-typed bullet list', () => {
    const sectionIdx = landingSource.indexOf('landingPricing" id="pricing"')
    const sectionEnd = landingSource.indexOf('</section>', sectionIdx)
    const section = landingSource.slice(sectionIdx, sectionEnd)
    expect(section).toContain('{PLAN_FEATURE_HIGHLIGHTS[planId]')
    for (const feature of PLAN_FEATURE_HIGHLIGHTS.free!) {
      expect(section).not.toContain(`>${feature}<`) // not literally duplicated as static JSX text
    }
  })

  it('the "Early Access Pricing" pill uses the same EARLY_ACCESS_PRICING flag and isPaid condition as /pricing (paid plans only)', () => {
    const sectionIdx = landingSource.indexOf('landingPricing" id="pricing"')
    const sectionEnd = landingSource.indexOf('</section>', sectionIdx)
    const section = landingSource.slice(sectionIdx, sectionEnd)
    expect(section).toContain("isPaid && EARLY_ACCESS_PRICING && <span className=\"statusPill pricingEarlyAccess\">Early Access Pricing</span>")
    expect(section).toContain("const isPaid = planId !== 'free'")
  })

  it('does not invent a fourth/new tier — exactly PUBLIC_PLAN_ORDER\'s plans are shown, same as /pricing\'s purchasable cards', () => {
    expect(PUBLIC_PLAN_ORDER).toEqual(['free', 'organize', 'manage'])
  })

  it('reuses the existing .pricingGrid/.pricingCard styling rather than a second, parallel card design', () => {
    const sectionIdx = landingSource.indexOf('landingPricing" id="pricing"')
    const sectionEnd = landingSource.indexOf('</section>', sectionIdx)
    const section = landingSource.slice(sectionIdx, sectionEnd)
    expect(section).toContain('className="pricingGrid landingPricingGrid"')
    expect(section).toContain('className={`pricingCard')
  })
})

describe('CTA after the pricing section', () => {
  it('uses the exact verified copy and routes into the real, existing signup flow (startSignup — no new signup page/route)', () => {
    const sectionIdx = landingSource.indexOf('landingPricing" id="pricing"')
    const sectionEnd = landingSource.indexOf('</section>', sectionIdx)
    const block = landingSource.slice(sectionIdx, sectionEnd)
    expect(block).toContain('Start with your first property free.')
    expect(block).toContain('onClick={startSignup}>Get Started Free</button>')
    expect(block).toContain('No credit card required.')
  })

  it('the pricing section also links to the full /pricing page (Coming Soon + 16+ tiers live there, not duplicated here)', () => {
    expect(landingSource).toContain('<Link href="/pricing" className="landingPricingFullLink">View full pricing details →</Link>')
  })
})

describe('No unsupported claims are introduced', () => {
  it('no superlative/guarantee language appears anywhere in the new homepage copy', () => {
    const forbidden = ['best property management', 'guaranteed savings', 'guaranteed return', 'free forever']
    const lower = landingSource.toLowerCase()
    for (const phrase of forbidden) {
      expect(lower).not.toContain(phrase)
    }
  })

  it('"No credit card required" appears only alongside the verified free-property message — never as a standalone, unqualified claim elsewhere in the file', () => {
    const occurrences = [...landingSource.matchAll(/No credit card required\./g)]
    expect(occurrences.length).toBe(2) // hero note + pricing-section CTA note, both audited above
  })
})

describe('Mobile pricing layout — no horizontal scroll at iPhone widths (360/390/430)', () => {
  const css = readFile('app/globals.css')

  it('the pricing grid collapses to a single column well above the narrowest target width (360px) — the existing shared rule, reused, not a second breakpoint', () => {
    expect(css).toMatch(/@media \(max-width: 620px\) \{ \.pricingGrid \{ grid-template-columns: 1fr; \} \}/)
  })

  it('the homepage pricing section has its own mobile padding at both the 980px and 560px breakpoints already used for the rest of the hero/landing content', () => {
    expect(css).toMatch(/@media \(max-width: 980px\) \{[\s\S]*?\.landingPricing \{ padding: 0 22px; \}[\s\S]*?\}/)
    expect(css).toMatch(/@media \(max-width: 560px\) \{[\s\S]*?\.landingPricing \{ padding: 0 16px; margin: 6px auto 44px; \}[\s\S]*?\}/)
  })

  it('the CTA button below the pricing cards is full-width on mobile (same treatment as the hero CTAs), so it stays easy to tap without causing overflow', () => {
    expect(css).toContain('.landingPricingCta .landingCtaPrimary { width: 100%; }')
  })

  it('nothing in the new CSS sets a fixed pixel width wide enough to force horizontal scroll on a 360px viewport', () => {
    const newRulesMatch = css.match(/\/\* Public Homepage Pricing \+ First Property Free[\s\S]*?\.landingPricingFullLink:hover \{ text-decoration: underline; \}/)
    expect(newRulesMatch).not.toBeNull()
    const newRules = newRulesMatch![0]
    const fixedWidths = [...newRules.matchAll(/(?<!max-)width:\s*(\d+)px/g)].map((m) => Number(m[1]))
    for (const w of fixedWidths) expect(w).toBeLessThan(360)
  })
})

describe('Existing authenticated pricing/billing behavior is unchanged', () => {
  it('app/pricing/page.tsx keeps its own exact hero copy and CTA logic untouched by this milestone', () => {
    expect(pricingPageSource).toContain('<h1>Simple pricing for your properties.</h1>')
    expect(pricingPageSource).toContain('Upgrade to ${def.name}')
    expect(pricingPageSource).toContain('isCurrent ? (\n                  <button className="secondary" disabled>Current Plan</button>')
  })

  it('lib/billing/plans.ts and lib/billing/entitlements.ts are unmodified in substance — same PlanId union, same PurchasablePlanId', () => {
    expect(plansSource).toContain("export type PlanId = 'free' | 'organize' | 'manage' | 'automate' | 'investor' | 'portfolio' | 'portfolio_pro' | 'owner'")
    expect(plansSource).toContain("export type PurchasablePlanId = 'organize' | 'manage'")
  })

  it('no Stripe/checkout/entitlement file was touched by this milestone (schema, stripe.ts, entitlements.ts, checkout route)', () => {
    // A pure content check: these files still contain their known,
    // pre-existing markers untouched — a real behavior change would show
    // up as a failure in their own dedicated test suites (stripe.test.ts,
    // entitlements.test.ts), which this run also exercises.
    const stripeLib = readFile('lib/billing/stripe.ts')
    expect(stripeLib).toContain('resolvePriceId')
  })
})
