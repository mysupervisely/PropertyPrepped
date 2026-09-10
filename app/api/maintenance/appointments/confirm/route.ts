// PropRoster — Tenant Connect: Scheduling Coordination V1. Landlord
// confirm/decline of a provider-proposed appointment. Auth pattern
// mirrors app/api/maintenance/provider-outreach/send/route.ts exactly:
// createRequestClient(token) re-fetches the appointment's OWN linked
// maintenance_requests row through the caller's RLS-scoped client —
// that re-fetch IS the authorization check (only the real owner's RLS
// policy ever returns that row) — before the admin client is used to
// write (this table has no client update policy, same precedent as
// maintenance_provider_outreach). Never trusts a client-supplied
// maintenance_request_id/owner_id — both come only from the appointment
// row itself, resolved by its own id.
//
// Confirming ALSO moves maintenance_requests.status to the pre-existing
// 'Scheduled' value (Section 7: "maintenance workflow can move to
// Scheduled if appropriate") — the ONE landlord-authorized case where
// this scheduling feature is allowed to touch that column, and it does
// so using the exact same value the status <select> in
// MaintenanceCaseDetail already offers, never a new one.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createRequestClient } from '../../../../../lib/supabase-server'

export const runtime = 'nodejs'

function getBearerToken(header: string | null): string | null {
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match ? match[1] : null
}

const ACTIONS = { confirm: 'confirmed', decline: 'declined' } as const

export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req.headers.get('authorization'))
    if (!token) return NextResponse.json({ ok: false, reason: 'unauthorized' }, { status: 401 })
    const client = createRequestClient(token)
    if (!client) return NextResponse.json({ ok: false, reason: 'not_configured' }, { status: 503 })

    const body = (await req.json().catch(() => ({}))) as { appointmentId?: string; action?: 'confirm' | 'decline' }
    if (!body.appointmentId || !body.action || !(body.action in ACTIONS)) {
      return NextResponse.json({ ok: false, reason: 'missing_fields' }, { status: 400 })
    }

    const admin = createAdminClient()
    if (!admin) return NextResponse.json({ ok: false, reason: 'not_configured' }, { status: 503 })

    // The appointment row itself isn't RLS-readable by id alone here
    // (no client select policy references it directly by primary key in
    // a way that would double as authorization) — resolve it via the
    // admin client first, then use ITS OWN maintenance_request_id to
    // re-fetch through the caller's RLS-scoped client, which is the
    // actual authorization check.
    const { data: appointment } = await admin
      .from('maintenance_appointments')
      .select('id, maintenance_request_id, status')
      .eq('id', body.appointmentId)
      .maybeSingle()
    if (!appointment) return NextResponse.json({ ok: false, reason: 'not_found' }, { status: 404 })
    if (appointment.status !== 'proposed') return NextResponse.json({ ok: false, reason: 'not_pending' }, { status: 409 })

    const { data: request } = await client
      .from('maintenance_requests')
      .select('id')
      .eq('id', appointment.maintenance_request_id)
      .maybeSingle()
    if (!request) return NextResponse.json({ ok: false, reason: 'not_found' }, { status: 404 })

    const nextStatus = ACTIONS[body.action]
    const { error: updateError } = await admin
      .from('maintenance_appointments')
      .update({ status: nextStatus, confirmed_at: nextStatus === 'confirmed' ? new Date().toISOString() : null })
      .eq('id', appointment.id)
    if (updateError) return NextResponse.json({ ok: false, reason: 'update_failed' }, { status: 500 })

    if (nextStatus === 'confirmed') {
      await admin.from('maintenance_requests').update({ status: 'Scheduled' }).eq('id', appointment.maintenance_request_id)
    }

    return NextResponse.json({ ok: true, status: nextStatus }, { status: 200 })
  } catch (err) {
    console.error('maintenance appointments: confirm route unexpected error', err)
    return NextResponse.json({ ok: false, reason: 'unexpected_error' }, { status: 500 })
  }
}
