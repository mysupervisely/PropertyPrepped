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

describe('entitlementsFor — Free (Property Overview + Pricing Polish V1, Stage 1: FINAL decision)', () => {
  it('has every core capability — Stage 1 removed the Manage-only gate; only property count differs by plan now', () => {
    const e = entitlementsFor('free')
    expect(e.canUseSmartUpload).toBe(true)
    expect(e.canUseSmartImport).toBe(true)
    expect(e.canUseDocumentIntelligence).toBe(true)
    expect(e.canUseRentLedger).toBe(true)
    expect(e.canUsePropWatch).toBe(true)
    // A real, platform-level fair-use safeguard (infrastructure cost
    // control, not a marketed feature) — same number every real plan
    // gets, not a marker of "no AI on this plan."
    expect(e.monthlyAIAnalyses).toBe(50)
  })
})

describe('entitlementsFor — Organize (Property Overview + Pricing Polish V1, Stage 1)', () => {
  it('has every core capability, identical to Free and Manage', () => {
    const e = entitlementsFor('organize')
    expect(e.canUseSmartUpload).toBe(true)
    expect(e.canUseSmartImport).toBe(true)
    expect(e.canUseDocumentIntelligence).toBe(true)
    expect(e.canUseRentLedger).toBe(true)
    expect(e.canUsePropWatch).toBe(true)
    expect(e.monthlyAIAnalyses).toBe(50)
  })

  it('still gets the full property/document/PropCrew/Search/Investment-Tools/Lease-Management baseline via maxProperties + the absence of any other gate', () => {
    expect(entitlementsFor('organize').maxProperties).toBe(5)
  })
})

describe('entitlementsFor — Manage (Property Overview + Pricing Polish V1, Stage 1)', () => {
  it('has every core capability, identical to Free and Organize — the SAME 50/month AI allowance, not a bigger one', () => {
    const e = entitlementsFor('manage')
    expect(e.canUseSmartUpload).toBe(true)
    expect(e.canUseSmartImport).toBe(true)
    expect(e.canUseDocumentIntelligence).toBe(true)
    expect(e.canUseRentLedger).toBe(true)
    expect(e.canUsePropWatch).toBe(true)
    expect(e.monthlyAIAnalyses).toBe(50)
  })
})

describe('entitlementsFor — Stage 1: Free/Organize/Manage capabilities are uniform (only maxProperties legitimately differs)', () => {
  it('every ManageCapabilities field (including the AI allowance) is identical across the three real self-serve plans', () => {
    const free = entitlementsFor('free')
    const organize = entitlementsFor('organize')
    const manage = entitlementsFor('manage')
    for (const field of ['canUseSmartUpload', 'canUseSmartImport', 'canUseDocumentIntelligence', 'canUseRentLedger', 'canUsePropWatch', 'monthlyAIAnalyses', 'tenantConnect'] as const) {
      expect(organize[field]).toEqual(free[field])
      expect(manage[field]).toEqual(free[field])
    }
    // The one legitimate difference between the three plans.
    expect(free.maxProperties).not.toBe(organize.maxProperties)
    expect(organize.maxProperties).not.toBe(manage.maxProperties)
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

describe('entitlementsFor — tenantConnect (Property Overview + Pricing Polish V1, Stage 1: FINAL decision)', () => {
  it('true for every real plan except legacy Investor: Free/Organize/Manage/Automate/Portfolio/Portfolio Pro/Owner true, Investor false', () => {
    expect(entitlementsFor('free').tenantConnect).toBe(true)
    expect(entitlementsFor('organize').tenantConnect).toBe(true)
    expect(entitlementsFor('manage').tenantConnect).toBe(true)
    expect(entitlementsFor('automate').tenantConnect).toBe(true)
    expect(entitlementsFor('portfolio').tenantConnect).toBe(true)
    expect(entitlementsFor('portfolio_pro').tenantConnect).toBe(true)
    expect(entitlementsFor('owner').tenantConnect).toBe(true)
    // Legacy Investor stays false deliberately — the long-term intent is
    // a genuinely separate, optional paid add-on, but no Stripe add-on
    // product exists yet, so it must not be enabled as if it were
    // already sold. Unchanged by this milestone — the one deliberate
    // carve-out, not a new contradiction.
    expect(entitlementsFor('investor').tenantConnect).toBe(false)
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

  it('a zero limit always blocks, even with zero usage — pure function behavior; no real plan actually carries limit 0 as of Stage 1 (see the CAPABILITIES_BY_PLAN test above), but this defensive case must still hold', () => {
    expect(aiAllowanceRemaining(0, 0)).toBe(false)
  })
})
