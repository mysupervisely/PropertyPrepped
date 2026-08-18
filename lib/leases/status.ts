// PropRoster — Milestone 17: Tenant & Lease Management V2, occupancy and
// lease-status derivation.
//
// Pure functions only — no Supabase calls, no React. Every date decision
// here goes through Milestone 16's own classifyDate/daysUntil
// (lib/dashboard/date-classification.ts) rather than re-implementing a
// second threshold, so a lease can never be "Expiring Soon" here while
// Command Center's Urgent bucket disagrees — both mean "within
// URGENT_WITHIN_DAYS (7) days of end_date," always the same number.
//
// Nothing here invents an occupancy answer from ambiguous data: a lease
// row with a missing or unparseable start_date/end_date is excluded from
// "Occupied"/"Upcoming tenancy" and instead surfaces as
// "Occupancy unknown" so a landlord never sees a false "Vacant."

import { classifyDate, daysUntil } from '../dashboard/date-classification'

export type LeaseStatus = 'Upcoming' | 'Active' | 'Expiring Soon' | 'Expired'
export type OccupancyStatus = 'Occupied' | 'Vacant' | 'Upcoming tenancy' | 'Occupancy unknown'

export type LeaseDates = { start_date: string | null; end_date: string | null }
export type LeaseWithId = LeaseDates & { id: string }

/**
 * Deterministic lease status from start/end dates alone:
 *   Upcoming       — start_date is after today (tenancy hasn't begun yet)
 *   Expired        — end_date is before today
 *   Expiring Soon  — end_date is today through URGENT_WITHIN_DAYS (7) days out
 *   Active         — today falls within [start_date, end_date) and it
 *                     isn't expiring soon
 *
 * Returns null when start_date or end_date is missing/unparseable, or
 * when end_date falls before start_date (invalid range) — callers must
 * treat null as "can't determine," never guess a status.
 */
export function deriveLeaseStatus(lease: LeaseDates, now: Date = new Date()): LeaseStatus | null {
  const startDays = daysUntil(lease.start_date, now)
  const endDays = daysUntil(lease.end_date, now)
  if (startDays === null || endDays === null) return null
  if (endDays < startDays) return null // invalid range: end before start

  if (startDays > 0) return 'Upcoming'

  const endUrgency = classifyDate(lease.end_date, now)
  if (endUrgency === 'Expired') return 'Expired'
  if (endUrgency === 'Urgent') return 'Expiring Soon'
  return 'Active' // Upcoming(8-30d out) or Normal from classifyDate both read as "Active" here
}

/**
 * Occupancy for a property from ALL of its lease rows (current +
 * historical) — never just the most recently created one. Priority:
 *   Occupied           — any lease is Active or Expiring Soon
 *   Upcoming tenancy    — no occupied lease, but a future-dated one exists
 *   Occupancy unknown   — no occupied/upcoming lease, but at least one row
 *                         couldn't be classified (bad/missing dates)
 *   Vacant              — no leases, or every lease is cleanly Expired
 */
export function deriveOccupancy(leases: LeaseDates[], now: Date = new Date()): OccupancyStatus {
  let sawUpcoming = false
  let sawUnknown = false
  for (const lease of leases) {
    const status = deriveLeaseStatus(lease, now)
    if (status === null) { sawUnknown = true; continue }
    if (status === 'Active' || status === 'Expiring Soon') return 'Occupied'
    if (status === 'Upcoming') sawUpcoming = true
  }
  if (sawUpcoming) return 'Upcoming tenancy'
  if (sawUnknown) return 'Occupancy unknown'
  return 'Vacant'
}

/**
 * Picks the single lease to feature as "Current Lease": the occupied one
 * if there is one (latest-starting, in the unlikely case more than one
 * row overlaps today), else the soonest-starting upcoming lease, else
 * null (vacant, or every remaining row is unclassifiable/expired).
 */
export function selectCurrentLease<T extends LeaseWithId>(leases: T[], now: Date = new Date()): T | null {
  const withStatus = leases.map((lease) => ({ lease, status: deriveLeaseStatus(lease, now) }))

  const occupied = withStatus.filter((x) => x.status === 'Active' || x.status === 'Expiring Soon')
  if (occupied.length) {
    return occupied.sort((a, b) => (b.lease.start_date || '').localeCompare(a.lease.start_date || ''))[0].lease
  }

  const upcoming = withStatus.filter((x) => x.status === 'Upcoming')
  if (upcoming.length) {
    return upcoming.sort((a, b) => (a.lease.start_date || '').localeCompare(b.lease.start_date || ''))[0].lease
  }

  return null
}

/**
 * Full lease list ordered for the Lease History section: the current
 * lease (if any, per selectCurrentLease) pinned first, then every other
 * lease newest-to-oldest by end_date. Never drops a row — a lease is
 * only ever removed by an explicit delete, not by becoming historical.
 */
export function sortLeaseHistory<T extends LeaseWithId>(leases: T[], now: Date = new Date()): T[] {
  const current = selectCurrentLease(leases, now)
  const rest = leases.filter((lease) => lease.id !== current?.id)
  const sorted = [...rest].sort((a, b) => (b.end_date || '').localeCompare(a.end_date || ''))
  return current ? [current, ...sorted] : sorted
}

// -- Tenant presentation -----------------------------------------------
//
// The leases table stores a single flat tenant_name/tenant_email/
// tenant_phone per lease row (see the Milestone 17 completion report's
// schema audit for why a full lease_tenants join table was NOT built in
// this pass — the risk of migrating existing lease data outweighed the
// benefit for this milestone). normalizeTenants() exists so the UI (and
// any future multi-tenant schema) can share one rendering shape: an
// array of tenant contacts, even though today it always has exactly one
// entry.

export type TenantContact = { name: string; email: string | null; phone: string | null }
export type TenantLeaseFields = { tenant_name: string; tenant_email: string | null; tenant_phone?: string | null }

export function normalizeTenants(lease: TenantLeaseFields): TenantContact[] {
  const name = lease.tenant_name.trim()
  if (!name) return []
  return [{ name, email: lease.tenant_email, phone: lease.tenant_phone ?? null }]
}

// -- Rent due day ---------------------------------------------------------
//
// A plain calendar day (1-31), not a rent ledger. Deliberately never
// tries to resolve day 29/30/31 against a specific month's real length —
// "due the 31st" in a 30-day month is a landlord/tenant expectation this
// app records verbatim, not something PropRoster computes or corrects.

export function isValidRentDueDay(value: number | null | undefined): boolean {
  if (value === null || value === undefined) return true // optional field
  return Number.isInteger(value) && value >= 1 && value <= 31
}

function ordinalSuffix(day: number): string {
  if (day % 100 >= 11 && day % 100 <= 13) return 'th'
  switch (day % 10) {
    case 1: return 'st'
    case 2: return 'nd'
    case 3: return 'rd'
    default: return 'th'
  }
}

/** "Rent due on the 1st of each month." — null when no due day is on file (never invents one). */
export function formatRentDueDay(day: number | null | undefined): string | null {
  if (!day || !isValidRentDueDay(day)) return null
  return `Rent due on the ${day}${ordinalSuffix(day)} of each month`
}
