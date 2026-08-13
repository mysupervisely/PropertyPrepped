// PropRoster Milestone 10: Tenant Connect — pure display/logic helpers.
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
