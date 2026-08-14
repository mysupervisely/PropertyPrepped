import { describe, expect, it } from 'vitest'
import { reconcileWatchItems, type PersistedWatchRow } from './reconcile'
import type { PropertyWatchDraft } from './types'

function draft(overrides: Partial<PropertyWatchDraft> = {}): PropertyWatchDraft {
  return {
    owner_id: 'owner-1',
    property_id: 'prop-1',
    source_type: 'lease',
    source_id: 'lease-1',
    event_key: 'lease_expiration',
    category: 'Lease',
    title: 'Lease Expiring',
    description: 'desc',
    event_date: '2026-11-30',
    warning_date: '2026-09-01',
    priority: 'Normal',
    status: 'Upcoming',
    action_type: 'Review',
    metadata: {},
    ...overrides,
  }
}

function row(overrides: Partial<PersistedWatchRow> = {}): PersistedWatchRow {
  return {
    id: 'row-1',
    source_type: 'lease',
    source_id: 'lease-1',
    event_key: 'lease_expiration',
    event_date: '2026-11-30',
    status: 'Upcoming',
    priority: 'Normal',
    ...overrides,
  }
}

describe('reconcileWatchItems', () => {
  it('inserts a brand-new draft with no matching existing row', () => {
    const result = reconcileWatchItems([], [draft()])
    expect(result.toInsert).toHaveLength(1)
    expect(result.toUpdate).toHaveLength(0)
  })

  it('a renewed lease (new event_date, same identity) updates the existing row instead of inserting a duplicate', () => {
    const existing = [row({ event_date: '2026-11-30', status: 'Upcoming' })]
    const renewed = draft({ event_date: '2027-05-31' })
    const result = reconcileWatchItems(existing, [renewed])
    expect(result.toInsert).toHaveLength(0)
    expect(result.toUpdate).toHaveLength(1)
    expect(result.toUpdate[0].id).toBe('row-1')
    expect(result.toUpdate[0].patch.event_date).toBe('2027-05-31')
  })

  it('an unchanged draft against a non-terminal existing row still produces an update (priority/status refresh)', () => {
    const existing = [row({ status: 'Upcoming', priority: 'Low' })]
    const result = reconcileWatchItems(existing, [draft({ priority: 'High', status: 'Needs Attention' })])
    expect(result.toUpdate).toHaveLength(1)
    expect(result.toUpdate[0].patch.priority).toBe('High')
  })

  it('a Dismissed item with an unchanged event_date is left completely alone (no resurrection)', () => {
    const existing = [row({ status: 'Dismissed', event_date: '2026-11-30' })]
    const result = reconcileWatchItems(existing, [draft({ event_date: '2026-11-30' })])
    expect(result.toInsert).toHaveLength(0)
    expect(result.toUpdate).toHaveLength(0)
  })

  it('a Completed item with an unchanged event_date is left completely alone', () => {
    const existing = [row({ status: 'Completed', event_date: '2026-11-30' })]
    const result = reconcileWatchItems(existing, [draft({ event_date: '2026-11-30' })])
    expect(result.toUpdate).toHaveLength(0)
    expect(result.toInsert).toHaveLength(0)
  })

  it('a Dismissed item whose underlying date changed IS updated (the obsolete reminder is refreshed, not left stale)', () => {
    const existing = [row({ status: 'Dismissed', event_date: '2026-11-30' })]
    const result = reconcileWatchItems(existing, [draft({ event_date: '2027-05-31', status: 'Upcoming' })])
    expect(result.toUpdate).toHaveLength(1)
    expect(result.toUpdate[0].patch.event_date).toBe('2027-05-31')
    expect(result.toUpdate[0].patch.status).toBe('Upcoming')
  })

  it('re-analysis of a document (same identity, different content) updates in place — never duplicates', () => {
    const docRow = row({ id: 'wi-doc-1', source_type: 'document', source_id: 'doc-1', event_key: 'document_field:endDate', event_date: '2026-11-30', status: 'Upcoming' })
    const secondAnalysisDraft = draft({ source_type: 'document', source_id: 'doc-1', event_key: 'document_field:endDate', event_date: '2026-12-15' })
    const result = reconcileWatchItems([docRow], [secondAnalysisDraft])
    expect(result.toInsert).toHaveLength(0)
    expect(result.toUpdate).toHaveLength(1)
    expect(result.toUpdate[0].id).toBe('wi-doc-1')
  })

  it('manual items (source_id null) never dedupe — every one is a fresh insert', () => {
    const manualDraft1 = draft({ source_type: 'manual', source_id: null, event_key: 'manual', title: 'Pool inspection' })
    const manualDraft2 = draft({ source_type: 'manual', source_id: null, event_key: 'manual', title: 'Pool inspection' })
    const result = reconcileWatchItems([], [manualDraft1, manualDraft2])
    expect(result.toInsert).toHaveLength(2)
  })

  it('different source rows never collide even with the same event_key', () => {
    const existing = [row({ id: 'row-A', source_id: 'lease-A' })]
    const result = reconcileWatchItems(existing, [draft({ source_id: 'lease-B' })])
    expect(result.toInsert).toHaveLength(1)
    expect(result.toUpdate).toHaveLength(0)
  })
})
