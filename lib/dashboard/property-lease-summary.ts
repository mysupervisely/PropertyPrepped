import { deriveOccupancy, selectCurrentLease, type LeaseWithId } from '../leases/status'

/** Uses the canonical lease selection rules; historical leases are never presented as current. */
export function propertyLeaseSummary(leases: LeaseWithId[], rental: boolean, now: Date = new Date()): { label: string; value: string } {
  if (!rental) return { label: 'Lease', value: 'Not applicable' }
  const occupancy = deriveOccupancy(leases, now)
  if (occupancy === 'Vacant') return { label: 'Lease ends', value: '—' }
  if (occupancy === 'Occupancy unknown') return { label: 'Lease', value: 'Not entered' }
  const current = selectCurrentLease(leases, now)
  const upcoming = occupancy === 'Upcoming tenancy'
  const date = upcoming ? current?.start_date : current?.end_date
  if (!date) return { label: 'Lease', value: 'Not entered' }
  return {
    label: upcoming ? 'Lease starts' : 'Lease ends',
    value: new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(date)),
  }
}
