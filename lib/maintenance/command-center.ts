// PropRoster — Tenant Connect + Maintenance Coordination, M3: Landlord
// Maintenance Command Center V1.
//
// Pure, framework-free enrichment/derivation logic — no Supabase, no
// React, no DOM — so every rule below is unit-testable directly with
// plain data, matching this repo's established convention.
//
// ===================================================================
// WHAT THIS BUILDS ON (read before changing anything here)
// ===================================================================
// public.maintenance_requests remains the SINGLE canonical maintenance
// case (M1.1's decision — see supabase/milestone-26-canonical-
// maintenance-case.sql's own header for the full reasoning). This
// module does not change that architecture, does not add a table, and
// does not add a status value — it only ENRICHES already-canonical
// case rows, at read time, with two facts that live in related tables:
//
//   1. category — lives on the linked tenant_requests row (tenant-
//      sourced cases only; landlord-logged cases have none), joined via
//      tenant_requests.maintenance_request_id.
//   2. urgent — a landlord-logged case can already mark itself Urgent
//      via maintenance_requests.priority (pre-existing, M0). A
//      TENANT-sourced case's urgency is decided entirely deterministically
//      during Guided Intake (lib/maintenance/intake/urgent.ts) and
//      recorded as maintenance_intake_sessions.outcome =
//      'escalated_urgent' — never re-derived or second-guessed here.
//      This module only reads that already-decided fact; it never
//      classifies anything itself. No AI, no heuristic, no keyword
//      match — a session's outcome is the ONLY urgent signal read from
//      the tenant side, exactly preserving M2's deterministic safety
//      logic without any possibility of an override.
//
// The tenant's own structured "what did they report" detail does NOT
// need a third data source here: GuidedIntake.tsx builds the tenant's
// full structured summary (buildSummary(), lib/maintenance/intake/
// engine.ts) BEFORE ever submitting, and that exact text is what
// becomes tenant_requests.description — which the M1.1 trigger also
// copies verbatim into maintenance_requests.description. A case's own
// `description` field already IS the structured guided-intake summary
// for a tenant-sourced case; this module does not duplicate that by
// re-fetching/re-rendering raw maintenance_intake_answers rows.
//
// ===================================================================
// STATUS MODEL — reused exactly as-is, no new value added
// ===================================================================
// maintenance_requests.status stays exactly Submitted/Scheduled/
// In Progress/Completed (the pre-existing M0 case lifecycle) — no
// conflicting one-off status system, per this milestone's own
// instruction. "Needs Attention / Active" vs "Completed / History"
// (the Command Center's own grouping) is a pure VIEW-level derivation
// (status !== 'Completed'), not a new persisted state.
//
// A GENUINE GAP WAS FOUND AND IS DELIBERATELY NOT PAPERED OVER: this
// milestone's own brief asks for a "Mark Needs More Information"
// landlord action and a "landlord internal note." Neither has a home
// in the current schema — status has no value for the former, and no
// table/column exists for the latter. Per this milestone's own
// instruction ("avoid schema changes if the existing model is
// sufficient... if a schema migration is needed, stop before applying
// it"), NEITHER is implemented here. See this module's own next-action
// vocabulary below (nowhere does it invent a 'needs_info' status), and
// see docs/tenant-connect-m3-landlord-command-center.md for the exact,
// smallest compatible migration this would require, written out but
// NOT applied.

import { latestOutreachForContact, type ProviderOutreachRow, type ProviderOutreachStatus } from './provider-outreach'
import { latestAppointmentForOutreach, type AppointmentRow, type AppointmentStatus } from './appointments'

export type MaintenanceCaseStatus = 'Submitted' | 'Scheduled' | 'In Progress' | 'Completed'
export type MaintenanceCaseSource = 'tenant' | 'landlord'

/**
 * The canonical case row shape this module enriches — mirrors
 * public.maintenance_requests exactly (no new column). `status` is
 * deliberately the wider `string` here (not MaintenanceCaseStatus) so
 * this accepts the app's own existing, already-typed row shapes
 * (app/page.tsx's MaintenanceRequest) without a cast at every call
 * site — every real value flowing through it is still constrained by
 * the DB's own CHECK constraint. MaintenanceCaseStatus stays the
 * precise, exported vocabulary for anything that WRITES a status
 * value (MaintenanceCaseDetail's status <select>).
 */
