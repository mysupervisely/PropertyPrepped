import { describe, expect, it, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildLeadNotificationEmail, isEmailNotificationConfigured, sendLeadNotificationEmail } from './notify'
import type { RealtorLeadRow } from './types'

function baseLead(overrides: Partial<RealtorLeadRow> = {}): RealtorLeadRow {
  return {
    id: 'lead-1',
    created_at: '2026-08-20T00:00:00Z',
    updated_at: '2026-08-20T00:00:00Z',
    owner_user_id: null,
    source: 'rental_analyzer',
    property_address: '17 Amaryllis Ln, Tampa, FL 33602',
    city: 'Tampa',
    state: 'FL',
    zip: '33602',
    geography_bucket: 'Tampa Bay Area',
    name: 'Jamie Rivera',
    email: 'jamie@example.com',
    phone: null,
    preferred_contact_method: 'Email',
    message: null,
    consent_at: '2026-08-20T00:00:00Z',
    analysis_snapshot: { source: 'rental_analyzer', purchasePrice: 350000, capRatePercent: 6.2 },
    status: 'New',
    referred_to_name: null,
    referred_to_email: null,
    referred_to_state: null,
    notes: null,
    ...overrides,
  }
}

describe('buildLeadNotificationEmail', () => {
  it('builds the exact subject format for a rental analyzer lead', () => {
    const email = buildLeadNotificationEmail(baseLead())
    expect(email.subject).toBe('New PropRoster Investment Lead - 17 Amaryllis Ln, Tampa, FL 33602')
  })

  it('builds the exact subject format for a home purchase lead', () => {
    const email = buildLeadNotificationEmail(baseLead({ source: 'home_purchase', property_address: '1 Main St, Austin, TX' }))
    expect(email.subject).toBe('New PropRoster Home Buyer Lead - 1 Main St, Austin, TX')
  })

  it('falls back to a clean subject with no address suffix when the visitor never supplied a property address — never fabricates one, never leaves a broken "- address not provided" tail', () => {
    const homeBuyer = buildLeadNotificationEmail(baseLead({ source: 'home_purchase', property_address: null }))
    expect(homeBuyer.subject).toBe('New PropRoster Home Buyer Lead')
    expect(homeBuyer.subject).not.toContain('address not provided')
    expect(homeBuyer.subject).not.toContain(' - ')

    const investor = buildLeadNotificationEmail(baseLead({ source: 'rental_analyzer', property_address: null }))
    expect(investor.subject).toBe('New PropRoster Investment Lead')
    expect(investor.subject).not.toContain('address not provided')
  })

  it('the body still says "Not provided" for a missing address — only the subject fallback changed', () => {
    const email = buildLeadNotificationEmail(baseLead({ property_address: null }))
    expect(email.body).toContain('Address: Not provided')
  })

  it('includes contact details, property, geography, and analysis metrics', () => {
    const email = buildLeadNotificationEmail(baseLead())
    expect(email.body).toContain('Jamie Rivera')
    expect(email.body).toContain('jamie@example.com')
    expect(email.body).toContain('Tampa Bay Area')
    expect(email.body).toContain('17 Amaryllis Ln, Tampa, FL 33602')
    expect(email.body).toContain('$350,000')
    expect(email.body).toContain('6.2%')
  })

  it('includes the optional message only when present', () => {
    const withMessage = buildLeadNotificationEmail(baseLead({ message: 'Please call after 5pm.' }))
    expect(withMessage.body).toContain('Please call after 5pm.')
    const withoutMessage = buildLeadNotificationEmail(baseLead({ message: null }))
    expect(withoutMessage.body).not.toContain('Message from the visitor')
  })

  it('never includes anything beyond the lead row itself — no secret/internal data', () => {
    const email = buildLeadNotificationEmail(baseLead())
    expect(email.body).not.toMatch(/service.?role/i)
    expect(email.body).not.toMatch(/api.?key/i)
  })
})

