import { describe, expect, it } from 'vitest'
import {
  deriveLeaseStatus, deriveOccupancy, selectCurrentLease, sortLeaseHistory,
  normalizeTenants, isValidRentDueDay, formatRentDueDay,
} from './status'

// Fixed "now" so every test is independent of the actual run date —
// same convention as lib/dashboard/date-classification.test.ts.
const NOW = new Date('2026-06-15T12:00:00')

function ymd(daysFromNow: number): string {
  const d = new Date(NOW)
  d.setDate(d.getDate() + daysFromNow)
  return d.toISOString().slice(0, 10)
}

describe('deriveLeaseStatus', () => {
  it('is Active for a lease well within its term', () => {
    expect(deriveLeaseStatus({ start_date: ymd(-90), end_date: ymd(90) }, NOW)).toBe('Active')
  })
  it('is Upcoming for a lease that has not started yet', () => {
    expect(deriveLeaseStatus({ start_date: ymd(10), end_date: ymd(400) }, NOW)).toBe('Upcoming')
  })
  it('is Expired for a lease whose end_date has passed', () => {
    expect(deriveLeaseStatus({ start_date: ymd(-400), end_date: ymd(-1) }, NOW)).toBe('Expired')
  })
  it('is Expiring Soon exactly at the 7-day boundary (matches Command Center Urgent)', () => {
    expect(deriveLeaseStatus({ start_date: ymd(-300), end_date: ymd(7) }, NOW)).toBe('Expiring Soon')
    expect(deriveLeaseStatus({ start_date: ymd(-300), end_date: ymd(0) }, NOW)).toBe('Expiring Soon')
  })
  it('is Active 8-30 days from expiration (not yet Expiring Soon)', () => {
    expect(deriveLeaseStatus({ start_date: ymd(-300), end_date: ymd(8) }, NOW)).toBe('Active')
    expect(deriveLeaseStatus({ start_date: ymd(-300), end_date: ymd(30) }, NOW)).toBe('Active')
  })
  it('is null when start_date is missing', () => {
    expect(deriveLeaseStatus({ start_date: null, end_date: ymd(30) }, NOW)).toBeNull()
  })
  it('is null when end_date is missing', () => {
    expect(deriveLeaseStatus({ start_date: ymd(-30), end_date: null }, NOW)).toBeNull()
  })
  it('is null for an unparseable date', () => {
    expect(deriveLeaseStatus({ start_date: 'not-a-date', end_date: ymd(30) }, NOW)).toBeNull()
  })
  it('is null when end_date is before start_date (invalid range)', () => {
    expect(deriveLeaseStatus({ start_date: ymd(10), end_date: ymd(-10) }, NOW)).toBeNull()
  })
})

describe('deriveOccupancy', () => {
  it('is Occupied when an active lease exists', () => {
    expect(deriveOccupancy([{ start_date: ymd(-30), end_date: ymd(60) }], NOW)).toBe('Occupied')
  })
  it('is Occupied when a lease is expiring soon (still living there today)', () => {
    expect(deriveOccupancy([{ start_date: ymd(-300), end_date: ymd(3) }], NOW)).toBe('Occupied')
  })
  it('is Vacant when there are no leases at all', () => {
    expect(deriveOccupancy([], NOW)).toBe('Vacant')
  })
  it('is Vacant when every lease has cleanly expired', () => {
    expect(deriveOccupancy([{ start_date: ymd(-400), end_date: ymd(-30) }], NOW)).toBe('Vacant')
  })
  it('is Upcoming tenancy when no lease is active but a future one exists', () => {
    expect(deriveOccupancy([{ start_date: ymd(-400), end_date: ymd(-30) }, { start_date: ymd(15), end_date: ymd(400) }], NOW)).toBe('Upcoming tenancy')
  })
  it('is Occupancy unknown rather than guessing Vacant when dates cannot be classified', () => {
    expect(deriveOccupancy([{ start_date: null, end_date: null }], NOW)).toBe('Occupancy unknown')
  })
  it('prefers Occupied over an unrelated unknown-dated historical row', () => {
    expect(deriveOccupancy([{ start_date: ymd(-30), end_date: ymd(60) }, { start_date: null, end_date: null }], NOW)).toBe('Occupied')
  })
})

