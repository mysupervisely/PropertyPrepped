// PropRoster — Tenant Connect: Provider Outreach V1. Client-side trigger
// for the send route — same Bearer-token pattern as
// lib/tenant-connect/notify-client.ts, but NOT best-effort: unlike a
// notification email, this call IS the landlord's explicit "Send
// Request" action (Section 1), so both call sites (app/page.tsx and
// app/maintenance/page.tsx) need the real result to show a confirmation
// or error, not swallow it.

import type { SupabaseClient } from '@supabase/supabase-js'

export type SendProviderOutreachResult = { sent: boolean; reason?: string; outreachId?: string }

export async function sendProviderOutreach(supabase: SupabaseClient, requestId: string): Promise<SendProviderOutreachResult> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return { sent: false, reason: 'unauthorized' }
  const res = await fetch('/api/maintenance/provider-outreach/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ requestId }),
  })
  const body = await res.json().catch(() => ({ sent: false, reason: 'unexpected_error' }))
  return body as SendProviderOutreachResult
}

/** Friendly text for the reasons the send route can return — used so a failed/blocked send never surfaces a raw API reason string to the landlord. */
export function providerOutreachErrorMessage(reason?: string): string {
  switch (reason) {
    case 'already_pending':
      return 'A request has already been sent to this provider.'
    case 'no_provider_email':
      return 'Add an email address for this provider in PropCrew before contacting them.'
    case 'no_assigned_contact':
      return 'Assign a PropCrew contact before sending a request.'
    default:
      return 'Could not send the request. Please try again in a moment.'
  }
}
