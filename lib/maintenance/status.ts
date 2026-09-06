// PropRoster Milestone 28 — M3: Landlord Maintenance Command Center V1.
//
// Presentation/status-mapping layer over the EXISTING canonical
// maintenance_requests.status vocabulary ('Submitted' | 'Scheduled' |
// 'In Progress' | 'Completed' — supabase/schema.sql) and the SEPARATE
// tenant_requests.status vocabulary ('New' | 'In Progress' |
// 'Resolved'). Per the M3 brief's explicit instruction ("map the UI
// cleanly to the existing canonical status model... create a
// presentation mapping rather than unnecessary schema churn"), no new
// database status value is introduced anywhere by this file — every
// function here only relabels/re-buckets values the schema already has.
//
// THE M1.1 OPEN QUESTION, AUDITED AND CLOSED HERE (no migration): M1.1
// left an explicit open question — when a landlord changes a case's
// status, does the tenant's own tenant_requests.status reflect it?
// Auditing the code (components/tenant-connect/TenantRequestsPanel.tsx)
// found the answer was previously "no, never": the landlord's ONLY
// status-editing UI wrote straight to maintenance_requests.status and
// never touched the linked tenant_requests row, while a SEPARATE
// tenant-facing view read tenant_requests.status directly — the exact
// "two independently editable sources of truth" the M3 brief warns
// against. syncedTenantRequestStatus() below is the fix: given the
// maintenance_requests.status a landlord just set, it returns the
// tenant_requests.status the linked row should ALSO be set to, in the
// same action. maintenance_requests remains the one canonical case —
// this never reads FROM tenant_requests to decide a case's own status,
// only computes what tenant_requests should mirror.
//
// A useful, unplanned side effect of writing to tenant_requests this
// way: maintenance_audit_log_write() (Milestone 25) is an AFTER
// UPDATE trigger on tenant_requests itself, so this sync automatically
// produces a real audit-log row ('status_changed') for every
// tenant-originated case status change — Section 13 of the M3 brief,
// satisfied by an existing trigger with zero new schema. See this
// milestone's own docs for why this does NOT extend to
// landlord-originated cases or to PropCrew assignment (no trigger and
// no client INSERT policy exists for either on maintenance_audit_log).

import type { TenantRequestStatus } from '../tenant-connect/types'

export const MAINTENANCE_REQUEST_STATUSES = ['Submitted', 'Scheduled', 'In Progress', 'Completed'] as const
export type MaintenanceRequestStatus = (typeof MAINTENANCE_REQUEST_STATUSES)[number]

export type MaintenanceRequestSource = 'tenant' | 'landlord'

/** The four landlord-facing summary buckets the Command Center's top tiles count into. Not a new DB value — purely a display grouping. */
export type CommandCenterBucket = 'Needs Review' | 'Open' | 'In Progress' | 'Completed'

export type PresentedStatus = { bucket: CommandCenterBucket; label: string }

/**
 * A freshly-submitted tenant case ('Submitted' + source: 'tenant')
 * hasn't been looked at by the landlord yet — "Needs Review" makes that
 * true fact visible, distinct from a landlord's own newly-logged case
 * ('Submitted' + source: 'landlord'), which the landlord obviously
 * already knows about — that one is simply "Open". 'Scheduled' still
 * displays its own specific label (useful, real information) but
 * counts toward the same "In Progress" bucket in the summary tiles,
 * since the brief's top summary has exactly four buckets, not five.
 */
export function presentMaintenanceStatus(status: MaintenanceRequestStatus, source: MaintenanceRequestSource): PresentedStatus {
  if (status === 'Submitted') return source === 'tenant' ? { bucket: 'Needs Review', label: 'Needs Review' } : { bucket: 'Open', label: 'Open' }
  if (status === 'Scheduled') return { bucket: 'In Progress', label: 'Scheduled' }
  if (status === 'In Progress') return { bucket: 'In Progress', label: 'In Progress' }
  return { bucket: 'Completed', label: 'Completed' }
}

/** Tallies a property's cases into the four summary-tile counts, by presentation bucket (not raw DB status). */
export function summarizeMaintenanceCaseCounts(cases: { status: MaintenanceRequestStatus; source: MaintenanceRequestSource }[]): Record<CommandCenterBucket, number> {
  const counts: Record<CommandCenterBucket, number> = { 'Needs Review': 0, Open: 0, 'In Progress': 0, Completed: 0 }
  for (const c of cases) counts[presentMaintenanceStatus(c.status, c.source).bucket] += 1
  return counts
}

/**
 * What a linked tenant_requests.status should become when the landlord
 * sets maintenance_requests.status to this value — the M1.1 sync fix.
 * 'Scheduled' and 'In Progress' both mean "the landlord is on it" from
 * the tenant's point of view, matching tenant_requests' own coarser,
 * tenant-facing three-state vocabulary.
 */
export function syncedTenantRequestStatus(maintenanceStatus: MaintenanceRequestStatus): TenantRequestStatus {
  if (maintenanceStatus === 'Submitted') return 'New'
  if (maintenanceStatus === 'Completed') return 'Resolved'
  return 'In Progress'
}

/** Reopening a completed case re-activates it — 'In Progress', not back to 'Submitted'/"Needs Review", since the case has already been triaged once and a landlord reopening it is continuing work, not starting review from zero. */
export const REOPENED_STATUS: MaintenanceRequestStatus = 'In Progress'
