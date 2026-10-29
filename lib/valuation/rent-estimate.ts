// RentCast long-term rent AVM. All values must come from RentCast, never an LLM.
export type RentEstimate = {
  rent: number
  low: number | null
  high: number | null
  comparables: number
  source: 'rentcast'
  retrievedAt: string
}
type Raw = {
  rent?: unknown
  rentRangeLow?: unknown
  rentRangeHigh?: unknown
  comparables?: unknown
}
const positive = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null

export function normalizeRentEstimate(raw: Raw): RentEstimate | null {
  const rent = positive(raw.rent)
  if (rent === null) return null
  const low = positive(raw.rentRangeLow)
  const high = positive(raw.rentRangeHigh)
  return {
    rent,
    low: low !== null && low <= rent ? low : null,
    high: high !== null && high >= rent ? high : null,
    comparables: Array.isArray(raw.comparables) ? raw.comparables.length : 0,
    source: 'rentcast',
    retrievedAt: new Date().toISOString(),
  }
}
export async function getRentEstimate(address: string, apiKey: string): Promise<RentEstimate | null> {
  const url = new URL('https://api.rentcast.io/v1/avm/rent/long-term')
  url.searchParams.set('address', address)
  const response = await fetch(url, {
    headers: { 'X-Api-Key': apiKey, Accept: 'application/json' },
    signal: AbortSignal.timeout(12000),
  })
  if (!response.ok) throw new Error('RentCast rental estimate request failed: ' + response.status)
  return normalizeRentEstimate(await response.json() as Raw)
}
