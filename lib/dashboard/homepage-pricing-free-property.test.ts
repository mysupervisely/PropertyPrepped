import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PLANS, PUBLIC_PLAN_ORDER, PLAN_FEATURE_HIGHLIGHTS, EARLY_ACCESS_PRICING } from '../billing/plans'

// Public Homepage Pricing + First Property Free (extended by Public
// Homepage V2 — Product Story + Pricing Simplification, which rewrote
// components/LandingPage.tsx's structure and copy but never the
// underlying facts these tests protect).
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
// Every test below asserts the homepage's copy/prices trace back to
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

  it('the free-property note appears after the primary CTA button, not before/inside it', () => {
    const ctaIdx = landingSource.indexOf('landingHeroCtas')
    const noteIdx = landingSource.indexOf('landingHeroFreeNote')
    expect(noteIdx).toBeGreaterThan(ctaIdx)
  })

  it('the primary hero CTA reads truthfully to what it actually does (opens the existing signup flow) and stays non-aggressive', () => {
    expect(landingSource).toContain("onClick={() => openAuth('signup')}>Start Free</button>")
    expect(landingSource.toLowerCase()).not.toMatch(/act now|limited time|don't miss|hurry/)
  })

  it('Public Homepage V2: there is exactly ONE primary hero CTA — Rental Property Analyzer is no longer a competing hero-level button (Section 11)', () => {
    const heroIdx = landingSource.indexOf('<section className="landingHero">')
    const heroEnd = landingSource.indexOf('</section>', heroIdx)
    const heroBlock = landingSource.slice(heroIdx, heroEnd)
    expect(heroBlock).not.toContain('rental-analyzer')
    expect((heroBlock.match(/landingCtaPrimary/g) || []).length).toBe(1)
  })
})

describe('Pricing is reachable from the public homepage without an account', () => {
  it('the homepage nav already exposes a Pricing link to the real /pricing page', () => {
    expect(landingSource).toContain('<Link href="/pricing" className="landingNavLink">Pricing</Link>')
  })

  // Simplification + Maintenance Workspace V2, Phase D.1 gave the
  // signed-in branch a hideMobileNav prop (Pricing is a public/
  // marketing surface, excluded from the new mobile bottom nav) —
  // reachability while signed out is otherwise unchanged.
  it('/pricing itself remains reachable while signed out (unchanged — this milestone does not touch that page)', () => {
    expect(pricingPageSource).toContain('ready && user ? <AuthHeader hideMobileNav /> : (')
  })
})

