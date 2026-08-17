// PropRoster — Property Value & Comps: real-imagery proxy.
//
// The ONLY thing the browser ever requests is THIS PropRoster-owned URL
// (e.g. /api/property-image?address=...&lat=...&lng=...) — never a
// Google URL, and never anything containing GOOGLE_STREET_VIEW_API_KEY.
// The key is read from process.env only inside
// lib/property-image/providers/street-view.ts (via getPropertyImageProvider()
// below) and is never included in this route's response body or headers.
//
// Kept intentionally thin — all real logic (cache lookup, provider calls,
// status-code selection) lives in the testable
// lib/property-image/handle-request.ts, exercised directly in
// handle-request.test.ts. This route only translates the HTTP request
// into that function's plain-object input and its result back into a
// NextResponse, the same "thin route, tested core" split already used by
// app/api/document-intelligence/analyze.
//
// Never breaks Property Value & Comps: every failure mode here (missing
// key, quota, timeout, bad address, network error) resolves to a non-200
// status with no body — the comp card's <img> onError simply falls back
// to the PropRoster placeholder. This route is never called by, and
// never calls, /api/valuation — RentCast's request count is completely
// unaffected by anything in this file (Part 14).

import { NextRequest, NextResponse } from 'next/server'
import { handlePropertyImageRequest } from '../../../lib/property-image/handle-request'
import { getPropertyImageProvider } from '../../../lib/property-image/provider'
import { getCachedAvailability, setCachedAvailability } from '../../../lib/property-image/availability-cache'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const address = searchParams.get('address') || ''
  const latRaw = searchParams.get('lat')
  const lngRaw = searchParams.get('lng')
  const latitude = latRaw !== null && Number.isFinite(Number(latRaw)) ? Number(latRaw) : null
  const longitude = lngRaw !== null && Number.isFinite(Number(lngRaw)) ? Number(lngRaw) : null

  const result = await handlePropertyImageRequest(
    { formattedAddress: address, latitude, longitude },
    { getProvider: getPropertyImageProvider, getCached: getCachedAvailability, setCached: setCachedAvailability },
  )

  if (result.status !== 200) {
    return new NextResponse(null, { status: result.status })
  }

  return new NextResponse(Buffer.from(result.bytes), {
    status: 200,
    headers: {
      'content-type': result.contentType,
      'cache-control': result.cacheControl,
    },
  })
}
