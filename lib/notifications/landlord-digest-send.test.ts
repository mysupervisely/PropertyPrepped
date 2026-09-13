import { describe, expect, it, vi, afterEach } from 'vitest'
import { isLandlordDigestEmailConfigured, sendLandlordDigestEmail } from './landlord-digest-send'

const email = { subject: 'PropRoster: 1 thing needs your attention', text: 'plain text body', html: '<p>html body</p>' }

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('isLandlordDigestEmailConfigured', () => {
  it('false when either env var is missing', () => {
    expect(isLandlordDigestEmailConfigured({})).toBe(false)
    expect(isLandlordDigestEmailConfigured({ RESEND_API_KEY: 're_x' })).toBe(false)
    expect(isLandlordDigestEmailConfigured({ LANDLORD_DIGEST_FROM_EMAIL: 'digest@example.com' })).toBe(false)
  })
  it('true only when both are present', () => {
    expect(isLandlordDigestEmailConfigured({ RESEND_API_KEY: 're_x', LANDLORD_DIGEST_FROM_EMAIL: 'digest@example.com' })).toBe(true)
  })
})

describe('sendLandlordDigestEmail', () => {
  it('never calls fetch when not configured — safe by default (e.g. in a deploy preview with no env vars set)', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const result = await sendLandlordDigestEmail('owner@example.com', email, {})
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result).toEqual({ sent: false, reason: 'not_configured' })
  })

  it('posts subject/text/html to Resend when configured, and reports sent:true on a 2xx response', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: Record<string, unknown>) => ({ ok: true, status: 200, text: async () => '' }) as Response)
    vi.stubGlobal('fetch', fetchMock)
    const env = { RESEND_API_KEY: 're_x', LANDLORD_DIGEST_FROM_EMAIL: 'digest@example.com' }
    const result = await sendLandlordDigestEmail('owner@example.com', email, env)
    expect(result).toEqual({ sent: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, { method: string; headers: Record<string, string>; body: string }]
    expect(url).toBe('https://api.resend.com/emails')
    expect(init.headers.Authorization).toBe('Bearer re_x')
    const body = JSON.parse(init.body)
    expect(body).toEqual({ from: 'digest@example.com', to: 'owner@example.com', subject: email.subject, text: email.text, html: email.html })
  })

  it('never throws on a non-2xx response — reports sent:false, reason: provider_error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 422, text: async () => '{"message":"Invalid from"}' }) as Response))
    const env = { RESEND_API_KEY: 're_x', LANDLORD_DIGEST_FROM_EMAIL: 'digest@example.com' }
    const result = await sendLandlordDigestEmail('owner@example.com', email, env)
    expect(result).toEqual({ sent: false, reason: 'provider_error' })
  })

  it('never throws when fetch itself throws (network error)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('getaddrinfo ENOTFOUND api.resend.com') }))
    const env = { RESEND_API_KEY: 're_x', LANDLORD_DIGEST_FROM_EMAIL: 'digest@example.com' }
    const result = await sendLandlordDigestEmail('owner@example.com', email, env)
    expect(result).toEqual({ sent: false, reason: 'provider_error' })
  })
})