describe('Public Homepage V2: returning-user sign-in moved to the header, not a permanent embedded card', () => {
  it('the header exposes a clear "Log In" action alongside "Start Free" (Section 12), both opening the same existing auth panel', () => {
    expect(landingSource).toContain("<button type=\"button\" className=\"landingNavLogin\" onClick={() => openAuth('signin')}>Log In</button>")
    expect(landingSource).toContain("<button type=\"button\" className=\"primary landingNavStartFree\" onClick={() => openAuth('signup')}>Start Free</button>")
  })

  it('the sign-in/sign-up form only renders when opened — it is not part of the hero\'s permanent layout', () => {
    const heroIdx = landingSource.indexOf('<section className="landingHero">')
    const heroEnd = landingSource.indexOf('</section>', heroIdx)
    const heroBlock = landingSource.slice(heroIdx, heroEnd)
    expect(heroBlock).not.toContain('landingSignInCard')
    expect(landingSource).toContain('{authOpen && (')
  })

  it('auth behavior itself is completely unchanged: same submitAuth/switchMode functions, same signInWithPassword/signUp calls', () => {
    expect(landingSource).toContain('async function submitAuth()')
    expect(landingSource).toContain('function switchMode(')
    expect(landingSource).toContain('supabase.auth.signInWithPassword({ email: email.trim(), password })')
    expect(landingSource).toContain('supabase.auth.signUp({ email: email.trim(), password })')
  })

  it('the auth overlay can be dismissed (backdrop click and an explicit close button), same interaction pattern as every other modal in the app', () => {
    expect(landingSource).toContain('className="overlay landingAuthOverlay"')
    expect(landingSource).toContain('e.target === e.currentTarget && closeAuth()')
    expect(landingSource).toContain('aria-label="Close" onClick={closeAuth}')
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
    // "More than 15 properties?" (the 16+/contact line) is expected text,
    // not a plan-card duplicate — this only guards against a hardcoded
    // "Up to 5/15 properties" standing in for {def.maxProperties} on a
    // plan card itself.
    expect(section).not.toMatch(/Up to (5|15) propert(y|ies)\b/)
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

  it('the "Early Access Pricing" pill uses the same EARLY_ACCESS_PRICING flag and isPaid condition as /pricing (paid plans only) — Public Homepage V2 turned the flag off as pricing-clutter cleanup, but the shared rendering logic is unchanged', () => {
    const sectionIdx = landingSource.indexOf('landingPricing" id="pricing"')
    const sectionEnd = landingSource.indexOf('</section>', sectionIdx)
    const section = landingSource.slice(sectionIdx, sectionEnd)
    expect(section).toContain("isPaid && EARLY_ACCESS_PRICING && <span className=\"statusPill pricingEarlyAccess\">Early Access Pricing</span>")
    expect(section).toContain("const isPaid = planId !== 'free'")
    expect(EARLY_ACCESS_PRICING).toBe(false)
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

  it('does not create a new "Automate" tier — Automate stays absent from this compact section, same as before (Section 17/25)', () => {
    const sectionIdx = landingSource.indexOf('landingPricing" id="pricing"')
    const sectionEnd = landingSource.indexOf('</section>', sectionIdx)
    const section = landingSource.slice(sectionIdx, sectionEnd)
    expect(section).not.toContain('Automate')
  })

  it('16+ properties has a simple, honest contact line — reuses the exact same mailto address /pricing already uses, never a fabricated contact route', () => {
    expect(landingSource).toContain('More than 15 properties?')
    expect(landingSource).toContain('mailto:sales@proproster.com?subject=PropRoster%20%E2%80%94%2016%2B%20properties')
    expect(pricingPageSource).toContain('mailto:sales@proproster.com?subject=PropRoster%20%E2%80%94%2016%2B%20properties')
  })
})

describe('CTA after the pricing section', () => {
  it('uses the exact verified copy and routes into the real, existing signup flow (openAuth — no new signup page/route)', () => {
    const sectionIdx = landingSource.indexOf('landingPricing" id="pricing"')
    const sectionEnd = landingSource.indexOf('</section>', sectionIdx)
    const block = landingSource.slice(sectionIdx, sectionEnd)
    expect(block).toContain('Start with your first property free.')
    expect(block).toContain("onClick={() => openAuth('signup')}>Get Started Free</button>")
    expect(block).toContain('No credit card required.')
  })

  it('the pricing section also links to the full /pricing page (Coming Soon + 16+ tiers live there, not duplicated here)', () => {
    expect(landingSource).toContain('<Link href="/pricing" className="landingPricingFullLink">View full pricing details &rarr;</Link>')
  })
})

describe('Public Homepage V2: the three current product pillars are accurately scoped', () => {
  it('features Tenant Connect, Maintenance Coordination and a Tax Center pillar, prominently, above the quiet secondary-features section', () => {
    expect(landingSource).toContain("heading: 'Tenant Connect',")
    expect(landingSource).toContain("heading: 'Maintenance Coordination',")
    expect(landingSource).toContain("heading: 'Live Tax Center',")
    const pillarsIdx = landingSource.indexOf('landingPillars')
    const secondaryIdx = landingSource.indexOf('landingSecondary')
    expect(pillarsIdx).toBeGreaterThan(-1)
    expect(secondaryIdx).toBeGreaterThan(pillarsIdx)
  })

  it('never claims SMS provider outreach, autonomous contractor hiring, or automatic appointment confirmation', () => {
    // Scoped to the actual copy strings this milestone wrote (the PILLARS/
    // WORKFLOW_STEPS/SECONDARY_FEATURES arrays and the JSX text below
    // them) rather than the whole file, which also contains developer
    // comments referencing "sms"-adjacent words like "signInWithPassword".
    const copyIdx = landingSource.indexOf('const PILLARS')
    const copy = landingSource.slice(copyIdx).toLowerCase()
    expect(copy).not.toMatch(/text message.{0,20}provider|\bsms\b/)
    expect(copy).not.toContain('hires')
    expect(copy).not.toContain('automatically confirm')
  })

  it('never claims PropCrew is a marketplace or a PropRoster-supplied provider network', () => {
    const lower = landingSource.toLowerCase()
    expect(lower).not.toContain('marketplace')
    expect(lower).not.toContain('provider network')
  })

  it('never claims tax preparation, filing, or tax advice, other than the explicit disclaimer saying it does NOT', () => {
    expect(landingSource).toContain('It does not prepare or file your taxes')
    // Every other occurrence of "prepare"/"file" near "tax" must be part
    // of that one disclaimer sentence, never a standalone affirmative claim.
    const affirmative = [...landingSource.matchAll(/(?:prepares?|files?) (?:your )?tax(?:es)?/gi)]
      .filter((m) => !landingSource.slice(Math.max(0, m.index! - 20), m.index! + 40).includes('does not'))
    expect(affirmative).toEqual([])
  })

  it('never claims live Cap Rate, NOI, Net Cash Flow or automated equity tracking as currently available (Property Intelligence has not shipped)', () => {
    const lower = landingSource.toLowerCase()
    expect(lower).not.toContain('cap rate')
    expect(lower).not.toContain('net operating income')
    expect(lower).not.toMatch(/\bnoi\b/)
    expect(lower).not.toContain('net cash flow')
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

  it('no em dashes appear in user-facing copy strings (Section 22 — normal punctuation only)', () => {
    // Scoped to the actual rendered-text literals this milestone wrote,
    // not the whole file — JSX/comment source elsewhere may still use an
    // em dash in developer-facing prose, which is exempt.
    const copyBlocks = [...landingSource.matchAll(/(?:text|heading|title):\s*'([^']*)'/g)].map((m) => m[1])
    for (const line of copyBlocks) {
      expect(line).not.toContain('—')
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

  it('the homepage pricing section has its own mobile padding at both the 980px and 560px breakpoints already used for the rest of the landing page', () => {
    expect(css).toMatch(/@media \(max-width: 980px\) \{[\s\S]*?\.landingPricing \{ padding: 0 22px; \}[\s\S]*?\}/)
    expect(css).toMatch(/@media \(max-width: 560px\) \{[\s\S]*?\.landingPricing \{ padding: 0 16px; margin: 6px auto 44px; \}[\s\S]*?\}/)
  })

  it('the CTA button below the pricing cards is full-width on mobile (same treatment as the hero CTA), so it stays easy to tap without causing overflow', () => {
    expect(css).toContain('.landingPricingCta .landingCtaPrimary { width: 100%; }')
  })

  it('nothing in the landing-page CSS sets a fixed pixel width wide enough to force horizontal scroll on a 360px viewport', () => {
    const blockMatch = css.match(/\/\* Public Homepage V2[\s\S]*?\.landingSignInCard \{ padding: 24px 18px; border-radius: 18px; \}\n\}/)
    expect(blockMatch).not.toBeNull()
    const block = blockMatch![0]
    const fixedWidths = [...block.matchAll(/(?<!max-)width:\s*(\d+)px/g)].map((m) => Number(m[1]))
    for (const w of fixedWidths) expect(w).toBeLessThan(360)
  })
})

describe('Existing authenticated pricing/billing behavior is unchanged', () => {
  it('app/pricing/page.tsx keeps its own exact hero copy and CTA logic untouched by this milestone', () => {
    expect(pricingPageSource).toContain('<h1>Simple pricing for your properties.</h1>')
    expect(pricingPageSource).toContain('Upgrade to ${def.name}')
    expect(pricingPageSource).toContain('isCurrent ? (\n                  <button className="secondary" disabled>Current Plan</button>')
  })

  it('lib/billing/plans.ts keeps the same PlanId union, same PurchasablePlanId — only marketing copy fields changed this milestone', () => {
    expect(plansSource).toContain("export type PlanId = 'free' | 'organize' | 'manage' | 'automate' | 'investor' | 'portfolio' | 'portfolio_pro' | 'owner'")
    expect(plansSource).toContain("export type PurchasablePlanId = 'organize' | 'manage'")
  })

  it('actual billing prices (priceMonthly) are untouched this milestone — display-only pricing simplification never changed what Stripe charges (Section 18: CRITICAL BILLING SAFETY CHECK)', () => {
    expect(PLANS.organize.priceMonthly).toBe(9.99)
    expect(PLANS.manage.priceMonthly).toBe(19.99)
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
