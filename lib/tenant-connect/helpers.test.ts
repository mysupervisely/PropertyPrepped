import { describe, expect, it } from 'vitest'
import { isConversationUnread, messagePreview, tenantDisplayName } from './helpers'

describe('isConversationUnread', () => {
  it('is false when there is no message yet', () => {
    expect(isConversationUnread(null, null)).toBe(false)
    expect(isConversationUnread(null, '2026-01-01T00:00:00Z')).toBe(false)
  })

  it('is true the first time a user has never read a conversation that has a message', () => {
    expect(isConversationUnread('2026-01-01T00:00:00Z', null)).toBe(true)
  })

  it('is true when the latest message is newer than the last read time', () => {
    expect(isConversationUnread('2026-01-02T00:00:00Z', '2026-01-01T00:00:00Z')).toBe(true)
  })

  it('is false once the user has read at or after the latest message', () => {
    expect(isConversationUnread('2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')).toBe(false)
    expect(isConversationUnread('2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z')).toBe(false)
  })
})

describe('messagePreview', () => {
  it('returns short messages unchanged', () => {
    expect(messagePreview('Thanks, will take a look')).toBe('Thanks, will take a look')
  })

  it('collapses internal newlines/whitespace into single spaces', () => {
    expect(messagePreview('Line one\nLine two\n\nLine three')).toBe('Line one Line two Line three')
  })

  it('truncates long messages with an ellipsis at the given length', () => {
    const long = 'a'.repeat(200)
    const preview = messagePreview(long, 80)
    expect(preview.length).toBe(80)
    expect(preview.endsWith('…')).toBe(true)
  })
})

describe('tenantDisplayName', () => {
  it('shows a pending-invite hint for Invited status', () => {
    expect(tenantDisplayName('tenant@example.com', 'Invited')).toBe('tenant@example.com (invite pending)')
  })

  it('shows a revoked hint for Revoked status', () => {
    expect(tenantDisplayName('tenant@example.com', 'Revoked')).toBe('tenant@example.com (access revoked)')
  })

  it('shows the plain email for Active status', () => {
    expect(tenantDisplayName('tenant@example.com', 'Active')).toBe('tenant@example.com')
  })
})
