// PropRoster — Subscription Management: pure logic for the admin
// Billing / Subscriptions view (app/admin/subscriptions/page.tsx,
// app/api/admin/subscriptions/route.ts).
//
// Kept framework-free and Stripe/Supabase-free — same "testable core"
// convention as lib/billing/webhook-handlers.ts — so status labeling and
// the summary metrics can be unit tested without a real database or
// Stripe call.

import { ENTITLED_STATUSES } from './entitlements'
import { PLANS, type PlanId, isPlanId } from './plans'

export type AdminStatusLabel = 'Active' | 'Trial' | 'Canceling' | 'Past Due' | 'Unpaid' | 'Canceled' | 'Incomplete' | 'Paused' | 'Free'

/**
 * Maps a raw Stripe status + cancel_at_period_end flag to the admin-facing
 * label set the task calls for (Active/Past Due/Canceling/Canceled), plus
 * a few extra labels for the remaining Stripe statuses so nothing is ever
 * mislabeled as "Active" (Section: ENTITLEMENTS — every status must be
 * handled correctly). "Canceling" takes priority over "Active"/"Trial"
 * for a subscription that's still in good standing but scheduled to end
 * — it is still entitled (paid access continues), just labeled distinctly
 * so an admin can see it will not renew.
 */
export function adminStatusLabel(status: string | null, cancelAtPeriodEnd: boolean): AdminStatusLabel {
  if (!status) return 'Free'
  if (status === 'canceled') return 'Canceled'
  if (status === 'incomplete' || status === 'incomplete_expired') return 'Incomplete'
  if (status === 'paused') return 'Paused'
  if (status === 'unpaid') return 'Unpaid'
  if (status === 'past_due') return 'Past Due'
  if (cancelAtPeriodEnd && (status === 'active' || status === 'trialing')) return 'Canceling'
  if (status === 'trialing') return 'Trial'
  if (status === 'active') return 'Active'
  return 'Free'
}

export type AdminSubscriptionRow = {
  ownerId: string
  email: string | null
  displayName: string | null
  plan: PlanId
  status: string | null
  statusLabel: AdminStatusLabel
  priceMonthly: number
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  createdAt: string | null
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  lastSuccessfulPaymentAt: string | null
}

export type RawSubscriptionRow = {
  owner_id: string
  plan: string | null
  status: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  created_at: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean | null
}

export type RawProfile = { id: string; first_name: string | null; last_name: string | null; display_name: string | null } | undefined

function nameFromProfile(profile: RawProfile): string | null {
  if (!profile) return null
  if (profile.display_name) return profile.display_name
  const combined = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim()
  return combined || null
}

/** Joins one raw user_subscriptions row with its owner's profile/email/last-payment date — never trusts anything client-supplied, all inputs are server-fetched via the admin client (Section: SECURITY — admin authorization is enforced before this is ever called, see app/api/admin/subscriptions/route.ts). `lastSuccessfulPaymentAt` isn't persisted anywhere (no invoice history table exists yet) — the route looks it up live from Stripe per row and passes it in here; `null` just means "not available," never an error. */
export function buildAdminSubscriptionRow(row: RawSubscriptionRow, profile: RawProfile, email: string | null, lastSuccessfulPaymentAt: string | null = null): AdminSubscriptionRow {
  const plan: PlanId = isPlanId(row.plan) ? row.plan : 'free'
  const cancelAtPeriodEnd = Boolean(row.cancel_at_period_end)
  return {
    ownerId: row.owner_id,
    email,
    displayName: nameFromProfile(profile),
    plan,
    status: row.status,
    statusLabel: adminStatusLabel(row.status, cancelAtPeriodEnd),
    priceMonthly: PLANS[plan].priceMonthly,
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    createdAt: row.created_at,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd,
    lastSuccessfulPaymentAt,
  }
}

export type AdminSubscriptionSummary = {
  activeSubscriptions: number
  monthlyRecurringRevenue: number
  cancelingSubscriptions: number
  pastDueSubscriptions: number
}

/**
 * Summary metrics for the top of the admin view. Only real paid plans
 * count (Free/owner are excluded — an owner account is internal, not a
 * "subscriber", and Free has no revenue and isn't a subscription).
 * "Active" counts every currently-entitled paid subscription, INCLUDING
 * one scheduled to cancel — Stripe's own dashboard treats "canceling" as
 * a still-active subscription with a note, not a separate bucket removed
 * from the active count, and it matches this file's own ENTITLED_STATUSES
 * reasoning: paid access is still live.
 */
export function summarizeAdminSubscriptions(rows: AdminSubscriptionRow[]): AdminSubscriptionSummary {
  let activeSubscriptions = 0
  let monthlyRecurringRevenue = 0
  let cancelingSubscriptions = 0
  let pastDueSubscriptions = 0

  for (const row of rows) {
    if (row.plan === 'free' || row.plan === 'owner') continue
    const entitled = row.status ? ENTITLED_STATUSES.has(row.status) : false
    if (entitled) {
      activeSubscriptions += 1
      monthlyRecurringRevenue += row.priceMonthly
    }
    if (row.cancelAtPeriodEnd && entitled) cancelingSubscriptions += 1
    if (row.status === 'past_due') pastDueSubscriptions += 1
  }

  return { activeSubscriptions, monthlyRecurringRevenue, cancelingSubscriptions, pastDueSubscriptions }
}
