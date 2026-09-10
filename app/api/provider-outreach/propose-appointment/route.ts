// PropRoster — Tenant Connect: Scheduling Coordination V1. Provider
// proposes a visit time — same account-less, token-only authorization
// model as app/api/provider-outreach/respond/route.ts (Section 10:
// "provider secure link must remain request-specific... do not weaken
// the existing Provider Outreach token architecture"). The token
// resolves the outreach row; the maintenance_request_id and owner_id
// used for the inserted appointment come ONLY from that resolved row,
// never from the request body (Section 9's own "never trust provider-
// supplied maintenance request IDs" carried forward to this route).
//
// Only reachable once the provider has already accepted (Section 5:
// "after a provider has accepted... allow them to coordinate a
// visit") — proposing before accepting is rejected outright, not
// silently allowed.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '../../../../lib/supabase-server'
import { hashProviderOutreachToken } from '../../../../lib/maintenance/provider-outreach'
import { parseLocalDateTime, formatLocalTimestampForStorage, matchProposedTime, windowsForRequestId, type AvailabilityWindow } from '../../../../lib/maintenance/availability'
import { hasPendingAppointmentProposal, type AppointmentRow } from '../../../../lib/maintenance/appointments'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { token?: string; localDateTime?: string }
    if (!body.token || !body.localDateTime) return NextResponse.json({ ok: false, reason: 'missing_fields' }, { status: 400 })
    const parsed = parseLocalDateTime(body.localDateTime)
    if (!parsed) return NextResponse.json({ ok: false, reason: 'invalid_time' }, { status: 400 })

    const admin = createAdminClient()
    if (!admin) return NextResponse.json({ ok: false, reason: 'not_configured' }, { status: 503 })

    const tokenHash = hashProviderOutreachToken(body.token)
    const { data: outreach } = await admin
      .from('maintenance_provider_outreach')
      .select('id, status, maintenance_request_id, owner_id, token_expires_at')
      .eq('token_hash', tokenHash)
      .maybeSingle()
    if (!outreach) return NextResponse.json({ ok: false, reason: 'invalid_token' }, { status: 404 })
    if (new Date(outreach.token_expires_at).getTime() < Date.now()) return NextResponse.json({ ok: false, reason: 'expired' }, { status: 410 })
    // A provider may only schedule after accepting — never before, and
    // never after declining/asking a question instead.
    if (outreach.status !== 'accepted') return NextResponse.json({ ok: false, reason: 'not_accepted' }, { status: 409 })

    const { data: existingAppointments } = await admin
      .from('maintenance_appointments')
      .select('id, maintenance_request_id, outreach_id, proposed_local_start_at, proposed_by, matched_availability, status, confirmed_at, created_at')
      .eq('outreach_id', outreach.id)
    // Duplicate-proposal protection (Section 6/9 of Provider Outreach V1,
    // carried forward here) — a double-tap must never create two live
    // proposals; a DECLINED prior proposal is not "pending," so a fresh
    // proposal after a decline is allowed.
    if (hasPendingAppointmentProposal((existingAppointments || []) as AppointmentRow[], outreach.id)) {
      return NextResponse.json({ ok: false, reason: 'already_proposed' }, { status: 409 })
    }

    // Resolve this request's tenant-supplied availability the same
    // one-hop way the landlord view does (tenant_requests.maintenance_request_id),
    // narrow-selected — never select('*') for a provider-reachable route.
    const { data: tenantRequest } = await admin
      .from('tenant_requests')
      .select('id')
      .eq('maintenance_request_id', outreach.maintenance_request_id)
      .maybeSingle()
    let windows: AvailabilityWindow[] = []
    if (tenantRequest) {
      const { data: windowRows } = await admin
        .from('maintenance_availability_windows')
        .select('id, request_id, window_date, window_label')
        .eq('request_id', tenantRequest.id)
      windows = windowsForRequestId((windowRows || []) as AvailabilityWindow[], tenantRequest.id)
    }
    const matched = matchProposedTime(windows, parsed)
    // Scheduling V1 Timezone Correction: NEVER `new Date(body.localDateTime)
    // .toISOString()` here — that would reinterpret a timezone-less
    // wall-clock value using this server's own runtime timezone,
    // silently shifting the hour the provider actually selected.
    // formatLocalTimestampForStorage() re-serializes the SAME parsed
    // parts already used for matching above, with zero conversion.
    const proposedLocalStartAt = formatLocalTimestampForStorage(parsed)

    const { data: inserted, error: insertError } = await admin
      .from('maintenance_appointments')
      .insert({
        maintenance_request_id: outreach.maintenance_request_id,
        outreach_id: outreach.id,
        owner_id: outreach.owner_id,
        proposed_local_start_at: proposedLocalStartAt,
        proposed_by: 'provider',
        matched_availability: matched,
      })
      .select('id')
      .single()
    if (insertError || !inserted) return NextResponse.json({ ok: false, reason: 'insert_failed' }, { status: 500 })

    return NextResponse.json({ ok: true, appointmentId: inserted.id, matched }, { status: 200 })
  } catch (err) {
    console.error('provider-outreach: propose-appointment route unexpected error', err)
    return NextResponse.json({ ok: false, reason: 'unexpected_error' }, { status: 500 })
  }
}
