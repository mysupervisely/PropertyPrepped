import { describe, expect, it, vi, afterEach } from 'vitest'
import { buildInviteEmail, buildNewRequestEmail, buildLandlordUpdateEmail, isTenantConnectEmailConfigured, sendTenantConnectEmail, tenantConnectBaseUrl } from './notify'

const FULL_ENV = { RESEND_API_KEY: 're_test_key', TENANT_CONNECT_FROM_EMAIL: 'tenantconnect@proproster.com' }
const ACCESS_ID = 'c0000000-0000-0000-0000-000000000242'

describe('tenantConnectBaseUrl', () => {
  it('prefers an explicit APP_BASE_URL override', () => {
    expect(tenantConnectBaseUrl({ APP_BASE_URL: 'https://override.example', URL: 'https://netlify.example' })).toBe('https://override.example')
  })
  it('falls back to Netlify\'s auto-injected URL — no new required env var', () => {
    expect(tenantConnectBaseUrl({ URL: 'https://sensational-platypus.netlify.app' })).toBe('https://sensational-platypus.netlify.app')
  })
  it('falls back to the known production domain when neither is set', () => {
    expect(tenantConnectBaseUrl({})).toBe('https://proproster.com')
  })
  it('strips a trailing slash so the joined URL never has a double slash', () => {
    expect(tenantConnectBaseUrl({ URL: 'https://proproster.com/' })).toBe('https://proproster.com')
  })
})

describe('buildInviteEmail (Tenant Connect Onboarding V2, Section 2/4)', () => {
  it('includes the "Connect to PropRoster" CTA text and the property address', () => {
    const email = buildInviteEmail('5531 Turtle Crossing Loop', ACCESS_ID, FULL_ENV)
    expect(email.subject).toContain('invited')
    expect(email.body).toContain('5531 Turtle Crossing Loop')
    expect(email.body).toContain('Connect to PropRoster')
    expect(email.html).toContain('Connect to PropRoster')
  })

  it('the plain-text body includes a usable, absolute destination URL', () => {
    const email = buildInviteEmail('5531 Turtle Crossing Loop', ACCESS_ID, FULL_ENV)
    const match = email.body.match(/https?:\/\/\S+/)
    expect(match).not.toBeNull()
    expect(match![0]).toBe(`https://proproster.com/tenant?invite=${ACCESS_ID}`)
  })

  it('the HTML CTA link and the plain-text URL point to the EXACT same destination', () => {
    const email = buildInviteEmail('5531 Turtle Crossing Loop', ACCESS_ID, FULL_ENV)
    const textUrl = email.body.match(/https?:\/\/\S+/)![0]
    const htmlHref = email.html!.match(/href="([^"]+)"/)![1]
    expect(htmlHref).toBe(textUrl)
  })

  it('the URL carries only the existing opaque access id — never a secret, session token, or landlord-only identifier', () => {
    const email = buildInviteEmail('5531 Turtle Crossing Loop', ACCESS_ID, FULL_ENV)
    const url = email.body.match(/https?:\/\/\S+/)![0]
    const parsed = new URL(url)
    expect(parsed.pathname).toBe('/tenant')
    expect([...parsed.searchParams.keys()]).toEqual(['invite'])
    expect(parsed.searchParams.get('invite')).toBe(ACCESS_ID)
    // No API key, service-role key, JWT, or bearer-looking token anywhere in either version.
    for (const text of [email.body, email.html!]) {
      expect(text).not.toMatch(/re_[A-Za-z0-9]/) // Resend key shape
      expect(text).not.toMatch(/service_role|eyJ[A-Za-z0-9_-]{10,}/) // service-role key / raw JWT shape
      expect(text).not.toContain('owner_id')
    }
  })

  it('honors an explicit base URL (e.g. APP_BASE_URL) rather than always hardcoding the production domain', () => {
    const email = buildInviteEmail('5531 Turtle Crossing Loop', ACCESS_ID, { ...FULL_ENV, URL: 'https://main--sensational-platypus-3da0b7.netlify.app' })
    expect(email.body).toContain('https://main--sensational-platypus-3da0b7.netlify.app/tenant?invite=')
  })

  it('preserves the plain-text fallback — body is still plain text, not HTML', () => {
    const email = buildInviteEmail('5531 Turtle Crossing Loop', ACCESS_ID, FULL_ENV)
    expect(email.body).not.toContain('<a ')
    expect(email.body).not.toContain('<div')
  })

  it('the HTML version escapes the property address (no unescaped markup injection from address content)', () => {
    const email = buildInviteEmail('123 Main St <script>alert(1)</script>', ACCESS_ID, FULL_ENV)
    expect(email.html).not.toContain('<script>')
    expect(email.html).toContain('&lt;script&gt;')
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

  it('includes html in the Resend payload when the email carries one (the invite email)', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: Record<string, unknown>) => ({ ok: true, status: 200, text: async () => '' }) as Response)
    vi.stubGlobal('fetch', fetchMock)
    await sendTenantConnectEmail('tenant@example.com', { subject: 'x', body: 'y', html: '<p>y</p>' }, FULL_ENV)
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }]
    expect(JSON.parse(init.body).html).toBe('<p>y</p>')
  })

  it('omits html entirely (never sends an empty/undefined value) when the email has none — every other Tenant Connect email stays text-only', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: Record<string, unknown>) => ({ ok: true, status: 200, text: async () => '' }) as Response)
    vi.stubGlobal('fetch', fetchMock)
    await sendTenantConnectEmail('tenant@example.com', { subject: 'x', body: 'y' }, FULL_ENV)
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }]
    expect(JSON.parse(init.body)).not.toHaveProperty('html')
  })
})
