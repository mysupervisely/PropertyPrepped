import { describe, expect, it } from 'vitest'
import {
  periodFromDate, periodKey, periodStart, periodEnd, shiftPeriod, formatPeriodLabel, clampDueDate,
  deriveRentObligation, deriveRentStatus, shouldDeleteLinkedTransaction,
} from './status'

const AUG_2026 = { year: 2026, month: 8 }
const NOW = new Date('2026-08-15T12:00:00')

describe('period helpers', () => {
  it('periodFromDate reads year/month (1-12) from a real Date', () => {
    expect(periodFromDate(new Date('2026-08-15T12:00:00'))).toEqual({ year: 2026, month: 8 })
  })
  it('periodKey / periodStart / periodEnd', () => {
    expect(periodKey(AUG_2026)).toBe('2026-08')
    expect(periodStart(AUG_2026)).toBe('2026-08-01')
    expect(periodEnd(AUG_2026)).toBe('2026-08-31')
    expect(periodEnd({ year: 2026, month: 2 })).toBe('2026-02-28') // non-leap Feb
    expect(periodEnd({ year: 2028, month: 2 })).toBe('2028-02-29') // leap Feb
  })
  it('shiftPeriod moves forward and backward across year boundaries', () => {
    expect(shiftPeriod(AUG_2026, 1)).toEqual({ year: 2026, month: 9 })
    expect(shiftPeriod(AUG_2026, -1)).toEqual({ year: 2026, month: 7 })
    expect(shiftPeriod({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 })
    expect(shiftPeriod({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 })
  })
  it('formatPeriodLabel', () => {
    expect(formatPeriodLabel(AUG_2026)).toBe('August 2026')
  })
  it('clampDueDate keeps a valid day and clamps an out-of-range day (31st in a 30-day month) to the month\'s last real day', () => {
    expect(clampDueDate(1, AUG_2026)).toBe('2026-08-01')
    expect(clampDueDate(31, AUG_2026)).toBe('2026-08-31')
    expect(clampDueDate(31, { year: 2026, month: 9 })).toBe('2026-09-30')
    expect(clampDueDate(30, { year: 2026, month: 2 })).toBe('2026-02-28')
  })
})

describe('deriveRentObligation', () => {
  it('a lease well within its term has an applicable obligation on its due day', () => {
    const lease = { monthly_rent: 2400, rent_due_day: 1, start_date: '2026-01-01', end_date: '2026-12-31' }
    expect(deriveRentObligation(lease, AUG_2026)).toEqual({ applicable: true, dueDate: '2026-08-01', expectedAmount: 2400 })
  })
  it('a lease that starts mid-period, after that month\'s due day, has no obligation for that month', () => {
    const lease = { monthly_rent: 2400, rent_due_day: 1, start_date: '2026-08-15', end_date: '2027-08-14' }
    expect(deriveRentObligation(lease, AUG_2026).applicable).toBe(false)
  })
  it('a lease that starts mid-period but before that month\'s due day IS applicable', () => {
    const lease = { monthly_rent: 2400, rent_due_day: 20, start_date: '2026-08-15', end_date: '2027-08-14' }
    const obligation = deriveRentObligation(lease, AUG_2026)
    expect(obligation).toEqual({ applicable: true, dueDate: '2026-08-20', expectedAmount: 2400 })
  })
  it('a lease that ended before the selected period has no obligation', () => {
    const lease = { monthly_rent: 2400, rent_due_day: 1, start_date: '2025-01-01', end_date: '2026-07-31' }
    expect(deriveRentObligation(lease, AUG_2026).applicable).toBe(false)
  })
  it('an upcoming lease (starts after the selected period) has no obligation yet', () => {
    const lease = { monthly_rent: 2400, rent_due_day: 1, start_date: '2026-09-01', end_date: '2027-08-31' }
    expect(deriveRentObligation(lease, AUG_2026).applicable).toBe(false)
  })
  it('that same upcoming lease DOES have an obligation once its own start month is selected', () => {
    const lease = { monthly_rent: 2400, rent_due_day: 1, start_date: '2026-09-01', end_date: '2027-08-31' }
    expect(deriveRentObligation(lease, { year: 2026, month: 9 })).toEqual({ applicable: true, dueDate: '2026-09-01', expectedAmount: 2400 })
  })
  it('missing rent_due_day is applicable but has no derivable due date', () => {
    const lease = { monthly_rent: 2400, rent_due_day: null, start_date: '2026-01-01', end_date: '2026-12-31' }
    expect(deriveRentObligation(lease, AUG_2026)).toEqual({ applicable: true, dueDate: null, expectedAmount: 2400, reason: 'missing_rent_due_day' })
  })
  it('an out-of-range rent_due_day is treated the same as missing (never trusted blindly)', () => {
    const lease = { monthly_rent: 2400, rent_due_day: 45, start_date: '2026-01-01', end_date: '2026-12-31' }
    expect(deriveRentObligation(lease, AUG_2026).reason).toBe('missing_rent_due_day')
  })
  it('invalid/unparseable lease dates surface as a visible, applicable "unknown" rather than being hidden', () => {
    const lease = { monthly_rent: 2400, rent_due_day: 1, start_date: 'not-a-date', end_date: '2026-12-31' }
    expect(deriveRentObligation(lease, AUG_2026)).toEqual({ applicable: true, dueDate: null, expectedAmount: 2400, reason: 'invalid_lease_dates' })
  })
  it('end_date before start_date is treated as invalid', () => {
    const lease = { monthly_rent: 2400, rent_due_day: 1, start_date: '2026-08-10', end_date: '2026-08-01' }
    expect(deriveRentObligation(lease, AUG_2026).reason).toBe('invalid_lease_dates')
  })
})

describe('deriveRentStatus', () => {
  const activeLease = { monthly_rent: 2400, rent_due_day: 1, start_date: '2026-01-01', end_date: '2026-12-31' }

  it('is null (no row) when the obligation is not applicable', () => {
    const notApplicable = deriveRentObligation({ monthly_rent: 2400, rent_due_day: 1, start_date: '2025-01-01', end_date: '2026-07-31' }, AUG_2026)
    expect(deriveRentStatus(notApplicable, 0, NOW)).toBeNull()
  })
  it('is Unknown when the due date cannot be determined', () => {
    const unknown = deriveRentObligation({ monthly_rent: 2400, rent_due_day: null, start_date: '2026-01-01', end_date: '2026-12-31' }, AUG_2026)
    expect(deriveRentStatus(unknown, 0, NOW)).toBe('Unknown')
  })
  it('is Upcoming when nothing is paid and the due date is in the future', () => {
    const obligation = deriveRentObligation(activeLease, { year: 2026, month: 9 })
    expect(deriveRentStatus(obligation, 0, NOW)).toBe('Upcoming')
  })
  it('is Due when nothing is paid and the due date is today', () => {
    const obligation = deriveRentObligation({ ...activeLease, rent_due_day: 15 }, AUG_2026)
    expect(deriveRentStatus(obligation, 0, NOW)).toBe('Due')
  })
  it('is Paid when total payments meet or exceed the expected amount', () => {
    const obligation = deriveRentObligation(activeLease, AUG_2026) // due Aug 1, already past relative to NOW (Aug 15)
    expect(deriveRentStatus(obligation, 2400, NOW)).toBe('Paid')
    expect(deriveRentStatus(obligation, 3000, NOW)).toBe('Paid') // overpayment still reads as Paid, never negative/broken
  })
  it('is Overdue when a balance remains after the due date has passed', () => {
    const obligation = deriveRentObligation(activeLease, AUG_2026) // due Aug 1
    expect(deriveRentStatus(obligation, 0, NOW)).toBe('Overdue')
    expect(deriveRentStatus(obligation, 1000, NOW)).toBe('Overdue') // partial payment does not rescue an overdue balance
  })
  it('is Partial when something has been paid, a balance remains, and the due date has not passed yet', () => {
    const obligation = deriveRentObligation({ ...activeLease, rent_due_day: 25 }, AUG_2026) // due Aug 25, NOW is Aug 15
    expect(deriveRentStatus(obligation, 1200, NOW)).toBe('Partial')
  })
  it('supports multiple payments summed by the caller before calling deriveRentStatus (two $1,200 payments = Paid)', () => {
    const obligation = deriveRentObligation(activeLease, AUG_2026)
    const totalPaid = 1200 + 1200
    expect(deriveRentStatus(obligation, totalPaid, NOW)).toBe('Paid')
  })
})

describe('shouldDeleteLinkedTransaction', () => {
  it('is true when this payment created the linked transaction', () => {
    expect(shouldDeleteLinkedTransaction({ financial_transaction_id: 'tx-1', created_linked_transaction: true })).toBe(true)
  })
  it('is false when the payment is merely linked to a pre-existing/manual transaction — that transaction must never be deleted', () => {
    expect(shouldDeleteLinkedTransaction({ financial_transaction_id: 'tx-manual', created_linked_transaction: false })).toBe(false)
  })
  it('is false when there is no linked transaction at all, even if the marker were somehow true', () => {
    expect(shouldDeleteLinkedTransaction({ financial_transaction_id: null, created_linked_transaction: true })).toBe(false)
  })
  it('is false for the common case of no linkage and no marker', () => {
    expect(shouldDeleteLinkedTransaction({ financial_transaction_id: null, created_linked_transaction: false })).toBe(false)
  })
})
