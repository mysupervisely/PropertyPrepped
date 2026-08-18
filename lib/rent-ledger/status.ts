// PropRoster — Milestone 18: Rent Ledger + PropWatch V1, rent obligation
// and rent-status derivation.
//
// Pure functions only — no Supabase calls, no React. Expected rent is
// NEVER persisted or cron-generated: it's always derived live from a
// lease's existing monthly_rent / rent_due_day / start_date / end_date
// (reusing lib/leases/status.ts's isValidRentDueDay, Milestone 17), then
// compared against however many rent_payments rows are actually on file
// for that lease/period. "Due today" vs. "in the future" vs. "overdue"
// reuses lib/dashboard/date-classification.ts's daysUntil/parseDateOnly
// directly — the SAME date math Command Center already uses, never a
// second implementation.

import { parseDateOnly, daysUntil } from '../dashboard/date-classification'
import { isValidRentDueDay } from '../leases/status'

export type RentPeriod = { year: number; month: number } // month is 1-12

export type RentStatus = 'Upcoming' | 'Due' | 'Paid' | 'Partial' | 'Overdue' | 'Unknown'

export type RentObligationReason = 'missing_rent_due_day' | 'invalid_lease_dates' | 'outside_lease_term'

export type RentObligation = {
  /** False when this lease simply doesn't cover the given period at all (ended before it, starts after it) — the caller should not show a row for it. */
  applicable: boolean
  /** Null when applicable-but-unknowable (missing rent_due_day or unparseable lease dates) — never a guessed date. */
  dueDate: string | null
  expectedAmount: number
  reason?: RentObligationReason
}

export type LeaseForRent = {
  monthly_rent: number
  rent_due_day?: number | null
  start_date: string
  end_date: string
}

/** "August 2026" style period from an actual Date — used to default the ledger to the current month. */
export function periodFromDate(date: Date): RentPeriod {
  return { year: date.getFullYear(), month: date.getMonth() + 1 }
}

export function periodKey(period: RentPeriod): string {
  return `${period.year}-${String(period.month).padStart(2, '0')}`
}

/** The first calendar day of the period, as a YYYY-MM-DD string — how rent_period is always stored on a rent_payments row. */
export function periodStart(period: RentPeriod): string {
  return `${periodKey(period)}-01`
}

/** The last calendar day of the period (handles 28/29/30/31 correctly), as YYYY-MM-DD. */
export function periodEnd(period: RentPeriod): string {
  const lastDay = new Date(period.year, period.month, 0).getDate()
  return `${periodKey(period)}-${String(lastDay).padStart(2, '0')}`
}

