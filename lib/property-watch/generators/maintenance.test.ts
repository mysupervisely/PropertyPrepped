import { describe, expect, it } from 'vitest'
import { deriveMaintenanceRecurrenceDrafts, type MaintenanceRecordLike } from './maintenance'
import type { PropertyLike } from './lease'

const NOW = new Date('2026-08-14T12:00:00')
const property: PropertyLike = { id: 'prop-1', owner_id: 'owner-1', address: '1 Signal St' }

function record(overrides: Partial<MaintenanceRecordLike>): MaintenanceRecordLike {
  return { id: 'record-1', property_id: 'prop-1', service_date: '2026-06-01', category: 'HVAC', ...overrides }
}

describe('deriveMaintenanceRecurrenceDrafts', () => {
  it('fires when the same category has 3+ events within the trailing 12 months', () => {
    const records = [
      record({ id: '1', service_date: '2026-02-01' }),
      record({ id: '2', service_date: '2026-05-01' }),
      record({ id: '3', service_date: '2026-07-01' }),
    ]
    const drafts = deriveMaintenanceRecurrenceDrafts(records, property, NOW)
    expect(drafts).toHaveLength(1)
    expect(drafts[0].category).toBe('Maintenance')
    expect(drafts[0].description).toContain('HVAC has had 3 recorded service events')
    expect(drafts[0].priority).toBe('Normal')
  })

  it('does not fire on only 2 events', () => {
    const records = [record({ id: '1', service_date: '2026-02-01' }), record({ id: '2', service_date: '2026-05-01' })]
    expect(deriveMaintenanceRecurrenceDrafts(records, property, NOW)).toHaveLength(0)
  })

  it('does not count events older than 12 months', () => {
    const records = [
      record({ id: '1', service_date: '2024-01-01' }), // too old
      record({ id: '2', service_date: '2026-05-01' }),
      record({ id: '3', service_date: '2026-07-01' }),
    ]
    expect(deriveMaintenanceRecurrenceDrafts(records, property, NOW)).toHaveLength(0)
  })

  it('never diagnoses or claims replacement is necessary', () => {
    const records = [record({ id: '1', service_date: '2026-02-01' }), record({ id: '2', service_date: '2026-05-01' }), record({ id: '3', service_date: '2026-07-01' })]
    const description = deriveMaintenanceRecurrenceDrafts(records, property, NOW)[0].description.toLowerCase()
    expect(description).not.toContain('replace')
    expect(description).not.toContain('diagnos')
  })

  it('tracks categories independently and can produce multiple drafts', () => {
    const records = [
      record({ id: '1', category: 'HVAC', service_date: '2026-02-01' }),
      record({ id: '2', category: 'HVAC', service_date: '2026-05-01' }),
      record({ id: '3', category: 'HVAC', service_date: '2026-07-01' }),
      record({ id: '4', category: 'Plumbing', service_date: '2026-01-01' }),
      record({ id: '5', category: 'Plumbing', service_date: '2026-03-01' }),
      record({ id: '6', category: 'Plumbing', service_date: '2026-06-01' }),
    ]
    const drafts = deriveMaintenanceRecurrenceDrafts(records, property, NOW)
    expect(drafts.map((d) => d.metadata.category).sort()).toEqual(['HVAC', 'Plumbing'])
  })

  it('ignores records for a different property', () => {
    const records = [
      record({ id: '1', property_id: 'other', service_date: '2026-02-01' }),
      record({ id: '2', property_id: 'other', service_date: '2026-05-01' }),
      record({ id: '3', property_id: 'other', service_date: '2026-07-01' }),
    ]
    expect(deriveMaintenanceRecurrenceDrafts(records, property, NOW)).toHaveLength(0)
  })
})
