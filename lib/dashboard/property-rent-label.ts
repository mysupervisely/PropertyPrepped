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


export function propertySummaryLabel(status: RentStatus | undefined, vacant: boolean, alerts: number): string {
  if (vacant) return alerts > 0 ? `${alerts} alert${alerts === 1 ? '' : 's'}` : 'No alerts'
  const label = propertyRentLabel(status, vacant).replace(/^Rent /, '')
  return alerts > 0 ? `${alerts} alert${alerts === 1 ? '' : 's'} - ${label.toLowerCase()}` : label.charAt(0).toUpperCase() + label.slice(1)
}
