import { describe, it, expect } from 'vitest'
import { propertyRentLabel, propertySummaryLabel } from './property-rent-label'

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

it('formats one consistent summary without inventing alerts or payment status', () => {
  expect(propertySummaryLabel('Overdue', false, 1)).toBe('1 alert - overdue')
  expect(propertySummaryLabel('Paid', false, 0)).toBe('Up to date')
  expect(propertySummaryLabel(undefined, true, 0)).toBe('No active lease')
  expect(propertySummaryLabel('Unknown', false, 2)).toBe('2 alerts - due date unavailable')
})
