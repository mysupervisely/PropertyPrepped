import { describe, expect, it } from 'vitest'
import { buildNotificationFeed, titleForEvent, navHrefForEvent, unreadCount, type NotificationEventRow, type NotificationContext } from './events'

const BASE_CTX: NotificationContext = {
  properties: [{ id: 'prop-1', address: '123 Harbor Lane', city: 'Tampa' }],
  maintenanceRequests: [{ id: 'case-1', tenant_name: 'Jordan Reyes' }],
  conversations: [{ id: 'convo-1', tenant_access_id: 'access-1' }],
  access: [{ id: 'access-1', tenant_email: 'jordan@example.test', lease_id: 'lease-1' }],
  leases: [{ id: 'lease-1', tenant_name: 'Jordan Reyes' }],
  outreach: [{ id: 'outreach-1', contact_id: 'contact-1' }],
  contacts: [{ id: 'contact-1', name: 'Marcus Bell' }],
}

function row(partial: Partial<NotificationEventRow>): NotificationEventRow {
  return {
    id: 'evt-1', seq: 1, event_type: 'tenant_message', property_id: 'prop-1', conversation_id: 'convo-1',
    maintenance_request_id: null, tenant_access_id: null, outreach_id: null, metadata: {},
    read_at: null, created_at: '2026-01-01T00:00:00Z',
    ...partial,
  }
}

describe('titleForEvent', () => {
  it('tenant_message resolves the tenant name via conversation -> access -> lease', () => {
    expect(titleForEvent(row({ event_type: 'tenant_message' }), BASE_CTX)).toBe('New message from Jordan Reyes')
  })

  it('falls back to the access row\'s own tenant_email when there is no lease match', () => {
    const ctx: NotificationContext = { ...BASE_CTX, leases: [] }
    expect(titleForEvent(row({ event_type: 'tenant_message' }), ctx)).toBe('New message from jordan@example.test')
  })

  it('tenant_maintenance_request reuses the real category label helper, never a fabricated one', () => {
    const r = row({ event_type: 'tenant_maintenance_request', metadata: { category: 'plumbing' } })
    expect(titleForEvent(r, BASE_CTX)).toContain('Plumbing')
    expect(titleForEvent(r, BASE_CTX)).toContain('Jordan Reyes')
  })

  it('maintenance_status_change reads the tenant name directly off the linked maintenance_requests row', () => {
    const r = row({ event_type: 'maintenance_status_change', maintenance_request_id: 'case-1', metadata: { status: 'Resolved' } })
    expect(titleForEvent(r, BASE_CTX)).toBe("Jordan Reyes's case moved to Resolved")
  })

  it('maintenance_status_change degrades gracefully when the case can no longer be found', () => {
    const r = row({ event_type: 'maintenance_status_change', maintenance_request_id: 'missing-case', metadata: { status: 'Resolved' } })
    expect(titleForEvent(r, BASE_CTX)).toBe('A maintenance case moved to Resolved')
  })

  it('propcrew_outreach_response names the real PropCrew contact', () => {
    const r = row({ event_type: 'propcrew_outreach_response', outreach_id: 'outreach-1', metadata: { status: 'accepted' } })
    expect(titleForEvent(r, BASE_CTX)).toBe('Marcus Bell accepted your request')
  })

  it('tenant_invite_accepted names the tenant via the access row directly', () => {
    const r = row({ event_type: 'tenant_invite_accepted', tenant_access_id: 'access-1' })
    expect(titleForEvent(r, BASE_CTX)).toBe('Jordan Reyes accepted your invitation')
  })
})

describe('navHrefForEvent', () => {
  it('message and tenant-request events link to the existing Tenant Connect inbox, never a new thread UI', () => {
    expect(navHrefForEvent(row({ event_type: 'tenant_message' }))).toBe('/tenant-connect')
    expect(navHrefForEvent(row({ event_type: 'tenant_maintenance_request' }))).toBe('/tenant-connect')
  })

  it('maintenance and outreach events link to the existing portfolio Maintenance page', () => {
    expect(navHrefForEvent(row({ event_type: 'maintenance_status_change' }))).toBe('/maintenance')
    expect(navHrefForEvent(row({ event_type: 'propcrew_outreach_response' }))).toBe('/maintenance')
  })

  it('invite-accepted links to Tenant Connect\'s own Tenants tab via the existing ?tab= param', () => {
    expect(navHrefForEvent(row({ event_type: 'tenant_invite_accepted' }))).toBe('/tenant-connect?tab=tenants')
  })
})

describe('buildNotificationFeed', () => {
  it('sorts newest first, by seq — never by created_at, which can tie between rows inserted in the same transaction', () => {
    const rows = [
      row({ id: 'old', seq: 1, created_at: '2026-01-01T00:00:00Z' }),
      // Identical created_at on purpose: reproduces the real tie
      // Postgres produces for two rows in one transaction. If sorting
      // ever regressed to created_at, this would fail non-deterministically.
      row({ id: 'new', seq: 2, created_at: '2026-01-01T00:00:00Z' }),
    ]
    expect(buildNotificationFeed(rows, BASE_CTX).map((i) => i.id)).toEqual(['new', 'old'])
  })

  it('unread is a direct read of read_at === null, never computed from anything else', () => {
    const rows = [row({ id: 'a', read_at: null }), row({ id: 'b', read_at: '2026-01-02T00:00:00Z' })]
    const feed = buildNotificationFeed(rows, BASE_CTX)
    expect(feed.find((i) => i.id === 'a')?.unread).toBe(true)
    expect(feed.find((i) => i.id === 'b')?.unread).toBe(false)
  })

  it('carries a null propertyLabel when the row has no property_id, rather than a fabricated label', () => {
    const feed = buildNotificationFeed([row({ property_id: null })], BASE_CTX)
    expect(feed[0].propertyLabel).toBeNull()
  })
})

describe('unreadCount', () => {
  it('counts only rows with read_at === null', () => {
    expect(unreadCount([{ read_at: null }, { read_at: null }, { read_at: '2026-01-01T00:00:00Z' }])).toBe(2)
    expect(unreadCount([])).toBe(0)
  })
})
