import { describe, it, expect } from 'vitest'
import { propertyRentLabel } from './property-rent-label'

describe('property rent label', () => {
  it('uses up to date only for confirmed Paid rent', () => {
    expect(propertyRentLabel('Paid', false)).toBe('Rent up to date')
    for (const status of ['Upcoming', 'Due', 'Partial', 'Overdue', 'Unknown', undefined] as const) {
      expect(propertyRentLabel(status, false)).not.toContain('up to date')
    }
  })
  it('keeps vacancy and missing records distinct from paid rent', () => {
    expect(propertyRentLabel(undefined, true)).toBe('No active lease')
    expect(propertyRentLabel('Paid', true)).toBe('No active lease')
    expect(propertyRentLabel(undefined, false)).toBe('No rent record')
  })
  it('preserves due-date uncertainty and distinguishes unpaid states', () => {
    expect(propertyRentLabel('Unknown', false)).toBe('Due date unavailable')
    expect(propertyRentLabel('Upcoming', false)).toBe('Rent upcoming')
    expect(propertyRentLabel('Partial', false)).toBe('Partially paid')
    expect(propertyRentLabel('Due', false)).toBe('Rent due')
    expect(propertyRentLabel('Overdue', false)).toBe('Rent overdue')
  })
})
