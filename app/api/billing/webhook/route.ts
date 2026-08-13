// PropPrepped Milestone 9: Stripe webhook endpoint — the single
// authoritative source of subscription state (Section 1/10).
//
// - Verifies the Stripe-Signature header against STRIPE_WEBHOOK_SECRET
//   before trusting anything in the payload. An unverified/invalid
//   signature is rejected outright; nothing is ever processed on the
//   strength of the request body alone.
// - Uses the raw request body for verification (req.text(), NOT
//   req.json()) — Stripe signs the exact bytes it sent, and re-serializing
//   parsed JSON would invalidate the signature.
// - This is the ONLY route in Milestone 9 that uses the Supabase
//   service-role key (see lib/supabase-server.ts's createAdminClient doc
//   comment for why: there is no user session in a webhook call, and
//   Stripe events must be able to update ANY account's subscription row
//   based on the event payload, not just "whoever is signed in"). Every
//   write is scoped to an owner_id resolved either from
//   client_reference_id (set server-side at Checkout creation — see
//   app/api/billing/checkout/route.ts) or from an existing
//   stripe_customer_id already on file — never from anything a client
//   could forge directly against this endpoint, since this endpoint only
//   accepts Stripe-signed payloads in the first place.
// - Idempotent: every event is claimed in stripe_webhook_events before any
//   other work happens (see lib/billing/webhook-handlers.ts).

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createAdminClient } from '../../../../lib/supabase-server'
import { getStripeClient, isStripeConfigured } from '../../../../lib/billing/stripe'
import { processStripeEvent, type StripeSubscriptionLike, type WebhookDeps } from '../../../../lib/billing/webhook-handlers'

export const runtime = 'nodejs'

function toSubscriptionLike(sub: Stripe.Subscription): StripeSubscriptionLike {
  const firstItem = sub.items.data[0]
  return {
    id: sub.id,
    customer: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
    status: sub.status,
    cancel_at_period_end: sub.cancel_at_period_end,
    current_period_end: firstItem?.current_period_end ?? null,
    items: { data: sub.items.data.map((item) => ({ price: { id: item.price.id } })) },
  }
}

export async function POST(req: NextRequest) {
  if (!isStripeConfigured() || !process.env.STRIPE_WEBHOOK_SECRET) {
    // Not "Billing is not configured yet." here — that's a client-facing
    // message. This endpoint is never called by a browser; a 503 is
    // enough for Stripe's dashboard to show a clear delivery failure.
    return NextResponse.json({ error: 'Stripe webhook is not configured.' }, { status: 503 })
  }

  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    return NextResponse.json({ error: 'Missing Stripe-Signature header.' }, { status: 400 })
  }

  const rawBody = await req.text()
  const stripe = getStripeClient()

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    console.error('Stripe webhook signature verification failed', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 })
  }

  const admin = createAdminClient()
  if (!admin) {
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 })
  }

  const deps: WebhookDeps = {
    claimEvent: async (eventId) => {
      const { data, error } = await admin
        .from('stripe_webhook_events')
        .insert({ id: eventId, type: event.type })
        .select('id')
      // A unique-violation on `id` means another delivery already claimed
      // this event — that's the expected duplicate path, not an error.
      if (error) return false
      return Boolean(data && data.length > 0)
    },
    findOwnerIdByCustomerId: async (customerId) => {
      const { data } = await admin
        .from('user_subscriptions')
        .select('owner_id')
        .eq('stripe_customer_id', customerId)
        .maybeSingle()
      return data?.owner_id || null
    },
    upsertSubscription: async (row) => {
      await admin.from('user_subscriptions').upsert(row, { onConflict: 'owner_id' })
    },
    fetchSubscription: async (subscriptionId) => {
      const sub = await stripe.subscriptions.retrieve(subscriptionId)
      return toSubscriptionLike(sub)
    },
  }

  try {
    const result = await processStripeEvent(
      { id: event.id, type: event.type, data: { object: event.data.object } },
      deps,
    )
    if (!result.handled && result.reason && result.reason !== 'duplicate event id — already processed') {
      // Not an error — plenty of legitimate Stripe events are no-ops for
      // us (Section 10 lists the minimum we act on; everything else is
      // safely ignored). Logged for visibility only.
      console.log('Stripe webhook event not acted on:', event.type, result.reason)
    }
  } catch (err) {
    console.error('Stripe webhook processing error', event.type, err)
    // claimEvent already inserted this event id BEFORE processing ran (to
    // make concurrent duplicate deliveries safe — see
    // lib/billing/webhook-handlers.ts). If processing then failed partway
    // (a transient Stripe/Supabase error), leaving that claim in place
    // would make every future retry look like an already-processed
    // duplicate and silently skip forever, permanently losing the update.
    // Un-claim it so Stripe's automatic retry actually redoes the work.
    await admin.from('stripe_webhook_events').delete().eq('id', event.id)
    return NextResponse.json({ error: 'Webhook processing failed.' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
