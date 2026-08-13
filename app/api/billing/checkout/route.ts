// PropPrepped Milestone 9: authenticated Stripe Checkout Session creation.
//
// - Runs server-side only (Node runtime); STRIPE_SECRET_KEY never reaches
//   the browser.
// - The browser sends only a plan identifier ("investor" / "portfolio" /
//   "portfolio_pro") — never a Stripe Price id (Section 9). The server
//   maps that identifier to a server-configured Price id
//   (lib/billing/stripe.ts resolvePriceId) via an env var lookup a client
//   can't influence.
// - Every Supabase call uses the caller's own access token — no
//   service-role key anywhere in this route. The Stripe customer id (if
//   any already exists) is read via an RLS-scoped SELECT of the caller's
//   own user_subscriptions row; a NEW customer is left for Stripe to
//   create during Checkout (via customer_email), and gets persisted to
//   user_subscriptions by the webhook once checkout.session.completed
//   arrives — this route never writes to user_subscriptions itself.
// - client_reference_id is set here, server-side, from the verified
//   user's id — never from client input — so the webhook can safely
//   attribute the resulting subscription to the right account.

import { NextRequest, NextResponse } from 'next/server'
import { createRequestClient } from '../../../../lib/supabase-server'
import { isPurchasablePlanId, isStripeConfigured, getStripeClient, resolvePriceId } from '../../../../lib/billing/stripe'

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

    const payload = (await req.json().catch(() => ({}))) as { plan?: unknown }
    if (!isPurchasablePlanId(payload.plan)) {
      return NextResponse.json({ error: 'Choose a valid plan (investor, portfolio, or portfolio_pro).' }, { status: 400 })
    }

    const priceId = resolvePriceId(payload.plan)
    if (!priceId) {
      // The plan identifier is valid, but its Stripe Price id env var isn't
      // set — treat this the same as "billing not configured" rather than
      // leaking which specific env var is missing.
      return NextResponse.json({ error: 'Billing is not configured yet.' }, { status: 503 })
    }

    // Reuse an existing Stripe customer if this account already has one
    // (from a prior subscription attempt) — read-only, RLS-scoped to the
    // caller's own row.
    const { data: existingSub } = await supabase
      .from('user_subscriptions')
      .select('stripe_customer_id')
      .eq('owner_id', user.id)
      .maybeSingle()

    const origin = req.headers.get('origin') || new URL(req.url).origin
    const stripe = getStripeClient()

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: user.id,
      ...(existingSub?.stripe_customer_id
        ? { customer: existingSub.stripe_customer_id }
        : { customer_email: user.email }),
      success_url: `${origin}/account/billing?checkout=success`,
      cancel_url: `${origin}/pricing?checkout=cancelled`,
    })

    if (!session.url) {
      return NextResponse.json({ error: 'Could not start checkout. Please try again.' }, { status: 502 })
    }

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('billing checkout error', err)
    return NextResponse.json({ error: 'Something went wrong starting checkout.' }, { status: 500 })
  }
}
