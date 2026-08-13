import { describe, expect, it } from 'vitest'
import {
  ENTITLED_STATUSES,
  canCreateProperty,
  entitlementsFor,
  maxPropertiesFor,
  resolveEffectivePlan,
} from './entitlements'
import { NEXT_PLAN, PLANS } from './plans'

describe('resolveEffectivePlan', () => {
  it('defaults to free when there is no subscription row', () => {
    expect(resolveEffectivePlan(null)).toBe('free')
    expect(resolveEffectivePlan(undefined)).toBe('free')
  })

  it('defaults to free when plan or status is missing', () => {
    expect(resolveEffectivePlan({ plan: null, status: 'active' })).toBe('free')
    expect(resolveEffectivePlan({ plan: 'investor', status: null })).toBe('free')
  })

  it('returns the plan for every entitled status', () => {
    for (const status of ENTITLED_STATUSES) {
      expect(resolveEffectivePlan({ plan: 'investor', status })).toBe('investor')
      expect(resolveEffectivePlan({ plan: 'portfolio', status })).toBe('portfolio')
      expect(resolveEffectivePlan({ plan: 'portfolio_pro', status })).toBe('portfolio_pro')
    }
  })

  it('falls back to free for every non-entitled status (cancellation/downgrade/payment failure safety)', () => {
    const nonEntitled = ['unpaid', 'canceled', 'incomplete', 'incomplete_expired', 'paused']
    for (const status of nonEntitled) {
      expect(resolveEffectivePlan({ plan: 'portfolio_pro', status })).toBe('free')
    }
  })

  it('never trusts an unrecognized plan string', () => {
    expect(resolveEffectivePlan({ plan: 'super_admin', status: 'active' })).toBe('free')
  })

  it('a free-plan row resolves to free regardless of status', () => {
    expect(resolveEffectivePlan({ plan: 'free', status: 'canceled' })).toBe('free')
    expect(resolveEffectivePlan({ plan: 'free', status: 'active' })).toBe('free')
  })

  it('7. Owner requires no Stripe subscription — resolves from plan+status alone, no Stripe identifiers involved at all', () => {
    // SubscriptionRow (the type this function accepts) only ever has
    // `plan`/`status` — there is no stripe_customer_id/subscription_id/
    // price_id field anywhere in this resolution path, so an owner row
    // resolving correctly here is proof by construction that no Stripe
    // data is read or required.
    expect(resolveEffectivePlan({ plan: 'owner', status: 'active' })).toBe('owner')
  })
})

describe('maxPropertiesFor — final launch limits', () => {
  it('matches the exact limits specified for launch', () => {
    expect(maxPropertiesFor('free')).toBe(1)
    expect(maxPropertiesFor('investor')).toBe(4)
    expect(maxPropertiesFor('portfolio')).toBe(9)
    expect(maxPropertiesFor('portfolio_pro')).toBe(20)
  })

  it('matches PLANS catalog (no drift between the two)', () => {
    expect(maxPropertiesFor('free')).toBe(PLANS.free.maxProperties)
    expect(maxPropertiesFor('investor')).toBe(PLANS.investor.maxProperties)
    expect(maxPropertiesFor('portfolio')).toBe(PLANS.portfolio.maxProperties)
    expect(maxPropertiesFor('portfolio_pro')).toBe(PLANS.portfolio_pro.maxProperties)
  })
})

