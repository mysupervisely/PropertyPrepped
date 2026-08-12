// PropPrepped Milestone 8: server-only Supabase client factory.
//
// This builds a request-scoped client authenticated as the calling user via
// their own access token — NOT a service-role client. Row Level Security
// still applies to every query, exactly as it does for the browser client in
// lib/supabase.ts. This file must only ever be imported from server code
// (API routes) — never from a 'use client' component.
//
// There is no service-role key anywhere in this project. Every server-side
// Supabase call still goes through RLS, scoped to whoever's access token was
// sent with the request.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export function createRequestClient(accessToken: string): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anonKey || !accessToken) return null

  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}
