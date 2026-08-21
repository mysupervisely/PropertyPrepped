import { describe, expect, it, vi, afterEach } from 'vitest'
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
    const fetchMock = vi.fn(async (_url: string, _init: Record<string, unknown>) => ({ ok: true, status: 200, text: async () => '' }) as Response)
    vi.stubGlobal('fetch', fetchMock)

    const result = await sendLeadNotificationEmail(baseLead(), FULL_ENV)

    expect(result).toEqual({ sent: true })
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
})