export type MaintenanceCaseRow = {
  id: string
  property_id: string
  owner_id: string
  tenant_name: string
  tenant_email: string | null
  title: string
  description: string
  priority: string
  status: string
  source: MaintenanceCaseSource
  assigned_contact_id: string | null
  created_at: string
}

/** Only the columns this module actually needs from tenant_requests. `entry_preference` was added for Scheduling Coordination V1 — optional here since not every consumer of this type fetches it, but present on app/maintenance/page.tsx's own select() so its landlord view can resolve it via lib/maintenance/availability.ts's entryPreferenceForMaintenanceRequest(). */
export type TenantRequestLink = {
  id: string
  maintenance_request_id: string | null
  category: string
  entry_preference?: 'someone_home' | 'contact_before_entering' | 'other' | null
}

/** Only the columns this module actually needs from maintenance_intake_sessions. */
export type IntakeSessionOutcome = {
  request_id: string
  outcome: string | null
}

// Simplification + Maintenance Workspace V2, Phase C — this vocabulary
// replaces the coarser 5-value one M3 originally shipped (assign_provider
// / awaiting_review / in_progress / scheduled / completed). That set
// predated Provider Outreach V1 and Scheduling Coordination V1: once a
// contact was assigned, EVERYTHING from "not yet contacted" through
// "provider declined" through "appointment awaiting your confirmation"
// all collapsed into the same vague "awaiting_review" bucket. No schema
// changed to support this — every one of the states below is derived,
// at read time, from columns that already exist
// (maintenance_requests.status/assigned_contact_id,
// maintenance_provider_outreach.status, maintenance_appointments.status)
// via nextActionFor() below. Still exactly one persisted status model
// (MaintenanceCaseStatus, unchanged) — this is a VIEW-level derivation
// exactly like `active`/`urgent` already were.
export type NextAction =
  | 'assign_provider'
  | 'contact_provider'
  | 'awaiting_provider'
  | 'provider_declined'
  | 'needs_information'
  | 'awaiting_proposal'
  | 'confirm_or_decline'
  | 'scheduled'
  | 'in_progress'
  | 'completed'

/** Generic, state-only fallback label — used where the richer, data-composed copy MaintenanceCaseDetail itself builds (e.g. "Contact Mike", "Mike accepted — waiting for a proposed time") isn't available or isn't needed (a compact list badge, a test fixture). Human language throughout, never internal terms like "canonical", "outreach", or "token". */
export const NEXT_ACTION_LABEL: Record<NextAction, string> = {
  assign_provider: 'Assign a provider',
  contact_provider: 'Contact the assigned provider',
  awaiting_provider: 'Waiting for the provider to respond',
  provider_declined: 'Choose another provider',
  needs_information: 'Provider needs more information',
  awaiting_proposal: 'Waiting for a proposed time',
  confirm_or_decline: 'Confirm the proposed appointment',
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  completed: 'Completed',
}

export type EnrichedMaintenanceCase = MaintenanceCaseRow & {
  /** From the linked tenant_requests row; null for a landlord-logged case (no guided intake exists for those). */
  category: string | null
  /** Deterministic only — see this file's own header. Never AI-derived. */
  urgent: boolean
  /** status !== 'Completed' — the Command Center's Active/History split, not a persisted value. */
  active: boolean
  nextAction: NextAction
}

/**
 * Urgent exactly when either already-canonical, already-deterministic
 * signal says so: the case's own priority (landlord-set, or a future
 * landlord-logged 'Urgent' request), OR any linked Guided Intake
 * session that escalated. Never invents a third signal, never inspects
 * free text.
 */
export function isUrgentCase(row: Pick<MaintenanceCaseRow, 'priority'>, linkedSessionOutcomes: (string | null)[]): boolean {
  if (row.priority === 'Urgent') return true
  return linkedSessionOutcomes.some((o) => o === 'escalated_urgent')
}