const FULL_ENV = {
  RESEND_API_KEY: 're_test_123',
  REALTOR_LEAD_NOTIFICATION_EMAIL: 'hello@proproster.com',
  REALTOR_LEAD_FROM_EMAIL: 'notifications@proproster.com',
}

describe('isEmailNotificationConfigured', () => {
  it('is false when nothing is set', () => {
    expect(isEmailNotificationConfigured({})).toBe(false)
  })

  it('requires ALL three env vars — any single one missing is treated as fully unconfigured, never a partial send', () => {
    expect(isEmailNotificationConfigured({ REALTOR_LEAD_NOTIFICATION_EMAIL: 'x@example.com', REALTOR_LEAD_FROM_EMAIL: 'y@example.com' })).toBe(false)
    expect(isEmailNotificationConfigured({ RESEND_API_KEY: 're_x', REALTOR_LEAD_FROM_EMAIL: 'y@example.com' })).toBe(false)
    expect(isEmailNotificationConfigured({ RESEND_API_KEY: 're_x', REALTOR_LEAD_NOTIFICATION_EMAIL: 'x@example.com' })).toBe(false)
  })

  it('is true when all three are set', () => {
    expect(isEmailNotificationConfigured(FULL_ENV)).toBe(true)
  })
})

describe('sendLeadNotificationEmail', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('never throws when unconfigured, and reports sent:false honestly rather than fabricating success', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await sendLeadNotificationEmail(baseLead(), {})
    expect(result).toEqual({ sent: false, reason: 'not_configured' })
    spy.mockRestore()
  })

  it('never calls the network at all when unconfigured', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await sendLeadNotificationEmail(baseLead(), {})
    expect(fetchMock).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('sends via Resend with the correct endpoint, headers, and body when fully configured', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: Record<string, unknown>) => ({ ok: true, status: 200, text: async () => '{"id":"re_msg_abc123"}' }) as Response)
    vi.stubGlobal('fetch', fetchMock)

    const result = await sendLeadNotificationEmail(baseLead(), FULL_ENV)

    expect(result).toEqual({ sent: true, messageId: 're_msg_abc123' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, { method: string; headers: Record<string, string>; body: string }]
    expect(url).toBe('https://api.resend.com/emails')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer re_test_123')
    expect(init.headers['Content-Type']).toBe('application/json')
    const sentBody = JSON.parse(init.body)
    expect(sentBody.from).toBe('notifications@proproster.com')
    expect(sentBody.to).toBe('hello@proproster.com')
    expect(sentBody.subject).toBe('New PropRoster Investment Lead - 17 Amaryllis Ln, Tampa, FL 33602')
    expect(sentBody.text).toContain('Jamie Rivera')
  })

  it('sets reply_to to the lead\'s own email when they gave one, so a reply goes straight to them', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: Record<string, unknown>) => ({ ok: true, status: 200, text: async () => '{"id":"re_msg_1"}' }) as Response)
    vi.stubGlobal('fetch', fetchMock)
    await sendLeadNotificationEmail(baseLead({ email: 'jamie@example.com' }), FULL_ENV)
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }]
    expect(JSON.parse(init.body).reply_to).toBe('jamie@example.com')
  })

  it('omits reply_to entirely (never sends an empty/undefined value) when the lead gave no email', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: Record<string, unknown>) => ({ ok: true, status: 200, text: async () => '{"id":"re_msg_2"}' }) as Response)
    vi.stubGlobal('fetch', fetchMock)
    await sendLeadNotificationEmail(baseLead({ email: null, phone: '555-123-4567' }), FULL_ENV)
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }]
    expect(JSON.parse(init.body)).not.toHaveProperty('reply_to')
  })

  it('captures and logs the Resend message id on a successful send, keyed by leadId only — never by email/phone/message content', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, text: async () => '{"id":"re_msg_xyz"}' }) as Response))
    const result = await sendLeadNotificationEmail(baseLead({ id: 'lead-42' }), FULL_ENV)
    expect(result.messageId).toBe('re_msg_xyz')
    expect(logSpy).toHaveBeenCalledWith('realtor-leads: Resend accepted the lead notification email', { leadId: 'lead-42', resendMessageId: 're_msg_xyz' })
    const loggedArgs = JSON.stringify(logSpy.mock.calls)
    expect(loggedArgs).not.toContain('jamie@example.com')
    logSpy.mockRestore()
  })

  it('never throws and leaves messageId undefined when Resend returns a 200 with a non-JSON/empty body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, text: async () => '' }) as Response))
    const result = await sendLeadNotificationEmail(baseLead(), FULL_ENV)
    expect(result.sent).toBe(true)
    expect(result.messageId).toBeUndefined()
  })

  it('reports sent:false (not a throw) on a non-2xx Resend response, and logs server-side without exposing the raw body to the caller', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fetchMock = vi.fn(async () => ({ ok: false, status: 422, text: async () => '{"message":"Invalid `from` field"}' }) as Response)
    vi.stubGlobal('fetch', fetchMock)

    const result = await sendLeadNotificationEmail(baseLead(), FULL_ENV)

    expect(result).toEqual({ sent: false, reason: 'provider_error' })
    expect(JSON.stringify(result)).not.toContain('Invalid `from` field')
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('reports sent:false (not a throw) when the network call itself throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('getaddrinfo ENOTFOUND api.resend.com') }))

    const result = await sendLeadNotificationEmail(baseLead(), FULL_ENV)

    expect(result).toEqual({ sent: false, reason: 'provider_error' })
    expect(JSON.stringify(result)).not.toContain('ENOTFOUND')
    spy.mockRestore()
  })

  it('never leaks the API key into the returned result, whatever the outcome', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, text: async () => '' }) as Response))
    const result = await sendLeadNotificationEmail(baseLead(), FULL_ENV)
    expect(JSON.stringify(result)).not.toContain('re_test_123')
  })

  it('always sends to whatever REALTOR_LEAD_NOTIFICATION_EMAIL resolves to, not a fixed address', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: Record<string, unknown>) => ({ ok: true, status: 200, text: async () => '' }) as Response)
    vi.stubGlobal('fetch', fetchMock)
    await sendLeadNotificationEmail(baseLead(), { ...FULL_ENV, REALTOR_LEAD_NOTIFICATION_EMAIL: 'proprosterteam@gmail.com' })
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }]
    expect(JSON.parse(init.body).to).toBe('proprosterteam@gmail.com')
  })
})

