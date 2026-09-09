import { describe, expect, it, vi, afterEach } from 'vitest'
import { buildInviteEmail, buildNewRequestEmail, buildLandlordUpdateEmail, isTenantConnectEmailConfigured, sendTenantConnectEmail, tenantInviteLink } from './notify'

const FULL_ENV = { RESEND_API_KEY: 're_test_key', TENANT_CONNECT_FROM_EMAIL: 'tenantconnect@proproster.com' }

describe('tenantInviteLink', () => {
  it('builds a /tenant?invite=<accessId> link from the given origin', () => {
    expect(tenantInviteLink('https://proproster.com', 'access-123')).toBe('https://proproster.com/tenant?invite=access-123')
  })

  it('strips a trailing slash on the origin (same convention as providerOutreachLink)', () => {
    expect(tenantInviteLink('https://proproster.com/', 'access-123')).toBe('https://proproster.com/tenant?invite=access-123')
  })

  it('works against a Deploy Preview origin — never a hardcoded/env-var host', () => {
    expect(tenantInviteLink('https://deploy-preview-60--sensational-platypus-3da0b7.netlify.app', 'a1')).toBe(
      'https://deploy-preview-60--sensational-platypus-3da0b7.netlify.app/tenant?invite=a1',
    )
  })
})

describe('buildInviteEmail', () => {
  // Tenant-Facing Experience V1: the milestone's own explicit
  // instruction ("Invitation email should contain a clear 'Connect to
  // your rental' button/link") supersedes this file's earlier
  // no-link design — see buildInviteEmail's own updated header for why
  // this is still safe: the link is never a bearer credential, only a
  // deep-link into the tenant sign-in flow.
  it('addresses the invite to the property and includes the "Connect to your rental" link, dynamically — never hardcoded', () => {
    const email = buildInviteEmail('5531 Turtle Crossing Loop', 'https://proproster.com/tenant?invite=abc-123')
    expect(email.subject).toContain('invited')
    expect(email.body).toContain('5531 Turtle Crossing Loop')
    expect(email.body).toContain('Connect to your rental')
    expect(email.body).toContain('https://proproster.com/tenant?invite=abc-123')
  })

  it('never hardcodes an example property address or link', () => {
    const email = buildInviteEmail('9 Example Ave', 'https://proproster.com/tenant?invite=xyz-789')
    expect(email.body).not.toContain('5531 Turtle Crossing Loop')
    expect(email.body).not.toContain('abc-123')
  })
})

describe('buildNewRequestEmail', () => {
  it('includes the category\'s human-readable label (not its raw machine id), title, and property in the landlord notification', () => {
    const email = buildNewRequestEmail('5531 Turtle Crossing Loop', 'plumbing', 'Kitchen sink leaking')
    expect(email.subject).toContain('5531 Turtle Crossing Loop')
    expect(email.body).toContain('Plumbing')
    expect(email.body).not.toContain('plumbing request') // the raw id must never leak into recipient-facing copy
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
