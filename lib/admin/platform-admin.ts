// PropRoster — Platform Admin Authorization Fix.
//
// The single, shared way to ask "is this account a PropRoster platform
// administrator" — server-side. Reads the new platform_admins table
// (supabase/milestone-33-platform-admin.sql) via an RLS-scoped client, so
// a caller can only ever see whether THEIR OWN account is a platform
// admin (the table's select policy is scoped to `owner_id = auth.uid()`).
//
// Deliberately NOT derived from user_subscriptions.plan — a customer's
// billing plan (free/organize/manage/owner/...) must never by itself
// grant platform-admin access. This is a fully separate concept: a
// platform admin can be on any plan, including 'free', and an account on
// the internal 'owner' plan is NOT an admin unless it also has a row
// here.
//
// Route usage (server-side, the REAL enforcement):
//   const isAdmin = await isCallerPlatformAdmin(supabase, user.id)
//   if (!isAdmin) return 403
//
// `supabase` must be the caller's own RLS-scoped client (from
// createRequestClient(token)) — passing the service-role admin client
// here would defeat the point, since it bypasses RLS and could read any
// row, not just the caller's own.

import type { SupabaseClient } from '@supabase/supabase-js'

export async function isCallerPlatformAdmin(supabase: SupabaseClient, ownerId: string): Promise<boolean> {
  const { data } = await supabase.from('platform_admins').select('owner_id').eq('owner_id', ownerId).maybeSingle()
  return Boolean(data)
}
