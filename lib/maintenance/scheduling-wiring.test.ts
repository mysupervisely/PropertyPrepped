import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// PropRoster — Tenant Connect: Scheduling Coordination V1. Source-read
// regression guards, matching lib/maintenance/provider-outreach-
// wiring.test.ts's own precedent. Pure logic (availability/appointment
// matching, latest-row selection) is already fully covered by
// lib/maintenance/availability.test.ts and appointments.test.ts — this
// file checks the WIRING: that the new routes/pages/components actually
// use that logic the way this milestone's sections require, and that
// nothing here reopens security boundaries Provider Outreach V1 already
// established.

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

const proposeRouteSource = readFile('app/api/provider-outreach/propose-appointment/route.ts')
const confirmRouteSource = readFile('app/api/maintenance/appointments/confirm/route.ts')
const providerPageSource = readFile('app/provider/[token]/page.tsx')
const providerActionsSource = readFile('components/provider/ProviderResponseActions.tsx')
const guidedIntakeSource = readFile('components/tenant-connect/GuidedIntake.tsx')
const submitSource = readFile('lib/maintenance/intake/submit.ts')
const caseDetailSource = readFile('components/maintenance/MaintenanceCaseDetail.tsx')
const pageSource = readFile('app/page.tsx')
const commandCenterPageSource = readFile('app/maintenance/page.tsx')
const migrationSource = readFile('supabase/milestone-28-scheduling-coordination-v1.sql')

describe('Tenant availability — optional, request-specific, no permanent calendar', () => {
  it('the guided intake review screen collects availability and entry preference, both optional', () => {
    expect(guidedIntakeSource).toContain('flattenAvailabilityInput(availabilityDays)')
    expect(guidedIntakeSource).toContain('entryPreference: entryPreference || null')
  })

  it('shows the entry-permission distinction verbatim near availability', () => {
    expect(guidedIntakeSource).toContain('Availability tells us when someone can come. It does not authorize entry into your home.')
  })

  it('submit.ts inserts availability windows scoped to the just-created request, never a standing/global calendar table', () => {
    expect(submitSource).toContain("from('maintenance_availability_windows')")
    expect(submitSource).not.toMatch(/calendar|recurring/i)
  })
})

describe('Landlord view — availability shown before contacting PropCrew, never blocks outreach', () => {
  it('MaintenanceCaseDetail renders the availability section before the PropCrew/outreach section', () => {
    const availabilityIdx = caseDetailSource.indexOf('maintenanceAvailabilitySection')
    const propCrewIdx = caseDetailSource.indexOf('providerOutreachSection')
    expect(availabilityIdx).toBeGreaterThan(-1)
    expect(propCrewIdx).toBeGreaterThan(-1)
    expect(availabilityIdx).toBeLessThan(propCrewIdx)
  })

  it('shows a neutral "not provided" state rather than inventing availability', () => {
    expect(caseDetailSource).toContain('Tenant availability not provided.')
  })

  it('the Contact PropCrew button is never gated on availability being present', () => {
    // Bounded to the PropCrew/outreach block itself — the appointment
    // proposal block further down the file legitimately checks
    // availabilityWindows.length for its own, unrelated availability-
    // match badge (see the PR #60 bug-fix describe block below); that
    // is not the Contact PropCrew button and must not trip this guard.
    const contactButtonSource = caseDetailSource.slice(
      caseDetailSource.indexOf('providerOutreachSection'),
      caseDetailSource.indexOf('maintenanceAppointmentProposal'),
    )
    expect(contactButtonSource).not.toMatch(/availabilityWindows\.length|!availabilityWindows/)
  })

  it('both landlord pages fetch availability windows and appointments and pass them into the shared component', () => {
    for (const source of [pageSource, commandCenterPageSource]) {
      expect(source).toContain("from('maintenance_availability_windows')")
      expect(source).toContain("from('maintenance_appointments')")
      expect(source).toContain('availabilityWindows={')
      expect(source).toContain('appointment={')
    }
  })
})

