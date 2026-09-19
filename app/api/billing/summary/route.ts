// PropRoster — Subscription Management: a safe payment-method summary
// (brand/last4 only) plus recent invoice history for the account billing
// page's "Billing & Plan" area.
//
// - Same bearer-token auth pattern as the other billing routes. The
//   Stripe customer id is read exclusively from the caller's own
//   RLS-scoped user_subscriptions row.
// - Deliberately thin: this route exists ONLY to fetch and narrow Stripe
//   data down to lib/billing/summary.ts's safe shapes before it ever
//   reaches JSON — no raw Stripe object is ever returned to the browser.
// - Full payment-method management and complete invoice history still
//   live in the Stripe Customer Portal ("Manage Subscription") — this is
//   a lightweight inline summary, not a rebuild of the Portal.

import { NextRequest, NextResponse } from 'next/server'
import { createRequestClient } from '../../../../lib/supabase-server'
import { isStripeConfigured, getStripeClient } from '../../../../lib/billing/stripe'
import { mapPaymentMethod, mapInvoices, type StripeCustomerLike, type StripeInvoiceLike } from '../../../../lib/billing/summary'

export const runtime = 'nodejs'

function getBearerToken(header: string | null): string | null {
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match ? match[1] : null
}

export async function GET(req: NextRequest) {
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
      return NextResponse.json({ paymentMethod: null, invoices: [] })
    }

    const stripe = getStripeClient()
    const customerId = sub.stripe_customer_id

    const [customer, invoiceList] = await Promise.all([
      stripe.customers.retrieve(customerId, { expand: ['invoice_settings.default_payment_method'] }),
      stripe.invoices.list({ customer: customerId, limit: 5 }),
    ])

    const paymentMethod = mapPaymentMethod('deleted' in customer && customer.deleted ? null : (customer as unknown as StripeCustomerLike))
    const invoices = mapInvoices(invoiceList.data as unknown as StripeInvoiceLike[])

    return NextResponse.json({ paymentMethod, invoices })
  } catch (err) {
    console.error('billing summary error', err)
    // Never a hard failure for the page — the summary is a nice-to-have;
    // the caller falls back to showing just the Manage Subscription link.
    return NextResponse.json({ paymentMethod: null, invoices: [] })
  }
}
