import { describe, expect, it } from 'vitest'
import { summarizeSubscriptionCounts } from './subscription-metrics'
import { PLANS } from '../billing/plans'
import type { SubscriptionCountRow } from './types'

describe('summarizeSubscriptionCounts', () => {
  it('sums counts per plan and per status independently of each other', () => {
    const rows: SubscriptionCountRow[] = [
      { plan: 'free', status: 'active', accountCount: 10 },
      { plan: 'investor', status: 'active', accountCount: 5 },
      { plan: 'investor', status: 'canceled', accountCount: 2 },
      { plan: 'portfolio', status: 'active', accountCount: 3 },
    ]
    const result = summarizeSubscriptionCounts(rows)
    expect(result.countsByPlan).toEqual({ free: 10, investor: 7, portfolio: 3 })
    expect(result.countsByStatus).toEqual({ active: 18, canceled: 2 })
  })

  it('computes MRR only from purchasable plans with an entitled status', () => {
    const rows: SubscriptionCountRow[] = [
      { plan: 'investor', status: 'active', accountCount: 10 }, // entitled
      { plan: 'investor', status: 'past_due', accountCount: 2 }, // still entitled (grace period)
      { plan: 'investor', status: 'canceled', accountCount: 5 }, // NOT entitled — excluded from MRR
      { plan: 'portfolio', status: 'active', accountCount: 4 },
      { plan: 'portfolio_pro', status: 'trialing', accountCount: 1 }, // entitled
    ]
    const result = summarizeSubscriptionCounts(rows)
    const expectedMrr = 10 * PLANS.investor.priceMonthly + 2 * PLANS.investor.priceMonthly + 4 * PLANS.portfolio.priceMonthly + 1 * PLANS.portfolio_pro.priceMonthly
    expect(result.mrrUsd).toBeCloseTo(expectedMrr, 6)
    expect(result.activePaidSubscriptions).toBe(10 + 2 + 4 + 1)
  })

  it('never counts free or the internal owner plan toward MRR, even if marked active', () => {
    const rows: SubscriptionCountRow[] = [
      { plan: 'free', status: 'active', accountCount: 100 },
      { plan: 'owner', status: 'active', accountCount: 3 },
    ]
    const result = summarizeSubscriptionCounts(rows)
    expect(result.mrrUsd).toBe(0)
    expect(result.activePaidSubscriptions).toBe(0)
  })

  it('reports canceled and past_due counts directly from countsByStatus', () => {
    const rows: SubscriptionCountRow[] = [
      { plan: 'free', status: 'canceled', accountCount: 7 },
      { plan: 'investor', status: 'past_due', accountCount: 4 },
    ]
    const result = summarizeSubscriptionCounts(rows)
    expect(result.canceledSubscriptions).toBe(7)
    expect(result.pastDueSubscriptions).toBe(4)
  })

  it('handles an empty result set safely', () => {
    const result = summarizeSubscriptionCounts([])
    expect(result).toEqual({
      countsByPlan: {},
      countsByStatus: {},
      activePaidSubscriptions: 0,
      canceledSubscriptions: 0,
      pastDueSubscriptions: 0,
      mrrUsd: 0,
    })
  })

  it('treats a null status defensively as "active" rather than dropping the row', () => {
    const rows: SubscriptionCountRow[] = [{ plan: 'investor', status: null, accountCount: 1 }]
    const result = summarizeSubscriptionCounts(rows)
    expect(result.countsByStatus['active']).toBe(1)
  })
})