export function shiftPeriod(period: RentPeriod, delta: number): RentPeriod {
  const total = period.year * 12 + (period.month - 1) + delta
  return { year: Math.floor(total / 12), month: (total % 12) + 1 }
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function formatPeriodLabel(period: RentPeriod): string {
  return `${MONTH_NAMES[period.month - 1]} ${period.year}`
}

/** Clamps a 1-31 rent_due_day to the actual last day of the given period (e.g. day 31 in a 30-day month lands on the 30th) — never a rent ledger, just an honest calendar day. */
export function clampDueDate(rentDueDay: number, period: RentPeriod): string {
  const lastDay = new Date(period.year, period.month, 0).getDate()
  const day = Math.min(Math.max(1, Math.round(rentDueDay)), lastDay)
  return `${periodKey(period)}-${String(day).padStart(2, '0')}`
}

/**
 * Whether/how much rent a lease expects for a given calendar month.
 *
 * - A lease whose active window doesn't overlap the period at all
 *   (ended before it, starts after it) is NOT applicable — no row, no
 *   obligation, nothing to pay. Reused for lease-turnover safety
 *   (Section 18): a historical lease creates no obligation after its
 *   end_date, an upcoming lease creates none before its start_date.
 * - A lease that overlaps the period, but whose derived due date would
 *   fall before start_date (lease started mid-period, after the due
 *   day already passed for that month) is also not applicable — no
 *   rent was contractually due yet.
 * - Unparseable/invalid lease dates surface as applicable=true with
 *   dueDate=null (reason 'invalid_lease_dates') rather than being
 *   silently hidden — a data problem should stay visible until fixed,
 *   same philosophy as Milestone 17's "Occupancy unknown."
 * - A missing rent_due_day is applicable=true, dueDate=null (reason
 *   'missing_rent_due_day') — never assumes the 1st.
 */
export function deriveRentObligation(lease: LeaseForRent, period: RentPeriod): RentObligation {
  const expectedAmount = Number(lease.monthly_rent) || 0
  const startValid = parseDateOnly(lease.start_date) !== null
  const endValid = parseDateOnly(lease.end_date) !== null
  if (!startValid || !endValid || lease.end_date < lease.start_date) {
    return { applicable: true, dueDate: null, expectedAmount, reason: 'invalid_lease_dates' }
  }

  const pStart = periodStart(period)
  const pEnd = periodEnd(period)
  const overlaps = lease.start_date <= pEnd && lease.end_date >= pStart
  if (!overlaps) return { applicable: false, dueDate: null, expectedAmount: 0, reason: 'outside_lease_term' }

  if (!isValidRentDueDay(lease.rent_due_day) || !lease.rent_due_day) {
    return { applicable: true, dueDate: null, expectedAmount, reason: 'missing_rent_due_day' }
  }

  const dueDate = clampDueDate(lease.rent_due_day, period)
  if (dueDate < lease.start_date || dueDate > lease.end_date) {
    return { applicable: false, dueDate: null, expectedAmount: 0, reason: 'outside_lease_term' }
  }

  return { applicable: true, dueDate, expectedAmount }
}

/**
 * Derives the landlord-facing status by comparing the obligation's due
 * date (relative to "now," via the same daysUntil() Command Center
 * uses) against total recorded payments:
 *   Paid     — total payments >= expected amount
 *   Overdue  — a balance remains and the due date has already passed
 *   Partial  — something has been paid, balance remains, not yet due
 *   Due      — nothing paid, due date is today
 *   Upcoming — nothing paid, due date is in the future
 *   Unknown  — due date can't be determined (missing/invalid lease data)
 * Returns null when the lease isn't applicable to this period at all
 * (obligation.applicable === false) — the caller shows no row.
 */
export function deriveRentStatus(obligation: RentObligation, totalPaid: number, now: Date = new Date()): RentStatus | null {
  if (!obligation.applicable) return null
  if (obligation.dueDate === null) return 'Unknown'

  const remaining = obligation.expectedAmount - totalPaid
  if (remaining <= 0) return 'Paid'

  const days = daysUntil(obligation.dueDate, now)
  if (days === null) return 'Unknown'
  if (days < 0) return 'Overdue'
  if (totalPaid > 0) return 'Partial'
  if (days === 0) return 'Due'
  return 'Upcoming'
}

// -- Rent payment <-> financial transaction deletion safety -----------
//
// Deleting a rent payment must be able to clean up the ONE
// financial_transactions row IT created (so a deleted payment never
// leaves phantom income behind) — but must NEVER delete a pre-existing/
// manual transaction that a payment merely got linked to. The only
// current write path (Record Payment) always creates a fresh
// transaction rather than linking an existing one, but the RLS layer
// doesn't enforce that, so deletion logic must not rely on "a link
// exists" as a proxy for "this payment created it" — it must check the
// explicit created_linked_transaction marker instead.

export type RentPaymentForDeletion = { financial_transaction_id: string | null; created_linked_transaction: boolean }

/** True only when this payment is what created financial_transaction_id — never true for a payment merely linked to a pre-existing/manual transaction. */
export function shouldDeleteLinkedTransaction(payment: RentPaymentForDeletion): boolean {
  return payment.created_linked_transaction === true && payment.financial_transaction_id !== null
}
