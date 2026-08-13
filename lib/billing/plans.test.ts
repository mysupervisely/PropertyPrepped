import { describe, expect, it } from 'vitest'
import { PLAN_IDS, PLANS, PUBLIC_PLAN_ORDER, isPlanId } from './plans'

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
