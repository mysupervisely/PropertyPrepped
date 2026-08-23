import { describe, expect, it } from 'vitest'
import { isConversationUnread, messagePreview, tenantDisplayName, tenantConnectStatusLabel, findAccessForLease } from './helpers'

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

describe('tenantConnectStatusLabel (Tenant Connect V1)', () => {
  it('maps null (no access row) to "Not invited"', () => {
    expect(tenantConnectStatusLabel(null)).toBe('Not invited')
  })
  it('maps Invited to "Invitation pending"', () => {
    expect(tenantConnectStatusLabel('Invited')).toBe('Invitation pending')
  })
  it('maps Active to "Connected"', () => {
    expect(tenantConnectStatusLabel('Active')).toBe('Connected')
  })
  it('maps Revoked to "Access ended"', () => {
    expect(tenantConnectStatusLabel('Revoked')).toBe('Access ended')
  })
})

describe('findAccessForLease (Tenant Connect V1)', () => {
  const rows = [
    { id: 'a1', lease_id: 'lease-1', status: 'Revoked' as const, created_at: '2025-01-01T00:00:00Z' },
    { id: 'a2', lease_id: 'lease-2', status: 'Active' as const, created_at: '2025-06-01T00:00:00Z' },
    { id: 'a3', lease_id: 'lease-3', status: 'Invited' as const, created_at: '2025-06-01T00:00:00Z' },
  ]

  it('returns null when leaseId is null/undefined (no lease selected yet)', () => {
    expect(findAccessForLease(rows, null)).toBeNull()
    expect(findAccessForLease(rows, undefined)).toBeNull()
  })

  it('returns null when no row references this lease at all — "Not invited"', () => {
    expect(findAccessForLease(rows, 'lease-999')).toBeNull()
  })

  it('finds the Active row for a lease', () => {
    expect(findAccessForLease(rows, 'lease-2')?.id).toBe('a2')
  })

  it('finds the Invited row for a lease', () => {
    expect(findAccessForLease(rows, 'lease-3')?.id).toBe('a3')
  })

  it('finds a Revoked row when that is all that exists for the lease', () => {
    expect(findAccessForLease(rows, 'lease-1')?.id).toBe('a1')
  })

  it('prefers Active over Invited over an older Revoked row for the same lease', () => {
    const mixed = [
      { id: 'old-revoked', lease_id: 'lease-x', status: 'Revoked' as const, created_at: '2025-01-01T00:00:00Z' },
      { id: 'invited', lease_id: 'lease-x', status: 'Invited' as const, created_at: '2025-02-01T00:00:00Z' },
    ]
    expect(findAccessForLease(mixed, 'lease-x')?.id).toBe('invited')
    const withActive = [...mixed, { id: 'active', lease_id: 'lease-x', status: 'Active' as const, created_at: '2025-03-01T00:00:00Z' }]
    expect(findAccessForLease(withActive, 'lease-x')?.id).toBe('active')
  })

  it('among multiple Revoked rows for the same lease, picks the most recently created one', () => {
    const revokedTwice = [
      { id: 'first-revoked', lease_id: 'lease-y', status: 'Revoked' as const, created_at: '2025-01-01T00:00:00Z' },
      { id: 'second-revoked', lease_id: 'lease-y', status: 'Revoked' as const, created_at: '2025-05-01T00:00:00Z' },
    ]
    expect(findAccessForLease(revokedTwice, 'lease-y')?.id).toBe('second-revoked')
  })
})
