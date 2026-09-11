import { describe, expect, it } from 'vitest'
import { maintenanceCategoryIconKind } from './category-icon'
import { MAINTENANCE_CATEGORY_IDS } from './categories'

describe('maintenanceCategoryIconKind (Phase D.1)', () => {
  it('maps every real MaintenanceCategoryId to one of the 5 known icon kinds — never throws, never an unrecognized value', () => {
    const KNOWN = new Set(['hvac', 'plumbing', 'electrical', 'appliance', 'general'])
    for (const id of MAINTENANCE_CATEGORY_IDS) {
      expect(KNOWN.has(maintenanceCategoryIconKind(id))).toBe(true)
    }
  })

  it('heating_ac maps to hvac', () => {
    expect(maintenanceCategoryIconKind('heating_ac')).toBe('hvac')
  })

  it('plumbing, toilet, and leak_water all map to the same plumbing icon', () => {
    expect(maintenanceCategoryIconKind('plumbing')).toBe('plumbing')
    expect(maintenanceCategoryIconKind('toilet')).toBe('plumbing')
    expect(maintenanceCategoryIconKind('leak_water')).toBe('plumbing')
  })

  it('electrical maps to electrical', () => {
    expect(maintenanceCategoryIconKind('electrical')).toBe('electrical')
  })

  it('appliance maps to appliance', () => {
    expect(maintenanceCategoryIconKind('appliance')).toBe('appliance')
  })

  it('lock_door and other both fall back to the neutral general icon (not invented sixth icons)', () => {
    expect(maintenanceCategoryIconKind('lock_door')).toBe('general')
    expect(maintenanceCategoryIconKind('other')).toBe('general')
  })

  it('a landlord-logged case (category null) gets the neutral fallback, never a guess', () => {
    expect(maintenanceCategoryIconKind(null)).toBe('general')
    expect(maintenanceCategoryIconKind(undefined)).toBe('general')
  })

  it('an unrecognized/future category value falls back to general rather than throwing', () => {
    expect(maintenanceCategoryIconKind('some_future_category')).toBe('general')
  })
})
