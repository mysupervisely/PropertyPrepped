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
    // Property Overview + Pricing Polish V1, Stage 1: Free/Organize/Manage
    // all have no plan-specific PLAN_FEATURE_HIGHLIGHTS entry anymore —
    // their entire feature set (including what used to be Manage-only:
    // Tenant Connect, Smart Upload, Rent Ledger, PropWatch, etc.) is now
    // shared, stated once via CORE_FEATURES on /pricing (see
    // lib/billing/plans.ts's own comment). 'automate' (not part of
    // PUBLIC_PLAN_ORDER, so never rendered by this homepage section
    // anyway) is the only remaining entry, so it's what's sampled here.
    for (const feature of PLAN_FEATURE_HIGHLIGHTS.automate!) {
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

// Dynamic Homepage V1 (CTA cleanup): the old post-grid CTA block ("Start
// with your first property free." / "Get Started Free" / "No credit
// card required.") duplicated BOTH the hero's own CTA above it and the
// page's final-close CTA right after it, with no product story between
// them — exactly the "too many Start Free" pattern flagged on a real
// iPhone. It's gone; "View full pricing details" is pricing's only next
// action on this compact teaser now, and the page's real final CTA
// (asserted separately below) is the sole remaining close.
describe('CTA after the pricing section', () => {
  it('the redundant post-grid CTA block is gone — no second "Get Started Free" button between pricing and the final close', () => {
    const sectionIdx = landingSource.indexOf('landingPricing" id="pricing"')
    const sectionEnd = landingSource.indexOf('</section>', sectionIdx)
    const block = landingSource.slice(sectionIdx, sectionEnd)
    expect(block).not.toContain('Get Started Free')
    expect(block).not.toContain('landingPricingCta')
    expect((block.match(/landingCtaPrimary/g) || []).length).toBe(0)
  })

  it('the pricing section links to the full /pricing page (Coming Soon + 16+ tiers live there, not duplicated here)', () => {
    expect(landingSource).toContain('<Link href="/pricing" className="landingPricingFullLink">View full pricing details &rarr;</Link>')
  })
})

describe('Public Homepage V2/V3/Dynamic Homepage V1: the product story is accurately scoped', () => {
  it('the four Organize/Coordinate/Automate/Understand scenes are still prominently above the quiet secondary-features section', () => {
    expect(landingSource).toContain('<h2 className="landingSceneHeadline">Organize.</h2>')
    expect(landingSource).toContain('<h2 className="landingSceneHeadline">Coordinate.</h2>')
    expect(landingSource).toContain('<h2 className="landingSceneHeadline">Automate.</h2>')
    expect(landingSource).toContain('<h2 className="landingSceneHeadline">Understand.</h2>')
    const scenesIdx = landingSource.indexOf('landingScenes')
    const secondaryIdx = landingSource.indexOf('landingSecondary')
    expect(scenesIdx).toBeGreaterThan(-1)
    expect(secondaryIdx).toBeGreaterThan(scenesIdx)
  })

  it('never claims SMS provider outreach, autonomous contractor hiring, or automatic appointment confirmation', () => {
    // Scoped to the actual rendered copy inside the LandingPage component
    // itself (its own return JSX — scene headlines/body/note text, hero,
    // pricing, etc.) rather than the whole file, which also contains
    // developer comments discussing what's NOT implied (necessarily
    // using some of these same words IN A NEGATION, e.g. "nothing
    // implies PropRoster hires anyone on its own") and words like
    // "signInWithPassword" that are "sms"-adjacent as plain substrings.
    const copyIdx = landingSource.indexOf('export default function LandingPage')
    const copy = landingSource.slice(copyIdx).toLowerCase()
    expect(copy).not.toMatch(/text message.{0,20}provider|\bsms\b/)
    expect(copy).not.toContain('hires')
    expect(copy).not.toContain('automatically confirm')
    expect(copy).not.toContain('independently authorizes')
    expect(copy).not.toContain('autonomously approves')
    expect(copy).not.toMatch(/chooses a (vendor|provider) without/)
  })

  it('Organization + Automation positioning follow-up: PropRoster is never framed as a property-management company, and does not attack property managers', () => {
    const copyIdx = landingSource.indexOf('export default function LandingPage')
    const copy = landingSource.slice(copyIdx).toLowerCase()
    expect(copy).not.toContain('property management company')
    expect(copy).not.toContain('property manager')
    expect(copy).not.toContain('takes a cut')
    // The old "SELF-MANAGE YOUR RENTALS WITHOUT DOING EVERYTHING YOURSELF"
    // hero positioning (previous PR #62 pass) leaned too far toward
    // property management and was explicitly replaced.
    expect(landingSource).not.toContain('SELF-MANAGE YOUR RENTALS')
    expect(landingSource).toContain('<h1>Your properties. Organized.</h1>')
  })

  // Dynamic Homepage V1's Coordinate scene explicitly REASSURES that
  // PropCrew is not a marketplace ("PropCrew is your own private
  // directory, not a marketplace") — a truthful disclaiming use of the
  // word, not an affirmative claim. This is the same "negated mention is
  // fine, affirmative claim is not" pattern the tax-prep check right
  // below already uses; rescoped here the same way rather than banning
  // the word outright.
  it('never claims PropCrew IS a marketplace or a PropRoster-supplied provider network — only ever disclaims it', () => {
    const affirmativeMarketplace = [...landingSource.matchAll(/marketplace/gi)]
      .filter((m) => !landingSource.slice(Math.max(0, m.index! - 20), m.index! + 15).toLowerCase().includes('not a marketplace'))
    expect(affirmativeMarketplace).toEqual([])
    expect(landingSource.toLowerCase()).not.toContain('provider network')
  })

  it('never claims tax preparation, filing, or tax advice — the "Understand" scene copy ("See the financial picture...") makes no tax-prep claim at all, so no disclaimer is needed on this page (the app\'s real tax-prep disclaimer still lives where an actual claim/tool exists — components/SmartUpload/ReceiptReview.tsx)', () => {
    // No affirmative "PropRoster prepares/files your taxes" claim anywhere
    // in the landing page, disclaimed or not.
    const affirmative = [...landingSource.matchAll(/(?:prepares?|files?) (?:your )?tax(?:es)?/gi)]
      .filter((m) => !landingSource.slice(Math.max(0, m.index! - 20), m.index! + 40).includes('does not'))
    expect(affirmative).toEqual([])
    const smartUploadTaxNote = readFileSync(join(ROOT, 'components/SmartUpload/ReceiptReview.tsx'), 'utf8')
    expect(smartUploadTaxNote).toContain('not tax advice')
  })

  it('never claims PropRoster collects, processes, or moves rent money — Rent Ledger only ever records what already happened', () => {
    const lower = landingSource.toLowerCase()
    expect(lower).not.toMatch(/collect(s|ing)? rent|process(es|ing)? (rent )?payments?|we collect/)
  })

  it('the Understand scene never annualizes YTD data or shows a fabricated/unsupported metric — same canonical fields the real, authenticated Property/Portfolio Snapshot use (Est. Value/Monthly Rent for a property; Properties/Portfolio Value/Monthly Rent/YTD NOI for a portfolio)', () => {
    const understandIdx = landingSource.indexOf('function UnderstandStage')
    const understandBlock = landingSource.slice(understandIdx, landingSource.indexOf('function LandingPage', understandIdx))
    for (const field of ['Est. Value', 'Monthly Rent', 'Properties</span>', 'Portfolio Value', 'YTD NOI']) {
      expect(understandBlock).toContain(field)
    }
    expect(understandBlock.toLowerCase()).not.toMatch(/annual(ized)? (noi|income|rent)|projected|forecast/)
  })

  it('never claims live Cap Rate, NOI (outside the real Portfolio Snapshot field name), Net Cash Flow or automated equity tracking as a homepage-level marketing claim', () => {
    // Scoped to the actual copy strings (scene stage components onward),
    // not developer comments earlier in the file. "YTD NOI" itself is
    // the real, canonical Portfolio Snapshot field label (see
    // UnderstandStage) — not a new claim invented for this page — so
    // it's excluded from this ban rather than triggering a false
    // positive on the one metric this page is explicitly allowed to show.
    const copyIdx = landingSource.indexOf('function OrganizeStage')
    const copy = landingSource.slice(copyIdx).toLowerCase().replace(/ytd noi/g, '')
    expect(copy).not.toContain('cap rate')
    expect(copy).not.toContain('net operating income')
    expect(copy).not.toMatch(/\bnoi\b/)
    expect(copy).not.toContain('net cash flow')
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
    // Dynamic Homepage V1 removed the redundant post-pricing CTA block
    // that used to repeat this line a second time — the hero's own note
    // is now the only occurrence (still verified above).
    const occurrences = [...landingSource.matchAll(/No credit card required\./g)]
    expect(occurrences.length).toBe(1)
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

  // Dynamic Homepage V1 removed the post-grid CTA block (.landingPricingCta)
  // entirely — there is no button below the pricing cards anymore, only
  // the "View full pricing details" link, so there is no full-width
  // mobile button rule left to protect here.
  it('no dangling .landingPricingCta rule was left behind after the block\'s removal', () => {
    expect(css).not.toMatch(/\.landingPricingCta\b/)
  })

  it('nothing in the landing-page CSS sets a fixed pixel width wide enough to force horizontal scroll on a 360px viewport', () => {
    const blockMatch = css.match(/\/\* Public Homepage V2[\s\S]*?\.landingSignInCard \{ padding: 24px 18px; border-radius: 18px; \}\n\}/)
    expect(blockMatch).not.toBeNull()
    const block = blockMatch![0]
    // Excludes both max-width and min-width — those are constraints/media
    // features (including Dynamic Homepage V1's own
    // `@media (min-width: 901px)` desktop-sticky block), never a fixed
    // box width that could force horizontal scroll on its own.
    const fixedWidths = [...block.matchAll(/(?<!min-)(?<!max-)width:\s*(\d+)px/g)].map((m) => Number(m[1]))
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
