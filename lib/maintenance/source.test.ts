import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { MAINTENANCE_REQUEST_SOURCES, isMaintenanceRequestSource } from './source'

describe('MAINTENANCE_REQUEST_SOURCES (M1.1 canonical maintenance case)', () => {
  it('is exactly tenant/landlord, in that order', () => {
    expect(MAINTENANCE_REQUEST_SOURCES).toEqual(['tenant', 'landlord'])
  })

  it('accepts every real value, rejects anything else, never throws', () => {
    for (const s of MAINTENANCE_REQUEST_SOURCES) expect(isMaintenanceRequestSource(s)).toBe(true)
    expect(isMaintenanceRequestSource('provider')).toBe(false)
    expect(isMaintenanceRequestSource('')).toBe(false)
    expect(isMaintenanceRequestSource('Tenant')).toBe(false)
  })

  it('exactly matches maintenance_requests.source\'s CHECK constraint in the M1.1 migration', () => {
    const sql = readFileSync(join(__dirname, '..', '..', 'supabase', 'milestone-26-canonical-maintenance-case.sql'), 'utf8')
    const checkMatch = sql.match(/check \(source in \(([^)]+)\)\)/)
    expect(checkMatch).not.toBeNull()
    const sqlValues = (checkMatch as RegExpMatchArray)[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''))
    expect(sqlValues).toEqual([...MAINTENANCE_REQUEST_SOURCES])
  })
})
