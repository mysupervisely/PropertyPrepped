// PropRoster — Landlord Digest V1: weekly-period math.
//
// Pure functions only — no Supabase, no network, no Date.now() default
// that would make a call site's behavior depend on the ambient clock
// (every function here takes `now` explicitly, same convention as
// lib/dashboard/date-classification.ts's daysUntil()/classifyDate()).
//
// The digest runs on a fixed weekly UTC schedule (Monday 13:00 UTC —
// see netlify.toml's own schedule string, kept in sync with
// DIGEST_SCHEDULE_DESCRIPTION below for anyone reading this file
// without also reading the toml). "Once per period" is defined as
// "once per Monday-13:00-UTC-to-the-next" window, so idempotency is
// anchored to the SAME schedule the function actually runs on, rather
// than an arbitrary calendar week — a retry or duplicate invocation
// minutes (or even days) after the real scheduled run still falls in
// the same period and is correctly skipped.

/** Human-readable echo of netlify.toml's `schedule = "0 13 * * 1"` — Monday, 13:00 UTC, once per week. Documentation only; changing the actual schedule means updating both places. */
export const DIGEST_SCHEDULE_DESCRIPTION = 'Weekly, Monday 13:00 UTC'

const PERIOD_HOUR_UTC = 13
const PERIOD_WEEKDAY = 1 // Monday (Date.getUTCDay(): 0 = Sunday)
const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * The most recent Monday-13:00-UTC at or before `now` — the start of
 * the CURRENT digest period. Deliberately "at or before," not "the
 * nearest," so a run that fires slightly early/late (or is retried
 * later the same day) still resolves to the same period boundary.
 */
export function getCurrentDigestPeriodStart(now: Date): Date {
  const todayUtcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const currentWeekday = now.getUTCDay()
  // Days since the most recent Monday (0 if today IS Monday).
  const daysSinceMonday = (currentWeekday - PERIOD_WEEKDAY + 7) % 7
  let periodStart = new Date(todayUtcMidnight - daysSinceMonday * MS_PER_DAY)
  periodStart = new Date(Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth(), periodStart.getUTCDate(), PERIOD_HOUR_UTC))
  // If today IS Monday but it's still before 13:00 UTC, the "current"
  // period actually started the PREVIOUS Monday 13:00 UTC — this
  // Monday's own period hasn't begun yet.
  if (periodStart.getTime() > now.getTime()) {
    periodStart = new Date(periodStart.getTime() - 7 * MS_PER_DAY)
  }
  return periodStart
}

/**
 * Whether an owner is due for a new digest: true when they have never
 * received one, or their last one was sent before the CURRENT period
 * started. This is the one rule that makes the scheduled function safe
 * to retry/duplicate-invoke — see lib/notifications/landlord-digest-run.ts's
 * own header comment for how this is used (checked before compiling
 * anything, and last_weekly_digest_sent_at is only ever updated AFTER a
 * confirmed successful send).
 */
export function isDigestDue(lastSentAt: string | null, now: Date): boolean {
  if (!lastSentAt) return true
  const lastSentMs = new Date(lastSentAt).getTime()
  if (Number.isNaN(lastSentMs)) return true // an unparseable timestamp is never trusted to mean "already sent"
  return lastSentMs < getCurrentDigestPeriodStart(now).getTime()
}
