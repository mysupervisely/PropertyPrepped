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
//   Used ONLY where no user session can exist by construction:
//     - The Stripe webhook. Stripe calls that endpoint server-to-server;
//       there is no Supabase session to scope an RLS-safe client to, and
//       Stripe deliveries must be able to write subscription state for
//       ANY user based on the event payload, not just "whoever is
//       currently signed in." Authorization for that endpoint comes
//       entirely from verifying the Stripe webhook signature (see
//       lib/billing/stripe.ts / app/api/billing/webhook/route.ts)
//       before this client is ever used.
//     - Landlord Digest V1's scheduled function
//       (netlify/functions/landlord-digest.ts, lib/notifications/
//       landlord-digest-run.ts). A cron trigger has no signed-in user
//       either, and the job genuinely needs to read across every
//       opted-in owner's portfolio to compile their digest — the exact
//       same "no session by construction" reason as the webhook above.
//       Every query it runs is explicitly scoped with
//       `.eq('owner_id', ownerId)` in application code (never relying
//       on RLS, which this client bypasses) — see that module's own
//       header comment for the owner-isolation contract.
//   Every other route (checkout, portal, document intelligence, Tenant
//   Connect, Provider Outreach, etc.) gets by on the RLS-scoped client
//   alone (see their route files for how) — reach for createAdminClient()
//   only when a route/job has no real user session to scope to at all.

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
