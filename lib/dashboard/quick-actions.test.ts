import { describe, expect, it } from 'vitest'
import {
  QUICK_ACTION_IDS, QUICK_ACTION_LABELS, QUICK_ACTION_SELECTION_SIZE, DEFAULT_QUICK_ACTIONS,
  isQuickActionId, isValidQuickActionSelection, normalizeQuickActionSelection,
} from './quick-actions'

describe('Mobile V2 — Quick Actions catalog', () => {
  it('has 8 catalog ids, each with a label, none blank or duplicated', () => {
    expect(QUICK_ACTION_IDS.length).toBe(8)
    expect(new Set(QUICK_ACTION_IDS).size).toBe(8)
    for (const id of QUICK_ACTION_IDS) {
      expect(QUICK_ACTION_LABELS[id]).toBeTruthy()
    }
    expect(Object.keys(QUICK_ACTION_LABELS).length).toBe(QUICK_ACTION_IDS.length)
  })

  it('the selection size is exactly 4', () => {
    expect(QUICK_ACTION_SELECTION_SIZE).toBe(4)
  })

  it('the default selection is exactly 4 valid, unique catalog ids', () => {
    expect(isValidQuickActionSelection(DEFAULT_QUICK_ACTIONS)).toBe(true)
  })

  it('the default selection does not include Add Property (the dashboard already has its own Add Property button)', () => {
    expect(DEFAULT_QUICK_ACTIONS).not.toContain('add_property')
  })

  it('the default selection is Add Expense, Smart Upload, Maintenance, Invite Tenant — the exact set Mobile V2 specifies', () => {
    expect(DEFAULT_QUICK_ACTIONS).toEqual(['add_expense', 'smart_upload', 'maintenance', 'invite_tenant'])
  })
})

describe('isQuickActionId', () => {
  it('accepts every catalog id', () => {
    for (const id of QUICK_ACTION_IDS) expect(isQuickActionId(id)).toBe(true)
  })

  it('rejects an unknown string, a non-string, null, and undefined', () => {
    expect(isQuickActionId('not_a_real_action')).toBe(false)
    expect(isQuickActionId(42)).toBe(false)
    expect(isQuickActionId(null)).toBe(false)
    expect(isQuickActionId(undefined)).toBe(false)
  })
})

describe('isValidQuickActionSelection', () => {
  it('accepts exactly 4 distinct valid ids, in any order', () => {
    expect(isValidQuickActionSelection(['tax_center', 'propcrew', 'add_property', 'tenant_messages'])).toBe(true)
  })

  it('rejects fewer than 4', () => {
    expect(isValidQuickActionSelection(['add_expense', 'smart_upload', 'maintenance'])).toBe(false)
  })

  it('rejects more than 4', () => {
    expect(isValidQuickActionSelection([...QUICK_ACTION_IDS])).toBe(false)
  })

  it('rejects a duplicate id padding out to 4', () => {
    expect(isValidQuickActionSelection(['add_expense', 'add_expense', 'maintenance', 'invite_tenant'])).toBe(false)
  })

  it('rejects an unknown id mixed in with 3 valid ones', () => {
    expect(isValidQuickActionSelection(['add_expense', 'smart_upload', 'maintenance', 'not_a_real_action'])).toBe(false)
  })

  it('rejects a non-array value (null, a plain object, a string)', () => {
    expect(isValidQuickActionSelection(null)).toBe(false)
    expect(isValidQuickActionSelection(undefined)).toBe(false)
    expect(isValidQuickActionSelection({ add_expense: true })).toBe(false)
    expect(isValidQuickActionSelection('add_expense')).toBe(false)
  })
})

describe('normalizeQuickActionSelection — the safe-fallback-to-defaults boundary', () => {
  it('passes through a valid selection unchanged, preserving the landlord\'s own order', () => {
    const picked: unknown = ['tenant_messages', 'propcrew', 'tax_center', 'add_property']
    expect(normalizeQuickActionSelection(picked)).toEqual(['tenant_messages', 'propcrew', 'tax_center', 'add_property'])
  })

  it('falls back to defaults for null (a fresh account, or Restore Defaults)', () => {
    expect(normalizeQuickActionSelection(null)).toEqual(DEFAULT_QUICK_ACTIONS)
  })

  it('falls back to defaults for undefined (no row in storage at all)', () => {
    expect(normalizeQuickActionSelection(undefined)).toEqual(DEFAULT_QUICK_ACTIONS)
  })

  it('falls back to defaults for a corrupt/wrong-shape value instead of throwing', () => {
    expect(normalizeQuickActionSelection('garbage')).toEqual(DEFAULT_QUICK_ACTIONS)
    expect(normalizeQuickActionSelection(123)).toEqual(DEFAULT_QUICK_ACTIONS)
    expect(normalizeQuickActionSelection({})).toEqual(DEFAULT_QUICK_ACTIONS)
    expect(normalizeQuickActionSelection(['add_expense'])).toEqual(DEFAULT_QUICK_ACTIONS)
  })

  it('falls back to defaults wholesale when a stale/unknown id is mixed into an otherwise-plausible 4 — never a partial selection', () => {
    const result = normalizeQuickActionSelection(['add_expense', 'smart_upload', 'maintenance', 'a_removed_future_action'])
    expect(result).toEqual(DEFAULT_QUICK_ACTIONS)
  })
})
