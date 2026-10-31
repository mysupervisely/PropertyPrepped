import type { RentStatus } from '../rent-ledger/status'

/** Presentation only. Absence of overdue rent is not evidence of payment. */
export function propertyRentLabel(status: RentStatus | undefined, vacant: boolean): string {
  if (vacant) return 'No active lease'
  if (!status) return 'No rent record'
  switch (status) {
    case 'Paid': return 'Rent up to date'
    case 'Overdue': return 'Rent overdue'
    case 'Due': return 'Rent due'
    case 'Partial': return 'Partially paid'
    case 'Upcoming': return 'Rent upcoming'
    case 'Unknown': return 'Due date unavailable'
  }
}
