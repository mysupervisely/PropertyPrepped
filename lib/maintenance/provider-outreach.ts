// PropRoster — Tenant Connect: Provider Outreach V1.
//
// Pure logic only — no Supabase, no network — so it's directly
// unit-testable (this repo's no-jsdom convention). The two server
// routes (send/respond) and app/provider/[token]/page.tsx are the only
// places that touch the database or crypto's async/DB-adjacent parts;
// they import from here rather than re-implementing any of this.
//
// Provider outreach state (this file's ProviderOutreachStatus) is
// DELIBERATELY separate from maintenance_requests.status — see
// supabase/milestone-27-provider-outreach-v1.sql's own header. Nothing
// here ever reads or writes maintenance_requests.status.

import { randomBytes, createHash } from 'crypto'

export type ProviderOutreachStatus = 'sent' | 'accepted' | 'declined' | 'needs_information'

export const PROVIDER_OUTREACH_STATUSES: ProviderOutreachStatus[] = ['sent', 'accepted', 'declined', 'needs_information']

/** Landlord-facing label — Section 6's own examples ("Request sent", "Accepted", "Needs more information", "Unable to help"). */
export const PROVIDER_OUTREACH_STATUS_LABEL: Record<ProviderOutreachStatus, string> = {
  sent: 'Request sent',
  accepted: 'Accepted',
  declined: 'Unable to help',
  needs_information: 'Needs more information',
}

/**
 * High-entropy, request-specific token — 32 random bytes (256 bits),
 * hex-encoded. Never a sequential/database id (Section 3's own
 * requirement). The RAW token exists only in the emailed link and the
 * provider's browser; hashProviderOutreachToken() below is what gets
 * persisted.
 */
export function generateProviderOutreachToken(): string {
  return randomBytes(32).toString('hex')
}

/** SHA-256 hex digest — this, never the raw token, is what's stored (Section 3: "avoid storing a raw token"). Deterministic, so the respond route/provider page can re-hash an incoming token and look up the matching row directly, with no raw tokens ever persisted anywhere to compare against. */
export function hashProviderOutreachToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex')
}

/** The exact link the outreach email sends — origin comes from the request that triggered the send (see the send route), never a hardcoded/env-var host, so this works identically on the Deploy Preview and production. */
export function providerOutreachLink(origin: string, rawToken: string): string {
  return `${origin.replace(/\/$/, '')}/provider/${rawToken}`
}

export type ProviderOutreachEmailInput = {
  providerFirstName: string
  landlordName: string
  propertyAddress: string
  issueTitle: string
  reviewUrl: string
}

const APP_NAME = 'PropRoster'

/**
 * Section 7's exact structure, with real values substituted — never a
 * hardcoded example name/address (Section 7's own explicit
 * instruction). No portfolio/financial content anywhere in the body.
 */
export function buildProviderOutreachEmail(input: ProviderOutreachEmailInput): { subject: string; body: string } {
  return {
    subject: `New maintenance request from ${APP_NAME}`,
    body: [
      `Hi ${input.providerFirstName},`,
      '',
      `${input.landlordName} has requested help with a maintenance issue at:`,
      '',
      input.propertyAddress,
      '',
      'Issue:',
      input.issueTitle,
      '',
      'Review the request and let the property owner know if you can help:',
      input.reviewUrl,
      '',
      `Sent through ${APP_NAME} on behalf of the property owner.`,
    ].join('\n'),
  }
}

/**
 * The ONLY fields the provider page (or its data route) may ever
 * render or return — an explicit allowlist construction, never a
 * spread of the source row, so a future column added to
 * maintenance_requests/properties/property_contacts can never leak
 * here by accident. Matches Section 4's exact example fields, and
 * Section 4's own "do NOT expose" list (property value, mortgage,
 * rent, lease financials, security deposit, tax info, portfolio,
 * PropWatch, internal notes, unrelated tenant info) by construction —
 * none of those are inputs to this function at all.
 */
export type ProviderSafeRequestView = {
  propertyAddress: string
  propertyCity: string | null
  issueTitle: string
  tenantReport: string
  priority: string
  providerFirstName: string
  status: ProviderOutreachStatus
}

export function buildProviderSafeView(input: {
  propertyAddress: string
  propertyCity: string | null
  issueTitle: string
  tenantReport: string
  priority: string
  providerName: string
  status: ProviderOutreachStatus
}): ProviderSafeRequestView {
  return {
    propertyAddress: input.propertyAddress,
    propertyCity: input.propertyCity,
    issueTitle: input.issueTitle,
    tenantReport: input.tenantReport,
    priority: input.priority,
    providerFirstName: firstNameOf(input.providerName),
    status: input.status,
  }
}

function firstNameOf(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || fullName
}

export type ProviderOutreachRow = {
  id: string
  maintenance_request_id: string
  contact_id: string
  status: ProviderOutreachStatus
  provider_message: string | null
  sent_at: string
  responded_at: string | null
}

/**
 * Section 8 (duplicate-send protection) + Section 6 (landlord
 * visibility): the one outreach row the UI should show for the
 * CURRENTLY assigned contact — always the most recently sent one for
 * that exact (request, contact) pair. Filtering by contact_id first is
 * what makes "landlord reassigns to a different provider" naturally
 * start a fresh outreach history (Section 8's own requirement) — a
 * previous contact's outreach rows simply never match the new
 * contact_id, with no special-case code needed.
 */
export function latestOutreachForContact(rows: ProviderOutreachRow[], contactId: string): ProviderOutreachRow | null {
  const forContact = rows.filter((r) => r.contact_id === contactId)
  if (!forContact.length) return null
  return forContact.slice().sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime())[0]
}

/** True only when a live, unresponded "sent" outreach already exists for this contact — the exact condition that should disable/hide the "Contact PropCrew" action (Section 8: never allow a second send while one is already pending). Accepted/declined/needs_information are NOT "in flight" — a landlord may reasonably want to reach back out (still one explicit new send, still logged as its own row). */
export function hasPendingOutreach(rows: ProviderOutreachRow[], contactId: string): boolean {
  const latest = latestOutreachForContact(rows, contactId)
  return latest?.status === 'sent'
}
