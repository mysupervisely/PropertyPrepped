import { describe, expect, it } from 'vitest'
import { handleLeadSubmission, type HandleLeadSubmissionDeps, type LeadSubmissionPayload } from './handle-lead-submission'
import type { RateLimitState } from './rate-limit'
import type { RealtorLeadRow } from './types'

function basePayload(overrides: Partial<LeadSubmissionPayload> = {}): LeadSubmissionPayload {
  return {
    source: 'rental_analyzer',
    name: 'Jamie Rivera',
    email: 'jamie@example.com',
    phone: '',
    preferredContactMethod: 'Email',
    message: '',
    propertyAddress: '17 Amaryllis Ln, Tampa, FL 33602',
    analysisSnapshot: { purchasePrice: 350000, capRatePercent: 6.1 },
    consent: true,
    website: '', // honeypot, empty = real visitor
    ...overrides,
  }
}

function makeDeps(overrides: Partial<HandleLeadSubmissionDeps> = {}): HandleLeadSubmissionDeps & { inserted: Omit<RealtorLeadRow, 'id' | 'created_at' | 'updated_at'>[]; notified: RealtorLeadRow[] } {
  const inserted: Omit<RealtorLeadRow, 'id' | 'created_at' | 'updated_at'>[] = []
  const notified: RealtorLeadRow[] = []
  return {
    rateLimitState: new Map() as RateLimitState,
    clientIp: '203.0.113.5',
    now: () => 1_000_000,
    ownerUserId: null,
    insertLead: async (row) => {
      inserted.push(row)
      const full: RealtorLeadRow = { id: 'lead-1', created_at: '2026-08-20T00:00:00Z', updated_at: '2026-08-20T00:00:00Z', ...row }
      return full
    },
    notify: async (lead) => {
      notified.push(lead)
      return { sent: false, reason: 'not_configured' }
    },
    inserted,
    notified,
    ...overrides,
  }
}

describe('handleLeadSubmission — happy paths', () => {
  it('signed-out submission succeeds and attaches owner_user_id: null', async () => {
    const deps = makeDeps({ ownerUserId: null })
    const result = await handleLeadSubmission(basePayload(), deps)
    expect(result).toEqual({ status: 200, body: { ok: true } })
    expect(deps.inserted[0].owner_user_id).toBeNull()
  })

  it('signed-in submission attaches the verified owner_user_id', async () => {
    const deps = makeDeps({ ownerUserId: 'user-abc' })
    const result = await handleLeadSubmission(basePayload(), deps)
    expect(result.status).toBe(200)
    expect(deps.inserted[0].owner_user_id).toBe('user-abc')
  })

  it('classifies geography from the submitted property address', async () => {
    const deps = makeDeps()
    await handleLeadSubmission(basePayload({ propertyAddress: '1 Main St, Austin, TX 78701' }), deps)
    expect(deps.inserted[0].geography_bucket).toBe('Outside Tampa Bay Area')
  })

  it('attaches the analysis snapshot with the source stamped in, even if the client omitted it', async () => {
    const deps = makeDeps()
    await handleLeadSubmission(basePayload({ analysisSnapshot: { purchasePrice: 999 } }), deps)
    expect(deps.inserted[0].analysis_snapshot).toEqual({ purchasePrice: 999, source: 'rental_analyzer' })
  })

  it('notifies exactly once for one successfully inserted lead — never a duplicate send', async () => {
    const deps = makeDeps()
    await handleLeadSubmission(basePayload(), deps)
    expect(deps.notified.length).toBe(1)
    expect(deps.notified[0].name).toBe('Jamie Rivera')
  })

  it('best-effort notifies after a successful insert, but a notification failure never fails the submission', async () => {
    const deps = makeDeps({ notify: async () => { throw new Error('smtp down') } })
    const result = await handleLeadSubmission(basePayload(), deps)
    expect(result.status).toBe(200)
  })

  it('the lead is never lost when notify resolves sent:false (not_configured/provider_error) rather than throwing — persistence already succeeded and the submission still reports success', async () => {
    const deps = makeDeps({ notify: async (lead) => { void lead; return { sent: false, reason: 'provider_error' } } })
    const result = await handleLeadSubmission(basePayload(), deps)
    expect(result).toEqual({ status: 200, body: { ok: true } })
    expect(deps.inserted.length).toBe(1)
  })
})

