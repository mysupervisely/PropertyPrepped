import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MAINTENANCE_CATEGORIES, MAINTENANCE_CATEGORY_IDS, maintenanceCategoryLabel, isMaintenanceCategoryId } from './categories'

describe('Maintenance category taxonomy (M1 foundation)', () => {
  it('is exactly the eight categories named in the M1 brief, in the brief\'s own order', () => {
    expect(MAINTENANCE_CATEGORY_IDS).toEqual([
      'heating_ac', 'plumbing', 'toilet', 'electrical', 'appliance', 'lock_door', 'leak_water', 'other',
    ])
  })

  it('every id is a stable, machine-readable identifier (lowercase snake_case), distinct from its display label', () => {
    for (const c of MAINTENANCE_CATEGORIES) {
      expect(c.id).toMatch(/^[a-z]+(_[a-z]+)*$/)
      expect(c.id).not.toBe(c.label)
    }
  })

  it('every label is the exact, human-readable text from the M1 brief', () => {
    const byId = Object.fromEntries(MAINTENANCE_CATEGORIES.map((c) => [c.id, c.label]))
    expect(byId.heating_ac).toBe('Heating / AC')
    expect(byId.plumbing).toBe('Plumbing')
    expect(byId.toilet).toBe('Toilet')
    expect(byId.electrical).toBe('Electrical')
    expect(byId.appliance).toBe('Appliance')
    expect(byId.lock_door).toBe('Lock / Door')
    expect(byId.leak_water).toBe('Leak / Water')
    expect(byId.other).toBe('Other')
  })

  it('maintenanceCategoryLabel() resolves every real id to its label', () => {
    expect(maintenanceCategoryLabel('heating_ac')).toBe('Heating / AC')
    expect(maintenanceCategoryLabel('lock_door')).toBe('Lock / Door')
  })

  it('maintenanceCategoryLabel() falls back to the raw value for an unrecognized id, never throws', () => {
    expect(maintenanceCategoryLabel('made_up')).toBe('made_up')
  })

  it('isMaintenanceCategoryId() correctly distinguishes real ids from arbitrary strings', () => {
    expect(isMaintenanceCategoryId('plumbing')).toBe(true)
    expect(isMaintenanceCategoryId('Plumbing')).toBe(false)
    expect(isMaintenanceCategoryId('made_up')).toBe(false)
  })

  it('exactly matches tenant_requests.category\'s CHECK constraint in the M1 migration', () => {
    const sql = readFileSync(join(__dirname, '..', '..', 'supabase', 'milestone-25-maintenance-coordination-foundation.sql'), 'utf8')
    const checkMatch = sql.match(/category text not null check \(category in \(([^)]+)\)\)/)
    expect(checkMatch).not.toBeNull()
    const sqlIds = (checkMatch as RegExpMatchArray)[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''))
    expect(sqlIds).toEqual(MAINTENANCE_CATEGORY_IDS)
  })
})
