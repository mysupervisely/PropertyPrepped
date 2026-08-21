// PropRoster Milestone 21: Realtor Connect V1 — minimal spam protection.
//
// Section 9: "Add rate limiting / spam protection using the simplest
// reliable pattern already available in the codebase. If no rate-limit
// utility exists, implement a conservative minimal protection and report
// the approach." This codebase has no rate-limiting utility anywhere
// (checked: no dependency, no lib/ module) — this is a new, deliberately
// small, dependency-free one.
//
// Two independent layers, both pure/testable (no timers, no network):
//   1. A honeypot field (`website` in RealtorLeadSubmission) — a real
//      visitor never sees or fills this field in (see
//      components/RealtorConnect/RealtorConnectModal.tsx, which never
//      renders it visibly); a filled honeypot is a near-certain bot.
//   2. A conservative in-memory sliding-window limiter keyed by caller IP,
//      applied in app/api/realtor-leads/route.ts.
//
// Known limitation, reported in the completion report: this in-memory
// limiter only protects a single running server process/instance. On a
// horizontally-scaled or per-invocation serverless deployment it resets
// per instance/cold-start and does not coordinate across instances — a
// determined attacker distributing requests across instances could still
// get through more submissions than the configured limit. It is real,
// zero-dependency, zero-cost protection against casual abuse and simple
// bots today; a durable store (e.g. a Postgres table, or Redis) is the
// natural upgrade if V2 needs a stronger guarantee.

export type RateLimitState = Map<string, number[]>

export const REALTOR_LEAD_RATE_LIMIT = {
  /** Max submissions allowed per key within the window. */
  maxRequests: 5,
  windowMs: 10 * 60 * 1000, // 10 minutes
}

/**
 * Pure sliding-window check: records `nowMs` against `key` in `state` and
 * returns whether this request should be ALLOWED. Mutates `state` only
 * when the request is allowed (a blocked request doesn't get to "use up"
 * a slot) — callers pass a real, persistent Map across requests to get
 * real rate limiting.
 */
export function checkRateLimit(state: RateLimitState, key: string, nowMs: number, config: { maxRequests: number; windowMs: number } = REALTOR_LEAD_RATE_LIMIT): boolean {
  const windowStart = nowMs - config.windowMs
  const existing = (state.get(key) || []).filter((t) => t > windowStart)
  if (existing.length >= config.maxRequests) {
    state.set(key, existing) // still prune stale entries even on a block
    return false
  }
  existing.push(nowMs)
  state.set(key, existing)
  return true
}

/** Best-effort caller IP extraction from common proxy headers — never throws, never fabricates an IP. */
export function extractClientIp(headers: { get(name: string): string | null }): string {
  const forwardedFor = headers.get('x-forwarded-for')
  if (forwardedFor) return forwardedFor.split(',')[0].trim()
  const realIp = headers.get('x-real-ip')
  if (realIp) return realIp.trim()
  return 'unknown'
}

/** True when the honeypot field was filled in — a real visitor never does this. */
export function isHoneypotTripped(website: unknown): boolean {
  return typeof website === 'string' && website.trim().length > 0
}
