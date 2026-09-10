import { describe, expect, it } from 'vitest'
import {
  isUrgentCase, nextActionFor, enrichMaintenanceCases, sortCasesForCommandCenter,
  casesForProperty, relevantContactsForProperty, summarizeCommandCenter, showsDedicatedUrgentBadge,
  type MaintenanceCaseRow, type TenantRequestLink, type IntakeSessionOutcome,
  type PropCrewContactRef, type PropCrewLinkRef,
} from './command-center'

function makeCase(overrides: Partial<MaintenanceCaseRow> = {}): MaintenanceCaseRow {
  return {
    id: 'case-1', property_id: 'prop-1', owner_id: 'owner-1', tenant_name: 'Jane Doe', tenant_email: 'jane@example.com',
    title: 'AC not cooling', description: 'The AC is not cooling.', priority: 'Normal', status: 'Submitted',
    source: 'landlord', assigned_contact_id: null, created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('isUrgentCase — deterministic only, never a heuristic', () => {
  it('is urgent when priority is Urgent, regardless of intake outcomes', () => {
    expect(isUrgentCase({ priority: 'Urgent' }, [])).toBe(true)
    expect(isUrgentCase({ priority: 'Urgent' }, ['resolved_in_intake'])).toBe(true)
  })

  it('is urgent when any linked intake session escalated_urgent', () => {
    expect(isUrgentCase({ priority: 'Normal' }, ['escalated_urgent'])).toBe(true)
    expect(isUrgentCase({ priority: 'Low' }, ['resolved_in_intake', 'escalated_urgent'])).toBe(true)
  })

  it('is not urgent otherwise', () => {
    expect(isUrgentCase({ priority: 'Normal' }, [])).toBe(false)
    expect(isUrgentCase({ priority: 'High' }, ['escalated_to_dispatch'])).toBe(false)
    expect(isUrgentCase({ priority: 'Normal' }, [null])).toBe(false)
  })
})

describe('showsDedicatedUrgentBadge — Bug 2 fix: dedup the "Urgent" badge against the priority pill, without touching isUrgentCase()', () => {
  it('hides the dedicated badge when urgency comes from priority itself — the priority pill already says "Urgent"', () => {
    expect(showsDedicatedUrgentBadge({ priority: 'Urgent' }, true)).toBe(false)
  })

  it('still shows the dedicated badge when urgency comes from a linked intake escalation and priority is NOT literally "Urgent" — otherwise this fact would appear nowhere', () => {
    expect(showsDedicatedUrgentBadge({ priority: 'Normal' }, true)).toBe(true)
    expect(showsDedicatedUrgentBadge({ priority: 'Low' }, true)).toBe(true)
  })

  it('never shows the badge when the case is not urgent at all', () => {
    expect(showsDedicatedUrgentBadge({ priority: 'Normal' }, false)).toBe(false)
    expect(showsDedicatedUrgentBadge({ priority: 'Urgent' }, false)).toBe(false)
  })

  it('composes with isUrgentCase/enrichMaintenanceCases exactly as the two render sites call it, for every case shape the app actually produces', () => {
    const landlordUrgent = enrichMaintenanceCases([makeCase({ id: 'a', priority: 'Urgent', source: 'landlord' })], [], [])[0]
    expect(showsDedicatedUrgentBadge(landlordUrgent, landlordUrgent.urgent)).toBe(false) // priority pill alone covers it

    const tenantEscalated = enrichMaintenanceCases(
      [makeCase({ id: 'b', priority: 'Normal', source: 'tenant' })],
      [{ id: 'tr1', maintenance_request_id: 'b', category: 'plumbing' }],
      [{ request_id: 'tr1', outcome: 'escalated_urgent' }],
    )[0]
    expect(showsDedicatedUrgentBadge(tenantEscalated, tenantEscalated.urgent)).toBe(true) // only the badge communicates this

    const notUrgent = enrichMaintenanceCases([makeCase({ id: 'c', priority: 'Normal', source: 'landlord' })], [], [])[0]
    expect(showsDedicatedUrgentBadge(notUrgent, notUrgent.urgent)).toBe(false)
  })
})

describe('nextActionFor — Simplification + Maintenance Workspace V2, Phase C: the full outreach/appointment-aware state machine', () => {
  it('Completed -> completed, Scheduled -> scheduled, In Progress -> in_progress, regardless of assignment or outreach/appointment state — a landlord\'s own explicit status choice always wins', () => {
    expect(nextActionFor({ status: 'Completed', assigned_contact_id: null })).toBe('completed')
    expect(nextActionFor({ status: 'Scheduled', assigned_contact_id: null })).toBe('scheduled')
    expect(nextActionFor({ status: 'In Progress', assigned_contact_id: 'c1' })).toBe('in_progress')
    expect(nextActionFor({ status: 'Completed', assigned_contact_id: 'c1' }, 'sent', 'proposed')).toBe('completed')
  })

  it('unassigned new request -> assign_provider', () => {
    expect(nextActionFor({ status: 'Submitted', assigned_contact_id: null })).toBe('assign_provider')
  })

  it('assigned but not yet contacted (no outreach at all) -> contact_provider', () => {
    expect(nextActionFor({ status: 'Submitted', assigned_contact_id: 'c1' })).toBe('contact_provider')
    expect(nextActionFor({ status: 'Submitted', assigned_contact_id: 'c1' }, null)).toBe('contact_provider')
  })

  it('outreach sent, no response yet -> awaiting_provider', () => {
    expect(nextActionFor({ status: 'Submitted', assigned_contact_id: 'c1' }, 'sent')).toBe('awaiting_provider')
  })

  it('provider declined -> provider_declined (a real landlord action: choose another provider)', () => {
    expect(nextActionFor({ status: 'Submitted', assigned_contact_id: 'c1' }, 'declined')).toBe('provider_declined')
  })

  it('provider asked a question -> needs_information', () => {
    expect(nextActionFor({ status: 'Submitted', assigned_contact_id: 'c1' }, 'needs_information')).toBe('needs_information')
  })

  it('provider accepted, no appointment proposed yet -> awaiting_proposal (NOT a landlord action — nothing to manufacture)', () => {
    expect(nextActionFor({ status: 'Submitted', assigned_contact_id: 'c1' }, 'accepted')).toBe('awaiting_proposal')
    expect(nextActionFor({ status: 'Submitted', assigned_contact_id: 'c1' }, 'accepted', null)).toBe('awaiting_proposal')
  })

  it('appointment proposed, pending landlord decision -> confirm_or_decline', () => {
    expect(nextActionFor({ status: 'Submitted', assigned_contact_id: 'c1' }, 'accepted', 'proposed')).toBe('confirm_or_decline')
  })

  it('appointment declined by the landlord -> back to awaiting_proposal, never stuck on the declined one', () => {
    expect(nextActionFor({ status: 'Submitted', assigned_contact_id: 'c1' }, 'accepted', 'declined')).toBe('awaiting_proposal')
  })

  it('appointment confirmed but maintenance_requests.status has not caught up yet (defensive ordering) -> scheduled, never asks to re-confirm', () => {
    expect(nextActionFor({ status: 'Submitted', assigned_contact_id: 'c1' }, 'accepted', 'confirmed')).toBe('scheduled')
  })

  it('assignment alone never implies the provider was contacted', () => {
    expect(nextActionFor({ status: 'Submitted', assigned_contact_id: 'c1' })).not.toBe('awaiting_provider')
    expect(nextActionFor({ status: 'Submitted', assigned_contact_id: 'c1' })).not.toBe('confirm_or_decline')
  })

  it('a proposal never implies confirmation — confirm_or_decline only fires for an actually-proposed appointment', () => {
    expect(nextActionFor({ status: 'Submitted', assigned_contact_id: 'c1' }, 'accepted')).not.toBe('confirm_or_decline')
  })
})

describe('enrichMaintenanceCases', () => {
  it('a landlord-logged case gets category=null and is never urgent from intake (it has no tenant_requests link)', () => {
    const cases = [makeCase({ id: 'c1', source: 'landlord' })]
    const [enriched] = enrichMaintenanceCases(cases, [], [])
    expect(enriched.category).toBeNull()
    expect(enriched.urgent).toBe(false)
    expect(enriched.active).toBe(true)
  })

  it('a tenant-sourced case is enriched with its linked tenant_requests category', () => {
    const cases = [makeCase({ id: 'c1', source: 'tenant' })]
    const tenantRequests: TenantRequestLink[] = [{ id: 'tr1', maintenance_request_id: 'c1', category: 'plumbing' }]
    const [enriched] = enrichMaintenanceCases(cases, tenantRequests, [])
    expect(enriched.category).toBe('plumbing')
  })

  it('a tenant-sourced case whose linked intake session escalated_urgent is enriched urgent=true', () => {
    const cases = [makeCase({ id: 'c1', source: 'tenant', priority: 'Normal' })]
    const tenantRequests: TenantRequestLink[] = [{ id: 'tr1', maintenance_request_id: 'c1', category: 'electrical' }]
    const sessions: IntakeSessionOutcome[] = [{ request_id: 'tr1', outcome: 'escalated_urgent' }]
    const [enriched] = enrichMaintenanceCases(cases, tenantRequests, sessions)
    expect(enriched.urgent).toBe(true)
  })

  it('never cross-links a session/tenant_request belonging to a DIFFERENT case', () => {
    const cases = [makeCase({ id: 'c1', source: 'tenant', priority: 'Normal' }), makeCase({ id: 'c2', source: 'tenant', priority: 'Normal' })]
    const tenantRequests: TenantRequestLink[] = [
      { id: 'tr1', maintenance_request_id: 'c1', category: 'plumbing' },
      { id: 'tr2', maintenance_request_id: 'c2', category: 'electrical' },
    ]
    const sessions: IntakeSessionOutcome[] = [{ request_id: 'tr2', outcome: 'escalated_urgent' }]
    const enriched = enrichMaintenanceCases(cases, tenantRequests, sessions)
    expect(enriched.find((c) => c.id === 'c1')!.urgent).toBe(false)
    expect(enriched.find((c) => c.id === 'c2')!.urgent).toBe(true)
  })

  it('Completed status makes active=false regardless of source/urgency', () => {
    const cases = [makeCase({ id: 'c1', status: 'Completed', priority: 'Urgent' })]
    const [enriched] = enrichMaintenanceCases(cases, [], [])
    expect(enriched.active).toBe(false)
    expect(enriched.urgent).toBe(true) // still urgent, just not active
  })

  describe('Phase C: nextAction reflects the full outreach/appointment lifecycle when those rows are supplied', () => {
    it('omitting outreach/appointment rows falls back to the coarse assigned/unassigned distinction — never throws, never assumes contact', () => {
      const [unassigned] = enrichMaintenanceCases([makeCase({ id: 'c1', assigned_contact_id: null })], [], [])
      expect(unassigned.nextAction).toBe('assign_provider')
      const [assigned] = enrichMaintenanceCases([makeCase({ id: 'c1', assigned_contact_id: 'contact-1' })], [], [])
      expect(assigned.nextAction).toBe('contact_provider')
    })

    it('resolves the CURRENT assigned contact\'s latest outreach, scoped to this exact case — a same contact\'s outreach on a DIFFERENT case never leaks in', () => {
      const cases = [makeCase({ id: 'case-a', assigned_contact_id: 'contact-1' }), makeCase({ id: 'case-b', assigned_contact_id: 'contact-1' })]
      const outreach = [
        { id: 'o1', maintenance_request_id: 'case-a', contact_id: 'contact-1', status: 'sent' as const, provider_message: null, sent_at: '2026-01-01T00:00:00Z', responded_at: null },
        { id: 'o2', maintenance_request_id: 'case-b', contact_id: 'contact-1', status: 'accepted' as const, provider_message: null, sent_at: '2026-01-02T00:00:00Z', responded_at: '2026-01-02T01:00:00Z' },
      ]
      const enriched = enrichMaintenanceCases(cases, [], [], outreach, [])
      expect(enriched.find((c) => c.id === 'case-a')!.nextAction).toBe('awaiting_provider')
      expect(enriched.find((c) => c.id === 'case-b')!.nextAction).toBe('awaiting_proposal')
    })

    it('reassigning to a different contact starts fresh — a PRIOR contact\'s outreach never carries over to the new one', () => {
      const cases = [makeCase({ id: 'case-a', assigned_contact_id: 'contact-2' })]
      const outreach = [
        { id: 'o1', maintenance_request_id: 'case-a', contact_id: 'contact-1', status: 'declined' as const, provider_message: null, sent_at: '2026-01-01T00:00:00Z', responded_at: '2026-01-01T01:00:00Z' },
      ]
      const [enriched] = enrichMaintenanceCases(cases, [], [], outreach, [])
      expect(enriched.nextAction).toBe('contact_provider') // fresh assignment, not provider_declined
    })

    it('resolves the appointment for the CURRENT outreach specifically, via the same outreach_id chain the detail view already uses', () => {
      const cases = [makeCase({ id: 'case-a', assigned_contact_id: 'contact-1' })]
      const outreach = [
        { id: 'o1', maintenance_request_id: 'case-a', contact_id: 'contact-1', status: 'accepted' as const, provider_message: null, sent_at: '2026-01-01T00:00:00Z', responded_at: '2026-01-01T01:00:00Z' },
      ]
      const appointments = [
        { id: 'a1', maintenance_request_id: 'case-a', outreach_id: 'o1', proposed_local_start_at: '2026-01-05T09:00:00', proposed_by: 'provider' as const, matched_availability: true, status: 'proposed' as const, confirmed_at: null, created_at: '2026-01-03T00:00:00Z' },
      ]
      const [enriched] = enrichMaintenanceCases(cases, [], [], outreach, appointments)
      expect(enriched.nextAction).toBe('confirm_or_decline')
    })
  })
})

describe('sortCasesForCommandCenter — active before history, urgent-first within active, newest-first within each group', () => {
  it('orders exactly: urgent-active, normal-active, history — regardless of input order', () => {
    const rows = [
      makeCase({ id: 'completed-old', status: 'Completed', created_at: '2026-01-01T00:00:00Z' }),
      makeCase({ id: 'active-normal', status: 'Submitted', created_at: '2026-01-05T00:00:00Z' }),
      makeCase({ id: 'active-urgent', status: 'Submitted', priority: 'Urgent', created_at: '2026-01-02T00:00:00Z' }),
      makeCase({ id: 'completed-new', status: 'Completed', created_at: '2026-01-06T00:00:00Z' }),
    ]
    const enriched = enrichMaintenanceCases(rows, [], [])
    const sorted = sortCasesForCommandCenter(enriched)
    expect(sorted.map((c) => c.id)).toEqual(['active-urgent', 'active-normal', 'completed-new', 'completed-old'])
  })

  it('never drops a row — history is preserved, only reordered', () => {
    const rows = [makeCase({ id: 'a', status: 'Completed' }), makeCase({ id: 'b', status: 'Submitted' })]
    const sorted = sortCasesForCommandCenter(enrichMaintenanceCases(rows, [], []))
    expect(sorted.length).toBe(2)
    expect(sorted.map((c) => c.id).sort()).toEqual(['a', 'b'])
  })
})

describe('casesForProperty — strict per-property scoping', () => {
  it('only returns cases for the requested property, never another property\'s rows', () => {
    const rows = [makeCase({ id: 'a', property_id: 'prop-1' }), makeCase({ id: 'b', property_id: 'prop-2' })]
    expect(casesForProperty(rows, 'prop-1').map((c) => c.id)).toEqual(['a'])
    expect(casesForProperty(rows, 'prop-2').map((c) => c.id)).toEqual(['b'])
    expect(casesForProperty(rows, 'prop-3')).toEqual([])
  })
})

describe('relevantContactsForProperty', () => {
  const contacts: PropCrewContactRef[] = [
    { id: 'c1', property_id: 'prop-1', owner_id: 'owner-1', name: 'Ace Plumbing', business_name: null, role: 'Plumber', email: null },
    { id: 'c2', property_id: 'prop-2', owner_id: 'owner-1', name: 'Bolt Electric', business_name: null, role: 'Electrician', email: null },
    { id: 'c3', property_id: 'prop-3', owner_id: 'owner-1', name: 'Cool Air HVAC', business_name: null, role: 'HVAC', email: null },
  ]

  it('includes a contact whose PRIMARY property_id matches', () => {
    expect(relevantContactsForProperty(contacts, [], 'prop-1').map((c) => c.id)).toEqual(['c1'])
  })

  it('ALSO includes a contact linked via property_contact_links, even if its primary property_id differs', () => {
    const links: PropCrewLinkRef[] = [{ contact_id: 'c2', property_id: 'prop-1' }]
    const result = relevantContactsForProperty(contacts, links, 'prop-1')
    expect(result.map((c) => c.id).sort()).toEqual(['c1', 'c2'])
  })

  it('never includes a contact belonging to a different property with no link', () => {
    expect(relevantContactsForProperty(contacts, [], 'prop-1').map((c) => c.id)).not.toContain('c3')
  })
})

describe('summarizeCommandCenter', () => {
  it('counts active, urgent-and-active, and completed independently', () => {
    const rows = [
      makeCase({ id: 'a', status: 'Submitted', priority: 'Urgent' }),
      makeCase({ id: 'b', status: 'Submitted', priority: 'Normal' }),
      makeCase({ id: 'c', status: 'Completed', priority: 'Urgent' }), // urgent but NOT active -> not counted in urgentCount
      makeCase({ id: 'd', status: 'Completed', priority: 'Normal' }),
    ]
    const summary = summarizeCommandCenter(enrichMaintenanceCases(rows, [], []))
    expect(summary).toEqual({ activeCount: 2, urgentCount: 1, completedCount: 2 })
  })

  it('an empty portfolio summarizes to all zeros, not an error', () => {
    expect(summarizeCommandCenter([])).toEqual({ activeCount: 0, urgentCount: 0, completedCount: 0 })
  })
})