describe('Documents + Navigation + Realtor Connect Polish, Section 9 — recipient is never hardcoded in source', () => {
  // The production notification recipient changes (hello@proproster.com
  // -> proprosterteam@gmail.com, a Netlify env var change made outside
  // this repo, Section 17) without touching a single line of code —
  // this file only ever reads process.env.REALTOR_LEAD_NOTIFICATION_EMAIL
  // (see isEmailNotificationConfigured/sendLeadNotificationEmail above).
  // This is a structural guard, same source-read technique as
  // lib/investment-tools/evaluator-layout-order.test.ts: neither the old
  // forwarding address nor the new direct inbox is ever literally present
  // in source.
  const ROOT = join(__dirname, '..', '..')
  function readFile(relativePath: string): string {
    return readFileSync(join(ROOT, relativePath), 'utf8')
  }

  it.each([
    'lib/realtor-leads/notify.ts',
    'app/api/realtor-leads/route.ts',
    'components/RealtorConnect/RealtorConnectModal.tsx',
    'components/RealtorConnect/RealtorConnectCTA.tsx',
  ])('%s never hardcodes a notification recipient address', (path) => {
    const source = readFile(path)
    expect(source).not.toContain('proprosterteam@gmail.com')
    expect(source).not.toContain('hello@proproster.com')
  })
})
