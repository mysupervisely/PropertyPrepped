import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// PropRoster — Tenant Connect: Provider Outreach V1. Source-read
// regression guards, matching this repo's established no-jsdom
// convention (see lib/maintenance/command-center-wiring.test.ts for the
// direct precedent this file follows). The pure logic itself
// (token/hash/link/email/safe-view/duplicate-protection) is already
// fully covered by lib/maintenance/provider-outreach.test.ts — this
// file instead checks the WIRING: that the send/respond routes and the
// two landlord pages actually use that logic the way Section 1-11
// require, without re-implementing anything inline.

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

// Several guards below assert an absence (no select('*'), no financial
// field, no message-thread pattern) — but this file's own header
// comments legitimately DESCRIBE those same forbidden things ("never
// select('*')", "do NOT expose ... PropWatch", "NOT a general chat/
// message thread") as documentation of what was deliberately avoided.
// Strip comments first so these guards check the actual code, not the
// prose explaining why the code doesn't do it.
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

const sendRouteSource = readFile('app/api/maintenance/provider-outreach/send/route.ts')
const respondRouteSource = readFile('app/api/provider-outreach/respond/route.ts')
const providerPageSource = readFile('app/provider/[token]/page.tsx')
const providerActionsSource = readFile('components/provider/ProviderResponseActions.tsx')
const caseDetailSource = readFile('components/maintenance/MaintenanceCaseDetail.tsx')
const pageSource = readFile('app/page.tsx')
const commandCenterPageSource = readFile('app/maintenance/page.tsx')
const migrationSource = readFile('supabase/milestone-27-provider-outreach-v1.sql')

describe('Landlord send route — explicit authorization only for an assigned provider with an email', () => {
  it('requires assigned_contact_id before any send is attempted', () => {
    expect(sendRouteSource).toContain('no_assigned_contact')
    expect(sendRouteSource).toContain('if (!request.assigned_contact_id)')
  })

  it('requires the assigned contact to actually have an email — never a fake/SMS fallback', () => {
    expect(sendRouteSource).toContain('no_provider_email')
    expect(sendRouteSource).toContain('if (!contact.email)')
    expect(sendRouteSource).not.toMatch(/twilio|sms|text message/i)
  })

  it('authorizes via the caller\'s own RLS-scoped re-fetch, never a client-supplied owner_id', () => {
    expect(sendRouteSource).toContain('createRequestClient(token)')
    expect(sendRouteSource).not.toMatch(/body\.ownerId|body\.owner_id/)
  })

  it('re-checks duplicate-send protection server-side (not just in the UI) before inserting', () => {
    expect(sendRouteSource).toContain('hasPendingOutreach(')
    expect(sendRouteSource).toContain('already_pending')
  })

  it('builds the email from dynamically-fetched values only — no hardcoded example name/property', () => {
    expect(sendRouteSource).not.toMatch(/Kiro|\bMike\b|Breezy Air|5558 Pats Point/)
    expect(sendRouteSource).toContain('buildProviderOutreachEmail(')
  })
})

describe('Provider respond route — token is the only authorization, never a client-supplied id', () => {
  it('resolves the outreach row from the hashed token only, never from a request-body id', () => {
    expect(respondRouteSource).toContain('hashProviderOutreachToken(body.token)')
    expect(respondRouteSource).not.toMatch(/body\.requestId|body\.maintenanceRequestId|body\.contactId|body\.outreachId/)
  })

  it('rejects an unrecognized token', () => {
    expect(respondRouteSource).toContain('invalid_token')
  })

  it('rejects an expired token', () => {
    expect(respondRouteSource).toContain("reason: 'expired'")
    expect(respondRouteSource).toMatch(/token_expires_at[\s\S]*Date\.now\(\)|Date\.now\(\)[\s\S]*token_expires_at/)
  })

  it('supports all three provider actions, mapped to the outreach table\'s own status vocabulary', () => {
    expect(respondRouteSource).toContain("accept: 'accepted'")
    expect(respondRouteSource).toContain("decline: 'declined'")
    expect(respondRouteSource).toContain("needs_information: 'needs_information'")
  })

  it('persists an optional provider question only for needs_information, bounded in length, never a general message thread', () => {
    expect(respondRouteSource).toContain('provider_message')
    expect(respondRouteSource).toContain('.slice(0, 1000)')
    expect(respondRouteSource).not.toMatch(/property_messages|thread_id|conversation/i)
  })

  it('never writes to maintenance_requests.status — outreach state stays on its own table', () => {
    expect(respondRouteSource).not.toContain("from('maintenance_requests')")
  })
})

