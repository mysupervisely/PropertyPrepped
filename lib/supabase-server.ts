// PropPrepped Milestone 9: server-side Supabase client factories.
//
// Two distinct clients, for two distinct trust levels — never confuse them:
//
// - createRequestClient(token): RLS-scoped to the caller's own access
//   token. Used for anything done "as the signed-in user" — reading their
//   own subscription row, verifying they own a property, uploading or
//   analyzing their own documents (Milestone 8), etc. Every M8/M9 route
//   reaches for this first, and most (checkout, portal, document
//   intelligence) never need anything else.
//
// - createAdminClient(): the service-role key, bypassing RLS entirely.
//   Used ONLY where no user session can exist by construction — the
//   Stripe webhook. Stripe calls that endpoint server-to-server; there is
//   no Supabase session to scope an RLS-safe client to, and Stripe
//   deliveries must be able to write subscription state for ANY user
//   based on the event payload, not just "whoever is currently signed
//   in." Authorization for that endpoint comes entirely from verifying
//   the Stripe webhook signature (see lib/billing/stripe.ts /
//   app/api/billing/webhook/route.ts) before this client is ever used.
//   This is the ONLY place in this codebase that touches the
//   service-role key — checkout, portal, and document intelligence all
//   get by on the RLS-scoped client alone (see their route files for how).

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

export function createRequestClient(accessToken: string): SupabaseClient | null {
  if (!url || !anonKey || !accessToken) return null
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}

export const isAdminClientConfigured = Boolean(url && serviceRoleKey)

export function createAdminClient(): SupabaseClient | null {
  if (!url || !serviceRoleKey) return null
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
