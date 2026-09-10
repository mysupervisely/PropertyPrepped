import { describe, expect, it, vi, afterEach } from 'vitest'
import { buildInviteEmail, buildNewRequestEmail, buildLandlordUpdateEmail, isTenantConnectEmailConfigured, sendTenantConnectEmail, tenantInviteLink, landlordRequestLink, tenantPortalLink } from './notify'

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

  // Bug fix (real-device testing, PR #60): "not consistently presenting
  // a usable clickable link" — plain-text-only email relies entirely on
  // a mail client's own best-effort auto-linking of a bare URL. Every
  // Tenant Connect email now also carries a real HTML variant with a
  // clickable button.
  it('the html variant includes the same link as a clickable button, not just plain text', () => {
    const email = buildInviteEmail('5531 Turtle Crossing Loop', 'https://proproster.com/tenant?invite=abc-123')
    expect(email.html).toBeTruthy()
    expect(email.html).toContain('href="https://proproster.com/tenant?invite=abc-123"')
    expect(email.html).toContain('Connect to your rental')
  })
})

describe('buildNewRequestEmail', () => {
  it('includes the category\'s human-readable label (not its raw machine id), title, and property in the landlord notification', () => {
    const email = buildNewRequestEmail('5531 Turtle Crossing Loop', 'plumbing', 'Kitchen sink leaking', 'https://proproster.com/?openProperty=p1&openTab=Rent&openRentSubTab=Tenant')
    expect(email.subject).toContain('5531 Turtle Crossing Loop')
    expect(email.body).toContain('Plumbing')
    expect(email.body).not.toContain('plumbing request') // the raw id must never leak into recipient-facing copy
    expect(email.body).toContain('Kitchen sink leaking')
  })

  it('includes the specific property/request destination as a usable link in both the plain-text and html variants — never a bare homepage link', () => {
    const url = 'https://proproster.com/?openProperty=p1&openTab=Rent&openRentSubTab=Tenant'
    const email = buildNewRequestEmail('5531 Turtle Crossing Loop', 'plumbing', 'Kitchen sink leaking', url)
    expect(email.body).toContain(url)
    expect(email.body).toContain('openProperty=p1') // the specific property/request deep link, never a bare homepage URL
    expect(email.html).toContain(`href="${url}"`)
    expect(email.html).toContain('Open the request')
  })
})

describe('buildLandlordUpdateEmail', () => {
  it('references the request title and property without echoing message content', () => {
    const email = buildLandlordUpdateEmail('5531 Turtle Crossing Loop', 'Kitchen sink leaking', 'https://proproster.com/tenant')
    expect(email.subject).toContain('5531 Turtle Crossing Loop')
    expect(email.body).toContain('Kitchen sink leaking')
  })

  it('links to the Tenant Portal (not the landlord homepage) as a usable link in both variants', () => {
    const email = buildLandlordUpdateEmail('5531 Turtle Crossing Loop', 'Kitchen sink leaking', 'https://proproster.com/tenant')
    expect(email.body).toContain('https://proproster.com/tenant')
    expect(email.html).toContain('href="https://proproster.com/tenant"')
    expect(email.html).toContain('Open your Tenant Portal')
  })
})

describe('landlordRequestLink', () => {
  it('deep-links to the specific property\'s Rent > Tenant tab via the existing ?openProperty=/?openTab=/?openRentSubTab= mechanism (app/page.tsx), never the bare homepage', () => {
    expect(landlordRequestLink('https://proproster.com', 'prop-1')).toBe('https://proproster.com/?openProperty=prop-1&openTab=Rent&openRentSubTab=Tenant')
  })

  it('strips a trailing slash on the origin (same convention as tenantInviteLink/providerOutreachLink)', () => {
    expect(landlordRequestLink('https://proproster.com/', 'prop-1')).toBe('https://proproster.com/?openProperty=prop-1&openTab=Rent&openRentSubTab=Tenant')
  })
})

describe('tenantPortalLink', () => {
  it('links to /tenant — the same dedicated route the invite email itself uses', () => {
    expect(tenantPortalLink('https://proproster.com')).toBe('https://proproster.com/tenant')
  })

  it('strips a trailing slash on the origin', () => {
    expect(tenantPortalLink('https://proproster.com/')).toBe('https://proproster.com/tenant')
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

  it('forwards the html variant to Resend when the email includes one, so the link renders as a real clickable button, not just plain text', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: Record<string, unknown>) => ({ ok: true, status: 200, text: async () => '' }) as Response)
    vi.stubGlobal('fetch', fetchMock)

    await sendTenantConnectEmail('tenant@example.com', { subject: 'x', body: 'y', html: '<p>y</p>' }, FULL_ENV)

    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }]
    const body = JSON.parse(init.body)
    expect(body.html).toBe('<p>y</p>')
  })

  it('omits html from the Resend payload when the email has none (backward compatible — never sends an empty/undefined html field)', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: Record<string, unknown>) => ({ ok: true, status: 200, text: async () => '' }) as Response)
    vi.stubGlobal('fetch', fetchMock)

    await sendTenantConnectEmail('tenant@example.com', { subject: 'x', body: 'y' }, FULL_ENV)

    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }]
    const body = JSON.parse(init.body)
    expect('html' in body).toBe(false)
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