/**
 * Display-only dedup for the Command Center / Active Requests cards.
 * `urgent` and the priority pill are two separate facts that can say
 * the same word: when the case is urgent BECAUSE priority is literally
 * 'Urgent', the priority pill already communicates it, so the dedicated
 * "Urgent" badge would be a redundant second pill reading the same
 * word. When urgent is instead driven by a linked Guided Intake
 * escalation (priority left at its default, e.g. 'Normal'), the badge
 * is the only place that fact appears, so it still renders. Purely a
 * display decision — isUrgentCase() above (the deterministic safety
 * classification) is untouched.
 */
export function showsDedicatedUrgentBadge(row: Pick<MaintenanceCaseRow, 'priority'>, urgent: boolean): boolean {
  return urgent && row.priority !== 'Urgent'
}

/**
 * The single source of truth for "what should the landlord do next" —
 * used identically by the portfolio Command Center's list, the
 * property Maintenance hub's list, and MaintenanceCaseDetail's own
 * "next step" card, so the same case never shows a different answer
 * in two places.
 *
 * `latestOutreachStatus`/`latestAppointmentStatus` are optional and
 * default to null (the pre-Phase-C behavior: without them, this can
 * only tell "assigned" from "not assigned," same as before) — callers
 * that resolve the assigned contact's latest outreach/appointment
 * (every real caller in this app does; see app/page.tsx's/app/
 * maintenance/page.tsx's own openMaintenanceOutreach/openMaintenanceAppointment)
 * should pass them for the full model. maintenance_requests.status
 * still wins for the three states it already owns outright
 * (Completed/In Progress/Scheduled) — this never second-guesses a
 * landlord's own explicit status choice.
 */
export function nextActionFor(
  row: Pick<MaintenanceCaseRow, 'status' | 'assigned_contact_id'>,
  latestOutreachStatus?: ProviderOutreachStatus | null,
  latestAppointmentStatus?: AppointmentStatus | null,
): NextAction {
  if (row.status === 'Completed') return 'completed'
  if (row.status === 'In Progress') return 'in_progress'
  if (row.status === 'Scheduled') return 'scheduled'
  // 'Submitted' — everything below only ever applies here; a landlord
  // who already moved a case to In Progress/Scheduled/Completed has
  // made the real decision, and this never overrides it.
  if (!row.assigned_contact_id) return 'assign_provider'
  if (!latestOutreachStatus) return 'contact_provider'
  if (latestOutreachStatus === 'declined') return 'provider_declined'
  if (latestOutreachStatus === 'needs_information') return 'needs_information'
  if (latestOutreachStatus === 'sent') return 'awaiting_provider'
  // 'accepted' — defers to the appointment lifecycle. Checking
  // 'confirmed' before 'proposed' is a defensive ordering: in the
  // normal flow maintenance_requests.status already reads 'Scheduled'
  // by the time an appointment is confirmed (the confirm route sets
  // both), so the early return above already fires first — this
  // fallback just means a still-'Submitted' row with a confirmed
  // appointment reads as 'scheduled' here too, rather than incorrectly
  // asking the landlord to confirm an already-confirmed appointment.
  if (latestAppointmentStatus === 'confirmed') return 'scheduled'
  if (latestAppointmentStatus === 'proposed') return 'confirm_or_decline'
  // No proposal yet, or the last one was declined/cancelled — either
  // way, the provider is expected to propose (or re-propose) a time
  // through their own existing flow; there is nothing for the landlord
  // to do yet, so this deliberately is NOT a landlord action.
  return 'awaiting_proposal'
}

/**
 * Joins canonical cases against tenant_requests (for category) and
 * maintenance_intake_sessions (for urgency) — both READ-ONLY, both
 * already-existing tables, no new query shape this app doesn't already
 * use elsewhere (app/page.tsx's own categoryByMaintenanceRequestId is
 * the same join pattern, generalized here into one enrichment pass).
 *
 * `outreachRows`/`appointmentRows` are optional (default []) —
 * Phase C addition, portfolio-wide rows both real callers already fetch
 * for their own display purposes (app/page.tsx's/app/maintenance/page.tsx's
 * own providerOutreach/appointments state). When supplied, each case's
 * `nextAction` reflects the full outreach/appointment lifecycle via
 * nextActionFor() above, resolved the exact same way
 * openMaintenanceOutreach/openMaintenanceAppointment already are at
 * both call sites (request-scoped first, then latestOutreachForContact/
 * latestAppointmentForOutreach) — no new derivation rule, just reused
 * here so every case in a list gets the same answer the detail view
 * would show for it, not only the one currently open.
 */
