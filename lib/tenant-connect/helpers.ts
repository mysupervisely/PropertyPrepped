// PropRoster Milestone 10 / 24: Tenant Connect — pure display/logic helpers.
//
// Deliberately free of any Supabase/React import so these can be unit
// tested without a live database (same reasoning as
// lib/billing/entitlements.ts and lib/document-intelligence/analyze-request.ts:
// business logic factored out of the component so it's testable on its
// own). Every actual security decision (who can read/write what) is
// enforced by RLS in supabase/milestone-10-tenant-connect.sql — this file
// only ever computes what to SHOW, never what to ALLOW.

/**
 * A conversation is unread for a given user when it has at least one
 * message and that user has either never read it (no lastReadAt row yet)
 * or read it before the latest message arrived. Mirrors the doc comment
 * on property_conversation_reads in the migration: "unread" is derived,
 * never stored as its own boolean, so it can never drift from the real
 * message timeline.
 */
export function isConversationUnread(latestMessageAt: string | null, lastReadAt: string | null): boolean {
  if (!latestMessageAt) return false
  if (!lastReadAt) return true
  return new Date(latestMessageAt).getTime() > new Date(lastReadAt).getTime()
}

/**
 * Trims a message body down to a single-line preview for the
 * conversation list (Section E: "Show: ... latest message"). Collapses
 * internal newlines so a multi-line message doesn't break the list row.
 */
export function messagePreview(message: string, maxLength = 80): string {
  const collapsed = message.replace(/\s+/g, ' ').trim()
  if (collapsed.length <= maxLength) return collapsed
  return `${collapsed.slice(0, maxLength - 1).trimEnd()}…`
}

/**
 * Display label for a tenant relationship that hasn't accepted yet vs.
 * one that has a real account. Centralized so the owner-side list and
 * any future tenant-facing surface render this identically.
 */
export function tenantDisplayName(tenantEmail: string, status: 'Invited' | 'Active' | 'Revoked'): string {
  if (status === 'Invited') return `${tenantEmail} (invite pending)`
  if (status === 'Revoked') return `${tenantEmail} (access revoked)`
  return tenantEmail
}

// ===========================================================================
// Tenant Connect V1 (Milestone 24) — the compact Rent > Tenant status card.
// ===========================================================================

export type TenantConnectStatusLabel = 'Not invited' | 'Invitation pending' | 'Connected' | 'Access ended'

/** The 4-state summary Section 2 asks for — a pure mapping from a tenant_property_access row's own status onto the landlord-facing label. `null` means no access row exists at all for this lease's tenant yet. */
export function tenantConnectStatusLabel(status: 'Invited' | 'Active' | 'Revoked' | null): TenantConnectStatusLabel {
  if (status === null) return 'Not invited'
  if (status === 'Invited') return 'Invitation pending'
  if (status === 'Active') return 'Connected'
  return 'Access ended'
}

type AccessRowForLeaseMatch = { lease_id: string | null; status: 'Invited' | 'Active' | 'Revoked'; created_at: string }

/**
 * The Tenant Connect access row (if any) tied to a specific lease — the
 * compact status card is scoped to THE CURRENT LEASE, never "any tenant
 * on this property" (Section 3: "Invitation must be tied to... lease").
 * When more than one row somehow references the same lease_id (e.g. an
 * invite was revoked and the tenant re-invited for the same lease), an
 * Active row always wins, then an Invited row, then the most recently
 * created Revoked row — never an older row over a newer, more relevant
 * one.
 */
export function findAccessForLease<T extends AccessRowForLeaseMatch>(rows: T[], leaseId: string | null | undefined): T | null {
  if (!leaseId) return null
  const forLease = rows.filter((r) => r.lease_id === leaseId)
  if (!forLease.length) return null
  return (
    forLease.find((r) => r.status === 'Active')
    || forLease.find((r) => r.status === 'Invited')
    || [...forLease].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
  )
}

export function normalizeTenantEmail(email: string): string {
  return email.trim().toLowerCase()
}

/**
 * Bug fix (real-invite testing, "Resend Invitation" silently re-sending
 * to a stale email): tenant_property_access.tenant_email is captured
 * once, at invite-insert time, and never automatically updated again —
 * it's also the exact value accept_tenant_invite() matches against the
 * tenant's own signed-in email (supabase/schema.sql), so it doubles as
 * this invite's security credential, not just the send destination. If
 * the landlord later corrects the tenant's email on the lease (e.g. it
 * was originally entered as a placeholder like "NA"), the existing
 * access row never picks that up on its own.
 *
 * Returns the normalized email the access row should be synced to
 * before resending, or null when no sync is needed. Deliberately
 * returns null for anything other than an 'Invited' row — an Active
 * row's tenant_email is the tenant's already-accepted identity and must
 * never be silently rewritten (Section: "preserve tenant invitation
 * security and token behavior").
 */
export function staleInvitedEmail(
  access: { status: 'Invited' | 'Active' | 'Revoked'; tenant_email: string } | null,
  currentLeaseEmail: string | null | undefined,
): string | null {
  if (!access || access.status !== 'Invited' || !currentLeaseEmail) return null
  const normalized = normalizeTenantEmail(currentLeaseEmail)
  return normalized !== access.tenant_email ? normalized : null
}

/**
 * Migration 30 root-cause fix (real-device invite-acceptance failure,
 * "This invite is not available to accept."): a pure-JS mirror of
 * accept_tenant_invite()'s WHERE clause and tenant_access_select's
 * Invited-branch predicate in supabase/schema.sql, both now
 * `lower(btrim(tenant_email)) = lower(btrim(v_email))`.
 *
 * Every application-side write to tenant_property_access.tenant_email
 * already normalizes with normalizeTenantEmail() (trim + lowercase)
 * before the write, so the stored side of this comparison can be
 * trusted. The one input NOT under this app's control is the
 * authenticated caller's own auth.jwt()->>'email' claim, which reflects
 * whatever a device's autofill/keyboard put in the sign-up/sign-in
 * email field — that's the side this function defends by trimming
 * before comparing, exactly like the SQL now does. This is a read-only
 * predicate mirror for regression testing; it grants nothing on its
 * own — the real authorization decision is still made exclusively by
 * accept_tenant_invite() in the database.
 */
export function emailsMatchForInviteAcceptance(storedTenantEmail: string, authenticatedEmail: string): boolean {
  return storedTenantEmail.trim().toLowerCase() === authenticatedEmail.trim().toLowerCase()
}
