import { describe, expect, it, vi, afterEach } from 'vitest'
import { runLandlordDigest, type LandlordDigestDataPort, type OwnerPreferenceRow, type OwnerPortfolioRows } from './landlord-digest-run'

const now = new Date('2026-09-16T12:00:00Z')
const ENV = { RESEND_API_KEY: 're_x', LANDLORD_DIGEST_FROM_EMAIL: 'digest@example.com' }

function emptyPortfolio(): OwnerPortfolioRows {
  return { properties: [], leases: [], insurancePolicies: [], mortgages: [], maintenanceRecords: [], rentPayments: [], propertySystems: [], tenantRequests: [] }
}

/** A portfolio with exactly one genuinely-attention-worthy item (an overdue lease-less-independent Insurance expiration, so it isn't entangled with the canUsePropWatch-gated Rent auto-item the way a lease with rent_due_day would be — see landlord-digest-items.test.ts for that interaction). */
function portfolioWithOneAttentionItem(propertyId: string): OwnerPortfolioRows {
  return {
    ...emptyPortfolio(),
    properties: [{ id: propertyId, address: `${propertyId} Test Street`, property_type: 'Rental Property' }],
    insurancePolicies: [{ id: `${propertyId}-ins`, property_id: propertyId, carrier: 'Acme', expiration_date: '2026-09-10' }], // already expired
  }
}

