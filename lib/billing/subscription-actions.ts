// PropRoster — Subscription Management: the testable core of the
// customer-facing cancel/resume actions, expressed as plain deps-injected
// async functions (same "ports and adapters" seam as
// lib/billing/webhook-handlers.ts) so the validation rules can be unit
// tested without a real Stripe or Supabase call.
//
// Security note: the subscription id these functions act on always comes
// from `deps.getOwnSubscription()` — in the real route (see
// app/api/billing/cancel/route.ts and .../resume/route.ts) that reads the
// CALLER'S OWN row via an RLS-scoped Supabase client, never from anything
// the browser submits in the request body. There is nothing here a client
// could redirect at another account's subscription.

import { buildSubscriptionRow, type StripeSubscriptionLike, type SubscriptionUpsertRow } from './webhook-handlers'
import type { PlanId } from './plans'

export type OwnSubscriptionRow = {
  plan: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  status: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean | null
} | null

export type SubscriptionActionDeps = {
  /** Reads the CALLER'S OWN user_subscriptions row (RLS-scoped in the real route) — never a client-supplied id. */
  getOwnSubscription: () => Promise<OwnSubscriptionRow>
  /** Calls stripe.subscriptions.update(subscriptionId, { cancel_at_period_end }) and maps the result. */
  updateCancelAtPeriodEnd: (subscriptionId: string, cancelAtPeriodEnd: boolean) => Promise<StripeSubscriptionLike>
  upsertSubscription: (row: SubscriptionUpsertRow) => Promise<void>
}

export type SubscriptionActionResult =
  | { ok: true; row: SubscriptionUpsertRow }
  | { ok: false; error: string; status: number }

/** Builds the "nothing to do" result straight from what's already on file — no Stripe call, no write, so a retried/duplicate click is a safe no-op. */
function noopResult(ownerId: string, own: NonNullable<OwnSubscriptionRow>, cancelAtPeriodEnd: boolean): SubscriptionActionResult {
  return {
    ok: true,
    row: {
      owner_id: ownerId,
      stripe_customer_id: own.stripe_customer_id as string,
      stripe_subscription_id: own.stripe_subscription_id as string,
      stripe_price_id: null,
      plan: (own.plan || 'free') as PlanId,
      status: own.status || 'active',
      current_period_end: own.current_period_end,
      cancel_at_period_end: cancelAtPeriodEnd,
    },
  }
}

async function setCancelAtPeriodEnd(
  ownerId: string,
  customerId: string,
  subscriptionId: string,
  deps: SubscriptionActionDeps,
  cancelAtPeriodEnd: boolean,
): Promise<SubscriptionActionResult> {
  const subscription = await deps.updateCancelAtPeriodEnd(subscriptionId, cancelAtPeriodEnd)
  const row = buildSubscriptionRow({ ownerId, customerId, subscription })
  await deps.upsertSubscription(row)
  return { ok: true, row }
}

/**
 * Schedules cancellation at the end of the current paid period
 * (`cancel_at_period_end: true`) — never an immediate cancellation. Paid
 * access, and every bit of customer data, is untouched: this only flips
 * one Stripe flag and mirrors it into user_subscriptions.
 */
export async function cancelSubscription(ownerId: string, deps: SubscriptionActionDeps): Promise<SubscriptionActionResult> {
  const own = await deps.getOwnSubscription()
  if (!own?.stripe_subscription_id || !own.stripe_customer_id) {
    return { ok: false, error: 'No active subscription found.', status: 404 }
  }
  if (own.status === 'canceled' || own.status === 'incomplete_expired') {
    return { ok: false, error: 'This subscription has already ended.', status: 400 }
  }
  if (own.cancel_at_period_end) {
    return noopResult(ownerId, own, true)
  }
  return setCancelAtPeriodEnd(ownerId, own.stripe_customer_id, own.stripe_subscription_id, deps, true)
}

/**
 * Removes a scheduled cancellation (`cancel_at_period_end: false`) —
 * only valid while the subscription is still in a paid, non-canceled
 * state (Section: "If a subscription has cancel_at_period_end enabled
 * and the paid period has not expired").
 */
export async function resumeSubscription(ownerId: string, deps: SubscriptionActionDeps): Promise<SubscriptionActionResult> {
  const own = await deps.getOwnSubscription()
  if (!own?.stripe_subscription_id || !own.stripe_customer_id) {
    return { ok: false, error: 'No active subscription found.', status: 404 }
  }
  if (own.status === 'canceled' || own.status === 'incomplete_expired') {
    return { ok: false, error: 'This subscription has already ended. Choose a plan to subscribe again.', status: 400 }
  }
  if (!own.cancel_at_period_end) {
    return { ok: false, error: 'This subscription is not scheduled to cancel.', status: 400 }
  }
  return setCancelAtPeriodEnd(ownerId, own.stripe_customer_id, own.stripe_subscription_id, deps, false)
}
