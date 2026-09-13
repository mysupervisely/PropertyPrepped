// PropRoster — Property + Attention Usability V1, Part 3-B/C: Needs Your
// Attention dismissal.
//
// Pure functions only — no Supabase/React. This module owns exactly one
// concern: computing a STABLE, per-issue-instance dismissal key, and
// filtering an already-built attention/vacancy list by a set of
// dismissed keys. It never recomputes urgency/status/eligibility — that
// stays entirely owned by lib/dashboard/attention.ts, lib/rent-ledger/
// ledger.ts and lib/tenant-connect/requests.ts, untouched by this
// milestone. Dismissal is presentation filtering layered ON TOP of the
// canonical list, never a change to how that list is built.
//
// KEY DESIGN: `${attention_type}:${canonical_item_id}:${relevant_date}`
// — reuses each DashboardDateItem's own already-canonical `id`/`date`
// fields, never a mutable display label. This is what makes dismissal
// safe: if a lease is renewed (a new end_date), the maintenance record
// gets a new service_date, or a NEW rent period comes due for the same
// lease, the key changes and the OLD dismissal simply stops matching —
// no explicit "resurface" logic is ever needed, and a genuinely
// different future issue is never accidentally hidden by an old
// dismissal of an unrelated one. See buildAttentionDismissalKey()'s own
// comment for why Rent specifically needs the date component (its `id`
// alone is NOT period-specific), and buildVacancyDismissalKey()'s for
// the vacancy-episode design (vacancy has no DashboardDateItem at all).

import type { DashboardDateItem, DashboardDateItemType } from './attention'

/** The attention_dismissals.attention_type values this app ever writes — matches the exact prefixes used in dismissal_key, so a row's own attention_type column is always redundant-but-consistent with its key (useful for admin/debugging queries, never load-bearing on its own). */
export type DismissibleAttentionKind =
  | 'rent' | 'lease' | 'insurance' | 'mortgage' | 'system' | 'maintenance' | 'tenant-request' | 'vacancy'

const TYPE_TO_DISMISSAL_PREFIX: Record<DashboardDateItemType, DismissibleAttentionKind> = {
  Rent: 'rent',
  Lease: 'lease',
  Insurance: 'insurance',
  Mortgage: 'mortgage',
  System: 'system',
  Maintenance: 'maintenance',
  TenantRequest: 'tenant-request',
}

/**
 * The stable dismissal key for one canonical attention item.
 *
 * `item.id` alone is already a unique, never-recurring row id for six of
 * the seven types (Lease/Insurance/Mortgage/Maintenance/System/
 * TenantRequest each own a single row that doesn't repeat under the
 * same id) — `item.date` there only adds harmless extra specificity
 * (and correctly changes the key if that record is ever edited, e.g. a
 * lease renewal, so an old dismissal never survives a genuine change to
 * the underlying fact).
 *
 * Rent is the one type where `item.date` is NOT optional: buildRentDateItems()
 * (lib/rent-ledger/ledger.ts) sets `id` to the LEASE's id, shared across
 * every month's rent item for that same lease — `item.date` (the
 * period's own due date, e.g. "2026-09-01" vs "2026-10-01") is what
 * distinguishes "Rent overdue for September" from "Rent overdue for
 * October," exactly as required.
 */
export function buildAttentionDismissalKey(item: DashboardDateItem): string {
  return `${TYPE_TO_DISMISSAL_PREFIX[item.type]}:${item.id}:${item.date}`
}

export type PropertyForVacancyDismissal = { id: string; created_at: string }
export type LeaseForVacancyDismissal = { id: string; end_date: string }

/**
 * The stable dismissal key for a property's CURRENT vacancy episode.
 *
 * A vacancy has no DashboardDateItem/canonical id or date of its own —
 * buildVacancyItems() (lib/rent-ledger/ledger.ts) derives "Vacant"
 * purely from deriveOccupancy() finding no lease that's Active/Expiring
 * Soon/Upcoming/Unknown for a property, which (by that function's own
 * logic) means every lease that exists for the property has already
 * ended. So the most recently ended lease (the one with the latest
 * end_date) IS the canonical marker for "this particular vacancy
 * episode" — the same episode persists (same key) for as long as no
 * newer lease exists, and a NEW lease later ending produces a DIFFERENT
 * key (a different lease id and/or end_date), so an old dismissal can
 * never suppress a genuinely later, separate vacancy.
 *
 * If the property has never had any lease at all, there is no "ended
 * lease" to anchor to — falls back to a stable marker tied to the
 * property's own creation date (never a random dismiss-time timestamp,
 * which would make every "still vacant" reload look like a new episode
 * and defeat persistence entirely).
 */
export function buildVacancyDismissalKey(property: PropertyForVacancyDismissal, leasesForProperty: LeaseForVacancyDismissal[]): string {
  if (leasesForProperty.length > 0) {
    const latest = [...leasesForProperty].sort((a, b) => (b.end_date || '').localeCompare(a.end_date || ''))[0]
    return `vacancy:${property.id}:${latest.id}:${latest.end_date}`
  }
  return `vacancy:${property.id}:never-leased:${property.created_at}`
}

/** Removes any item whose own dismissal key is in `dismissedKeys` — pure presentation filtering, never touches the input array's own contents or any canonical field. */
export function filterDismissedAttentionItems<T extends DashboardDateItem>(items: T[], dismissedKeys: ReadonlySet<string>): T[] {
  return items.filter((item) => !dismissedKeys.has(buildAttentionDismissalKey(item)))
}