export function enrichMaintenanceCases(
  cases: MaintenanceCaseRow[],
  tenantRequests: TenantRequestLink[],
  intakeSessions: IntakeSessionOutcome[],
  outreachRows: ProviderOutreachRow[] = [],
  appointmentRows: AppointmentRow[] = [],
): EnrichedMaintenanceCase[] {
  const tenantRequestByCaseId = new Map<string, TenantRequestLink>()
  for (const tr of tenantRequests) {
    if (tr.maintenance_request_id) tenantRequestByCaseId.set(tr.maintenance_request_id, tr)
  }
  const outcomesByRequestId = new Map<string, string[]>()
  for (const s of intakeSessions) {
    const list = outcomesByRequestId.get(s.request_id) || []
    list.push(s.outcome as string)
    outcomesByRequestId.set(s.request_id, list)
  }
  return cases.map((c) => {
    const tr = tenantRequestByCaseId.get(c.id)
    const outcomes = tr ? outcomesByRequestId.get(tr.id) || [] : []
    const latestOutreach = c.assigned_contact_id
      ? latestOutreachForContact(outreachRows.filter((o) => o.maintenance_request_id === c.id), c.assigned_contact_id)
      : null
    const latestAppointment = latestOutreach ? latestAppointmentForOutreach(appointmentRows, latestOutreach.id) : null
    return {
      ...c,
      category: tr ? tr.category : null,
      urgent: isUrgentCase(c, outcomes),
      active: c.status !== 'Completed',
      nextAction: nextActionFor(c, latestOutreach?.status, latestAppointment?.status),
    }
  })
}

/**
 * Command Center ordering: every Active case before every History
 * (Completed) case — "make active work obvious" — urgent-first within
 * Active, then newest first; History is simply newest-first. Never
 * drops a row (history is preserved, just ordered last), matching "do
 * not delete historical records."
 */
export function sortCasesForCommandCenter(cases: EnrichedMaintenanceCase[]): EnrichedMaintenanceCase[] {
  const active = cases.filter((c) => c.active).sort((a, b) => {
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1
    return b.created_at.localeCompare(a.created_at)
  })
  const history = cases.filter((c) => !c.active).sort((a, b) => b.created_at.localeCompare(a.created_at))
  return [...active, ...history]
}

export function casesForProperty<T extends { property_id: string }>(cases: T[], propertyId: string): T[] {
  return cases.filter((c) => c.property_id === propertyId)
}

/** Only the columns this module needs from property_contacts. `email` was added for Tenant Connect Provider Outreach V1 — the "Contact PropCrew" action needs it to decide whether outreach is even offered (Section 1: "when an assigned contact has an email address"). */
export type PropCrewContactRef = {
  id: string
  property_id: string
  owner_id: string
  name: string
  business_name: string | null
  role: string
  email: string | null
}

export type PropCrewLinkRef = { contact_id: string; property_id: string }

/**
 * A property's "relevant" PropCrew contacts — its own primary
 * association (property_contacts.property_id) UNIONed with every
 * additional property_contact_links row, exactly the same "full
 * associated-properties list" definition supabase/schema.sql's own
 * Milestone-11 comment establishes (no new relevance rule invented
 * here).
 */
export function relevantContactsForProperty(
  contacts: PropCrewContactRef[],
  links: PropCrewLinkRef[],
  propertyId: string,
): PropCrewContactRef[] {
  const linkedIds = new Set(links.filter((l) => l.property_id === propertyId).map((l) => l.contact_id))
  return contacts.filter((c) => c.property_id === propertyId || linkedIds.has(c.id))
}

/** Portfolio-level summary tiles — deliberately small (Command Center's own "do not overload the screen" instruction). */
export type CommandCenterSummary = {
  activeCount: number
  urgentCount: number
  completedCount: number
}

export function summarizeCommandCenter(cases: EnrichedMaintenanceCase[]): CommandCenterSummary {
  return {
    activeCount: cases.filter((c) => c.active).length,
    urgentCount: cases.filter((c) => c.active && c.urgent).length,
    completedCount: cases.filter((c) => !c.active).length,
  }
}
