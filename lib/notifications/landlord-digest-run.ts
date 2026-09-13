// PropRoster — Landlord Digest V1: the scheduled run's orchestration.
//
// This is the one place that ties together preference lookup,
// duplicate-send protection, canonical attention-item composition, and
// delivery — everything else in lib/notifications/ is pure/testable in
// isolation. runLandlordDigest() itself is written against a small
// LandlordDigestDataPort interface (implemented for real by
// landlord-digest-supabase-port.ts, using the service-role admin
// client) rather than a raw SupabaseClient, specifically so this
// orchestration logic — the duplicate-send rule, the skip/failure
// bookkeeping, "one owner's failure never aborts the run" — can be unit
// tested with a plain in-memory fake, no live Supabase or Resend call
// involved (see landlord-digest-run.test.ts).
//
// OWNER ISOLATION: every port method takes an explicit ownerId and is
// documented (landlord-digest-supabase-port.ts) to filter every query
// by it — this module never fetches "everyone's data" in one call and
// filters client-side; each owner's portfolio is fetched independently,
// one at a time, so a bug in one query can't leak a second owner's rows
// into the first owner's email.
//
// FAILURE HANDLING: each owner is wrapped in its own try/catch — one
// owner's thrown error (a malformed row, a transient network blip)
// increments `failed` and moves on to the next owner; it can never
// abort the whole run.
//
// OBSERVABILITY: the returned summary is aggregate counts only — no
// email addresses, portfolio content, or per-owner detail. Per-owner
// failures are logged (console.error) keyed by ownerId only, same
// "trace the specific case without exposing personal data" convention
// lib/realtor-leads/notify.ts already uses.

import { resolveEffectivePlan, entitlementsFor, type SubscriptionRow } from '../billing/entitlements'
import { isDigestDue } from './digest-period'
import { buildOwnerAttentionItems, groupDigestItems, type OwnerDigestSourceData } from './landlord-digest-items'
import { buildLandlordDigestEmail } from './landlord-digest-email'
import { sendLandlordDigestEmail } from './landlord-digest-send'

export type OwnerPreferenceRow = {
  ownerId: string
  weeklyDigestEnabled: boolean
  lastWeeklyDigestSentAt: string | null
}

/** Same fields buildOwnerAttentionItems() needs, minus propertyLabelById/canUsePropWatch (the runner derives those itself — see below) — properties additionally carry `address`, needed to build propertyLabelById the same way app/page.tsx's own Dashboard does. */
export type OwnerPortfolioRows = Omit<OwnerDigestSourceData, 'propertyLabelById' | 'canUsePropWatch' | 'properties'> & {
  properties: (OwnerDigestSourceData['properties'][number] & { address: string })[]
}

/**
 * The narrow surface runLandlordDigest() needs — implemented for real
 * against Supabase's service-role client by
 * landlord-digest-supabase-port.ts, and by a plain in-memory fake in
 * tests. Every method is scoped to a single ownerId (or, for
 * listOwnerPreferences, returns the full small preferences table —
 * there is no per-owner data in that one).
 */
export type LandlordDigestDataPort = {
  listOwnerPreferences(): Promise<OwnerPreferenceRow[]>
  getSubscriptionRow(ownerId: string): Promise<SubscriptionRow>
  /** The canonical Supabase Auth email for this owner — null if the account genuinely has none usable (never fabricated). */
  getOwnerEmail(ownerId: string): Promise<string | null>
  getPortfolioRows(ownerId: string): Promise<OwnerPortfolioRows>
  /** Only ever called after a CONFIRMED successful send. Returns false if the write itself failed (treated as a run failure for this owner, so the next scheduled run retries rather than silently drifting out of sync). */
  markDigestSent(ownerId: string, sentAtIso: string): Promise<boolean>
}

export type LandlordDigestRunOptions = {
  /** The origin every digest link is built against (e.g. "https://proproster.com") — same convention as lib/tenant-connect/notify.ts's own link builders. */
  origin: string
  now?: Date
  env?: Record<string, string | undefined>
}

export type LandlordDigestRunSummary = {
  processed: number
  sent: number
  noAttention: number
  disabled: number
  alreadySent: number
  noEmail: number
  failed: number
}

function emptySummary(): LandlordDigestRunSummary {
  return { processed: 0, sent: 0, noAttention: 0, disabled: 0, alreadySent: 0, noEmail: 0, failed: 0 }
}

/**
 * Runs the weekly digest for every owner in one pass. Never throws —
 * a single owner's failure is caught, counted, and logged; the loop
 * always continues to the next owner and always returns a complete
 * summary.
 */
export async function runLandlordDigest(port: LandlordDigestDataPort, options: LandlordDigestRunOptions): Promise<LandlordDigestRunSummary> {
  const now = options.now ?? new Date()
  const summary = emptySummary()

  const preferences = await port.listOwnerPreferences()
  summary.processed = preferences.length

  for (const pref of preferences) {
    try {
      if (!pref.weeklyDigestEnabled) {
        summary.disabled++
        continue
      }
      if (!isDigestDue(pref.lastWeeklyDigestSentAt, now)) {
        summary.alreadySent++
        continue
      }

      const email = await port.getOwnerEmail(pref.ownerId)
      if (!email) {
        summary.noEmail++
        continue
      }

      const subscription = await port.getSubscriptionRow(pref.ownerId)
      const plan = resolveEffectivePlan(subscription)
      const entitlements = entitlementsFor(plan)

      const rows = await port.getPortfolioRows(pref.ownerId)
      const propertyLabelById = new Map(rows.properties.map((p) => [p.id, p.address]))
      const items = buildOwnerAttentionItems({ ...rows, propertyLabelById, canUsePropWatch: entitlements.canUsePropWatch }, now)

      if (!items.length) {
        summary.noAttention++
        continue
      }

      const groups = groupDigestItems(items)
      const digestEmail = buildLandlordDigestEmail(groups, options.origin)
      const result = await sendLandlordDigestEmail(email, digestEmail, options.env)
      if (!result.sent) {
        summary.failed++
        continue
      }

      const marked = await port.markDigestSent(pref.ownerId, now.toISOString())
      if (!marked) {
        // The email genuinely sent — logging this distinctly from a
        // send failure matters (a landlord did receive a digest), but
        // it's still counted as `failed` for THIS run's own bookkeeping
        // since the duplicate-send guard for next week now depends on
        // a write that didn't happen; the safe fallback is "try again
        // next scheduled run" rather than silently treating it as done.
        console.error('landlord-digest: email sent but marking last_weekly_digest_sent_at failed', { ownerId: pref.ownerId })
        summary.failed++
        continue
      }

      summary.sent++
    } catch (err) {
      console.error('landlord-digest: unexpected error processing owner', { ownerId: pref.ownerId, err })
      summary.failed++
    }
  }

  return summary
}
