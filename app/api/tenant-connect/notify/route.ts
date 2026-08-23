// PropRoster — Tenant Connect V1 (Milestone 24): notification trigger.
//
// The one server route Tenant Connect's client-driven writes (invite,
// request creation, replies, status changes — all done directly via the
// caller's own RLS-scoped Supabase client, same as the rest of Tenant
// Connect since M10) call AFTER a DB write already succeeded, purely to
// send the transactional email for it. Never the write path itself —
// this route makes no INSERT/UPDATE of its own.
//
// Auth pattern mirrors app/api/realtor-leads/route.ts exactly:
// createRequestClient(token) gives an RLS-scoped client for the ACTUAL
// caller, used to re-fetch the row being notified about — this is what
// proves the caller is a legitimate participant (owner or the request's
// own tenant) rather than trusting anything in the request body. The
// only content ever emailed is what that re-fetch returns, never a
// client-supplied subject/body. createAdminClient() is used ONLY to
// resolve the property owner's email address (auth.users.email isn't
// otherwise exposed anywhere the client can read it) — never to bypass
// the RLS-scoped authorization check above.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createRequestClient } from '../../../../lib/supabase-server'
import { buildInviteEmail, buildNewRequestEmail, buildLandlordUpdateEmail, sendTenantConnectEmail } from '../../../../lib/tenant-connect/notify'

export const runtime = 'nodejs'

function getBearerToken(header: string | null): string | null {
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match ? match[1] : null
}

export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req.headers.get('authorization'))
    if (!token) return NextResponse.json({ sent: false }, { status: 401 })
    const supabase = createRequestClient(token)
    if (!supabase) return NextResponse.json({ sent: false }, { status: 503 })

    const body = (await req.json().catch(() => ({}))) as { kind?: string; accessId?: string; requestId?: string }

    if (body.kind === 'invite' && body.accessId) {
      // RLS (tenant_access_select) only returns this row if the caller
      // is its real owner_id — the query itself is the authorization
      // check, nothing here trusts the body beyond "which row."
      const { data: access } = await supabase.from('tenant_property_access').select('property_id, tenant_email').eq('id', body.accessId).maybeSingle()
      if (!access) return NextResponse.json({ sent: false }, { status: 200 })
      const { data: property } = await supabase.from('properties').select('address').eq('id', access.property_id).maybeSingle()
      const result = await sendTenantConnectEmail(access.tenant_email, buildInviteEmail(property?.address || 'your property'))
      return NextResponse.json(result, { status: 200 })
    }

    if (body.kind === 'new_request' && body.requestId) {
      // RLS (tenant_requests_select) only returns this row to its owner
      // or its own active tenant — here it's the tenant who just
      // created it, re-fetched (never trusted from the body). The
      // caller here is the TENANT, so the property re-fetch below goes
      // through tenant_property_view, not the owner-facing properties
      // base table — that base table has no tenant-facing SELECT
      // policy any more (Round 6, Concern 2), so a tenant's own
      // RLS-scoped client would get nothing from it.
      const { data: request } = await supabase.from('tenant_requests').select('property_id, owner_id, category, title').eq('id', body.requestId).maybeSingle()
      if (!request) return NextResponse.json({ sent: false }, { status: 200 })
      const { data: property } = await supabase.from('tenant_property_view').select('address').eq('id', request.property_id).maybeSingle()
      const admin = createAdminClient()
      if (!admin) return NextResponse.json({ sent: false }, { status: 200 })
      const { data: ownerUser } = await admin.auth.admin.getUserById(request.owner_id)
      if (!ownerUser?.user?.email) return NextResponse.json({ sent: false }, { status: 200 })
      const result = await sendTenantConnectEmail(ownerUser.user.email, buildNewRequestEmail(property?.address || 'your property', request.category, request.title))
      return NextResponse.json(result, { status: 200 })
    }

    if (body.kind === 'landlord_update' && body.requestId) {
      // RLS again does the authorization work: only returned to the
      // owner (who is the only one who can trigger this kind) or the
      // request's own tenant.
      const { data: request } = await supabase.from('tenant_requests').select('property_id, tenant_access_id, title').eq('id', body.requestId).maybeSingle()
      if (!request) return NextResponse.json({ sent: false }, { status: 200 })
      const [{ data: property }, { data: access }] = await Promise.all([
        supabase.from('properties').select('address').eq('id', request.property_id).maybeSingle(),
        supabase.from('tenant_property_access').select('tenant_email').eq('id', request.tenant_access_id).maybeSingle(),
      ])
      if (!access?.tenant_email) return NextResponse.json({ sent: false }, { status: 200 })
      const result = await sendTenantConnectEmail(access.tenant_email, buildLandlordUpdateEmail(property?.address || 'your property', request.title))
      return NextResponse.json(result, { status: 200 })
    }

    return NextResponse.json({ sent: false }, { status: 400 })
  } catch (err) {
    console.error('tenant-connect: notify route unexpected error', err)
    return NextResponse.json({ sent: false }, { status: 500 })
  }
}
