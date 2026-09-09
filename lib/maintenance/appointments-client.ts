// PropRoster — Tenant Connect: Scheduling Coordination V1. Client-side
// trigger for the landlord confirm/decline route — same Bearer-token
// pattern as lib/maintenance/provider-outreach-client.ts, and NOT
// best-effort for the same reason: confirming/declining an appointment
// IS the landlord's explicit action (Section 7), so both call sites
// need the real result.

import type { SupabaseClient } from '@supabase/supabase-js'

export type ConfirmAppointmentResult = { ok: boolean; reason?: string; status?: string }

export async function confirmAppointment(supabase: SupabaseClient, appointmentId: string, action: 'confirm' | 'decline'): Promise<ConfirmAppointmentResult> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return { ok: false, reason: 'unauthorized' }
  const res = await fetch('/api/maintenance/appointments/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ appointmentId, action }),
  })
  const body = await res.json().catch(() => ({ ok: false, reason: 'unexpected_error' }))
  return body as ConfirmAppointmentResult
}

/** Friendly text for the reasons the confirm route can return — same "never show a raw API reason" convention as providerOutreachErrorMessage(). */
export function appointmentErrorMessage(reason?: string): string {
  switch (reason) {
    case 'not_pending':
      return 'This appointment has already been decided.'
    case 'not_found':
      return 'This appointment could not be found.'
    default:
      return 'Could not update the appointment. Please try again in a moment.'
  }
}
