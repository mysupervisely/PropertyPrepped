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

describe('isEmailNotificationConfigured / sendLeadNotificationEmail', () => {
  afterEach(() => vi.restoreAllMocks())

  it('is false when REALTOR_LEAD_NOTIFICATION_EMAIL is unset', () => {
    expect(isEmailNotificationConfigured({})).toBe(false)
  })

  it('is true when REALTOR_LEAD_NOTIFICATION_EMAIL is set', () => {
    expect(isEmailNotificationConfigured({ REALTOR_LEAD_NOTIFICATION_EMAIL: 'leads@example.com' })).toBe(true)
  })

  it('never throws when unconfigured, and reports sent:false honestly rather than fabricating success', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await sendLeadNotificationEmail(baseLead(), {})
    expect(result).toEqual({ sent: false, reason: 'not_configured' })
    spy.mockRestore()
  })

  it('logs (does not silently drop) the built notification even when a recipient IS configured, since no provider is wired in yet', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await sendLeadNotificationEmail(baseLead(), { REALTOR_LEAD_NOTIFICATION_EMAIL: 'leads@example.com' })
    expect(result).toEqual({ sent: false, reason: 'no_provider_configured' })
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})
