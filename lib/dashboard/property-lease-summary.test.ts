import { describe, it, expect } from 'vitest'
import { propertyLeaseSummary } from './property-lease-summary'
const now = new Date('2026-10-31T12:00:00Z')
const active = { id: 'active', start_date: '2026-01-01', end_date: '2027-08-01' }
const expired = { id: 'expired', start_date: '2024-01-01', end_date: '2025-01-01' }
describe('property lease summary', () => {
  it('shows the active lease end instead of an expired historical lease', () => {
    expect(propertyLeaseSummary([expired, active], true, now)).toEqual({ label: 'Lease ends', value: 'Aug 2027' })
  })
  it('shows Vacant for no lease or only expired leases', () => {
    for (const leases of [[], [expired]]) expect(propertyLeaseSummary(leases, true, now)).toEqual({ label: 'Occupancy', value: 'Vacant' })
  })
  it('does not label incomplete lease dates Vacant', () => {
    expect(propertyLeaseSummary([{ id: 'incomplete', start_date: null, end_date: null }], true, now)).toEqual({ label: 'Lease', value: 'Not entered' })
  })
  it('shows a future start rather than pretending a tenant is already in place', () => {
    expect(propertyLeaseSummary([{ id: 'future', start_date: '2026-12-01', end_date: '2027-12-01' }], true, now)).toEqual({ label: 'Lease starts', value: 'Dec 2026' })
  })
  it('does not call a non-rental property vacant', () => {
    expect(propertyLeaseSummary([], false, now)).toEqual({ label: 'Lease', value: 'Not applicable' })
  })
})