describe('canCreateProperty — upgrade boundaries', () => {
  it('Free: can create property #1, cannot create #2', () => {
    expect(canCreateProperty('free', 0)).toBe(true) // creating the 1st
    expect(canCreateProperty('free', 1)).toBe(false) // attempting the 2nd
  })

  it('Investor: can create through #4, cannot create #5', () => {
    expect(canCreateProperty('investor', 3)).toBe(true) // creating the 4th
    expect(canCreateProperty('investor', 4)).toBe(false) // attempting the 5th
  })

  it('Portfolio: can create through #9, cannot create #10', () => {
    expect(canCreateProperty('portfolio', 8)).toBe(true) // creating the 9th
    expect(canCreateProperty('portfolio', 9)).toBe(false) // attempting the 10th
  })

  it('Portfolio Pro: can create through #20, cannot create #21', () => {
    expect(canCreateProperty('portfolio_pro', 19)).toBe(true) // creating the 20th
    expect(canCreateProperty('portfolio_pro', 20)).toBe(false) // attempting the 21st
  })

  it('never produces NaN/Infinity for pathological counts', () => {
    expect(canCreateProperty('free', -1)).toBe(true)
    expect(canCreateProperty('free', Number.NaN)).toBe(false)
    expect(canCreateProperty('free', Number.POSITIVE_INFINITY)).toBe(false)
  })

  it('5. Owner can exceed every paid tier, including Portfolio Pro\'s 20-property ceiling', () => {
    expect(canCreateProperty('owner', 20)).toBe(true) // Portfolio Pro would reject this exact count
    expect(canCreateProperty('owner', 100)).toBe(true)
    expect(canCreateProperty('owner', 1_000_000)).toBe(true)
  })

  it('8. Owner never receives an upgrade prompt — the gate that would trigger one never returns false', () => {
    // app/page.tsx's openAddProperty() and the property evaluator's
    // openConvert() both call canCreateProperty(plan, count) and only
    // show the upgrade modal when it returns false. Proving this is
    // true for arbitrarily large counts is proving the modal can never
    // open for an owner account, without needing component-rendering
    // infrastructure to exercise the JSX directly.
    for (const count of [0, 1, 20, 21, 1000, Number.MAX_SAFE_INTEGER]) {
      expect(canCreateProperty('owner', count)).toBe(true)
    }
    // Belt-and-suspenders: even if that gate were ever bypassed, the
    // modal's own "what's next" lookup for owner is null (see
    // lib/billing/plans.ts NEXT_PLAN) — there is no plan to upsell.
    expect(NEXT_PLAN.owner).toBeNull()
  })
})

describe('entitlementsFor — future capability stubs', () => {
  it('exposes maxProperties matching the plan', () => {
    expect(entitlementsFor('portfolio').maxProperties).toBe(9)
  })

  it('does not guess at unmeasured future limits — returns null/false, never a number pretending to be real', () => {
    const e = entitlementsFor('portfolio_pro')
    expect(e.monthlyAIAnalyses).toBeNull()
    expect(e.tenantPortal).toBe(false)
    expect(e.portfolioAnalytics).toBe(false)
    expect(e.advancedReports).toBe(false)
    expect(e.teamMembers).toBeNull()
    expect(e.prioritySupport).toBe(false)
  })

  it('is identical across plans for the not-yet-enforced fields (no accidental partial enforcement)', () => {
    const free = entitlementsFor('free')
    const pro = entitlementsFor('portfolio_pro')
    expect(free.monthlyAIAnalyses).toBe(pro.monthlyAIAnalyses)
    expect(free.tenantPortal).toBe(pro.tenantPortal)
  })
})

describe('entitlementsFor — Milestone 10 tenantConnect launch intent', () => {
  it('matches the exact launch intent: Free/Investor false, Portfolio/Portfolio Pro/Owner true', () => {
    expect(entitlementsFor('free').tenantConnect).toBe(false)
    // Investor stays false deliberately — the long-term intent is a paid
    // add-on, but no Stripe add-on product exists yet, so it must not be
    // enabled as if it were already sold.
    expect(entitlementsFor('investor').tenantConnect).toBe(false)
    expect(entitlementsFor('portfolio').tenantConnect).toBe(true)
    expect(entitlementsFor('portfolio_pro').tenantConnect).toBe(true)
    expect(entitlementsFor('owner').tenantConnect).toBe(true)
  })
})