describe('Provider page — no account, minimum-necessary info only', () => {
  it('is reachable with no session/auth check — the token alone gates access', () => {
    expect(providerPageSource).not.toMatch(/auth\.getUser\(\)|supabase\.auth\.getSession/)
    expect(providerPageSource).toContain('createAdminClient()')
  })

  it('narrow-selects only the columns the safe view needs — never select(\'*\') on any table', () => {
    expect(stripComments(providerPageSource)).not.toMatch(/select\('\*'\)/)
  })

  it('never fetches or renders financial/portfolio fields', () => {
    expect(stripComments(providerPageSource)).not.toMatch(/mortgage|rent_amount|security_deposit|lease_terms|tax_|purchase_price|market_value|propwatch/i)
  })

  it('renders only via buildProviderSafeView\'s own allowlisted fields, not a raw row spread', () => {
    expect(providerPageSource).toContain('buildProviderSafeView(')
    expect(providerPageSource).not.toMatch(/\{\.\.\.(request|contact|property|outreach)\}/)
  })

  it('shows an explicit invalid/expired state rather than leaking any partial data for a bad token', () => {
    expect(providerPageSource).toContain('Link not found')
    expect(providerPageSource).toContain('Link expired')
  })
})

describe('Provider response actions — exactly three actions, no general chat thread', () => {
  it('offers I Can Help / I Can\'t Help / I Need More Information, matching Section 5 verbatim', () => {
    expect(providerActionsSource).toContain('I Can Help')
    expect(providerActionsSource).toContain('I Can&apos;t Help')
    expect(providerActionsSource).toContain('I Need More Information')
  })

  it('shows Section 5\'s own confirmation copy for accepted/declined/needs_information', () => {
    expect(providerActionsSource).toContain('Thanks. The property owner has been notified that you can help.')
  })

  it('never builds a multi-message thread UI', () => {
    expect(stripComments(providerActionsSource)).not.toMatch(/messages\.map|conversation|thread/i)
  })
})

describe('Landlord visibility — one shared detail component, no second dashboard', () => {
  it('MaintenanceCaseDetail renders the outreach status via the shared label map, not an inline duplicate vocabulary', () => {
    expect(caseDetailSource).toContain('PROVIDER_OUTREACH_STATUS_LABEL[outreach.status]')
  })

  it('the "Contact PropCrew" action requires explicit landlord confirmation before onSendOutreach() is ever called', () => {
    expect(caseDetailSource).toContain('setShowContactConfirm(true)')
    expect(caseDetailSource).toContain('showContactConfirm && assignedContact')
    expect(caseDetailSource).toContain('onSendOutreach?.()')
  })

  it('duplicate-send protection: the send button is hidden once a live "sent" outreach exists for the assigned contact', () => {
    expect(caseDetailSource).toContain("(!outreach || outreach.status !== 'sent')")
  })

  it('both landlord pages fetch maintenance_provider_outreach and pass it into the shared component — one implementation, not a second dashboard', () => {
    for (const source of [pageSource, commandCenterPageSource]) {
      expect(source).toContain("from('maintenance_provider_outreach')")
      expect(source).toContain('outreach={')
      expect(source).toContain('onSendOutreach={')
    }
  })

  it('the outreach row shown for the open case is scoped to that request AND its currently assigned contact — reassignment never inherits a stale outreach state', () => {
    expect(pageSource).toContain('latestOutreachForContact(providerOutreach.filter((o) => o.maintenance_request_id === openMaintenanceCase.id), openMaintenanceCase.assigned_contact_id)')
    expect(commandCenterPageSource).toContain('latestOutreachForContact(providerOutreach.filter((o) => o.maintenance_request_id === openCase.id), openCase.assigned_contact_id)')
  })
})

describe('Migration — reviewed, not applied; kept distinct from maintenance_requests.status', () => {
  it('is explicitly marked as not yet applied to production', () => {
    expect(migrationSource).toContain('NOT YET APPLIED TO PRODUCTION')
  })

  it('never touches maintenance_requests.status', () => {
    expect(migrationSource).not.toMatch(/alter table public\.maintenance_requests/i)
  })

  it('has no client-facing insert/update/delete policy — every write goes through a server route', () => {
    expect(migrationSource).not.toMatch(/for insert to authenticated|for update to authenticated|for delete to authenticated/i)
  })

  it('stores only the token hash, never a raw-token column', () => {
    expect(migrationSource).toContain('token_hash text not null unique')
    expect(migrationSource).not.toMatch(/\btoken\s+text\b/)
  })
})
