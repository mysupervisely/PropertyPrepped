// PropPrepped Milestone 9: client-side helpers for starting Checkout /
// opening the Customer Portal. Shared by the pricing page, the account
// billing page, and the in-app upgrade prompt so the fetch/redirect logic
// isn't duplicated three times.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { PurchasablePlanId } from './plans'

async function postWithAuth(supabase: SupabaseClient, path: string, body?: Record<string, unknown>): Promise<{ url?: string; error?: string }> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return { error: 'Please sign in again.' }

  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body || {}),
  })
  const responseBody = (await res.json().catch(() => ({}))) as { url?: string; error?: string }
  if (!res.ok || !responseBody.url) {
    return { error: responseBody.error || 'Something went wrong. Please try again.' }
  }
  return { url: responseBody.url }
}

/** Starts a Stripe Checkout session for the given plan and redirects the browser to it. Returns an error string on failure instead of throwing. */
export async function startCheckout(supabase: SupabaseClient, plan: PurchasablePlanId): Promise<{ error?: string }> {
  const result = await postWithAuth(supabase, '/api/billing/checkout', { plan })
  if (result.error) return { error: result.error }
  window.location.href = result.url!
  return {}
}

/** Opens the caller's Stripe Customer Portal and redirects the browser to it. Returns an error string on failure instead of throwing. */
export async function openBillingPortal(supabase: SupabaseClient): Promise<{ error?: string }> {
  const result = await postWithAuth(supabase, '/api/billing/portal')
  if (result.error) return { error: result.error }
  window.location.href = result.url!
  return {}
}

export type SubscriptionActionResponse = {
  subscription?: { plan: string; status: string; current_period_end: string | null; cancel_at_period_end: boolean }
  error?: string
}

async function postAction(supabase: SupabaseClient, path: string): Promise<SubscriptionActionResponse> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return { error: 'Please sign in again.' }

  const res = await fetch(path, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
  const body = (await res.json().catch(() => ({}))) as SubscriptionActionResponse
  if (!res.ok) return { error: body.error || 'Something went wrong. Please try again.' }
  return body
}

/** Schedules cancellation at the end of the current paid period (never immediate). */
export async function scheduleCancellation(supabase: SupabaseClient): Promise<SubscriptionActionResponse> {
  return postAction(supabase, '/api/billing/cancel')
}

/** Removes a scheduled cancellation, restoring normal renewal. */
export async function resumeSubscription(supabase: SupabaseClient): Promise<SubscriptionActionResponse> {
  return postAction(supabase, '/api/billing/resume')
}

export type BillingSummary = {
  paymentMethod: { brand: string; last4: string } | null
  invoices: { id: string; amountPaid: number; currency: string; status: string | null; created: string; hostedInvoiceUrl: string | null }[]
}

/** Fetches a safe payment-method summary (brand/last4 only) and recent invoice history. Never throws — falls back to an empty summary on any failure. */
export async function fetchBillingSummary(supabase: SupabaseClient): Promise<BillingSummary> {
  const empty: BillingSummary = { paymentMethod: null, invoices: [] }
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return empty
  try {
    const res = await fetch('/api/billing/summary', { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) return empty
    const body = (await res.json().catch(() => null)) as BillingSummary | null
    return body || empty
  } catch {
    return empty
  }
}
