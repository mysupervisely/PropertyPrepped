// PropRoster — Subscription Management: admin-only Billing / Subscriptions
// view data source.
//
// - Same bearer-token auth pattern as every other billing route.
// - Admin authorization is enforced HERE, server-side, before any
//   cross-account data is ever read: the caller's OWN plan is checked via
//   an RLS-scoped read of their OWN user_subscriptions row (the same
//   internal-only 'owner' plan gate already used by
//   app/admin/realtor-leads/page.tsx and the document-intelligence
//   diagnostics route) — a non-owner gets 403 and the admin client below
//   is never touched.
// - Only once that check passes does this reach for the service-role
//   admin client to read every account's subscription row — the same
//   "no per-row RLS policy needed" pattern the Stripe webhook and the
//   Landlord Digest job already use (see lib/supabase-server.ts's
//   createAdminClient doc comment), rather than adding a new
//   self-referential RLS policy on user_subscriptions.
// - Never exposes anything beyond what the task asks for: no raw Stripe
//   API response, no card numbers, no secret keys — only the fields
//   listed in lib/billing/admin-subscriptions.ts's AdminSubscriptionRow.

import { NextRequest, NextResponse } from 'next/server'
import { createRequestClient, createAdminClient } from '../../../../lib/supabase-server'
import { isStripeConfigured, getStripeClient } from '../../../../lib/billing/stripe'
import { buildAdminSubscriptionRow, summarizeAdminSubscriptions, type RawProfile, type RawSubscriptionRow } from '../../../../lib/billing/admin-subscriptions'

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

    const { data: own } = await supabase
      .from('user_subscriptions')
      .select('plan')
      .eq('owner_id', user.id)
      .maybeSingle()

    if (own?.plan !== 'owner') {
      // Same friendly, non-revealing message as the realtor-leads admin
      // page — never confirms/denies the existence of admin data to a
      // non-admin caller beyond "not available."
      return NextResponse.json({ error: 'Not available.' }, { status: 403 })
    }

    const admin = createAdminClient()
    if (!admin) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 })

    const { data: subRows, error: subError } = await admin
      .from('user_subscriptions')
      .select('owner_id,plan,status,stripe_customer_id,stripe_subscription_id,created_at,current_period_end,cancel_at_period_end')
      .order('created_at', { ascending: false })

    if (subError || !subRows) {
      return NextResponse.json({ error: 'Could not load subscriptions.' }, { status: 500 })
    }

    const ownerIds = subRows.map((row) => row.owner_id as string)

    const { data: profileRows } = await admin
      .from('user_profiles')
      .select('id,first_name,last_name,display_name')
      .in('id', ownerIds.length > 0 ? ownerIds : [''])

    const profilesById = new Map<string, RawProfile>((profileRows || []).map((p) => [p.id as string, p as RawProfile]))

    // auth.users isn't exposed through PostgREST — the Admin API is the
    // documented, correct way to read it server-side (same pattern as
    // lib/notifications/landlord-digest-supabase-port.ts's getOwnerEmail).
    const emailsById = new Map<string, string | null>()
    await Promise.all(
      ownerIds.map(async (ownerId) => {
        const { data, error } = await admin.auth.admin.getUserById(ownerId)
        emailsById.set(ownerId, error || !data?.user?.email ? null : data.user.email)
      }),
    )

    // "Last successful payment" isn't persisted anywhere yet (no invoice
    // history table) — looked up live from Stripe per subscriber with a
    // Stripe customer id. A lookup failure for one row never fails the
    // whole page; it just leaves that row's date blank.
    const lastPaymentById = new Map<string, string | null>()
    if (isStripeConfigured()) {
      const stripe = getStripeClient()
      await Promise.all(
        (subRows as RawSubscriptionRow[])
          .filter((row) => row.stripe_customer_id)
          .map(async (row) => {
            try {
              const invoices = await stripe.invoices.list({ customer: row.stripe_customer_id as string, status: 'paid', limit: 1 })
              const latest = invoices.data[0]
              lastPaymentById.set(row.owner_id, latest ? new Date(latest.created * 1000).toISOString() : null)
            } catch {
              lastPaymentById.set(row.owner_id, null)
            }
          }),
      )
    }

    const rows = (subRows as RawSubscriptionRow[]).map((row) =>
      buildAdminSubscriptionRow(row, profilesById.get(row.owner_id), emailsById.get(row.owner_id) ?? null, lastPaymentById.get(row.owner_id) ?? null),
    )

    return NextResponse.json({ rows, summary: summarizeAdminSubscriptions(rows) })
  } catch (err) {
    console.error('admin subscriptions error', err)
    return NextResponse.json({ error: 'Something went wrong loading subscriptions.' }, { status: 500 })
  }
}
