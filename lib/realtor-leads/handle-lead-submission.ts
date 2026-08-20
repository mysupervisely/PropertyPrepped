// PropRoster Milestone 21: Realtor Connect V1 — the testable core of
// POST /api/realtor-leads.
//
// Same "ports and adapters" seam as lib/document-intelligence/
// analyze-request.ts: every external effect (rate-limit state, DB
// insert, email notification, the current clock) is injected, so the
// full submission flow — validation, honeypot, rate limiting, geography
// classification, persistence, notification — is unit-testable with no
// real network/database/timer. app/api/realtor-leads/route.ts is the
// thin adapter that wires real implementations to this.

import { validateLeadInput } from './validate-lead'
import { classifyGeography, parseAddressParts } from './geography'
import { checkRateLimit, isHoneypotTripped, type RateLimitState } from './rate-limit'
import type { LeadAnalysisSnapshot, LeadSource, RealtorLeadRow } from './types'

export type LeadSubmissionPayload = {
  name?: unknown
  email?: unknown
  phone?: unknown
  preferredContactMethod?: unknown
  message?: unknown
  propertyAddress?: unknown
  consent?: unknown
  analysisSnapshot?: unknown
  website?: unknown // honeypot
  source?: unknown
}

export type HandleLeadSubmissionDeps = {
  rateLimitState: RateLimitState
  clientIp: string
  now: () => number
  insertLead: (row: Omit<RealtorLeadRow, 'id' | 'created_at' | 'updated_at'>) => Promise<RealtorLeadRow | null>
  notify: (lead: RealtorLeadRow) => Promise<{ sent: boolean; reason?: string }>
  /** The authenticated caller's user id, if any — never trusted from the request body. */
  ownerUserId: string | null
}

export type LeadSubmissionResult =
  | { status: 200; body: { ok: true } }
  | { status: 400; body: { error: string } }
  | { status: 429; body: { error: string } }
  | { status: 500; body: { error: string } }

const VALID_SOURCES: readonly LeadSource[] = ['rental_analyzer', 'home_purchase']

export async function handleLeadSubmission(payload: LeadSubmissionPayload, deps: HandleLeadSubmissionDeps): Promise<LeadSubmissionResult> {
  // Honeypot — a real visitor never fills this field in. Return a
  // generic success so a bot gets no signal it was caught, without ever
  // touching the database or rate-limit budget.
  if (isHoneypotTripped(payload.website)) {
    return { status: 200, body: { ok: true } }
  }

  const allowed = checkRateLimit(deps.rateLimitState, deps.clientIp, deps.now())
  if (!allowed) {
    return { status: 429, body: { error: 'Too many requests. Please try again in a few minutes.' } }
  }

  const source = typeof payload.source === 'string' && VALID_SOURCES.includes(payload.source as LeadSource) ? (payload.source as LeadSource) : null
  if (!source) return { status: 400, body: { error: 'Please try again from the calculator page.' } }

  const validated = validateLeadInput(payload)
  if (!validated.valid) return { status: 400, body: { error: validated.error } }

  const propertyAddress = validated.data.propertyAddress
  const geography = classifyGeography(propertyAddress || '')
  const parts = propertyAddress ? parseAddressParts(propertyAddress) : { city: null, state: null, zip: null }

  const snapshot: LeadAnalysisSnapshot = (payload.analysisSnapshot && typeof payload.analysisSnapshot === 'object')
    ? { ...(payload.analysisSnapshot as LeadAnalysisSnapshot), source }
    : { source }

  try {
    const inserted = await deps.insertLead({
      owner_user_id: deps.ownerUserId,
      source,
      property_address: propertyAddress,
      city: parts.city,
      state: parts.state,
      zip: parts.zip,
      geography_bucket: geography,
      name: validated.data.name,
      email: validated.data.email,
      phone: validated.data.phone,
      preferred_contact_method: validated.data.preferredContactMethod,
      message: validated.data.message,
      consent_at: new Date(deps.now()).toISOString(),
      analysis_snapshot: snapshot,
      status: 'New',
      referred_to_name: null,
      referred_to_email: null,
      referred_to_state: null,
      notes: null,
    })
    if (!inserted) return { status: 500, body: { error: "We couldn't send your request. Please try again." } }

    // Best-effort — a notification failure must never fail a successful
    // submission (Section 11: submission success is what matters to the
    // user; Section 10: the lead itself is already safely persisted).
    try {
      await deps.notify(inserted)
    } catch (err) {
      console.error('realtor-leads: notification threw', err)
    }

    return { status: 200, body: { ok: true } }
  } catch (err) {
    console.error('realtor-leads: insert failed', err)
    return { status: 500, body: { error: "We couldn't send your request. Please try again." } }
  }
}
