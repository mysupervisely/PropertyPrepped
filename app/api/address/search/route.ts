// PropRoster Milestone: Investment Tools 2.0 — the only endpoint the
// browser ever calls for address suggestions. Never exposes
// MAPBOX_ACCESS_TOKEN to the client — the token is read here, server-side,
// exactly once, and never appears in any response.
//
// Unauthenticated by design: Investment Tools (including the Home
// Purchase Calculator and Property Value & Comps) are reachable without a
// PropRoster sign-in, matching the existing Property Evaluator's own
// "works with no Supabase session at all" design. Address search returns
// nothing sensitive — no user data, just candidate addresses for whatever
// text was typed.

import { NextRequest, NextResponse } from 'next/server'
import { getAddressSearchProvider } from '../../../../lib/address/provider'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q') || ''
  if (!query.trim()) {
    return NextResponse.json({ suggestions: [] })
  }

  const provider = getAddressSearchProvider()
  if (!provider) {
    // Not an error — a defined "not configured" state the client uses to
    // fall back to plain manual address entry and stop retrying for the
    // rest of the session. See components/AddressAutocomplete.tsx.
    return NextResponse.json({ configured: false, suggestions: [] }, { status: 503 })
  }

  try {
    const suggestions = await provider.search(query)
    return NextResponse.json({ configured: true, suggestions })
  } catch (err) {
    console.error('address search error', err)
    return NextResponse.json({ configured: true, suggestions: [] }, { status: 502 })
  }
}
