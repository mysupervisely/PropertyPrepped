// PropRoster Milestone 21: Realtor Connect V1 — public lead submission.
//
// - Reachable signed-out (Section 4: "Do not force account creation just
//   to submit a Realtor connection request") — same "works with no
//   Supabase session at all" precedent as the Property Evaluator /
//   address search endpoints.
// - Uses the admin (service-role) Supabase client — the ONLY other
//   consumer of that client in this codebase is the Stripe webhook, for
//   the identical reason: a request that must be able to write
//   regardless of whether a session exists. This is intentional, not a
//   shortcut: `realtor_leads` grants NO insert policy to anon/
//   authenticated at all (see supabase/milestone-21-realtor-connect.sql)
//   — a public lead can ONLY be created through this one server route,
//   never directly from the client (Section 9).
// - If the caller IS signed in, their user id is read from their own
//   verified session token (never trusted from the request body) and
//   attached as owner_user_id — but a session is never required.
// - All business logic (validation, honeypot, rate limiting, geography,
//   persistence, notification) lives in
//   lib/realtor-leads/handle-lead-submission.ts so it's unit-testable
//   without a live database or network call; this file is the thin
//   adapter wiring real Supabase/env implementations to it.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createRequestClient } from '../../../lib/supabase-server'
import { handleLeadSubmission, type LeadSubmissionPayload } from '../../../lib/realtor-leads/handle-lead-submission'
import { sendLeadNotificationEmail } from '../../../lib/realtor-leads/notify'
import { extractClientIp } from '../../../lib/realtor-leads/rate-limit'
import type { RateLimitState } from '../../../lib/realtor-leads/rate-limit'
import type { RealtorLeadRow } from '../../../lib/realtor-leads/types'

export const runtime = 'nodejs'

function getBearerToken(header: string | null): string | null {
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match ? match[1] : null
}

// Module-scope so it persists across requests handled by the same warm
// server process — see lib/realtor-leads/rate-limit.ts's top comment for
// the honest limitation of this approach on a multi-instance deployment.
const rateLimitState: RateLimitState = new Map()

export async function POST(req: NextRequest) {
  try {
    const admin = createAdminClient()
    if (!admin) return NextResponse.json({ error: 'This isn’t available right now. Please try again later.' }, { status: 503 })

    // Signed-in is entirely optional here (Section 4) — when a token IS
    // present, verify it for real via the caller's own RLS-scoped client
    // rather than trusting a client-supplied user id.
    let ownerUserId: string | null = null
    const token = getBearerToken(req.headers.get('authorization'))
    if (token) {
      const requestClient = createRequestClient(token)
      if (requestClient) {
        const { data: userData } = await requestClient.auth.getUser()
        ownerUserId = userData?.user?.id || null
      }
    }

    const payload = (await req.json().catch(() => ({}))) as LeadSubmissionPayload

    const result = await handleLeadSubmission(payload, {
      rateLimitState,
      clientIp: extractClientIp(req.headers),
      now: () => Date.now(),
      ownerUserId,
      insertLead: async (row) => {
        const { data, error } = await admin.from('realtor_leads').insert(row).select('*').single()
        if (error) {
          console.error('realtor-leads: insert error', error)
          return null
        }
        return data as RealtorLeadRow
      },
      notify: (lead) => sendLeadNotificationEmail(lead),
    })

    return NextResponse.json(result.body, { status: result.status })
  } catch (err) {
    console.error('realtor-leads: unexpected error', err)
    return NextResponse.json({ error: "We couldn't send your request. Please try again." }, { status: 500 })
  }
}
