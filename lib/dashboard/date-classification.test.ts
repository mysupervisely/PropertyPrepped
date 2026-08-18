import { describe, expect, it } from 'vitest'
import { classifyDate, daysUntil, isAttentionUrgency, parseDateOnly } from './date-classification'

// Fixed "today" for deterministic tests — a plain Wednesday, no month/
// year-boundary edge cases of its own.
const TODAY = new Date(2026, 5, 17, 9, 30, 0) // June 17, 2026, mid-morning
const dateStr = (offsetDays: number) => {
  const d = new Date(2026, 5, 17 + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

describe('parseDateOnly', () => {
  it('parses a YYYY-MM-DD string at local noon', () => {
    const parsed = parseDateOnly('2026-06-17')
    expect(parsed?.getHours()).toBe(12)
    expect(parsed?.getFullYear()).toBe(2026)
    expect(parsed?.getMonth()).toBe(5)
    expect(parsed?.getDate()).toBe(17)
  })

  it('returns null for null/undefined/empty input', () => {
    expect(parseDateOnly(null)).toBeNull()
    expect(parseDateOnly(undefined)).toBeNull()
    expect(parseDateOnly('')).toBeNull()
  })

  it('returns null for an invalid date string — never throws', () => {
    expect(parseDateOnly('not-a-date')).toBeNull()
  })
})

describe('daysUntil', () => {
  it('is 0 for today', () => {
    expect(daysUntil(dateStr(0), TODAY)).toBe(0)
  })

  it('is -1 for yesterday', () => {
    expect(daysUntil(dateStr(-1), TODAY)).toBe(-1)
  })

  it('is 1 for tomorrow', () => {
    expect(daysUntil(dateStr(1), TODAY)).toBe(1)
  })

  it('is unaffected by the current time of day (mid-morning "now" still gives whole-day counts)', () => {
    const lateInDay = new Date(2026, 5, 17, 23, 59, 0)
    expect(daysUntil(dateStr(1), lateInDay)).toBe(1)
  })

  it('returns null for a missing date', () => {
    expect(daysUntil(null, TODAY)).toBeNull()
    expect(daysUntil(undefined, TODAY)).toBeNull()
  })
})

describe('classifyDate', () => {
  it('classifies yesterday as Expired', () => {
    expect(classifyDate(dateStr(-1), TODAY)).toBe('Expired')
  })

  it('classifies today as Urgent', () => {
    expect(classifyDate(dateStr(0), TODAY)).toBe('Urgent')
  })

  it('classifies tomorrow as Urgent', () => {
    expect(classifyDate(dateStr(1), TODAY)).toBe('Urgent')
  })

  it('classifies exactly 7 days out as Urgent (inclusive boundary)', () => {
    expect(classifyDate(dateStr(7), TODAY)).toBe('Urgent')
  })

  it('classifies exactly 8 days out as Upcoming (first day past the Urgent boundary)', () => {
    expect(classifyDate(dateStr(8), TODAY)).toBe('Upcoming')
  })

  it('classifies exactly 30 days out as Upcoming (inclusive boundary)', () => {
    expect(classifyDate(dateStr(30), TODAY)).toBe('Upcoming')
  })

  it('classifies exactly 31 days out as Normal (first day past the Upcoming boundary)', () => {
    expect(classifyDate(dateStr(31), TODAY)).toBe('Normal')
  })

  it('classifies a date far in the past as Expired, not some other bucket', () => {
    expect(classifyDate(dateStr(-400), TODAY)).toBe('Expired')
  })

  it('classifies a date far in the future as Normal', () => {
    expect(classifyDate(dateStr(400), TODAY)).toBe('Normal')
  })

  it('returns null for a missing date rather than guessing', () => {
    expect(classifyDate(null, TODAY)).toBeNull()
    expect(classifyDate(undefined, TODAY)).toBeNull()
    expect(classifyDate('', TODAY)).toBeNull()
  })

  it('returns null for an invalid/unparseable date string', () => {
    expect(classifyDate('not-a-date', TODAY)).toBeNull()
  })
})

describe('isAttentionUrgency', () => {
  it('is true for Expired and Urgent', () => {
    expect(isAttentionUrgency('Expired')).toBe(true)
    expect(isAttentionUrgency('Urgent')).toBe(true)
  })

  it('is false for Upcoming, Normal, and null', () => {
    expect(isAttentionUrgency('Upcoming')).toBe(false)
    expect(isAttentionUrgency('Normal')).toBe(false)
    expect(isAttentionUrgency(null)).toBe(false)
  })
})
