import { describe, expect, it } from 'vitest'
import { latestAppointmentForOutreach, hasPendingAppointmentProposal, APPOINTMENT_STATUS_LABEL, type AppointmentRow } from './appointments'

// proposed_local_start_at is deliberately a naive, offset-less string
// (Scheduling V1 Timezone Correction) — never ".000Z"/an offset, which
// would suggest a real UTC instant this column is NOT.
const rows: AppointmentRow[] = [
  { id: 'a1', maintenance_request_id: 'r1', outreach_id: 'o1', proposed_local_start_at: '2026-09-15T10:00:00', proposed_by: 'provider', matched_availability: true, status: 'declined', confirmed_at: null, created_at: '2026-09-10T10:00:00Z' },
  { id: 'a2', maintenance_request_id: 'r1', outreach_id: 'o1', proposed_local_start_at: '2026-09-16T14:00:00', proposed_by: 'provider', matched_availability: false, status: 'proposed', confirmed_at: null, created_at: '2026-09-12T10:00:00Z' },
  { id: 'a3', maintenance_request_id: 'r1', outreach_id: 'o2', proposed_local_start_at: '2026-09-15T10:00:00', proposed_by: 'provider', matched_availability: true, status: 'confirmed', confirmed_at: '2026-09-11T10:00:00Z', created_at: '2026-09-11T09:00:00Z' },
]

describe('latestAppointmentForOutreach', () => {
  it('returns the most recently proposed row for that outreach, regardless of status', () => {
    expect(latestAppointmentForOutreach(rows, 'o1')?.id).toBe('a2')
  })

  it('never mixes in another outreach\'s appointment (reassignment starts a fresh history)', () => {
    expect(latestAppointmentForOutreach(rows, 'o2')?.id).toBe('a3')
  })

  it('returns null when this outreach has never had a proposal', () => {
    expect(latestAppointmentForOutreach(rows, 'o-never-proposed')).toBeNull()
  })

  it('never destroys or ignores the earlier declined proposal — it is still present in the input, just not the latest', () => {
    const forO1 = rows.filter((r) => r.outreach_id === 'o1')
    expect(forO1.some((r) => r.id === 'a1' && r.status === 'declined')).toBe(true)
  })
})

describe('hasPendingAppointmentProposal — duplicate-proposal protection', () => {
  it('true when the latest proposal for this outreach is still awaiting a landlord decision', () => {
    expect(hasPendingAppointmentProposal(rows, 'o1')).toBe(true)
  })

  it('false once the landlord has confirmed', () => {
    expect(hasPendingAppointmentProposal(rows, 'o2')).toBe(false)
  })

  it('false when there has never been a proposal', () => {
    expect(hasPendingAppointmentProposal(rows, 'o-never-proposed')).toBe(false)
  })

  it('a DECLINED latest proposal is not pending — the provider may propose a fresh time', () => {
    const declinedOnly: AppointmentRow[] = [{ ...rows[0], outreach_id: 'o3' }]
    expect(hasPendingAppointmentProposal(declinedOnly, 'o3')).toBe(false)
  })
})

describe('Appointment status vocabulary', () => {
  it('is exactly proposed/confirmed/declined/cancelled — no scheduling status leaks onto maintenance_requests.status or outreach status', () => {
    expect(APPOINTMENT_STATUS_LABEL).toEqual({
      proposed: 'Proposed', confirmed: 'Confirmed', declined: 'Declined', cancelled: 'Cancelled',
    })
  })
})
