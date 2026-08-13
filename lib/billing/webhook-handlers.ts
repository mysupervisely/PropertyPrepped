// PropPrepped Milestone 9: the testable core of the Stripe webhook route,
// expressed as plain async functions (a "ports and adapters" seam, same
// pattern as lib/document-intelligence/analyze-request.ts in Milestone 8)
// rather than direct Stripe SDK / Supabase calls, so idempotency and event
// routing can be unit tested without a network call or a real webhook
// signature.
//
// Security note: signature verification happens BEFORE any of this code
// runs (in app/api/billing/webhook/route.ts, using Stripe's own
// constructEvent against STRIPE_WEBHOOK_SECRET) — everything here treats
// the event payload as already-authenticated.

import { planForPriceId } from './stripe'
import type { PlanId, PurchasablePlanId } from './plans'

export type StripeSubscriptionLike = {
  id: string
  customer: string
  status: string
  cancel_at_period_end: boolean
  current_period_end: number | null
  items: { data: { price: { id: string } }[] }
}

export type SubscriptionUpsertRow = {
  owner_id: string
  stripe_customer_id: string
  stripe_subscription_id: string
  stripe_price_id: string | null
  plan: PlanId
  status: string
  current_period_end: string | null
  cancel_at_period_end: boolean
}

/** Pure mapping from a Stripe subscription object to the row we persist. Never trusts anything except the subscription's own price id to determine plan. */
export function buildSubscriptionRow(params: {
  ownerId: string
  customerId: string
  subscription: StripeSubscriptionLike
  env?: Record<string, string | undefined>
}): SubscriptionUpsertRow {
  const priceId = params.subscription.items.data[0]?.price?.id || null
  return {
    owner_id: params.ownerId,
    stripe_customer_id: params.customerId,
    stripe_subscription_id: params.subscription.id,
    stripe_price_id: priceId,
    plan: planForPriceId(priceId, params.env),
    status: params.subscription.status,
    current_period_end: params.subscription.current_period_end
      ? new Date(params.subscription.current_period_end * 1000).toISOString()
      : null,
    cancel_at_period_end: params.subscription.cancel_at_period_end,
  }
}

export type WebhookDeps = {
  /** Records that this Stripe event id is being processed. Returns true if newly claimed (proceed), false if already seen (skip — idempotency). */
  claimEvent: (eventId: string) => Promise<boolean>
  findOwnerIdByCustomerId: (customerId: string) => Promise<string | null>
  upsertSubscription: (row: SubscriptionUpsertRow) => Promise<void>
  /** Fetches the current subscription object from Stripe by id — used for invoice.* events, which don't carry the full subscription payload inline. */
  fetchSubscription: (subscriptionId: string) => Promise<StripeSubscriptionLike>
}

export type CheckoutSessionObject = { customer: string | null; subscription: string | null; client_reference_id: string | null }
export type InvoiceObject = { customer: string | null; subscription: string | null }

// Deliberately NOT a discriminated union keyed on `type`: Stripe's real
// event catalog has dozens of types we never act on (see the `default`
// branch below), and callers — including tests — construct these from
// plain webhook JSON. `data.object`'s shape is asserted per-branch instead
// (via the *Object/*Like types above), which mirrors how the route
// actually receives this payload from `stripe.webhooks.constructEvent`.
export type StripeEventLike = { id: string; type: string; data: { object: unknown } }

export type ProcessResult = { handled: boolean; reason?: string }

/**
 * Routes one verified Stripe event to the right DB write. Idempotent: the
 * very first thing this does is claim the event id, and every branch
 * short-circuits (does nothing) if the payload doesn't let us safely
 * resolve which PropPrepped account it belongs to — we never guess.
 */
export async function processStripeEvent(event: StripeEventLike, deps: WebhookDeps): Promise<ProcessResult> {
  const isNew = await deps.claimEvent(event.id)
  if (!isNew) return { handled: false, reason: 'duplicate event id — already processed' }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as CheckoutSessionObject
      if (!session.customer || !session.subscription || !session.client_reference_id) {
        return { handled: false, reason: 'checkout session missing customer/subscription/client_reference_id' }
      }
      const subscription = await deps.fetchSubscription(session.subscription)
      await deps.upsertSubscription(
        buildSubscriptionRow({ ownerId: session.client_reference_id, customerId: session.customer, subscription }),
      )
      return { handled: true }
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as StripeSubscriptionLike
      const ownerId = await deps.findOwnerIdByCustomerId(subscription.customer)
      if (!ownerId) return { handled: false, reason: 'no PropPrepped account mapped to this Stripe customer yet' }
      await deps.upsertSubscription(buildSubscriptionRow({ ownerId, customerId: subscription.customer, subscription }))
      return { handled: true }
    }

    case 'invoice.paid':
    case 'invoice.payment_failed': {
      const invoice = event.data.object as InvoiceObject
      if (!invoice.customer || !invoice.subscription) {
        return { handled: false, reason: 'invoice is not tied to a subscription' }
      }
      const ownerId = await deps.findOwnerIdByCustomerId(invoice.customer)
      if (!ownerId) return { handled: false, reason: 'no PropPrepped account mapped to this Stripe customer yet' }
      const subscription = await deps.fetchSubscription(invoice.subscription)
      await deps.upsertSubscription(buildSubscriptionRow({ ownerId, customerId: invoice.customer, subscription }))
      return { handled: true }
    }

    default:
      return { handled: false, reason: `unhandled event type: ${event.type}` }
  }
}

export type { PurchasablePlanId }
