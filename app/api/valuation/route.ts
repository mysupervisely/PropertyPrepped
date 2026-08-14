// PropRoster Milestone: Investment Tools 2.0 — Property Value & Comps
// backend. The ONLY server route the Property Value & Comps page calls.
// Never returns a value or comparable sale that didn't come directly from
// a configured PropertyValuationProvider (Part 8/9) — no Anthropic import
// anywhere in this file or anything it calls.
//
// Unauthenticated, same trust model as /api/address/*: no user data
// touched, works without a PropRoster sign-in.

import { NextRequest, NextResponse } from 'next/server'
import { getPropertyValuationProvider } from '../../../lib/valuation/provider'
import { manualAddress, type NormalizedAddress } from '../../../lib/address/types'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { address?: Partial<NormalizedAddress>; formattedAddress?: string }
  const formattedAddress = (body.address?.formattedAddress || body.formattedAddress || '').trim()
  if (!formattedAddress) {
    return NextResponse.json({ error: 'An address is required.' }, { status: 400 })
  }
  const address: NormalizedAddress = body.address?.formattedAddress ? (body.address as NormalizedAddress) : manualAddress(formattedAddress)

  const provider = getPropertyValuationProvider()
  if (!provider) {
    // Defined "not configured" state, not an error — Part 8: "If no
    // provider is configured: Show 'Property valuation data is not
    // configured yet.'" The client renders exactly that message.
    return NextResponse.json({ configured: false, result: null })
  }

  try {
    const result = await provider.getValuation(address)
    return NextResponse.json({ configured: true, result })
  } catch (err) {
    console.error('property valuation error', err)
    return NextResponse.json({ configured: true, result: null, error: 'Something went wrong estimating this property’s value.' }, { status: 502 })
  }
}
