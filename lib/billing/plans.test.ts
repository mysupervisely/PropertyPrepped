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