/** A minimal, fully in-memory fake — no real Supabase/network anywhere. */
function makeFakePort(overrides: Partial<{
  preferences: OwnerPreferenceRow[]
  emails: Record<string, string | null>
  portfolios: Record<string, OwnerPortfolioRows>
  markSentResults: Record<string, boolean>
}> = {}) {
  const preferences = overrides.preferences ?? []
  const emails = overrides.emails ?? {}
  const portfolios = overrides.portfolios ?? {}
  const markSentResults = overrides.markSentResults ?? {}
  const markSentCalls: { ownerId: string; sentAtIso: string }[] = []

  const port: LandlordDigestDataPort = {
    async listOwnerPreferences() {
      return preferences
    },
    async getSubscriptionRow() {
      return { plan: 'free', status: 'active' } // canUsePropWatch true under free per Property Overview + Pricing Polish V1 Stage 1 — irrelevant to these fixtures either way since they avoid the rent/warranty interaction
    },
    async getOwnerEmail(ownerId) {
      return ownerId in emails ? emails[ownerId] : `${ownerId}@example.com`
    },
    async getPortfolioRows(ownerId) {
      return portfolios[ownerId] ?? emptyPortfolio()
    },
    async markDigestSent(ownerId, sentAtIso) {
      markSentCalls.push({ ownerId, sentAtIso })
      return ownerId in markSentResults ? markSentResults[ownerId] : true
    },
  }
  return { port, markSentCalls }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('runLandlordDigest', () => {
  it('sends nothing and counts no_attention when the owner has zero attention items — never sends an empty digest', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { port } = makeFakePort({
      preferences: [{ ownerId: 'owner-1', weeklyDigestEnabled: true, lastWeeklyDigestSentAt: null }],
      portfolios: { 'owner-1': emptyPortfolio() },
    })
    const summary = await runLandlordDigest(port, { origin: 'https://proproster.com', now, env: ENV })
    expect(summary).toEqual({ processed: 1, sent: 0, noAttention: 1, disabled: 0, alreadySent: 0, noEmail: 0, failed: 0 })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('skips an owner with the digest disabled — never even fetches their portfolio', async () => {
    const getPortfolioRows = vi.fn(async () => emptyPortfolio())
    const { port } = makeFakePort({ preferences: [{ ownerId: 'owner-1', weeklyDigestEnabled: false, lastWeeklyDigestSentAt: null }] })
    port.getPortfolioRows = getPortfolioRows
    const summary = await runLandlordDigest(port, { origin: 'https://proproster.com', now, env: ENV })
    expect(summary.disabled).toBe(1)
    expect(summary.sent).toBe(0)
    expect(getPortfolioRows).not.toHaveBeenCalled()
  })

  it('skips an owner already sent this period — no duplicate digest', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { port } = makeFakePort({
      preferences: [{ ownerId: 'owner-1', weeklyDigestEnabled: true, lastWeeklyDigestSentAt: '2026-09-15T00:00:00Z' }], // within the current period (started 2026-09-14T13:00Z)
      portfolios: { 'owner-1': portfolioWithOneAttentionItem('p1') },
    })
    const summary = await runLandlordDigest(port, { origin: 'https://proproster.com', now, env: ENV })
    expect(summary.alreadySent).toBe(1)
    expect(summary.sent).toBe(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('skips an owner with no usable email — logs the skip, never fails the run', async () => {
    const { port } = makeFakePort({
      preferences: [{ ownerId: 'owner-1', weeklyDigestEnabled: true, lastWeeklyDigestSentAt: null }],
      emails: { 'owner-1': null },
      portfolios: { 'owner-1': portfolioWithOneAttentionItem('p1') },
    })
    const summary = await runLandlordDigest(port, { origin: 'https://proproster.com', now, env: ENV })
    expect(summary).toEqual({ processed: 1, sent: 0, noAttention: 0, disabled: 0, alreadySent: 0, noEmail: 1, failed: 0 })
  })

  it('a successful send updates last_weekly_digest_sent_at (via markDigestSent) and counts sent', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, text: async () => '' }) as Response))
    const { port, markSentCalls } = makeFakePort({
      preferences: [{ ownerId: 'owner-1', weeklyDigestEnabled: true, lastWeeklyDigestSentAt: null }],
      portfolios: { 'owner-1': portfolioWithOneAttentionItem('p1') },
    })
    const summary = await runLandlordDigest(port, { origin: 'https://proproster.com', now, env: ENV })
    expect(summary.sent).toBe(1)
    expect(markSentCalls).toEqual([{ ownerId: 'owner-1', sentAtIso: now.toISOString() }])
  })

  it('a failed send does NOT call markDigestSent — never records success for an email that never went out', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, text: async () => 'boom' }) as Response))
    const { port, markSentCalls } = makeFakePort({
      preferences: [{ ownerId: 'owner-1', weeklyDigestEnabled: true, lastWeeklyDigestSentAt: null }],
      portfolios: { 'owner-1': portfolioWithOneAttentionItem('p1') },
    })
    const summary = await runLandlordDigest(port, { origin: 'https://proproster.com', now, env: ENV })
    expect(summary.failed).toBe(1)
    expect(summary.sent).toBe(0)
    expect(markSentCalls).toEqual([])
  })

  it('a failed markDigestSent write (email sent, but the timestamp write failed) is counted as failed, not sent — so the next run retries', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, text: async () => '' }) as Response))
    const { port } = makeFakePort({
      preferences: [{ ownerId: 'owner-1', weeklyDigestEnabled: true, lastWeeklyDigestSentAt: null }],
      portfolios: { 'owner-1': portfolioWithOneAttentionItem('p1') },
      markSentResults: { 'owner-1': false },
    })
    const summary = await runLandlordDigest(port, { origin: 'https://proproster.com', now, env: ENV })
    expect(summary.sent).toBe(0)
    expect(summary.failed).toBe(1)
  })

  it('one owner throwing does not abort the run — every other owner is still processed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, text: async () => '' }) as Response))
    const { port } = makeFakePort({
      preferences: [
        { ownerId: 'owner-broken', weeklyDigestEnabled: true, lastWeeklyDigestSentAt: null },
        { ownerId: 'owner-2', weeklyDigestEnabled: true, lastWeeklyDigestSentAt: null },
      ],
      portfolios: { 'owner-2': portfolioWithOneAttentionItem('p2') },
    })
    port.getPortfolioRows = async (ownerId: string) => {
      if (ownerId === 'owner-broken') throw new Error('simulated failure fetching this one owner\'s rows')
      return portfolioWithOneAttentionItem('p2')
    }
    const summary = await runLandlordDigest(port, { origin: 'https://proproster.com', now, env: ENV })
    expect(summary.failed).toBe(1)
    expect(summary.sent).toBe(1)
    expect(summary.processed).toBe(2)
  })

  it('owner scoping: two owners with different portfolios each only ever see their OWN data in their own email', async () => {
    const sentBodies: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: string }) => {
      sentBodies.push(init.body)
      return { ok: true, status: 200, text: async () => '' } as Response
    }))
    const { port } = makeFakePort({
      preferences: [
        { ownerId: 'owner-a', weeklyDigestEnabled: true, lastWeeklyDigestSentAt: null },
        { ownerId: 'owner-b', weeklyDigestEnabled: true, lastWeeklyDigestSentAt: null },
      ],
      portfolios: {
        'owner-a': portfolioWithOneAttentionItem('a-property'),
        'owner-b': portfolioWithOneAttentionItem('b-property'),
      },
    })
    const summary = await runLandlordDigest(port, { origin: 'https://proproster.com', now, env: ENV })
    expect(summary.sent).toBe(2)
    expect(sentBodies).toHaveLength(2)
    const ownerABody = sentBodies.find((b) => b.includes('owner-a@example.com'))!
    const ownerBBody = sentBodies.find((b) => b.includes('owner-b@example.com'))!
    expect(ownerABody).toContain('a-property Test Street')
    expect(ownerABody).not.toContain('b-property Test Street')
    expect(ownerBBody).toContain('b-property Test Street')
    expect(ownerBBody).not.toContain('a-property Test Street')
  })

  it('no autonomous state change: markDigestSent is the ONLY write this module ever performs, and only after a confirmed send', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, text: async () => '' }) as Response))
    const { port, markSentCalls } = makeFakePort({
      preferences: [{ ownerId: 'owner-1', weeklyDigestEnabled: true, lastWeeklyDigestSentAt: null }],
      portfolios: { 'owner-1': portfolioWithOneAttentionItem('p1') },
    })
    await runLandlordDigest(port, { origin: 'https://proproster.com', now, env: ENV })
    // Exactly one write, exactly the timestamp field — no maintenance
    // status, rent payment, lease, or PropCrew mutation is ever touched
    // by this module (it has no port method that could even attempt one).
    expect(markSentCalls).toHaveLength(1)
    expect(Object.keys(port)).toEqual(['listOwnerPreferences', 'getSubscriptionRow', 'getOwnerEmail', 'getPortfolioRows', 'markDigestSent'])
  })
})