describe('selectCurrentLease / sortLeaseHistory', () => {
  const active = { id: 'active', start_date: ymd(-30), end_date: ymd(60) }
  const oldest = { id: 'oldest', start_date: ymd(-800), end_date: ymd(-400) }
  const newerExpired = { id: 'newer-expired', start_date: ymd(-400), end_date: ymd(-31) }
  const future = { id: 'future', start_date: ymd(20), end_date: ymd(400) }

  it('selects the occupied lease as current when one exists', () => {
    expect(selectCurrentLease([oldest, newerExpired, active], NOW)?.id).toBe('active')
  })
  it('falls back to the soonest upcoming lease when nothing is currently occupied', () => {
    expect(selectCurrentLease([oldest, future], NOW)?.id).toBe('future')
  })
  it('returns null when every lease is expired (vacant, with history)', () => {
    expect(selectCurrentLease([oldest, newerExpired], NOW)).toBeNull()
  })
  it('returns null for an empty list', () => {
    expect(selectCurrentLease([], NOW)).toBeNull()
  })
  it('sorts current lease first, then the rest newest-to-oldest by end_date', () => {
    const sorted = sortLeaseHistory([oldest, active, newerExpired], NOW)
    expect(sorted.map((l) => l.id)).toEqual(['active', 'newer-expired', 'oldest'])
  })
  it('sorts purely by recency when there is no current lease', () => {
    const sorted = sortLeaseHistory([oldest, newerExpired], NOW)
    expect(sorted.map((l) => l.id)).toEqual(['newer-expired', 'oldest'])
  })
})

describe('normalizeTenants', () => {
  it('returns a single-entry array carrying name/email/phone', () => {
    expect(normalizeTenants({ tenant_name: 'Taylor Morgan', tenant_email: 't@example.com', tenant_phone: '555-0100' }))
      .toEqual([{ name: 'Taylor Morgan', email: 't@example.com', phone: '555-0100' }])
  })
  it('defaults a missing tenant_phone to null rather than undefined', () => {
    expect(normalizeTenants({ tenant_name: 'Taylor Morgan', tenant_email: null })).toEqual([{ name: 'Taylor Morgan', email: null, phone: null }])
  })
  it('returns an empty array for a blank tenant name rather than a hollow entry', () => {
    expect(normalizeTenants({ tenant_name: '  ', tenant_email: null })).toEqual([])
  })
})

describe('rent due day', () => {
  it('accepts every day 1-31', () => {
    expect(isValidRentDueDay(1)).toBe(true)
    expect(isValidRentDueDay(31)).toBe(true)
  })
  it('rejects 0, negative, non-integer, and out-of-range values', () => {
    expect(isValidRentDueDay(0)).toBe(false)
    expect(isValidRentDueDay(-1)).toBe(false)
    expect(isValidRentDueDay(32)).toBe(false)
    expect(isValidRentDueDay(15.5)).toBe(false)
  })
  it('treats null/undefined as valid (optional field)', () => {
    expect(isValidRentDueDay(null)).toBe(true)
    expect(isValidRentDueDay(undefined)).toBe(true)
  })
  it('formats with the correct ordinal suffix, including the 11th/12th/13th special case', () => {
    expect(formatRentDueDay(1)).toBe('Rent due on the 1st of each month')
    expect(formatRentDueDay(2)).toBe('Rent due on the 2nd of each month')
    expect(formatRentDueDay(3)).toBe('Rent due on the 3rd of each month')
    expect(formatRentDueDay(4)).toBe('Rent due on the 4th of each month')
    expect(formatRentDueDay(11)).toBe('Rent due on the 11th of each month')
    expect(formatRentDueDay(12)).toBe('Rent due on the 12th of each month')
    expect(formatRentDueDay(13)).toBe('Rent due on the 13th of each month')
    expect(formatRentDueDay(21)).toBe('Rent due on the 21st of each month')
    expect(formatRentDueDay(31)).toBe('Rent due on the 31st of each month')
  })
  it('is null when no due day is on file, never a guessed default', () => {
    expect(formatRentDueDay(null)).toBeNull()
    expect(formatRentDueDay(undefined)).toBeNull()
  })
})
