import { describe, expect, it } from 'vitest'
import { isConversationUnread, messagePreview, tenantDisplayName, tenantConnectStatusLabel, findAccessForLease, staleInvitedEmail, normalizeTenantEmail, emailsMatchForInviteAcceptance } from './helpers'

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

describe('normalizeTenantEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeTenantEmail('  Ben@Example.com  ')).toBe('ben@example.com')
  })
})

// Bug fix regression: "Resend Invitation" silently re-sent to a stale
// stored email whenever the landlord corrected the tenant's email
// after the initial invite (e.g. it was originally entered as "NA").
describe('staleInvitedEmail — root cause of the "Resend Invitation" bug', () => {
  it('returns the corrected email when the current lease email differs from the stored Invited row', () => {
    const access = { status: 'Invited' as const, tenant_email: 'na' }
    expect(staleInvitedEmail(access, 'ben.and.crystal@example.com')).toBe('ben.and.crystal@example.com')
  })

  it('normalizes (trim + lowercase) the returned email', () => {
    const access = { status: 'Invited' as const, tenant_email: 'na' }
    expect(staleInvitedEmail(access, '  Ben.And.Crystal@Example.com  ')).toBe('ben.and.crystal@example.com')
  })

  it('returns null when the stored email already matches the current lease email — no unnecessary write', () => {
    const access = { status: 'Invited' as const, tenant_email: 'ben@example.com' }
    expect(staleInvitedEmail(access, 'Ben@Example.com')).toBeNull()
  })

  it('returns null when there is no access row at all', () => {
    expect(staleInvitedEmail(null, 'ben@example.com')).toBeNull()
  })

  it('returns null when the current lease has no email to sync to', () => {
    const access = { status: 'Invited' as const, tenant_email: 'na' }
    expect(staleInvitedEmail(access, null)).toBeNull()
    expect(staleInvitedEmail(access, undefined)).toBeNull()
    expect(staleInvitedEmail(access, '')).toBeNull()
  })

  it('SECURITY: never syncs an Active row, even if the lease email differs — an already-accepted tenant\'s identity must never be silently rewritten', () => {
    const access = { status: 'Active' as const, tenant_email: 'original@example.com' }
    expect(staleInvitedEmail(access, 'different@example.com')).toBeNull()
  })

  it('never syncs a Revoked row', () => {
    const access = { status: 'Revoked' as const, tenant_email: 'na' }
    expect(staleInvitedEmail(access, 'ben@example.com')).toBeNull()
  })
})

// Migration 30 root-cause fix: accept_tenant_invite() rejecting an
// invite with "This invite is not available to accept." even though
// tenant_access_select's identical-shaped predicate had already let the
// tenant see the same pending invite on /tenant. emailsMatchForInviteAcceptance()
// mirrors the SQL comparison (`lower(btrim(a)) = lower(btrim(b))`) so this
// exact class of failure has a pure-logic regression guard independent
// of a live database.
describe('emailsMatchForInviteAcceptance (Migration 30 — btrim() hardening)', () => {
  it('matches when both sides are already normalized (the common case)', () => {
    expect(emailsMatchForInviteAcceptance('ben@example.com', 'ben@example.com')).toBe(true)
  })

  it('matches regardless of case, on either side', () => {
    expect(emailsMatchForInviteAcceptance('ben@example.com', 'Ben@Example.com')).toBe(true)
  })

  it('root cause: matches when the AUTHENTICATED email carries incidental whitespace (e.g. mobile autofill) that the stored, already-normalized tenant_email does not', () => {
    expect(emailsMatchForInviteAcceptance('ben.and.crystal@example.com', ' ben.and.crystal@example.com ')).toBe(true)
    expect(emailsMatchForInviteAcceptance('ben.and.crystal@example.com', 'ben.and.crystal@example.com\n')).toBe(true) // trailing newline (also stripped by JS .trim(), mirroring SQL btrim()) still matches
  })

  it('does not match two genuinely different emails, even after trimming', () => {
    expect(emailsMatchForInviteAcceptance('tenant-a@example.com', ' tenant-b@example.com ')).toBe(false)
  })

  it('full reported regression sequence: NA placeholder -> landlord corrects lease email -> Resend Invitation re-syncs the stale access row -> a new account signs in with a whitespace-affected but otherwise-matching email -> acceptance now succeeds', () => {
    // 1. Tenant originally created with a placeholder email.
    const originalAccess = { status: 'Invited' as const, tenant_email: 'na' }
    // 2/3. Landlord corrects the lease's tenant email.
    const correctedLeaseEmail = 'ben.and.crystal@example.com'
    // 4. PR #60's Resend Invitation fix re-syncs the stale invited email.
    const syncedEmail = staleInvitedEmail(originalAccess, correctedLeaseEmail)
    expect(syncedEmail).toBe('ben.and.crystal@example.com')
    const resyncedAccess = { status: 'Invited' as const, tenant_email: syncedEmail! }
    // 5/6. Invitation delivered to, and a PropRoster account created/signed
    // in with, the corrected address — but the device's own autofill adds
    // a trailing space to the JWT's email claim.
    const authenticatedEmail = 'ben.and.crystal@example.com '
    // 7. Acceptance must now succeed (this is exactly what accept_tenant_invite()'s
    // WHERE clause decides in the database — this mirrors that predicate).
    expect(emailsMatchForInviteAcceptance(resyncedAccess.tenant_email, authenticatedEmail)).toBe(true)
  })
})
