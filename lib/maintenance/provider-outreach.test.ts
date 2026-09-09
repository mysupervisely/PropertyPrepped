import { describe, expect, it } from 'vitest'
import {
  generateProviderOutreachToken, hashProviderOutreachToken, providerOutreachLink,
  buildProviderOutreachEmail, buildProviderSafeView, latestOutreachForContact, hasPendingOutreach,
  type ProviderOutreachRow,
} from './provider-outreach'

describe('generateProviderOutreachToken / hashProviderOutreachToken', () => {
  it('generates a high-entropy, 64-hex-char token (32 random bytes) — never sequential', () => {
    const a = generateProviderOutreachToken()
    const b = generateProviderOutreachToken()
    expect(a).toMatch(/^[0-9a-f]{64}$/)
    expect(a).not.toBe(b)
  })

  it('hashing is deterministic (same input -> same hash, needed for lookup) but never reversible/equal to the input', () => {
    const token = generateProviderOutreachToken()
    const h1 = hashProviderOutreachToken(token)
    const h2 = hashProviderOutreachToken(token)
    expect(h1).toBe(h2)
    expect(h1).not.toBe(token)
    expect(h1).toMatch(/^[0-9a-f]{64}$/) // sha-256 hex
  })

  it('different tokens hash to different values', () => {
    expect(hashProviderOutreachToken('a')).not.toBe(hashProviderOutreachToken('b'))
  })
})

describe('providerOutreachLink', () => {
  it('builds a request-specific link under /provider/<token>, from the given origin', () => {
    expect(providerOutreachLink('https://proproster.com', 'abc123')).toBe('https://proproster.com/provider/abc123')
  })

  it('works with a Deploy Preview origin too — never a hardcoded host', () => {
    expect(providerOutreachLink('https://deploy-preview-59--sensational-platypus-3da0b7.netlify.app', 'tok')).toBe('https://deploy-preview-59--sensational-platypus-3da0b7.netlify.app/provider/tok')
  })

  it('strips a trailing slash on the origin so the link never has a double slash', () => {
    expect(providerOutreachLink('https://proproster.com/', 'tok')).toBe('https://proproster.com/provider/tok')
  })
})

describe('buildProviderOutreachEmail — Section 7\'s exact structure, real values only', () => {
  it('uses the actual landlord/provider/property/issue values — never hardcoded example data', () => {
    const email = buildProviderOutreachEmail({
      providerFirstName: 'Mike',
      landlordName: 'Kiro',
      propertyAddress: '5558 Pats Point, Winter Park, FL 32792',
      issueTitle: 'AC not cooling',
      reviewUrl: 'https://proproster.com/provider/tok123',
    })
    expect(email.subject).toBe('New maintenance request from PropRoster')
    expect(email.body).toContain('Hi Mike,')
    expect(email.body).toContain('Kiro has requested help')
    expect(email.body).toContain('5558 Pats Point, Winter Park, FL 32792')
    expect(email.body).toContain('AC not cooling')
    expect(email.body).toContain('https://proproster.com/provider/tok123')
  })

  it('never mentions portfolio/financial content', () => {
    const email = buildProviderOutreachEmail({ providerFirstName: 'Mike', landlordName: 'Kiro', propertyAddress: '1 Main St', issueTitle: 'Leak', reviewUrl: 'https://x.test/provider/t' })
    expect(email.body.toLowerCase()).not.toMatch(/mortgage|rent\b|equity|value|portfolio|deposit|tax/)
  })
})

describe('buildProviderSafeView — the explicit allowlist the provider page renders', () => {
  it('carries through exactly the safe fields', () => {
    const view = buildProviderSafeView({
      propertyAddress: '5558 Pats Point', propertyCity: 'Winter Park', issueTitle: 'AC not cooling',
      tenantReport: 'Set at 73, feels like 80.', priority: 'Urgent', providerName: 'Mike Rivera', status: 'sent',
    })
    expect(view).toEqual({
      propertyAddress: '5558 Pats Point', propertyCity: 'Winter Park', issueTitle: 'AC not cooling',
      tenantReport: 'Set at 73, feels like 80.', priority: 'Urgent', providerFirstName: 'Mike', status: 'sent',
    })
  })

  it('reduces the provider name to a first name only, matching the email\'s own "Hi Mike," convention', () => {
    const view = buildProviderSafeView({ propertyAddress: 'x', propertyCity: null, issueTitle: 'x', tenantReport: 'x', priority: 'Normal', providerName: 'Mike Rivera', status: 'accepted' })
    expect(view.providerFirstName).toBe('Mike')
  })

  it('is a fixed, explicit shape — TypeScript itself blocks passing extra fields like mortgage/rent through this function (compile-time allowlist, not just a runtime one)', () => {
    // @ts-expect-error — buildProviderSafeView's input type has no room for financial fields at all.
    buildProviderSafeView({ propertyAddress: 'x', propertyCity: null, issueTitle: 'x', tenantReport: 'x', priority: 'Normal', providerName: 'Mike', status: 'sent', mortgageBalance: 250000 })
  })
})

const rows: ProviderOutreachRow[] = [
  { id: 'o1', maintenance_request_id: 'r1', contact_id: 'c1', status: 'sent', provider_message: null, sent_at: '2026-09-01T10:00:00Z', responded_at: null },
  { id: 'o2', maintenance_request_id: 'r1', contact_id: 'c1', status: 'accepted', provider_message: null, sent_at: '2026-09-03T10:00:00Z', responded_at: '2026-09-03T11:00:00Z' },
  { id: 'o3', maintenance_request_id: 'r1', contact_id: 'c2', status: 'sent', provider_message: null, sent_at: '2026-09-02T10:00:00Z', responded_at: null },
]

describe('latestOutreachForContact', () => {
  it('returns the most recently sent outreach row for that exact contact', () => {
    expect(latestOutreachForContact(rows, 'c1')?.id).toBe('o2')
  })

  it('never mixes in a DIFFERENT contact\'s outreach history — the exact "reassigning treats the new provider as a separate outreach event" requirement', () => {
    expect(latestOutreachForContact(rows, 'c2')?.id).toBe('o3')
  })

  it('returns null when this contact has never been contacted for this request', () => {
    expect(latestOutreachForContact(rows, 'c-never-contacted')).toBeNull()
  })
})

describe('hasPendingOutreach — duplicate-send protection', () => {
  it('is false once the contact\'s LATEST outreach has moved past "sent" (accepted/declined/needs_information) — a landlord may reasonably send again', () => {
    expect(hasPendingOutreach(rows, 'c1')).toBe(false) // latest for c1 is 'accepted' (o2)
  })

  it('is true while the latest outreach to this contact is still awaiting a response', () => {
    expect(hasPendingOutreach(rows, 'c2')).toBe(true) // latest (only) for c2 is 'sent' (o3)
  })

  it('is false for a contact never contacted at all — nothing pending', () => {
    expect(hasPendingOutreach(rows, 'c-never-contacted')).toBe(false)
  })

  it('reassigning to a brand-new contact never inherits a pending state from the previously assigned one', () => {
    const onlyOldContactPending: ProviderOutreachRow[] = [{ id: 'o1', maintenance_request_id: 'r1', contact_id: 'old-contact', status: 'sent', provider_message: null, sent_at: '2026-09-01T10:00:00Z', responded_at: null }]
    expect(hasPendingOutreach(onlyOldContactPending, 'new-contact')).toBe(false)
  })
})
