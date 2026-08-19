// PropRoster Pre-Launch Calculator + Billing UX Polish — Issue 5: bounded
// post-checkout subscription synchronization.
//
// Root cause of the observed stale-Free-plan flash: app/account/billing's
// old logic did exactly ONE re-fetch, 2.5s after `?checkout=success`
// landed. Stripe webhook delivery + our own processing has no fixed
// latency guarantee — if it hadn't landed by 2.5s, that single re-fetch
// just re-read the still-stale Free row and then gave up permanently
// (no further attempt), so the page kept showing Free until the user
// manually left and came back (a fresh mount re-reads once more, by
// which time the webhook has long since landed). A single fixed-delay
// retry is exactly as likely to lose the race as the initial load.
//
// Fix: a short, BOUNDED sequence of retries instead of one fixed delay,
// with an explicit stop condition once the paid plan is actually
// confirmed. Expressed here as pure, framework-free functions (same
// "testable core" seam as lib/billing/webhook-handlers.ts) so the
// schedule and stop condition are unit-testable without a real timer,
// DOM, or Supabase call — app/account/billing/page.tsx supplies only the
// side effects (the refresh() call itself, via useEffect/setTimeout).

/** One scheduled re-check. delayMs is measured from the PREVIOUS attempt (or from mount, for the first). */
export type CheckoutSyncStep = {
  /** 0-based index into the schedule. */
  index: number
  delayMs: number
  /** True for the schedule's final entry — no further attempt follows this one. */
  isLastAttempt: boolean
}

// Five attempts over ~19s total (2+3+4+5+5) — long enough to comfortably
// cover normal Stripe webhook delivery + our own DB write, short enough
// to never feel like an infinite hang. Deliberately NOT exponential/
// unbounded — "do not create an infinite polling loop" (Issue 5).
export const CHECKOUT_SYNC_DELAYS_MS: readonly number[] = [2000, 3000, 4000, 5000, 5000]

export function buildCheckoutSyncSchedule(delays: readonly number[] = CHECKOUT_SYNC_DELAYS_MS): CheckoutSyncStep[] {
  return delays.map((delayMs, index) => ({ index, delayMs, isLastAttempt: index === delays.length - 1 }))
}

/**
 * Whether the sync loop should stop because the paid plan is now visible.
 * 'free' is deliberately the ONLY non-confirmed state — that's exactly
 * the stale value the loop exists to wait out. Any other resolved plan
 * (organize/manage/legacy/owner/…) means the webhook has landed and
 * user_subscriptions correctly reflects it — this never fabricates a
 * paid result on its own, it only recognizes one already read from the
 * database via the normal useSubscription() query.
 */
export function isCheckoutSyncConfirmed(plan: string): boolean {
  return plan !== 'free'
}

/**
 * Whether the poll loop should still be actively scheduling attempts,
 * given the current plan and how many attempts have already fired.
 * Used by the page to both gate the setTimeout effect and decide
 * whether to show "Confirming your subscription…". Pure decision logic
 * — never touches Supabase/Stripe/timers itself.
 */
export function shouldContinueCheckoutSync(params: {
  checkoutState: string | null
  plan: string
  attemptsFired: number
  schedule?: CheckoutSyncStep[]
}): boolean {
  const schedule = params.schedule ?? buildCheckoutSyncSchedule()
  if (params.checkoutState !== 'success') return false
  if (isCheckoutSyncConfirmed(params.plan)) return false
  return params.attemptsFired < schedule.length
}
