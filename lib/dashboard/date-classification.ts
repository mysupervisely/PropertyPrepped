// PropRoster — Milestone 16: Landlord Command Center V1, date classification.
//
// The single source of truth for "is this date-bearing record something
// the landlord needs to worry about" — every Needs Attention / Upcoming
// decision on the dashboard goes through classifyDate() below, never a
// second, ad-hoc date comparison somewhere else in the page.
//
// Date-only fields (lease end_date, insurance expiration_date, mortgage
// maturity_date, maintenance service_date) are parsed as LOCAL NOON, the
// exact same `${value}T12:00:00` convention already used throughout
// app/page.tsx (e.g. `new Date(\`${lease.end_date}T12:00:00\`)`) — a
// bare `new Date(value)` on a YYYY-MM-DD string parses as UTC midnight,
// which displays one calendar day early in every negative-UTC-offset
// timezone (all of the Americas). Never introduce a second parsing
// convention here.

export const URGENT_WITHIN_DAYS = 7
export const UPCOMING_WITHIN_DAYS = 30

export type Urgency = 'Expired' | 'Urgent' | 'Upcoming' | 'Normal'

/** Parses a date-only (YYYY-MM-DD) string as local noon. Returns null for missing/blank/unparseable input — never guesses, never throws. */
export function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null
  const date = new Date(`${value}T12:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * Whole calendar days between "today" and the given date-only value
 * (positive = in the future, negative = in the past, 0 = today). Both
 * sides are anchored to local noon before differencing, so daylight-
 * saving-time transitions (a 23- or 25-hour day) can never shift the
 * result by one day. Null when the date is missing or invalid.
 */
export function daysUntil(value: string | null | undefined, now: Date = new Date()): number | null {
  const target = parseDateOnly(value)
  if (!target) return null
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0)
  const targetNoon = new Date(target.getFullYear(), target.getMonth(), target.getDate(), 12, 0, 0)
  const msPerDay = 24 * 60 * 60 * 1000
  return Math.round((targetNoon.getTime() - today.getTime()) / msPerDay)
}

/**
 * Classifies a date-only value against today:
 *   Expired  — before today (days < 0)
 *   Urgent   — today through 7 days out (0 <= days <= 7)
 *   Upcoming — 8 through 30 days out
 *   Normal   — more than 30 days out
 *   null     — missing/invalid date; caller must exclude it from both
 *              Needs Attention and Upcoming rather than guess
 */
export function classifyDate(value: string | null | undefined, now: Date = new Date()): Urgency | null {
  const days = daysUntil(value, now)
  if (days === null) return null
  if (days < 0) return 'Expired'
  if (days <= URGENT_WITHIN_DAYS) return 'Urgent'
  if (days <= UPCOMING_WITHIN_DAYS) return 'Upcoming'
  return 'Normal'
}

/** True for the two urgency levels that belong in "Needs Attention." */
export function isAttentionUrgency(urgency: Urgency | null): boolean {
  return urgency === 'Expired' || urgency === 'Urgent'
}
