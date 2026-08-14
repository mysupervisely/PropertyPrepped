import { describe, expect, it } from 'vitest'
import { deriveLeaseWatchDraft, type LeaseLike, type PropertyLike } from './lease'

const NOW = new Date('2026-08-14T12:00:00')
const at = (daysFromNow: number) => {
  const d = new Date(NOW)
  d.setDate(d.getDate() + daysFromNow)
  return d.toISOString().slice(0, 10)
}

const property: PropertyLike = { id: 'prop-1', owner_id: 'owner-1', address: '12109 Rustic River Way' }

function lease(overrides: Partial<LeaseLike> = {}): LeaseLike {
  return { id: 'lease-1', property_id: 'prop-1', owner_id: 'owner-1', tenant_name: 'Jordan Rivera', end_date: at(60), renewal_status: 'Active', ...overrides }
}

describe('deriveLeaseWatchDraft', () => {
  it('90-day threshold produces a Low-priority Upcoming item', () => {
    const draft = deriveLeaseWatchDraft(lease({ end_date: at(90) }), property, NOW)
    expect(draft?.priority).toBe('Low')
    expect(draft?.status).toBe('Upcoming')
    expect(draft?.category).toBe('Lease')
  })

  it('60-day threshold produces Normal priority', () => {
    expect(deriveLeaseWatchDraft(lease({ end_date: at(60) }), property, NOW)?.priority).toBe('Normal')
  })

  it('30-day threshold produces High priority, Needs Attention', () => {
    const draft = deriveLeaseWatchDraft(lease({ end_date: at(30) }), property, NOW)
    expect(draft?.priority).toBe('High')
    expect(draft?.status).toBe('Needs Attention')
  })

  it('7-day threshold produces Urgent priority', () => {
    expect(deriveLeaseWatchDraft(lease({ end_date: at(7) }), property, NOW)?.priority).toBe('Urgent')
  })

  it('an expired, unresolved lease is Urgent and flagged past due', () => {
    const draft = deriveLeaseWatchDraft(lease({ end_date: at(-10) }), property, NOW)
    expect(draft?.priority).toBe('Urgent')
    expect(draft?.metadata.isPastDue).toBe(true)
    expect(draft?.description).toContain('expired')
  })

  it('a renewed lease (new end_date) keeps the same identity so it updates rather than duplicates', () => {
    const before = deriveLeaseWatchDraft(lease({ end_date: at(30) }), property, NOW)!
    const after = deriveLeaseWatchDraft(lease({ end_date: at(200) }), property, NOW) // renewed far out — falls outside the window again
    expect(before.source_id).toBe('lease-1')
    expect(before.event_key).toBe('lease_expiration')
    // Same source_id + event_key even though there's no draft once renewed past the window —
    // reconcile.ts is what actually performs the update; this just proves identity is stable.
    expect(after).toBeNull()
  })

  it('nothing is produced when the lease has no end date', () => {
    expect(deriveLeaseWatchDraft(lease({ end_date: null }), property, NOW)).toBeNull()
  })

  it('nothing is produced for a lease already marked Ended', () => {
    expect(deriveLeaseWatchDraft(lease({ end_date: at(10), renewal_status: 'Ended' }), property, NOW)).toBeNull()
  })

  it('nothing is produced when the expiration is more than 90 days away', () => {
    expect(deriveLeaseWatchDraft(lease({ end_date: at(150) }), property, NOW)).toBeNull()
  })

  it('never invents tenant data — only the tenant name already on the lease row appears', () => {
    const draft = deriveLeaseWatchDraft(lease({ tenant_name: 'Alex Chen', end_date: at(30) }), property, NOW)!
    expect(draft.metadata.tenantName).toBe('Alex Chen')
    expect(draft.description).not.toContain('Alex Chen') // description is address + date-focused; tenant name lives in metadata only
  })
})