describe('Provider propose-appointment route — token-only authorization, never a client-supplied id', () => {
  it('resolves the outreach via the hashed token only', () => {
    expect(proposeRouteSource).toContain('hashProviderOutreachToken(body.token)')
    expect(stripComments(proposeRouteSource)).not.toMatch(/body\.maintenanceRequestId|body\.outreachId|body\.ownerId/)
  })

  it('only allows proposing after the provider has already accepted', () => {
    expect(proposeRouteSource).toContain("outreach.status !== 'accepted'")
    expect(proposeRouteSource).toContain("reason: 'not_accepted'")
  })

  it('computes matched_availability deterministically via matchProposedTime, never AI', () => {
    expect(proposeRouteSource).toContain('matchProposedTime(windows, parsed)')
  })

  it('Scheduling V1 Timezone Correction: stores the proposal via formatLocalTimestampForStorage, never new Date(...).toISOString() on the raw local input', () => {
    expect(proposeRouteSource).toContain('formatLocalTimestampForStorage(parsed)')
    expect(stripComments(proposeRouteSource)).not.toMatch(/new Date\(body\.localDateTime\)/)
    expect(stripComments(proposeRouteSource)).not.toContain('.toISOString()')
    expect(proposeRouteSource).toContain('proposed_local_start_at')
  })

  it('duplicate-proposal protection: rejects a second proposal while one is already pending', () => {
    expect(proposeRouteSource).toContain('hasPendingAppointmentProposal(')
    expect(proposeRouteSource).toContain("reason: 'already_proposed'")
  })

  it('never selects financial/portfolio columns for the availability lookup', () => {
    expect(stripComments(proposeRouteSource)).not.toMatch(/mortgage|rent_amount|security_deposit|purchase_price|market_value/i)
  })
})

describe('Landlord confirm/decline route — RLS re-fetch as authorization, never trusts a client-supplied owner/request id', () => {
  it('re-fetches the linked maintenance_requests row through the caller\'s RLS-scoped client', () => {
    expect(confirmRouteSource).toContain('createRequestClient(token)')
    expect(confirmRouteSource).toContain("from('maintenance_requests')")
  })

  it('only allows confirming/declining a still-pending proposal, never overwriting a settled one', () => {
    expect(confirmRouteSource).toContain("appointment.status !== 'proposed'")
    expect(confirmRouteSource).toContain("reason: 'not_pending'")
  })

  it('confirming moves maintenance_requests.status to the pre-existing Scheduled value only — no new status invented', () => {
    expect(confirmRouteSource).toContain("status: 'Scheduled'")
  })

  it('provider outreach status is never written by this route — scheduling state stays separate', () => {
    expect(stripComments(confirmRouteSource)).not.toMatch(/maintenance_provider_outreach/)
  })
})

