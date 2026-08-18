import { describe, expect, it } from 'vitest'
import {
  ENTITLED_STATUSES,
  aiAllowanceRemaining,
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
  it('matches the exact limits specified for Launch Pricing', () => {
    expect(maxPropertiesFor('free')).toBe(1)
    expect(maxPropertiesFor('organize')).toBe(5)
    expect(maxPropertiesFor('manage')).toBe(15)
  })

  it('legacy plan limits are UNCHANGED by Launch Pricing', () => {
    expect(maxPropertiesFor('investor')).toBe(4)
    expect(maxPropertiesFor('portfolio')).toBe(9)
    expect(maxPropertiesFor('portfolio_pro')).toBe(20)
  })

  it('matches PLANS catalog (no drift between the two)', () => {
    expect(maxPropertiesFor('free')).toBe(PLANS.free.maxProperties)
    expect(maxPropertiesFor('organize')).toBe(PLANS.organize.maxProperties)
    expect(maxPropertiesFor('manage')).toBe(PLANS.manage.maxProperties)
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

  it('Organize: can create through #5, cannot create #6', () => {
    expect(canCreateProperty('organize', 4)).toBe(true) // creating the 5th
    expect(canCreateProperty('organize', 5)).toBe(false) // attempting the 6th
  })

  it('Manage: can create through #15, cannot create #16', () => {
    expect(canCreateProperty('manage', 14)).toBe(true) // creating the 15th
    expect(canCreateProperty('manage', 15)).toBe(false) // attempting the 16th
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

describe('entitlementsFor — still-unmeasured future capability stubs', () => {
  it('exposes maxProperties matching the plan', () => {
    expect(entitlementsFor('manage').maxProperties).toBe(15)
  })

  it('does not guess at genuinely unmeasured future limits — returns null/false, never a number pretending to be real', () => {
    const e = entitlementsFor('manage')
    expect(e.tenantPortal).toBe(false)
    expect(e.portfolioAnalytics).toBe(false)
    expect(e.advancedReports).toBe(false)
    expect(e.teamMembers).toBeNull()
    expect(e.prioritySupport).toBe(false)
  })

  it('the still-unmeasured stub fields remain identical across every plan (no accidental partial enforcement)', () => {
    const free = entitlementsFor('free')
    const manage = entitlementsFor('manage')
    expect(free.tenantPortal).toBe(manage.tenantPortal)
    expect(free.portfolioAnalytics).toBe(manage.portfolioAnalytics)
    expect(free.teamMembers).toBe(manage.teamMembers)
  })
})

describe('entitlementsFor — Free (Launch Pricing)', () => {
  it('has none of the Manage-tier capabilities', () => {
    const e = entitlementsFor('free')
    expect(e.canUseSmartUpload).toBe(false)
    expect(e.canUseSmartImport).toBe(false)
    expect(e.canUseDocumentIntelligence).toBe(false)
    expect(e.canUseRentLedger).toBe(false)
    expect(e.canUsePropWatch).toBe(false)
    expect(e.monthlyAIAnalyses).toBe(0)
  })
})

describe('entitlementsFor — Organize (Launch Pricing)', () => {
  it('has none of the Manage-tier capabilities, same as Free', () => {
    const e = entitlementsFor('organize')
    expect(e.canUseSmartUpload).toBe(false)
    expect(e.canUseSmartImport).toBe(false)
    expect(e.canUseDocumentIntelligence).toBe(false)
    expect(e.canUseRentLedger).toBe(false)
    expect(e.canUsePropWatch).toBe(false)
    expect(e.monthlyAIAnalyses).toBe(0)
  })

  it('still gets the full property/document/PropCrew/Search/Investment-Tools/Lease-Management baseline via maxProperties + the absence of any other gate', () => {
    expect(entitlementsFor('organize').maxProperties).toBe(5)
  })
})

describe('entitlementsFor — Manage (Launch Pricing)', () => {
  it('has every new capability, with a 50/month AI allowance', () => {
    const e = entitlementsFor('manage')
    expect(e.canUseSmartUpload).toBe(true)
    expect(e.canUseSmartImport).toBe(true)
    expect(e.canUseDocumentIntelligence).toBe(true)
    expect(e.canUseRentLedger).toBe(true)
    expect(e.canUsePropWatch).toBe(true)
    expect(e.monthlyAIAnalyses).toBe(50)
  })
})

describe('entitlementsFor — legacy paid plans (Investor/Portfolio/Portfolio Pro)', () => {
  it('CRITICAL: remain fully functional — every new capability granted, conservative UNLIMITED AI rather than the new 50/month cap', () => {
    for (const id of ['investor', 'portfolio', 'portfolio_pro'] as const) {
      const e = entitlementsFor(id)
      expect(e.canUseSmartUpload).toBe(true)
      expect(e.canUseSmartImport).toBe(true)
      expect(e.canUseDocumentIntelligence).toBe(true)
      expect(e.canUseRentLedger).toBe(true)
      expect(e.canUsePropWatch).toBe(true)
      // Unlimited (null), not 50 — legacy subscribers never had a cap
      // before Launch Pricing and must not be surprised by one now.
      expect(e.monthlyAIAnalyses).toBeNull()
    }
  })
})

describe('entitlementsFor — owner/internal plan', () => {
  it('unrestricted: every capability true, unlimited AI', () => {
    const e = entitlementsFor('owner')
    expect(e.canUseSmartUpload).toBe(true)
    expect(e.canUseSmartImport).toBe(true)
    expect(e.canUseDocumentIntelligence).toBe(true)
    expect(e.canUseRentLedger).toBe(true)
    expect(e.canUsePropWatch).toBe(true)
    expect(e.monthlyAIAnalyses).toBeNull()
  })
})

describe('entitlementsFor — Milestone 10 tenantConnect launch intent', () => {
  it('matches the exact launch intent: Free/Organize/legacy Investor false, Manage/legacy Portfolio/Portfolio Pro/Owner true', () => {
    expect(entitlementsFor('free').tenantConnect).toBe(false)
    expect(entitlementsFor('organize').tenantConnect).toBe(false)
    // Legacy Investor stays false deliberately — the long-term intent is
    // a paid add-on, but no Stripe add-on product exists yet, so it must
    // not be enabled as if it were already sold. Unchanged by Launch Pricing.
    expect(entitlementsFor('investor').tenantConnect).toBe(false)
    expect(entitlementsFor('manage').tenantConnect).toBe(true)
    expect(entitlementsFor('portfolio').tenantConnect).toBe(true)
    expect(entitlementsFor('portfolio_pro').tenantConnect).toBe(true)
    expect(entitlementsFor('owner').tenantConnect).toBe(true)
  })
})

describe('aiAllowanceRemaining — Section: AI Enforcement', () => {
  it('unlimited (null limit) always allows, regardless of usage', () => {
    expect(aiAllowanceRemaining(null, 0)).toBe(true)
    expect(aiAllowanceRemaining(null, 1_000_000)).toBe(true)
  })

  it('allows while used is strictly below the limit', () => {
    expect(aiAllowanceRemaining(50, 0)).toBe(true)
    expect(aiAllowanceRemaining(50, 49)).toBe(true)
  })

  it('blocks once used meets or exceeds the limit — the 50th analysis is allowed, the 51st is not', () => {
    expect(aiAllowanceRemaining(50, 50)).toBe(false)
    expect(aiAllowanceRemaining(50, 51)).toBe(false)
  })

  it('a zero limit (Free/Organize — no Document Intelligence capability at all) always blocks', () => {
    expect(aiAllowanceRemaining(0, 0)).toBe(false)
  })
})
