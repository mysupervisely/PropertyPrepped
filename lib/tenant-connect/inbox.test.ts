import { describe, expect, it } from 'vitest'
import { buildMessageInbox, filterMessageInbox, latestMessageByConversation, summarizeUnreadInbox } from './inbox'

const PROPERTIES = [{ id: 'prop-1', address: '123 Harbor Lane', city: 'Tampa' }]
const ACCESS = [{ id: 'access-1', lease_id: 'lease-1', tenant_email: 'jordan@example.test' }]
const LEASES = [{ id: 'lease-1', tenant_name: 'Jordan Reyes' }]
const CONVERSATIONS = [{ id: 'convo-1', property_id: 'prop-1', tenant_access_id: 'access-1', maintenance_request_id: null, status: 'Open' as const }]

describe('latestMessageByConversation', () => {
  it('picks the most recent message per conversation regardless of input order', () => {
    const messages = [
      { conversation_id: 'c1', message: 'older', created_at: '2026-01-01T00:00:00Z' },
      { conversation_id: 'c1', message: 'newer', created_at: '2026-01-02T00:00:00Z' },
      { conversation_id: 'c2', message: 'other convo', created_at: '2026-01-01T12:00:00Z' },
    ]
    const result = latestMessageByConversation(messages)
    expect(result.get('c1')).toEqual({ message: 'newer', created_at: '2026-01-02T00:00:00Z' })
    expect(result.get('c2')?.message).toBe('other convo')
  })
})

describe('buildMessageInbox', () => {
  it('resolves tenant name via the lease on the conversation\'s own access row', () => {
    const rows = buildMessageInbox(CONVERSATIONS, [], ACCESS, LEASES, PROPERTIES, [], [])
    expect(rows[0].tenantName).toBe('Jordan Reyes')
    expect(rows[0].propertyLabel).toBe('123 Harbor Lane, Tampa')
  })

  it('falls back to the access row\'s own tenant_email when there is no lease match', () => {
    const access = [{ id: 'access-1', lease_id: null, tenant_email: 'sam@example.test' }]
    const rows = buildMessageInbox(CONVERSATIONS, [], access, [], PROPERTIES, [], [])
    expect(rows[0].tenantName).toBe('sam@example.test')
  })

  it('excludes Closed conversations', () => {
    const conversations = [{ ...CONVERSATIONS[0], status: 'Closed' as const }]
    expect(buildMessageInbox(conversations, [], ACCESS, LEASES, PROPERTIES, [], [])).toHaveLength(0)
  })

  it('shows no preview/timestamp for a conversation with no messages yet, rather than inventing one', () => {
    const rows = buildMessageInbox(CONVERSATIONS, [], ACCESS, LEASES, PROPERTIES, [], [])
    expect(rows[0].latestMessagePreview).toBeNull()
    expect(rows[0].latestMessageAt).toBeNull()
    expect(rows[0].unread).toBe(false)
  })

  it('prefers the matching tenant_requests row\'s maintenance_request_id over the conversation\'s own column', () => {
    const conversations = [{ ...CONVERSATIONS[0], maintenance_request_id: 'maint-from-conversation' }]
    const requests = [{ conversation_id: 'convo-1', maintenance_request_id: 'maint-from-request' }]
    const rows = buildMessageInbox(conversations, [], ACCESS, LEASES, PROPERTIES, [], requests)
    expect(rows[0].maintenanceRequestId).toBe('maint-from-request')
  })

  it('falls back to the conversation\'s own maintenance_request_id when no tenant_requests row matches', () => {
    const conversations = [{ ...CONVERSATIONS[0], maintenance_request_id: 'maint-from-conversation' }]
    const rows = buildMessageInbox(conversations, [], ACCESS, LEASES, PROPERTIES, [], [])
    expect(rows[0].maintenanceRequestId).toBe('maint-from-conversation')
  })

  it('unread uses the exact same isConversationUnread rule as everywhere else: newer latest message than last_read_at', () => {
    const messages = [{ conversation_id: 'convo-1', message: 'hi', created_at: '2026-02-01T00:00:00Z' }]
    const readBefore = [{ conversation_id: 'convo-1', last_read_at: '2026-01-01T00:00:00Z' }]
    const readAfter = [{ conversation_id: 'convo-1', last_read_at: '2026-03-01T00:00:00Z' }]
    expect(buildMessageInbox(CONVERSATIONS, messages, ACCESS, LEASES, PROPERTIES, readBefore, [])[0].unread).toBe(true)
    expect(buildMessageInbox(CONVERSATIONS, messages, ACCESS, LEASES, PROPERTIES, readAfter, [])[0].unread).toBe(false)
    expect(buildMessageInbox(CONVERSATIONS, messages, ACCESS, LEASES, PROPERTIES, [], [])[0].unread).toBe(true)
  })

  it('sorts newest latest-message first', () => {
    const conversations = [
      { id: 'convo-1', property_id: 'prop-1', tenant_access_id: 'access-1', maintenance_request_id: null, status: 'Open' as const },
      { id: 'convo-2', property_id: 'prop-1', tenant_access_id: 'access-1', maintenance_request_id: null, status: 'Open' as const },
    ]
    const messages = [
      { conversation_id: 'convo-1', message: 'old', created_at: '2026-01-01T00:00:00Z' },
      { conversation_id: 'convo-2', message: 'new', created_at: '2026-02-01T00:00:00Z' },
    ]
    const rows = buildMessageInbox(conversations, messages, ACCESS, LEASES, PROPERTIES, [], [])
    expect(rows.map((r) => r.conversationId)).toEqual(['convo-2', 'convo-1'])
  })
})

describe('summarizeUnreadInbox', () => {
  it('counts only unread rows', () => {
    const rows = buildMessageInbox(CONVERSATIONS, [{ conversation_id: 'convo-1', message: 'hi', created_at: '2026-01-01T00:00:00Z' }], ACCESS, LEASES, PROPERTIES, [], [])
    expect(summarizeUnreadInbox(rows)).toBe(1)
    expect(summarizeUnreadInbox([])).toBe(0)
  })
})

describe('filterMessageInbox — Desktop Workspace V1 inbox search', () => {
  const rows = buildMessageInbox(
    [
      { id: 'convo-1', property_id: 'prop-1', tenant_access_id: 'access-1', maintenance_request_id: null, status: 'Open' as const },
    ],
    [{ conversation_id: 'convo-1', message: 'Still dripping under the sink', created_at: '2026-01-01T00:00:00Z' }],
    ACCESS, LEASES, PROPERTIES, [], [],
  )

  it('returns every row for an empty/whitespace query', () => {
    expect(filterMessageInbox(rows, '')).toEqual(rows)
    expect(filterMessageInbox(rows, '   ')).toEqual(rows)
  })

  it('matches on tenant name, case-insensitively', () => {
    expect(filterMessageInbox(rows, 'jordan').map((r) => r.conversationId)).toEqual(['convo-1'])
    expect(filterMessageInbox(rows, 'JORDAN').map((r) => r.conversationId)).toEqual(['convo-1'])
  })

  it('matches on property label', () => {
    expect(filterMessageInbox(rows, 'harbor lane').map((r) => r.conversationId)).toEqual(['convo-1'])
  })

  it('matches on the latest message preview text', () => {
    expect(filterMessageInbox(rows, 'dripping').map((r) => r.conversationId)).toEqual(['convo-1'])
  })

  it('excludes rows that match nothing', () => {
    expect(filterMessageInbox(rows, 'nonexistent-term')).toEqual([])
  })
})
