// PropPrepped Milestone 9: authenticated Stripe Customer Portal session
// creation.
//
// - Server-side only; STRIPE_SECRET_KEY never reaches the browser.
// - The Stripe customer id is read exclusively via an RLS-scoped SELECT of
//   the caller's OWN user_subscriptions row (`.eq('owner_id', user.id)`
//   on top of RLS that already restricts to owner_id = auth.uid()) — never
//   accepted from client input, so one user can never open another
//   customer's billing portal (Section 11/14).
// - No service-role key used here either — same reasoning as the checkout
//   route: everything this endpoint needs is either "read the caller's own
//   row" (RLS-safe) or a Stripe API call scoped to the id just read.

import { NextRequest, NextResponse } from 'next/server'
import { createRequestClient } from '../../../../lib/supabase-server'
import { isStripeConfigured, getStripeClient } from '../../../../lib/billing/stripe'

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

    const { data: sub } = await supabase
      .from('user_subscriptions')
      .select('stripe_customer_id')
      .eq('owner_id', user.id)
      .maybeSingle()

    if (!sub?.stripe_customer_id) {
      return NextResponse.json(
        { error: 'No billing account found yet. Subscribe to a paid plan first.' },
        { status: 404 },
      )
    }

    const origin = req.headers.get('origin') || new URL(req.url).origin
    const stripe = getStripeClient()

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${origin}/account/billing`,
    })

    return NextResponse.json({ url: portalSession.url })
  } catch (err) {
    console.error('billing portal error', err)
    return NextResponse.json({ error: 'Something went wrong opening the billing portal.' }, { status: 500 })
  }
}
