// PropRoster — Netlify Deploy Preview environment debug (temporary).
//
// Section 6 of the deploy-preview-env investigation: a safe, minimal,
// GET-able diagnostic so the product owner can confirm — from a
// browser, on the actual deployed preview, no CLI/dashboard access
// needed — whether NEXT_PUBLIC_SUPABASE_URL/ANON_KEY were actually
// present in the environment this specific deploy was built/is running
// in. Returns booleans and safe deployment metadata ONLY.
//
// NEVER returns: the URL value, the anon key value, any other secret,
// or any env var not explicitly listed below. This route is temporary —
// delete it (and this file) once the Netlify site-mismatch found during
// this investigation (see docs/netlify-deploy-preview-env-debug.md) is
// resolved and no longer needs to be re-verified from a browser.
//
// CONTEXT/BRANCH/COMMIT_REF/DEPLOY_ID/DEPLOY_URL/URL are Netlify's own
// documented build+runtime environment variables (https://docs.netlify.
// com/configure-builds/environment-variables/#deploy-urls-and-metadata)
// — deployment metadata, not secrets; safe to expose. Undefined outside
// Netlify (e.g. local `next dev`), reported as null rather than thrown.

import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    SUPABASE_URL_PRESENT: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    SUPABASE_ANON_KEY_PRESENT: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    NETLIFY_CONTEXT: process.env.CONTEXT || null,
    BRANCH: process.env.BRANCH || null,
    COMMIT_REF: process.env.COMMIT_REF ? process.env.COMMIT_REF.slice(0, 12) : null,
    DEPLOY_ID: process.env.DEPLOY_ID || null,
    SITE_URL: process.env.URL || null,
    DEPLOY_PRIME_URL: process.env.DEPLOY_PRIME_URL || null,
  })
}
