// PropRoster — Platform Admin Authorization Fix, follow-up: one-time
// reconciliation for existing user_subscriptions rows whose
// current_period_end was silently persisted as null by the webhook bug
// fixed in lib/billing/webhook-handlers.ts (normalizeSubscriptionEventObject).
//
// Same "ports and adapters" seam as lib/billing/webhook-handlers.ts and
// lib/billing/subscription-actions.ts — plain deps-injected functions, no
// direct Stripe SDK / Supabase calls, so the reconciliation logic is
// unit-testable without a network call.
//
// Design constraints (deliberately narrow):
// - Stripe is the ONLY authoritative source read here — never invents or
//   derives a date from invoices or anything else.
// - The write path (deps.updateCurrentPeriodEnd) can physically only ever
//   set ONE column, current_period_end, scoped to one owner_id — there is
//   no way for this module to touch plan, status, price, customer id, or
//   any other row's data, by construction of its own dependency shape.
// - Idempotent: re-running is always safe. A row whose live Stripe value
//   matches what's already stored is simply rewritten to the same value;
//   a Stripe subscription that's gone (deleted/missing) is reported as
//   such and left untouched, never nulled out further or guessed at.
// - Never fatal across the batch: one row's Stripe error doesn't stop the
//   rest from being reconciled.

export type ReconciliationCandidate = {
  ownerId: string
  stripeSubscriptionId: string
}

/** Returned by fetchLiveCurrentPeriodEnd: the live value, or a sentinel for "Stripe has no such subscription anymore." */
export type LiveCurrentPeriodEndResult =
  | { found: true; currentPeriodEnd: number | null }
  | { found: false }

export type ReconcileDeps = {
  /** Rows needing reconciliation — the caller decides the filter (e.g. current_period_end is null). */
  listCandidates: () => Promise<ReconciliationCandidate[]>
  /** Retrieves the subscription live from Stripe and extracts current_period_end from the correct (item-level) location. Must not throw for a missing subscription — return { found: false } instead. */
  fetchLiveCurrentPeriodEnd: (stripeSubscriptionId: string) => Promise<LiveCurrentPeriodEndResult>
  /** Updates ONLY current_period_end for exactly one owner's row. */
  updateCurrentPeriodEnd: (ownerId: string, currentPeriodEndIso: string | null) => Promise<void>
}

export type ReconciliationRowOutcome = 'updated' | 'stripe_subscription_not_found' | 'error'

export type ReconciliationRowResult = {
  ownerId: string
  stripeSubscriptionId: string
  outcome: ReconciliationRowOutcome
  currentPeriodEnd?: string | null
  error?: string
}

export type ReconciliationSummary = {
  total: number
  updated: number
  notFound: number
  errored: number
  results: ReconciliationRowResult[]
}

export async function reconcileCurrentPeriodEnd(deps: ReconcileDeps): Promise<ReconciliationSummary> {
  const candidates = await deps.listCandidates()
  const results: ReconciliationRowResult[] = []

  for (const candidate of candidates) {
    try {
      const live = await deps.fetchLiveCurrentPeriodEnd(candidate.stripeSubscriptionId)
      if (!live.found) {
        // Stripe subscription no longer exists — never guess a value,
        // never touch the row. The next real webhook event for this
        // customer (if any) is what should resolve this, not this tool.
        results.push({ ownerId: candidate.ownerId, stripeSubscriptionId: candidate.stripeSubscriptionId, outcome: 'stripe_subscription_not_found' })
        continue
      }
      const iso = live.currentPeriodEnd ? new Date(live.currentPeriodEnd * 1000).toISOString() : null
      await deps.updateCurrentPeriodEnd(candidate.ownerId, iso)
      results.push({ ownerId: candidate.ownerId, stripeSubscriptionId: candidate.stripeSubscriptionId, outcome: 'updated', currentPeriodEnd: iso })
    } catch (err) {
      results.push({
        ownerId: candidate.ownerId,
        stripeSubscriptionId: candidate.stripeSubscriptionId,
        outcome: 'error',
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return {
    total: results.length,
    updated: results.filter((r) => r.outcome === 'updated').length,
    notFound: results.filter((r) => r.outcome === 'stripe_subscription_not_found').length,
    errored: results.filter((r) => r.outcome === 'error').length,
    results,
  }
}
