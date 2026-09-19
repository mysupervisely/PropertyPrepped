// PropRoster — Subscription Management: resume a subscription that has a
// scheduled (not-yet-effective) cancellation.
//
// Mirrors app/api/billing/cancel/route.ts exactly — same auth pattern,
// same "subscription id comes only from the caller's own RLS-scoped row"
// rule, same immediate upsert. lib/billing/subscription-actions.ts's
// resumeSubscription() rejects the request (400) if there is no scheduled
// cancellation to remove, or if the paid period has already fully ended
// (status canceled) — resuming past that point means subscribing again
// via Checkout, not resuming.

import { NextRequest, NextResponse } from 'next/server'
import { createRequestClient, createAdminClient } from '../../../../lib/supabase-server'
import { isStripeConfigured, getStripeClient, toSubscriptionLike } from '../../../../lib/billing/stripe'
import { resumeSubscription, type SubscriptionActionDeps } from '../../../../lib/billing/subscription-actions'

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

    const result = await resumeSubscription(user.id, deps)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json({ subscription: result.row })
  } catch (err) {
    console.error('billing resume error', err)
    return NextResponse.json({ error: 'Something went wrong resuming your subscription. Please try again.' }, { status: 500 })
  }
}
