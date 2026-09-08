// PropRoster — Tenant Connect: Provider Outreach V1. Landlord-initiated
// send. Auth pattern mirrors app/api/tenant-connect/notify/route.ts
// exactly: createRequestClient(token) gives an RLS-scoped client for
// the ACTUAL caller — re-fetching the maintenance request through it
// IS the authorization check (only the real owner's RLS policy ever
// returns that row). createAdminClient() is used ONLY after that
// succeeds, to insert the outreach row (a token must be generated and
// hashed regardless — no client insert policy exists on this table on
// purpose, see the migration's own header) and to look up the request/
// property/contact fields needed for the email. Never trusts a
// client-supplied owner_id, property address, or contact email —
// every value that ends up in the email comes from this route's own
// re-fetch, never the request body.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createRequestClient } from '../../../../../lib/supabase-server'
import {
  generateProviderOutreachToken, hashProviderOutreachToken, providerOutreachLink,
  buildProviderOutreachEmail, hasPendingOutreach, type ProviderOutreachRow,
} from '../../../../../lib/maintenance/provider-outreach'
import { sendTenantConnectEmail } from '../../../../../lib/tenant-connect/notify'

export const runtime = 'nodejs'

function getBearerToken(header: string | null): string | null {
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match ? match[1] : null
}

export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req.headers.get('authorization'))
    if (!token) return NextResponse.json({ sent: false, reason: 'unauthorized' }, { status: 401 })
    const client = createRequestClient(token)
    if (!client) return NextResponse.json({ sent: false, reason: 'not_configured' }, { status: 503 })

    const body = (await req.json().catch(() => ({}))) as { requestId?: string }
    if (!body.requestId) return NextResponse.json({ sent: false, reason: 'missing_request_id' }, { status: 400 })

    // RLS (maintenance_requests_select_own) only returns this row to
    // its real owner — this re-fetch is the whole authorization check.
    const { data: request } = await client
      .from('maintenance_requests')
      .select('id, owner_id, property_id, title, assigned_contact_id')
      .eq('id', body.requestId)
      .maybeSingle()
    if (!request) return NextResponse.json({ sent: false, reason: 'not_found' }, { status: 404 })
    if (!request.assigned_contact_id) return NextResponse.json({ sent: false, reason: 'no_assigned_contact' }, { status: 400 })

    // Same RLS-scoped re-fetch for the contact and property — both
    // must belong to this same caller too (property_contacts_select_own
    // / properties_select_own), never trusted from the request.
    const [{ data: contact }, { data: property }, { data: userResult }] = await Promise.all([
      client.from('property_contacts').select('id, name, email').eq('id', request.assigned_contact_id).maybeSingle(),
      client.from('properties').select('address, city').eq('id', request.property_id).maybeSingle(),
      client.auth.getUser(),
    ])
    if (!contact) return NextResponse.json({ sent: false, reason: 'contact_not_found' }, { status: 404 })
    if (!contact.email) return NextResponse.json({ sent: false, reason: 'no_provider_email' }, { status: 400 })
    if (!property) return NextResponse.json({ sent: false, reason: 'property_not_found' }, { status: 404 })

    const admin = createAdminClient()
    if (!admin) return NextResponse.json({ sent: false, reason: 'not_configured' }, { status: 503 })

    // Section 8 (duplicate-send protection) — re-checked server-side,
    // not just in the UI, so a double-click/replayed request can never
    // create two live outreach rows for the same (request, contact).
    const { data: existingRows } = await admin
      .from('maintenance_provider_outreach')
      .select('id, maintenance_request_id, contact_id, status, provider_message, sent_at, responded_at')
      .eq('maintenance_request_id', request.id)
      .eq('contact_id', contact.id)
    if (hasPendingOutreach((existingRows || []) as ProviderOutreachRow[], contact.id)) {
      return NextResponse.json({ sent: false, reason: 'already_pending' }, { status: 409 })
    }

    const rawToken = generateProviderOutreachToken()
    const { data: inserted, error: insertError } = await admin
      .from('maintenance_provider_outreach')
      .insert({
        maintenance_request_id: request.id,
        contact_id: contact.id,
        owner_id: request.owner_id,
        token_hash: hashProviderOutreachToken(rawToken),
      })
      .select('id')
      .single()
    if (insertError || !inserted) return NextResponse.json({ sent: false, reason: 'insert_failed' }, { status: 500 })

    const landlordName = userResult.user?.user_metadata?.full_name || userResult.user?.email?.split('@')[0] || 'The property owner'
    const propertyAddress = property.city ? `${property.address}, ${property.city}` : property.address
    const reviewUrl = providerOutreachLink(req.nextUrl.origin, rawToken)
    const email = buildProviderOutreachEmail({
      providerFirstName: contact.name.split(/\s+/)[0] || contact.name,
      landlordName,
      propertyAddress,
      issueTitle: request.title,
      reviewUrl,
    })
    const result = await sendTenantConnectEmail(contact.email, email)

    return NextResponse.json({ sent: result.sent, reason: result.reason, outreachId: inserted.id }, { status: 200 })
  } catch (err) {
    console.error('provider-outreach: send route unexpected error', err)
    return NextResponse.json({ sent: false, reason: 'unexpected_error' }, { status: 500 })
  }
}
