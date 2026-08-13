import { describe, expect, it } from 'vitest'
import { PLAN_IDS, PLANS, PUBLIC_PLAN_ORDER, TENANT_CONNECT_PRICING_NOTE, isPlanId } from './plans'

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

describe('Milestone 10 pricing update — prices changed, property limits did not', () => {
  it('matches the new displayed monthly pricing exactly', () => {
    expect(PLANS.free.priceMonthly).toBe(0)
    expect(PLANS.investor.priceMonthly).toBe(19.99)
    expect(PLANS.portfolio.priceMonthly).toBe(39.99)
    expect(PLANS.portfolio_pro.priceMonthly).toBe(59.99)
  })

  it('leaves property limits exactly as they were — 1 / 4 / 9 / 20', () => {
    expect(PLANS.free.maxProperties).toBe(1)
    expect(PLANS.investor.maxProperties).toBe(4)
    expect(PLANS.portfolio.maxProperties).toBe(9)
    expect(PLANS.portfolio_pro.maxProperties).toBe(20)
  })
})

describe('Milestone 10 production-hardening pass — pricing truthfulness', () => {
  it('labels Tenant Connect as "Coming soon" for every plan that shows it, even though the internal entitlement is already true for Portfolio/Portfolio Pro', () => {
    // There is no tenant-facing UI yet, so the public pricing page must
    // never claim the feature is live/included, regardless of what
    // entitlementsFor() resolves internally for owner-side testing.
    expect(TENANT_CONNECT_PRICING_NOTE.investor).toBe('Tenant Connect — Coming soon')
    expect(TENANT_CONNECT_PRICING_NOTE.portfolio).toBe('Tenant Connect — Coming soon')
    expect(TENANT_CONNECT_PRICING_NOTE.portfolio_pro).toBe('Tenant Connect — Coming soon')
  })

  it('never says "included" anywhere in the pricing copy', () => {
    for (const note of Object.values(TENANT_CONNECT_PRICING_NOTE)) {
      expect(note.toLowerCase()).not.toContain('included')
    }
  })

  it('Free has no Tenant Connect pricing note at all', () => {
    expect(TENANT_CONNECT_PRICING_NOTE.free).toBeUndefined()
  })
})

describe('9. Owner does not appear as a public pricing option', () => {
  it('PUBLIC_PLAN_ORDER (what /pricing renders) never includes owner', () => {
    expect(PUBLIC_PLAN_ORDER).not.toContain('owner')
    expect(PUBLIC_PLAN_ORDER).toEqual(['free', 'investor', 'portfolio', 'portfolio_pro'])
  })

  it('every plan actually shown on /pricing is a real, priced, purchasable-or-free plan', () => {
    for (const id of PUBLIC_PLAN_ORDER) {
      expect(id).not.toBe('owner')
      expect(Number.isFinite(PLANS[id].maxProperties)).toBe(true)
    }
  })
})
