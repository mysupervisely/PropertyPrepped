import { describe, expect, it } from 'vitest'
import { groupWatchItemsForPropertyPage, selectHomepageAttentionItems } from './views'
import type { WatchPriority, WatchStatus } from './types'

type Item = { id: string; status: WatchStatus; priority: WatchPriority; event_date: string | null }

function item(id: string, status: WatchStatus, priority: WatchPriority, event_date: string | null = null): Item {
  return { id, status, priority, event_date }
}

describe('selectHomepageAttentionItems', () => {
  it('shows nothing when no item needs attention', () => {
    const items = [item('1', 'Upcoming', 'Low'), item('2', 'Completed', 'Urgent'), item('3', 'Dismissed', 'High')]
    expect(selectHomepageAttentionItems(items)).toHaveLength(0)
  })

  it('only includes status === Needs Attention items', () => {
    const items = [item('1', 'Upcoming', 'Urgent'), item('2', 'Needs Attention', 'Normal'), item('3', 'Completed', 'Urgent')]
    const result = selectHomepageAttentionItems(items)
    expect(result.map((i) => i.id)).toEqual(['2'])
  })

  it('sorts by priority then nearest date, matching the shared comparator', () => {
    const items = [
      item('low', 'Needs Attention', 'Low', '2026-09-01'),
      item('urgent-far', 'Needs Attention', 'Urgent', '2026-09-05'),
      item('urgent-near', 'Needs Attention', 'Urgent', '2026-08-20'),
      item('high', 'Needs Attention', 'High', '2026-08-25'),
    ]
    const result = selectHomepageAttentionItems(items)
    expect(result.map((i) => i.id)).toEqual(['urgent-near', 'urgent-far', 'high', 'low'])
  })

  it('caps the number of items returned to keep the widget compact', () => {
    const items = Array.from({ length: 12 }, (_, i) => item(`item-${i}`, 'Needs Attention', 'Normal', `2026-09-${String(i + 1).padStart(2, '0')}`))
    expect(selectHomepageAttentionItems(items, 6)).toHaveLength(6)
  })
})

describe('groupWatchItemsForPropertyPage', () => {
  it('buckets items into Needs Attention / Upcoming / Completed (Completed bucket also includes Dismissed)', () => {
    const items = [
      item('1', 'Needs Attention', 'Urgent'),
      item('2', 'Upcoming', 'Low'),
      item('3', 'Completed', 'Normal'),
      item('4', 'Dismissed', 'Normal'),
    ]
    const grouped = groupWatchItemsForPropertyPage(items)
    expect(grouped.needsAttention.map((i) => i.id)).toEqual(['1'])
    expect(grouped.upcoming.map((i) => i.id)).toEqual(['2'])
    expect(grouped.completed.map((i) => i.id).sort()).toEqual(['3', '4'])
  })

  it('each active bucket is sorted by the shared priority/date comparator', () => {
    const items = [
      item('a', 'Upcoming', 'Low', '2026-10-01'),
      item('b', 'Upcoming', 'Normal', '2026-09-01'),
    ]
    const grouped = groupWatchItemsForPropertyPage(items)
    expect(grouped.upcoming.map((i) => i.id)).toEqual(['b', 'a'])
  })
})
