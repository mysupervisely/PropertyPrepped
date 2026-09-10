// PropRoster — Tenant-Facing Experience V1.
//
// Owner and Tenant are NOT mutually exclusive account types — a single
// authenticated user may eventually hold both a landlord workspace
// (properties they own) and tenant access (a property they rent). This
// file therefore never persists a "role" anywhere — there is no
// `role` column on any table, and there must never be one. The
// registration-time choice ("How will you use PropRoster?") only ever
// decides where a BRAND NEW account lands the first time, nothing more
// — ongoing access to either context is (and must remain) determined
// entirely by what the account actually owns (properties.owner_id) or
// has been granted (tenant_property_access), not by this choice.
//
// Pure logic only, so it's directly unit-testable — no Supabase, no
// React, no localStorage read/write (the one caller,
// components/LandingPage.tsx, owns that side effect itself).

export type IntendedRole = 'owner' | 'tenant'

/** localStorage key the signup flow uses to remember an intended-tenant choice across the one-time email-confirmation round trip, so app/page.tsx can redirect a first sign-in once and then forget it. Never read as an ongoing access grant — see this file's own header. */
export const INTENDED_ROLE_STORAGE_KEY = 'proproster-intended-role'

/** Where a brand-new account should land immediately after a successful (already-authenticated) sign-up — the ONE place this choice has any effect. */
export function postSignupRedirectPath(role: IntendedRole): string {
  return role === 'tenant' ? '/tenant' : '/'
}
