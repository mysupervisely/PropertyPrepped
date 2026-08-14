// PropRoster Milestone 11: Property Watch — deterministic urgency banding.
//
// Section 15: "Define priority deterministically. Do not let AI arbitrarily
// determine priority." Every category that counts down to a single future
// date (Lease expiration, Insurance renewal, Mortgage maturity, a manual
// reminder, a document-extracted date) runs through this ONE function, so
// "60 days until my lease expires" and "60 days until my mortgage matures"
// escalate on exactly the same schedule. The four bands below are exactly
// the milestone's own named thresholds — 90 / 60 / 30 / 7 days — so each
// one is independently reachable and testable:
//
//   > 90 days out  -> not yet surfaced at all (see withinWarningWindow)
//   61-90 days out -> Low,    status Upcoming
//   31-60 days out -> Normal, status Upcoming
//   8-30  days out -> High,   status Needs Attention
//   0-7   days out -> Urgent, status Needs Attention
//   past due       -> Urgent, status Needs Attention, isPastDue true
//
// No category-specific magic numbers live outside this file — a generator
// that wants a different countdown (e.g. a manual reminder's own
// "remind me N days before") only ever varies the STATUS cutoff, never
// invents its own priority scale. See generators/manual.ts.

import { diffDaysFromToday } from './date-utils'
import type { WatchPriority } from './types'

export type UrgencyResult = {
  daysRemaining: number
  isPastDue: boolean
  priority: WatchPriority
  /** Upcoming or Needs Attention only — Completed/Dismissed are user-driven, never computed here. */
  status: 'Upcoming' | 'Needs Attention'
  /** True once inside the outer 90-day band (or past due) — the signal generators use to decide whether to produce a draft at all. */
  withinWarningWindow: boolean
}

export function computeUrgency(eventDateIso: string, now: Date = new Date()): UrgencyResult {
  const daysRemaining = diffDaysFromToday(eventDateIso, now)
  const isPastDue = daysRemaining < 0

  let priority: WatchPriority
  if (isPastDue || daysRemaining <= 7) priority = 'Urgent'
  else if (daysRemaining <= 30) priority = 'High'
  else if (daysRemaining <= 60) priority = 'Normal'
  else priority = 'Low'

  const withinWarningWindow = isPastDue || daysRemaining <= 90
  const status: 'Upcoming' | 'Needs Attention' = isPastDue || daysRemaining <= 30 ? 'Needs Attention' : 'Upcoming'

  return { daysRemaining, isPastDue, priority, status, withinWarningWindow }
}

const PRIORITY_RANK: Record<WatchPriority, number> = { Urgent: 0, High: 1, Normal: 2, Low: 3 }

/**
 * Section 15's sort: Urgent > High > Normal > Low, then nearest relevant
 * date first within a priority band. Past-due items are already forced
 * into Urgent by computeUrgency, and among same-priority items an earlier
 * (more overdue, or simply sooner) date always sorts first — "past-due
 * unresolved items should rise appropriately" falls out of this for free,
 * with no separate past-due special case needed here.
 */
export function compareWatchItems<T extends { priority: WatchPriority; event_date: string | null }>(a: T, b: T): number {
  const rankDiff = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]
  if (rankDiff !== 0) return rankDiff
  if (a.event_date === b.event_date) return 0
  if (a.event_date === null) return 1
  if (b.event_date === null) return -1
  return a.event_date < b.event_date ? -1 : 1
}

export function sortWatchItems<T extends { priority: WatchPriority; event_date: string | null }>(items: T[]): T[] {
  return [...items].sort(compareWatchItems)
}
