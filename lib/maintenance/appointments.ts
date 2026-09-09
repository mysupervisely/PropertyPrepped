// PropRoster — Tenant Connect: Scheduling Coordination V1.
//
// Pure logic only (see lib/maintenance/availability.ts's own header for
// the shared rationale). This file models the provider-proposes /
// landlord-confirms appointment lifecycle — deliberately its own table
// (public.maintenance_appointments), separate from BOTH
// maintenance_requests.status and maintenance_provider_outreach.status
// (Section 8's own "scheduling state must remain separate" instruction).
//
// A proposal never becomes a confirmed appointment by itself — every
// row this file reads/writes reflects that a provider proposing a time
// is a REQUEST for the landlord to confirm, never a fait accompli
// (Section 7). Nothing here ever mutates a past proposal in place — a
// new proposal is always a new row (Section 9's "do not overwrite
// scheduling history"); latestAppointmentForOutreach() below is what
// lets every caller cheaply show "only the current one" without any
// row ever being destroyed.

export const APPOINTMENT_STATUSES = ['proposed', 'confirmed', 'declined', 'cancelled'] as const
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number]

export const APPOINTMENT_STATUS_LABEL: Record<AppointmentStatus, string> = {
  proposed: 'Proposed',
  confirmed: 'Confirmed',
  declined: 'Declined',
  cancelled: 'Cancelled',
}

/** Mirrors public.maintenance_appointments exactly. */
export type AppointmentRow = {
  id: string
  maintenance_request_id: string
  outreach_id: string
  proposed_start_at: string
  proposed_by: 'provider' | 'landlord'
  matched_availability: boolean
  status: AppointmentStatus
  confirmed_at: string | null
  created_at: string
}

/**
 * The one appointment row a caller should ever show for a given
 * outreach — always the most recently proposed one, regardless of its
 * status. Mirrors provider-outreach.ts's latestOutreachForContact()
 * exactly: filtering by outreach_id first is what makes "provider
 * proposes again after a decline" naturally show only the fresh
 * proposal, with no row ever mutated or deleted.
 */
export function latestAppointmentForOutreach(rows: AppointmentRow[], outreachId: string): AppointmentRow | null {
  const forOutreach = rows.filter((r) => r.outreach_id === outreachId)
  if (!forOutreach.length) return null
  return forOutreach.slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
}

/** True only when the latest proposal for this outreach is still awaiting a landlord decision — the exact condition that should block a second, duplicate proposal from the same outreach (double-tap protection, mirroring hasPendingOutreach()'s semantics exactly). A 'declined' latest proposal is NOT pending — the provider may freely propose a new time. */
export function hasPendingAppointmentProposal(rows: AppointmentRow[], outreachId: string): boolean {
  return latestAppointmentForOutreach(rows, outreachId)?.status === 'proposed'
}
