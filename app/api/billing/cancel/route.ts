// PropRoster — Subscription Management: schedule cancellation at the end
// of the current paid billing period.
//
// - Same bearer-token auth pattern as app/api/billing/checkout/route.ts
//   and .../portal/route.ts.
// - The Stripe subscription id acted on is read EXCLUSIVELY from the
//   caller's own, RLS-scoped user_subscriptions row — the request body is
//   never consulted for an id, so there is nothing a client could ever
//   submit to cancel someone else's subscription.
// - Default behavior is `cancel_at_period_end: true`, never an immediate
//   cancellation — paid access continues through the already-paid period,
//   and no customer data is touched (lib/billing/subscription-actions.ts).
// - Also upserts user_subscriptions directly (via the admin client) with
//   the row Stripe just confirmed, so the UI reflects the change
//   immediately rather than waiting on the webhook round trip. Stripe
//   will also send its own customer.subscription.updated event for this
//   change; upsertSubscription is an idempotent write (onConflict:
//   owner_id), so that later webhook delivery just re-applies the same
//   state safely.

import { NextRequest, NextResponse } from 'next/server'
import { createRequestClient, createAdminClient } from '../../../../lib/supabase-server'
import { isStripeConfigured, getStripeClient, toSubscriptionLike } from '../../../../lib/billing/stripe'
import { cancelSubscription, type SubscriptionActionDeps } from '../../../../lib/billing/subscription-actions'

export const runtime = 'nodejs'

function getBearerToken(header: string | null): string | null {
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match ? match[1] : null
}

export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req.headers.get('authorization'))
    if (!token) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })

    const supabase = createRequestClient(token)
    if (!supabase) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 })

    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData?.user) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
    }
    const user = userData.user

    if (!isStripeConfigured()) {
      return NextResponse.json({ error: 'Billing is not configured yet.' }, { status: 503 })
    }

    const admin = createAdminClient()
    if (!admin) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 })

    const stripe = getStripeClient()

    const deps: SubscriptionActionDeps = {
      getOwnSubscription: async () => {
        const { data } = await supabase
          .from('user_subscriptions')
          .select('plan,stripe_customer_id,stripe_subscription_id,status,current_period_end,cancel_at_period_end')
          .eq('owner_id', user.id)
          .maybeSingle()
        return data || null
      },
      updateCancelAtPeriodEnd: async (subscriptionId, cancelAtPeriodEnd) => {
        const updated = await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: cancelAtPeriodEnd })
        return toSubscriptionLike(updated)
      },
      upsertSubscription: async (row) => {
        await admin.from('user_subscriptions').upsert(row, { onConflict: 'owner_id' })
      },
    }

    const result = await cancelSubscription(user.id, deps)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json({ subscription: result.row })
  } catch (err) {
    console.error('billing cancel error', err)
    return NextResponse.json({ error: 'Something went wrong scheduling cancellation. Please try again.' }, { status: 500 })
  }
}
