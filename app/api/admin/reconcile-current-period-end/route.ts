// PropRoster — Platform Admin Authorization Fix, follow-up: one-time
// (repeatable, idempotent) admin-triggered reconciliation for existing
// user_subscriptions rows whose current_period_end is null because of
// the webhook bug fixed in lib/billing/webhook-handlers.ts.
//
// - Same bearer-token auth pattern as every other billing/admin route.
// - Authorization is isCallerPlatformAdmin() — the same mechanism as
//   app/api/admin/subscriptions/route.ts, checked BEFORE the service-role
//   admin client or Stripe are ever touched.
// - Stripe is the ONLY authoritative source read (stripe.subscriptions.retrieve)
//   — never invents a date, never derives one from invoices.
// - The write is scoped to exactly one column (current_period_end) and
//   one row (.eq('owner_id', ...)) — this route cannot alter plan,
//   status, price, or ownership, by construction of
//   lib/billing/reconcile-current-period-end.ts's dependency shape.
// - Candidates are narrowly scoped to rows that actually need it
//   (stripe_subscription_id present, current_period_end null) — the
//   smallest possible blast radius, not a full resync of every row.
// - Idempotent: safe to call more than once. Rows already fixed simply
//   fall out of the candidate set on the next call.

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createRequestClient, createAdminClient } from '../../../../lib/supabase-server'
import { isStripeConfigured, getStripeClient, toSubscriptionLike } from '../../../../lib/billing/stripe'
import { isCallerPlatformAdmin } from '../../../../lib/admin/platform-admin'
import { reconcileCurrentPeriodEnd, type ReconcileDeps } from '../../../../lib/billing/reconcile-current-period-end'

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

    if (!(await isCallerPlatformAdmin(supabase, user.id))) {
      return NextResponse.json({ error: 'Not available.' }, { status: 403 })
    }

    if (!isStripeConfigured()) {
      return NextResponse.json({ error: 'Billing is not configured yet.' }, { status: 503 })
    }

    const admin = createAdminClient()
    if (!admin) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 })

    const stripe = getStripeClient()

    const deps: ReconcileDeps = {
      listCandidates: async () => {
        const { data } = await admin
          .from('user_subscriptions')
          .select('owner_id,stripe_subscription_id')
          .not('stripe_subscription_id', 'is', null)
          .is('current_period_end', null)
        return (data || []).map((row) => ({
          ownerId: row.owner_id as string,
          stripeSubscriptionId: row.stripe_subscription_id as string,
        }))
      },
      fetchLiveCurrentPeriodEnd: async (stripeSubscriptionId) => {
        try {
          const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId)
          return { found: true, currentPeriodEnd: toSubscriptionLike(sub).current_period_end }
        } catch (err) {
          if (err instanceof Stripe.errors.StripeInvalidRequestError && err.code === 'resource_missing') {
            return { found: false }
          }
          throw err
        }
      },
      updateCurrentPeriodEnd: async (ownerId, currentPeriodEndIso) => {
        const { error } = await admin
          .from('user_subscriptions')
          .update({ current_period_end: currentPeriodEndIso })
          .eq('owner_id', ownerId)
        if (error) throw new Error(error.message)
      },
    }

    const summary = await reconcileCurrentPeriodEnd(deps)
    return NextResponse.json(summary)
  } catch (err) {
    console.error('reconcile current_period_end error', err)
    return NextResponse.json({ error: 'Something went wrong reconciling subscriptions.' }, { status: 500 })
  }
}
