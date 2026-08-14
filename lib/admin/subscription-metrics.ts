// PropRoster Milestone 11 (Privacy-First Admin Analytics): turns the raw
// (plan, status, count) rows from admin_subscription_metrics() into the
// SUBSCRIPTIONS section's summary — including MRR.
//
// MRR is deliberately computed HERE, in TypeScript, from lib/billing/plans
// (PLANS) and lib/billing/entitlements (ENTITLED_STATUSES) — the exact
// same pricing catalog and entitlement-status set every other part of this
// app already uses. This is a pure function over the RPC's counts; it
// never queries the database itself and never needs to know about
// individual subscription rows.

import { PLANS, type PurchasablePlanId } from '../billing/plans'
import { ENTITLED_STATUSES } from '../billing/entitlements'
import type { SubscriptionCountRow, SubscriptionMetrics } from './types'

// Only these three plans are ever sold — 'free' has no price and the
// internal 'owner' plan is never billed (priceMonthly: 0), so neither
// could ever contribute real MRR even if included here. Being explicit
// about the purchasable set (rather than "every plan with a positive
// price") keeps this function's intent readable and matches
// lib/billing/stripe.ts's own PurchasablePlanId-based design.
const PURCHASABLE_PLANS: readonly PurchasablePlanId[] = ['investor', 'portfolio', 'portfolio_pro']

function isPurchasablePlan(plan: string): plan is PurchasablePlanId {
  return (PURCHASABLE_PLANS as readonly string[]).includes(plan)
}

export function summarizeSubscriptionCounts(rows: SubscriptionCountRow[]): SubscriptionMetrics {
  const countsByPlan: Record<string, number> = {}
  const countsByStatus: Record<string, number> = {}
  let activePaidSubscriptions = 0
  let mrrUsd = 0

  for (const row of rows) {
    const plan = row.plan || 'free'
    const status = row.status || 'active'
    const count = Math.max(0, row.accountCount)

    countsByPlan[plan] = (countsByPlan[plan] || 0) + count
    countsByStatus[status] = (countsByStatus[status] || 0) + count

    if (isPurchasablePlan(plan) && ENTITLED_STATUSES.has(status)) {
      activePaidSubscriptions += count
      mrrUsd += PLANS[plan].priceMonthly * count
    }
  }

  return {
    countsByPlan,
    countsByStatus,
    activePaidSubscriptions,
    canceledSubscriptions: countsByStatus['canceled'] || 0,
    pastDueSubscriptions: countsByStatus['past_due'] || 0,
    mrrUsd,
  }
}
