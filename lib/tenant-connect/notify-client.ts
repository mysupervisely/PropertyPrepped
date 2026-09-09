// PropRoster — Tenant Connect V1 (Milestone 24): client-side trigger for
// the notify API route. Same auth pattern lib/billing/client.ts already
// uses (grab the session's access_token, send it as a Bearer header) —
// not a new pattern.
//
// Never throws — every call site that only ever fired this alongside a
// real DB write that already succeeded (invite creation, a new tenant
// request, a landlord reply/status change) can keep doing exactly what
// it always did: `void notifyTenantConnect(...)`, ignoring the result,
// since a failed/slow email trigger must never block or roll back a UI
// action that already succeeded on its own.
//
// Bug fix (real-invite testing, TenantConnectStatusCard's "Resend
// Invitation"): this now RETURNS the send result instead of discarding
// it. Resend has no OTHER action behind it — sending the email IS the
// entire point of that button — so silently swallowing a failure there
// left the landlord clicking "Resend Invitation" with zero feedback
// while nothing was ever delivered. Every existing `void
// notifyTenantConnect(...)` call site is unaffected: `void` discards
// whatever a Promise resolves to, so widening the resolved type here
// changes no existing behavior.
import type { SupabaseClient } from '@supabase/supabase-js'

export type TenantConnectNotifyKind = 'invite' | 'new_request' | 'landlord_update'
export type NotifyTenantConnectResult = { sent: boolean; reason?: string } | null

export async function notifyTenantConnect(supabase: SupabaseClient, kind: TenantConnectNotifyKind, ids: Record<string, string>): Promise<NotifyTenantConnectResult> {
  try {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) return null
    const res = await fetch('/api/tenant-connect/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ kind, ...ids }),
    })
    return await res.json().catch(() => null)
  } catch {
    return null
  }
}
