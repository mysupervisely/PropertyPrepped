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

/** Only the columns this module actually needs from tenant_requests. */
export type TenantRequestLink = {
  id: string
  maintenance_request_id: string | null
  category: string
}

/** Only the columns this module actually needs from maintenance_intake_sessions. */
export type IntakeSessionOutcome = {
  request_id: string
  outcome: string | null
}

export type NextAction = 'assign_provider' | 'awaiting_review' | 'in_progress' | 'scheduled' | 'completed'

export const NEXT_ACTION_LABEL: Record<NextAction, string> = {
  assign_provider: 'Assign a PropCrew contact',
  awaiting_review: 'Review and start progress',
  in_progress: 'In progress',
  scheduled: 'Scheduled',
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

export function nextActionFor(row: Pick<MaintenanceCaseRow, 'status' | 'assigned_contact_id'>): NextAction {
  if (row.status === 'Completed') return 'completed'
  if (row.status === 'Scheduled') return 'scheduled'
  if (row.status === 'In Progress') return 'in_progress'
  // 'Submitted' — the only status where "what should the landlord do
  // next" actually branches on whether a PropCrew contact is assigned.
  return row.assigned_contact_id ? 'awaiting_review' : 'assign_provider'
}

/**
 * Joins canonical cases against tenant_requests (for category) and
 * maintenance_intake_sessions (for urgency) — both READ-ONLY, both
 * already-existing tables, no new query shape this app doesn't already
 * use elsewhere (app/page.tsx's own categoryByMaintenanceRequestId is
 * the same join pattern, generalized here into one enrichment pass).
 */
export function enrichMaintenanceCases(
  cases: MaintenanceCaseRow[],
  tenantRequests: TenantRequestLink[],
  intakeSessions: IntakeSessionOutcome[],
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
    return {
      ...c,
      category: tr ? tr.category : null,
      urgent: isUrgentCase(c, outcomes),
      active: c.status !== 'Completed',
      nextAction: nextActionFor(c),
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

/** Only the columns this module needs from property_contacts. */
export type PropCrewContactRef = {
  id: string
  property_id: string
  owner_id: string
  name: string
  business_name: string | null
  role: string
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