describe('Provider page/component — scheduling only after acceptance, no unrelated data exposed', () => {
  it('availability/appointment are only fetched once the outreach has been accepted', () => {
    expect(providerPageSource).toContain("outreach.status === 'accepted'")
  })

  it('never selects financial/portfolio columns anywhere in this file', () => {
    expect(stripComments(providerPageSource)).not.toMatch(/mortgage|rent_amount|security_deposit|lease_terms|tax_|purchase_price|market_value|propwatch/i)
  })

  it('the provider-safe availability view never carries a request/tenant id through to the browser', () => {
    expect(providerPageSource).toContain('buildProviderSafeAvailability(')
  })

  it('scheduling UI renders only in the accepted state, not for sent/declined/needs_information', () => {
    expect(providerActionsSource).toContain("status === 'accepted'")
  })

  it('Scheduling V1 Timezone Correction: displays proposed/confirmed times via formatAppointmentDateTime, never new Date(appointment.proposed_local_start_at)', () => {
    for (const source of [caseDetailSource, providerActionsSource]) {
      expect(source).not.toMatch(/new Date\(appointment\.proposed/)
    }
    expect(caseDetailSource).toContain('formatAppointmentDateTime(appointment.proposed_local_start_at)')
    expect(providerActionsSource).toContain('formatAppointmentDateTime(appointment.proposed_local_start_at)')
  })

  it('never builds a full calendar widget or pulls in a calendar library', () => {
    expect(stripComments(providerActionsSource)).not.toMatch(/calendar|fullcalendar|react-datepicker/i)
  })
})

describe('Migration — additive only, scheduling state kept separate from both maintenance_requests.status and outreach status', () => {
  it('is explicitly marked as not yet applied to production', () => {
    expect(migrationSource).toContain('NOT YET APPLIED TO PRODUCTION')
  })

  it('adds entry_preference as a nullable additive column, never a NOT NULL retroactive requirement', () => {
    expect(migrationSource).toContain('add column if not exists entry_preference text')
    expect(migrationSource).not.toMatch(/entry_preference[^\n]*not null/)
  })

  it('Scheduling V1 Timezone Correction: proposed_local_start_at is a plain `timestamp`, never `timestamptz` — no property timezone infrastructure exists to convert it correctly', () => {
    expect(migrationSource).toContain('proposed_local_start_at timestamp not null')
    expect(migrationSource).not.toMatch(/proposed_start_at\s+timestamptz/)
  })

  it('has no client-facing insert/update/delete policy on maintenance_appointments — every write goes through a server route', () => {
    const appointmentsSection = migrationSource.slice(migrationSource.indexOf('create table if not exists public.maintenance_appointments'))
    expect(appointmentsSection).not.toMatch(/for insert to authenticated|for update to authenticated|for delete to authenticated/i)
  })

  it('availability windows are insert-only for tenants — no update/delete policy (append-only history)', () => {
    const windowsSection = migrationSource.slice(
      migrationSource.indexOf('create table if not exists public.maintenance_availability_windows'),
      migrationSource.indexOf('create table if not exists public.maintenance_appointments'),
    )
    expect(windowsSection).not.toMatch(/for update to authenticated|for delete to authenticated/i)
  })

  it('never alters maintenance_provider_outreach or weakens its existing policy', () => {
    expect(migrationSource).not.toMatch(/alter table public\.maintenance_provider_outreach/i)
  })
})

describe('Bug fix (real-device testing, PR #60): the availability-match badge no longer misreads "no availability provided" as "outside availability"', () => {
  // matched_availability is stored false both when a proposal is
  // genuinely outside the tenant's windows AND when the tenant provided
  // no availability at all (matchProposedTime() returns false for an
  // empty window list by construction — see its own doc comment in
  // lib/maintenance/availability.ts). The landlord UI must not collapse
  // those into the same "Outside the tenant's provided availability"
  // message.
  // Phase C moved the proposed-appointment display into the Next Step
  // card's own 'confirm_or_decline' case (lib/maintenance/command-
  // center.ts's nextActionFor() — this is now a derived state, not a
  // standalone `appointment && appointment.status === 'proposed'`
  // check inline in the JSX) — scoped to that case block specifically.
  const proposalBlock = caseDetailSource.slice(
    caseDetailSource.indexOf("case 'confirm_or_decline':"),
    caseDetailSource.indexOf("case 'scheduled':"),
  )

  it('never shows either availability badge when the tenant provided no availability windows at all', () => {
    expect(proposalBlock).toContain('hasAvailability && (')
    // hasAvailability itself is defined once, from the same
    // availabilityWindows.length > 0 check this guard always was.
    expect(caseDetailSource).toContain('const hasAvailability = Boolean(availabilityWindows && availabilityWindows.length > 0)')
  })

  it('shows a positive "Matches tenant availability" pill when windows exist and the proposal matched', () => {
    expect(proposalBlock).toContain('appointment.matched_availability')
    expect(proposalBlock).toContain('Matches tenant availability')
    expect(proposalBlock).toContain('pillGood')
  })

  it('still shows "Outside the tenant\'s provided availability" when windows exist and the proposal did not match', () => {
    expect(proposalBlock).toContain("Outside the tenant&apos;s provided availability")
    expect(proposalBlock).toContain('pillBad')
  })

  it('does not repeat "not provided" copy next to the appointment — the existing Tenant Availability section above already says that', () => {
    expect(stripComments(proposalBlock)).not.toMatch(/wasn.?t provided|not provided/i)
  })

  it('does not touch provider acceptance, proposal creation, confirmation/decline routes, or the underlying matched_availability computation', () => {
    expect(proposeRouteSource).toContain('matchProposedTime(windows, parsed)')
    expect(confirmRouteSource).not.toMatch(/matched_availability/)
  })
})
