import { describe, expect, it } from 'vitest'
import { PLAN_IDS, PLANS, PUBLIC_PLAN_ORDER, COMING_SOON_PLAN_ORDER, TENANT_CONNECT_PRICING_NOTE, PLAN_FEATURE_HIGHLIGHTS, CONTACT_TIER, isPlanId } from './plans'

describe('internal owner plan — catalog shape', () => {
  it('exists in PLANS with unlimited properties and no price', () => {
    expect(PLANS.owner).toBeDefined()
    expect(PLANS.owner.maxProperties).toBe(Number.POSITIVE_INFINITY)
    expect(PLANS.owner.priceMonthly).toBe(0)
  })

  it('is a recognized PlanId (a real row can legitimately carry it)', () => {
    expect(PLAN_IDS).toContain('owner')
    expect(isPlanId('owner')).toBe(true)
  })
})

describe('Launch Pricing — new public plan catalog', () => {
  it('matches the launch pricing exactly', () => {
    expect(PLANS.free.priceMonthly).toBe(0)
    expect(PLANS.organize.priceMonthly).toBe(9.99)
    expect(PLANS.manage.priceMonthly).toBe(19.99)
  })

  it('matches the launch property limits — Free 1 / Organize 5 / Manage 15', () => {
    expect(PLANS.free.maxProperties).toBe(1)
    expect(PLANS.organize.maxProperties).toBe(5)
    expect(PLANS.manage.maxProperties).toBe(15)
  })

  it('Automate is marked comingSoon and excluded from purchasable order', () => {
    expect(PLANS.automate.comingSoon).toBe(true)
    expect(PUBLIC_PLAN_ORDER).not.toContain('automate')
    expect(COMING_SOON_PLAN_ORDER).toContain('automate')
  })

  it('Launch Polish: Automate displays "Up to 15 properties" — same ceiling as Manage, never a bigger number (upgrade reason is capability, not property count)', () => {
    expect(PLANS.automate.maxProperties).toBe(PLANS.manage.maxProperties)
    expect(PLAN_FEATURE_HIGHLIGHTS.automate).toContain('Up to 15 properties')
  })

  it('Launch Polish: the contact tier reads "16+ Properties" — one more than Manage\'s ceiling, never ">15"', () => {
    expect(CONTACT_TIER.label).toBe('16+ Properties')
    expect(CONTACT_TIER.label).not.toContain('>15')
    expect(CONTACT_TIER.label).not.toContain('21+')
  })
})

describe('Legacy Subscribers — CRITICAL: existing plan catalog entries are untouched', () => {
  it('legacy prices are exactly as they were before Launch Pricing', () => {
    expect(PLANS.investor.priceMonthly).toBe(19.99)
    expect(PLANS.portfolio.priceMonthly).toBe(39.99)
    expect(PLANS.portfolio_pro.priceMonthly).toBe(59.99)
  })

  it('legacy property limits are exactly as they were before Launch Pricing — 4 / 9 / 20', () => {
    expect(PLANS.investor.maxProperties).toBe(4)
    expect(PLANS.portfolio.maxProperties).toBe(9)
    expect(PLANS.portfolio_pro.maxProperties).toBe(20)
  })

  it('legacy plan ids remain real, resolvable PlanIds', () => {
    for (const id of ['investor', 'portfolio', 'portfolio_pro']) {
      expect(PLAN_IDS).toContain(id)
      expect(isPlanId(id)).toBe(true)
      expect(PLANS[id as 'investor']).toBeDefined()
    }
  })

  it('legacy plans are no longer offered to new customers — absent from the public purchasable order', () => {
    expect(PUBLIC_PLAN_ORDER).not.toContain('investor')
    expect(PUBLIC_PLAN_ORDER).not.toContain('portfolio')
    expect(PUBLIC_PLAN_ORDER).not.toContain('portfolio_pro')
  })
})

describe('Milestone 10 production-hardening pass — pricing truthfulness', () => {
  it('labels Tenant Connect as "Coming soon" for every plan that shows it, even though the internal entitlement is already true for Manage and legacy Portfolio/Portfolio Pro', () => {
    // There is no tenant-facing UI yet, so the public pricing page must
    // never claim the feature is live/included, regardless of what
    // entitlementsFor() resolves internally for owner-side testing.
    expect(TENANT_CONNECT_PRICING_NOTE.manage).toBe('Tenant Connect — Coming soon')
    expect(TENANT_CONNECT_PRICING_NOTE.investor).toBe('Tenant Connect — Coming soon')
    expect(TENANT_CONNECT_PRICING_NOTE.portfolio).toBe('Tenant Connect — Coming soon')
    expect(TENANT_CONNECT_PRICING_NOTE.portfolio_pro).toBe('Tenant Connect — Coming soon')
  })

  it('never says "included" anywhere in the pricing copy', () => {
    for (const note of Object.values(TENANT_CONNECT_PRICING_NOTE)) {
      expect(note.toLowerCase()).not.toContain('included')
    }
  })

  it('Free and Organize have no Tenant Connect pricing note at all', () => {
    expect(TENANT_CONNECT_PRICING_NOTE.free).toBeUndefined()
    expect(TENANT_CONNECT_PRICING_NOTE.organize).toBeUndefined()
  })
})

describe('Owner does not appear as a public pricing option', () => {
  it('PUBLIC_PLAN_ORDER (what /pricing renders as purchasable) is exactly Free/Organize/Manage', () => {
    expect(PUBLIC_PLAN_ORDER).not.toContain('owner')
    expect(PUBLIC_PLAN_ORDER).toEqual(['free', 'organize', 'manage'])
  })

  it('every plan actually shown on /pricing (purchasable or coming soon) is a real, priced plan', () => {
    for (const id of [...PUBLIC_PLAN_ORDER, ...COMING_SOON_PLAN_ORDER]) {
      expect(id).not.toBe('owner')
      expect(Number.isFinite(PLANS[id].maxProperties)).toBe(true)
    }
  })
})
