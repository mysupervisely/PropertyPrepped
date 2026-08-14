// PropRoster Milestone 11 (Privacy-First Admin Analytics): the vocabulary
// of admin_audit_events.action. Kept in TypeScript rather than a database
// check constraint (see the comment atop admin_audit_events in
// supabase/milestone-11-admin-analytics.sql for why) so this is the ONE
// place that ever needs to change when a new admin action ships.
//
// Only VIEW_ADMIN_ANALYTICS is actually written by this pass — the other
// three are named here (matching the task's own examples) so the type is
// ready for CHANGE_ACCOUNT_STATUS / GRANT_INTERNAL_ROLE /
// REVOKE_INTERNAL_ROLE the day any of those ships, without inventing a
// fourth ad-hoc string at that point. None of this milestone's code paths
// currently produce those three — there is no grant/revoke UI, no account
// status change UI, in this pass (see "DO NOT BUILD").
export const ADMIN_AUDIT_ACTIONS = [
  'VIEW_ADMIN_ANALYTICS',
  'CHANGE_ACCOUNT_STATUS',
  'GRANT_INTERNAL_ROLE',
  'REVOKE_INTERNAL_ROLE',
] as const

export type AdminAuditAction = (typeof ADMIN_AUDIT_ACTIONS)[number]
