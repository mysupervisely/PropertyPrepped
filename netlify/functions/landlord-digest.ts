// PropRoster — Landlord Digest V1: the scheduled trigger.
//
// This file is deliberately thin — every real decision (who's eligible,
// what counts as "already sent this period," how the email is built,
// how a failure is handled) lives in lib/notifications/, already fully
// unit-tested there with fakes (see landlord-digest-run.test.ts and
// friends). This file's only job is: get a real admin Supabase client,
// wire it into the real port, run it, log/return the aggregate summary.
//
// SCHEDULE: declared in netlify.toml (`[functions."landlord-digest"]
// schedule = "0 13 * * 1"` — Monday 13:00 UTC, once a week). Kept in
// sync with lib/notifications/digest-period.ts's own
// DIGEST_SCHEDULE_DESCRIPTION constant.
//
// SECURITY MODEL: this function takes NO input from the request that
// affects what it does — every invocation (scheduled or a direct POST
// to its own URL) performs the exact same deterministic scan of every
// opted-in owner, and the response is aggregate counts only, never an
// email address or portfolio detail. Its real safety property is
// idempotency, not request authentication: lib/notifications/
// digest-period.ts's isDigestDue() check means an extra/early/duplicate
// invocation can be triggered before it "does real work" is impossible.
// It can never cause a duplicate digest, and it exposes nothing an
// attacker could use even if they discovered the URL. See this
// milestone's own completion report for why a shared-secret header
// wasn't added on top of this (Netlify's toml-declared scheduled
// functions have no way to attach one to the scheduler's own
// invocation) and flags it as a decision worth reviewing.
//
// SAFE-BY-DEFAULT IN PREVIEW: sending is gated on LANDLORD_DIGEST_FROM_EMAIL
// (lib/notifications/landlord-digest-send.ts) — exactly like Tenant
// Connect's own email gating, this means a deploy preview (which will
// not have that env var set) can run this function end-to-end and see
// real, honest summary counts (processed/disabled/no_attention/etc.)
// without ever being able to send a single real email.

import { createAdminClient } from '../../lib/supabase-server'
import { createLandlordDigestSupabasePort } from '../../lib/notifications/landlord-digest-supabase-port'
import { runLandlordDigest, type LandlordDigestRunSummary } from '../../lib/notifications/landlord-digest-run'

type NetlifyEvent = { httpMethod?: string }

const NOT_CONFIGURED_SUMMARY: LandlordDigestRunSummary & { note: string } = {
  processed: 0, sent: 0, noAttention: 0, disabled: 0, alreadySent: 0, noEmail: 0, failed: 0,
  note: 'supabase_admin_client_not_configured',
}

export async function handler(event: NetlifyEvent) {
  // Scheduled invocations are POST; this just keeps a stray GET (a
  // browser visiting the function URL directly) from doing anything —
  // not a real security boundary (see this file's own header comment),
  // just tidiness.
  if (event.httpMethod && event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const admin = createAdminClient()
  if (!admin) {
    console.error('landlord-digest: service-role Supabase client is not configured — run skipped entirely.')
    return { statusCode: 200, body: JSON.stringify(NOT_CONFIGURED_SUMMARY) }
  }

  // Netlify sets URL automatically to the site's primary production
  // URL in every Function invocation — no new env var needed for the
  // common case. The fallback only matters for a from-scratch
  // environment where that isn't populated yet.
  const origin = process.env.URL || 'https://proproster.com'

  const port = createLandlordDigestSupabasePort(admin)
  const summary = await runLandlordDigest(port, { origin })

  console.log('landlord-digest: run complete', summary)
  return { statusCode: 200, body: JSON.stringify(summary) }
}
