import { describe, expect, it } from 'vitest'
import { buildLandlordDigestEmail, buildLandlordDigestSubject, digestDetailLine } from './landlord-digest-email'
import type { DigestGroup } from './landlord-digest-items'
import type { DashboardDateItem } from '../dashboard/attention'

function item(overrides: Partial<DashboardDateItem>): DashboardDateItem {
  return {
    id: 'i1', type: 'Lease', label: 'Lease expiring soon', description: 'Alex Rivera',
    propertyId: 'p1', propertyLabel: '123 Main Street', date: '2026-10-10', daysUntil: 24,
    urgency: 'Upcoming', nav: { tab: 'Rent', rentSubTab: 'Lease' },
    ...overrides,
  }
}

describe('buildLandlordDigestSubject', () => {
  it('singular for exactly one item', () => {
    expect(buildLandlordDigestSubject(1)).toBe('PropRoster: 1 thing needs your attention')
  })
  it('plural with the count for more than one', () => {
    expect(buildLandlordDigestSubject(3)).toBe('PropRoster: 3 things need your attention')
  })
})

describe('digestDetailLine', () => {
  it('appends a future day count for date-driven types', () => {
    expect(digestDetailLine(item({ type: 'Lease', label: 'Lease expiring soon', daysUntil: 24 }))).toBe('Lease expiring soon (in 24 days)')
  })
  it('appends "today" for daysUntil === 0 on a date-driven type', () => {
    expect(digestDetailLine(item({ type: 'Insurance', label: 'Insurance expiring soon', daysUntil: 0 }))).toBe('Insurance expiring soon (today)')
  })
  it('appends a past day count for an already-expired date-driven item', () => {
    expect(digestDetailLine(item({ type: 'Mortgage', label: 'Mortgage matured', daysUntil: -3 }))).toBe('Mortgage matured (3 days ago)')
  })
  it('singular "day" wording for exactly 1', () => {
    expect(digestDetailLine(item({ type: 'System', label: 'Warranty expiring soon', daysUntil: 1 }))).toBe('Warranty expiring soon (in 1 day)')
    expect(digestDetailLine(item({ type: 'System', label: 'Warranty expired', daysUntil: -1 }))).toBe('Warranty expired (1 day ago)')
  })
  it('Rent and TenantRequest labels are already complete sentences — no day count appended', () => {
    expect(digestDetailLine(item({ type: 'Rent', label: 'Rent overdue', daysUntil: 0 }))).toBe('Rent overdue')
    expect(digestDetailLine(item({ type: 'TenantRequest', label: 'New maintenance request', daysUntil: 0 }))).toBe('New maintenance request')
  })
})

describe('buildLandlordDigestEmail', () => {
  const groups: DigestGroup[] = [
    { name: 'Rent', items: [item({ id: 'r1', type: 'Rent', label: 'Rent overdue', propertyLabel: '123 Main Street', daysUntil: -3, urgency: 'Expired', nav: { tab: 'Rent', rentSubTab: 'Lease' } })] },
    { name: 'Leases', items: [item({ id: 'l1', type: 'Lease', label: 'Lease expiring soon', propertyLabel: '456 Oak Avenue', daysUntil: 24, urgency: 'Upcoming', propertyId: 'p2', nav: { tab: 'Rent', rentSubTab: 'Lease' } })] },
  ]

  it('subject reflects the total item count across all groups', () => {
    const email = buildLandlordDigestEmail(groups, 'https://proproster.com')
    expect(email.subject).toBe('PropRoster: 2 things need your attention')
  })

  it('text includes each group heading, property label, and detail line', () => {
    const email = buildLandlordDigestEmail(groups, 'https://proproster.com')
    expect(email.text).toContain('RENT')
    expect(email.text).toContain('123 Main Street — Rent overdue')
    expect(email.text).toContain('LEASES')
    expect(email.text).toContain('456 Oak Avenue — Lease expiring soon (in 24 days)')
    expect(email.text).toContain('View in PropRoster:')
    expect(email.text).toContain('https://proproster.com/')
  })

  it('html contains a deep link for each item and one primary CTA to the dashboard', () => {
    const email = buildLandlordDigestEmail(groups, 'https://proproster.com')
    expect(email.html).toContain('https://proproster.com/?openProperty=p1&openTab=Rent&openRentSubTab=Lease')
    expect(email.html).toContain('https://proproster.com/?openProperty=p2&openTab=Rent&openRentSubTab=Lease')
    expect(email.html).toContain('>View in PropRoster<')
    expect((email.html.match(/View in PropRoster/g) || []).length).toBe(1)
  })

  it('html escapes dynamic property-label/detail text', () => {
    const withUnsafe: DigestGroup[] = [{ name: 'Leases', items: [item({ propertyLabel: '123 <b>Main</b> & Co', label: 'Lease "expiring"' })] }]
    const email = buildLandlordDigestEmail(withUnsafe, 'https://proproster.com')
    expect(email.html).not.toContain('<b>Main</b>')
    expect(email.html).toContain('123 &lt;b&gt;Main&lt;/b&gt; &amp; Co')
  })

  it('mentions the opt-out path (Profile > Notifications) so this never reads as an unexplained email', () => {
    const email = buildLandlordDigestEmail(groups, 'https://proproster.com')
    expect(email.html.toLowerCase()).toContain('profile')
    expect(email.html.toLowerCase()).toContain('notifications')
  })

  it('never mentions rent COLLECTION — PropRoster records rent after money arrives, it does not collect it', () => {
    const email = buildLandlordDigestEmail(groups, 'https://proproster.com')
    expect(email.text.toLowerCase()).not.toMatch(/collect(s|ing)? rent|rent collection/)
    expect(email.html.toLowerCase()).not.toMatch(/collect(s|ing)? rent|rent collection/)
  })

  it('never claims or implies an autonomous action was taken', () => {
    const email = buildLandlordDigestEmail(groups, 'https://proproster.com')
    expect(email.text.toLowerCase()).not.toMatch(/we (contacted|assigned|scheduled|authorized|approved|hired)/)
  })
})
