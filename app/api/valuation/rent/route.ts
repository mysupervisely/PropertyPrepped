import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { normalizeRentEstimate } from '../../../../lib/valuation/rent-estimate'

export const runtime = 'nodejs'
const THIRTY_DAYS = 60 * 60 * 24 * 30

// An explicit user action is required to request an estimate. No background
// requests or automatic calls on page load, protecting the free API allowance.
export async function POST(req: NextRequest) {
  const bearer = req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1]
  if (!bearer) return NextResponse.json({ error: 'Sign in to request an estimate.' }, { status: 401 })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) return NextResponse.json({ error: 'Service unavailable.' }, { status: 503 })
  const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: auth, error: authError } = await client.auth.getUser(bearer)
  if (authError || !auth.user) return NextResponse.json({ error: 'Session expired.' }, { status: 401 })
  const body = await req.json().catch(() => null) as { propertyId?: unknown } | null
  if (typeof body?.propertyId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.propertyId)) {
    return NextResponse.json({ error: 'Invalid property.' }, { status: 400 })
  }
  const { data: property, error } = await client.from('properties').select('id,address,city').eq('id', body.propertyId).eq('owner_id', auth.user.id).single()
  if (error || !property) return NextResponse.json({ error: 'Property not found.' }, { status: 404 })
  const address = [property.address, property.city].filter(Boolean).join(', ').trim()
  if (address.length < 8) return NextResponse.json({ error: 'Add a complete property address first.' }, { status: 400 })
  const key = process.env.RENTCAST_API_KEY
  if (!key) return NextResponse.json({ error: 'Rental estimates are not configured.' }, { status: 503 })
  try {
    const endpoint = new URL('https://api.rentcast.io/v1/avm/rent/long-term')
    endpoint.searchParams.set('address', address)
    const response = await fetch(endpoint, {
      headers: { 'X-Api-Key': key, Accept: 'application/json' },
      next: { revalidate: THIRTY_DAYS },
      signal: AbortSignal.timeout(12000),
    })
    if (!response.ok) {
      console.error('RentCast rental API status', response.status)
      return NextResponse.json({ error: 'Rental estimate temporarily unavailable.' }, { status: 502 })
    }
    const estimate = normalizeRentEstimate(await response.json())
    return NextResponse.json({ estimate }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    console.error('RentCast rental estimate failure', error)
    return NextResponse.json({ error: 'Could not retrieve rental estimate.' }, { status: 502 })
  }
}
