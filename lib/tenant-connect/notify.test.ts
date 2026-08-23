import { describe, expect, it, vi, afterEach } from 'vitest'
import { buildInviteEmail, buildNewRequestEmail, buildLandlordUpdateEmail, isTenantConnectEmailConfigured, sendTenantConnectEmail } from './notify'

const FULL_ENV = { RESEND_API_KEY: 're_test_key', TENANT_CONNECT_FROM_EMAIL: 'tenantconnect@proproster.com' }

describe('buildInviteEmail', () => {
  it('addresses the invite to the property, never echoes a raw token/link', () => {
    const email = buildInviteEmail('5531 Turtle Crossing Loop')
    expect(email.subject).toContain('invited')
    expect(email.body).toContain('5531 Turtle Crossing Loop')
    expect(email.body).not.toMatch(/https?:\/\//)
  })
})

describe('buildNewRequestEmail', () => {
  it('includes the category, title, and property in the landlord notification', () => {
    const email = buildNewRequestEmail('5531 Turtle Crossing Loop', 'Plumbing', 'Kitchen sink leaking')
    expect(email.subject).toContain('5531 Turtle Crossing Loop')
    expect(email.body).toContain('Plumbing')
    expect(email.body).toContain('Kitchen sink leaking')
  })
})

describe('buildLandlordUpdateEmail', () => {
  it('references the request title and property without echoing message content', () => {
    const email = buildLandlordUpdateEmail('5531 Turtle Crossing Loop', 'Kitchen sink leaking')
    expect(email.subject).toContain('5531 Turtle Crossing Loop')
    expect(email.body).toContain('Kitchen sink leaking')
  })
})

describe('isTenantConnectEmailConfigured', () => {
  it('is false with no env vars set', () => {
    expect(isTenantConnectEmailConfigured({})).toBe(false)
  })
  it('is false with only one of the two required vars', () => {
    expect(isTenantConnectEmailConfigured({ RESEND_API_KEY: 're_x' })).toBe(false)
    expect(isTenantConnectEmailConfigured({ TENANT_CONNECT_FROM_EMAIL: 'x@example.com' })).toBe(false)
  })
  it('is true once both are present', () => {
    expect(isTenantConnectEmailConfigured(FULL_ENV)).toBe(true)
  })
})

describe('sendTenantConnectEmail', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns { sent: false, reason: "not_configured" } and never calls fetch when unconfigured', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const result = await sendTenantConnectEmail('tenant@example.com', { subject: 'x', body: 'y' }, {})
    expect(result).toEqual({ sent: false, reason: 'not_configured' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('posts to Resend with the right recipient/subject/body/from when configured', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: Record<string, unknown>) => ({ ok: true, status: 200, text: async () => '' }) as Response)
    vi.stubGlobal('fetch', fetchMock)

    const result = await sendTenantConnectEmail('tenant@example.com', { subject: 'You\'ve been invited', body: 'Hello' }, FULL_ENV)

    expect(result).toEqual({ sent: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, { method: string; headers: Record<string, string>; body: string }]
    expect(url).toBe('https://api.resend.com/emails')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer re_test_key')
    const body = JSON.parse(init.body)
    expect(body.from).toBe('tenantconnect@proproster.com')
    expect(body.to).toBe('tenant@example.com')
    expect(body.subject).toBe('You\'ve been invited')
    expect(body.text).toBe('Hello')
  })

  it('returns { sent: false, reason: "provider_error" } and never throws on a non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 422, text: async () => '{"message":"Invalid"}' }) as Response))
    const result = await sendTenantConnectEmail('tenant@example.com', { subject: 'x', body: 'y' }, FULL_ENV)
    expect(result).toEqual({ sent: false, reason: 'provider_error' })
  })

  it('returns { sent: false, reason: "provider_error" } and never throws on a network error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('getaddrinfo ENOTFOUND api.resend.com') }))
    const result = await sendTenantConnectEmail('tenant@example.com', { subject: 'x', body: 'y' }, FULL_ENV)
    expect(result).toEqual({ sent: false, reason: 'provider_error' })
  })
})
