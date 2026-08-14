import { describe, expect, it } from 'vitest'
import { compareWatchItems, computeUrgency, sortWatchItems } from './urgency'

const NOW = new Date('2026-08-14T12:00:00')
const at = (daysFromNow: number) => {
  const d = new Date(NOW)
  d.setDate(d.getDate() + daysFromNow)
  return d.toISOString().slice(0, 10)
}

describe('computeUrgency', () => {
  it('90-day threshold: Low priority, Upcoming status, inside the warning window', () => {
    const result = computeUrgency(at(90), NOW)
    expect(result.daysRemaining).toBe(90)
    expect(result.priority).toBe('Low')
    expect(result.status).toBe('Upcoming')
    expect(result.withinWarningWindow).toBe(true)
    expect(result.isPastDue).toBe(false)
  })

  it('60-day threshold: Normal priority, Upcoming status', () => {
    const result = computeUrgency(at(60), NOW)
    expect(result.priority).toBe('Normal')
    expect(result.status).toBe('Upcoming')
  })

  it('30-day threshold: High priority, Needs Attention status', () => {
    const result = computeUrgency(at(30), NOW)
    expect(result.priority).toBe('High')
    expect(result.status).toBe('Needs Attention')
  })

  it('7-day threshold: Urgent priority, Needs Attention status', () => {
    const result = computeUrgency(at(7), NOW)
    expect(result.priority).toBe('Urgent')
    expect(result.status).toBe('Needs Attention')
  })

  it('past due (expired, unresolved): Urgent, Needs Attention, isPastDue true', () => {
    const result = computeUrgency(at(-5), NOW)
    expect(result.isPastDue).toBe(true)
    expect(result.daysRemaining).toBe(-5)
    expect(result.priority).toBe('Urgent')
    expect(result.status).toBe('Needs Attention')
  })

  it('outside the 90-day window entirely is not yet surfaced', () => {
    const result = computeUrgency(at(200), NOW)
    expect(result.withinWarningWindow).toBe(false)
  })

  it('exactly at the boundary between bands resolves to the more urgent side (<=)', () => {
    expect(computeUrgency(at(8), NOW).priority).toBe('High') // 8 days: not <=7, but <=30
    expect(computeUrgency(at(31), NOW).priority).toBe('Normal') // 31 days: not <=30, but <=60
    expect(computeUrgency(at(61), NOW).priority).toBe('Low') // 61 days: not <=60, but <=90
  })
})

describe('compareWatchItems / sortWatchItems', () => {
  it('orders Urgent > High > Normal > Low', () => {
    const items = [
      { priority: 'Low' as const, event_date: null },
      { priority: 'Urgent' as const, event_date: null },
      { priority: 'Normal' as const, event_date: null },
      { priority: 'High' as const, event_date: null },
    ]
    expect(sortWatchItems(items).map((i) => i.priority)).toEqual(['Urgent', 'High', 'Normal', 'Low'])
  })

  it('within the same priority, nearest date sorts first', () => {
    const items = [
      { priority: 'High' as const, event_date: '2026-09-20' },
      { priority: 'High' as const, event_date: '2026-09-01' },
      { priority: 'High' as const, event_date: '2026-09-10' },
    ]
    expect(sortWatchItems(items).map((i) => i.event_date)).toEqual(['2026-09-01', '2026-09-10', '2026-09-20'])
  })

  it('a null event_date sorts after dated items of the same priority', () => {
    const items = [
      { priority: 'Normal' as const, event_date: null },
      { priority: 'Normal' as const, event_date: '2026-09-01' },
    ]
    expect(sortWatchItems(items).map((i) => i.event_date)).toEqual(['2026-09-01', null])
  })

  it('past-due unresolved items rise to the top of Urgent (most overdue first)', () => {
    const items = [
      { priority: 'Urgent' as const, event_date: '2026-08-10' }, // barely overdue relative to the other
      { priority: 'Urgent' as const, event_date: '2026-01-01' }, // very overdue
      { priority: 'High' as const, event_date: '2026-08-01' },
    ]
    const sorted = sortWatchItems(items)
    expect(sorted[0].event_date).toBe('2026-01-01')
    expect(sorted[1].event_date).toBe('2026-08-10')
    expect(sorted[2].priority).toBe('High')
  })

  it('compareWatchItems is a stable pairwise comparator (0 for identical priority+date)', () => {
    expect(compareWatchItems({ priority: 'Low', event_date: '2026-01-01' }, { priority: 'Low', event_date: '2026-01-01' })).toBe(0)
  })
})
