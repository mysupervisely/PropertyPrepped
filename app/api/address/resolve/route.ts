// PropRoster Milestone: Investment Tools 2.0 — resolves an address
// suggestion's opaque provider id into a full NormalizedAddress. Same
// trust model as search/route.ts: unauthenticated, no secrets ever
// returned to the client.

import { NextRequest, NextResponse } from 'next/server'
import { getAddressSearchProvider } from '../../../../lib/address/provider'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id') || ''
  if (!id.trim()) {
    return NextResponse.json({ error: 'Missing id.' }, { status: 400 })
  }

  const provider = getAddressSearchProvider()
  if (!provider) {
    return NextResponse.json({ configured: false, address: null }, { status: 503 })
  }

  try {
    const address = await provider.resolve(id)
    if (!address) {
      return NextResponse.json({ configured: true, address: null }, { status: 404 })
    }
    return NextResponse.json({ configured: true, address })
  } catch (err) {
    console.error('address resolve error', err)
    return NextResponse.json({ configured: true, address: null }, { status: 502 })
  }
}
