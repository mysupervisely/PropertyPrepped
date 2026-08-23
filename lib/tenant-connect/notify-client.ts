// PropRoster — Tenant Connect V1 (Milestone 24): client-side trigger for
// the notify API route. Same auth pattern lib/billing/client.ts already
// uses (grab the session's access_token, send it as a Bearer header) —
// not a new pattern.
//
// Deliberately best-effort and never throws: the real DB write (invite/
// request/reply/status-change) already succeeded via the caller's own
// RLS-scoped Supabase client BEFORE this is ever called — a failed or
// slow email trigger must never block or roll back a UI action that
// already succeeded.

import type { SupabaseClient } from '@supabase/supabase-js'

export type TenantConnectNotifyKind = 'invite' | 'new_request' | 'landlord_update'

export async function notifyTenantConnect(supabase: SupabaseClient, kind: TenantConnectNotifyKind, ids: Record<string, string>): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) return
    await fetch('/api/tenant-connect/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ kind, ...ids }),
    })
  } catch {
    // Best-effort only — never surface a notification failure to the UI.
  }
}
