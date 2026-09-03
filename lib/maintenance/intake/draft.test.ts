import { describe, expect, it } from 'vitest'
import { draftStorageKey, serializeDraft, parseDraft, type IntakeDraft } from './draft'

const sample: IntakeDraft = { category: 'heating_ac', stepHistory: ['hvac_symptom', 'thermostat_mode'], answers: { hvac_symptom: 'ac_not_cooling', thermostat_mode: 'cool' } }

describe('draftStorageKey', () => {
  it('is scoped per tenant_access_id, so two different tenancies never collide', () => {
    expect(draftStorageKey('access-1')).not.toBe(draftStorageKey('access-2'))
  })

  it('is stable for the same tenant_access_id', () => {
    expect(draftStorageKey('access-1')).toBe(draftStorageKey('access-1'))
  })
})

describe('serializeDraft / parseDraft round-trip', () => {
  it('round-trips a real draft exactly', () => {
    expect(parseDraft(serializeDraft(sample))).toEqual(sample)
  })

  it('parseDraft returns null for missing/empty input, never throws', () => {
    expect(parseDraft(null)).toBeNull()
    expect(parseDraft('')).toBeNull()
  })

  it('parseDraft returns null for corrupted JSON, never throws', () => {
    expect(parseDraft('{not valid json')).toBeNull()
  })

  it('parseDraft returns null for well-formed JSON missing required fields', () => {
    expect(parseDraft(JSON.stringify({ category: 'heating_ac' }))).toBeNull()
    expect(parseDraft(JSON.stringify({ stepHistory: [], answers: {} }))).toBeNull()
    expect(parseDraft(JSON.stringify(['not', 'an', 'object']))).toBeNull()
    expect(parseDraft(JSON.stringify(null))).toBeNull()
  })
})