describe('handleLeadSubmission — validation', () => {
  it('rejects missing consent with a friendly (not raw) error, never touching the database', async () => {
    const deps = makeDeps()
    const result = await handleLeadSubmission(basePayload({ consent: false }), deps)
    expect(result.status).toBe(400)
    expect(deps.inserted.length).toBe(0)
    expect((result.body as { error: string }).error).not.toMatch(/postgres|supabase|row-level|rls/i)
  })

  it('rejects when neither email nor phone is present', async () => {
    const deps = makeDeps()
    const result = await handleLeadSubmission(basePayload({ email: '', phone: '' }), deps)
    expect(result.status).toBe(400)
  })

  it('accepts phone-only submissions', async () => {
    const deps = makeDeps()
    const result = await handleLeadSubmission(basePayload({ email: '', phone: '555-123-4567' }), deps)
    expect(result.status).toBe(200)
  })

  it('rejects an unrecognized/missing source', async () => {
    const deps = makeDeps()
    const result = await handleLeadSubmission(basePayload({ source: 'not_a_real_calculator' }), deps)
    expect(result.status).toBe(400)
    expect(deps.inserted.length).toBe(0)
  })
})

describe('handleLeadSubmission — honeypot', () => {
  it('a tripped honeypot returns a fake success without touching the database or rate-limit budget', async () => {
    const deps = makeDeps()
    const result = await handleLeadSubmission(basePayload({ website: 'http://spam.example' }), deps)
    expect(result).toEqual({ status: 200, body: { ok: true } })
    expect(deps.inserted.length).toBe(0)
    expect(deps.notified.length).toBe(0)
  })
})

describe('handleLeadSubmission — duplicate-submit / rate-limit protection', () => {
  it('rejects the 6th submission from the same IP within the window (default limit is 5)', async () => {
    const deps = makeDeps()
    for (let i = 0; i < 5; i++) {
      const r = await handleLeadSubmission(basePayload({ email: `jamie${i}@example.com` }), deps)
      expect(r.status).toBe(200)
    }
    const sixth = await handleLeadSubmission(basePayload({ email: 'jamie6@example.com' }), deps)
    expect(sixth.status).toBe(429)
    expect(deps.inserted.length).toBe(5)
  })

  it('a repeated-tap duplicate submission from the same caller is still just a normal rate-limited request — never a raw error, never a duplicate DB row beyond the limit', async () => {
    const deps = makeDeps()
    await handleLeadSubmission(basePayload(), deps)
    await handleLeadSubmission(basePayload(), deps)
    expect(deps.inserted.length).toBe(2)
    for (let i = 0; i < 10; i++) await handleLeadSubmission(basePayload(), deps)
    expect(deps.inserted.length).toBe(5) // never exceeds the configured cap regardless of tap count
  })

  it('never exposes a raw server error on a DB failure', async () => {
    const deps = makeDeps({ insertLead: async () => { throw new Error('connection refused to db.internal:5432') } })
    const result = await handleLeadSubmission(basePayload(), deps)
    expect(result.status).toBe(500)
    expect((result.body as { error: string }).error).not.toMatch(/connection refused|db\.internal|5432/)
  })

  it('never exposes a raw error when insertLead resolves null (e.g. an RLS/insert failure)', async () => {
    const deps = makeDeps({ insertLead: async () => null })
    const result = await handleLeadSubmission(basePayload(), deps)
    expect(result.status).toBe(500)
    expect((result.body as { error: string }).error).not.toMatch(/postgres|supabase|row-level|rls/i)
  })

  it('never sends a notification when persistence failed — notify only ever fires after a successful insert', async () => {
    const failedInsert = makeDeps({ insertLead: async () => null })
    await handleLeadSubmission(basePayload(), failedInsert)
    expect(failedInsert.notified.length).toBe(0)

    const thrownInsert = makeDeps({ insertLead: async () => { throw new Error('db down') } })
    await handleLeadSubmission(basePayload(), thrownInsert)
    expect(thrownInsert.notified.length).toBe(0)
  })
})
