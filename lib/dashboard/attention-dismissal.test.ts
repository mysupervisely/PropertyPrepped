import { describe, expect, it } from 'vitest'
import {
  buildAttentionDismissalKey, buildVacancyDismissalKey, filterDismissedAttentionItems,
  buildOpenMaintenanceDismissalKey, filterDismissedOpenMaintenanceItems,
} from './attention-dismissal'
import type { DashboardDateItem, OpenMaintenanceItem } from './attention'

function openMaintenanceItem(overrides: Partial<OpenMaintenanceItem>): OpenMaintenanceItem {
  return {
    id: 'req-1', description: 'Ac not working', category: 'Urgent', vendor: null,
    propertyId: 'p1', propertyLabel: '5558 Pats Point', date: '2026-09-08', status: 'New',
    nav: { tab: 'Maintenance' },
    ...overrides,
  }
}

function item(overrides: Partial<DashboardDateItem>): DashboardDateItem {
  return {
    id: 'i1', type: 'Lease', label: 'Lease expiring soon', description: 'Alex Rivera',
    propertyId: 'p1', propertyLabel: '123 Main Street', date: '2026-10-10', daysUntil: 24,
    urgency: 'Upcoming', nav: { tab: 'Rent', rentSubTab: 'Lease' },
    ...overrides,
  }
}

describe('buildAttentionDismissalKey', () => {
  it('uses the canonical type prefix + id + date, never a mutable label', () => {
    const key = buildAttentionDismissalKey(item({ type: 'Lease', id: 'lease-1', date: '2026-12-31', label: 'Lease expiring soon' }))
    expect(key).toBe('lease:lease-1:2026-12-31')
    expect(key).not.toContain('expiring')
  })

  it('every canonical type maps to its own stable prefix', () => {
    expect(buildAttentionDismissalKey(item({ type: 'Rent', id: 'lease-1', date: '2026-09-01' }))).toBe('rent:lease-1:2026-09-01')
    expect(buildAttentionDismissalKey(item({ type: 'Insurance', id: 'ins-1', date: '2026-09-01' }))).toBe('insurance:ins-1:2026-09-01')
    expect(buildAttentionDismissalKey(item({ type: 'Mortgage', id: 'mort-1', date: '2026-09-01' }))).toBe('mortgage:mort-1:2026-09-01')
    expect(buildAttentionDismissalKey(item({ type: 'System', id: 'sys-1', date: '2026-09-01' }))).toBe('system:sys-1:2026-09-01')
    expect(buildAttentionDismissalKey(item({ type: 'Maintenance', id: 'maint-1', date: '2026-09-01' }))).toBe('maintenance:maint-1:2026-09-01')
    expect(buildAttentionDismissalKey(item({ type: 'TenantRequest', id: 'req-1', date: '2026-09-01' }))).toBe('tenant-request:req-1:2026-09-01')
  })

  it('Rent: the SAME lease in two different months produces two DIFFERENT keys, so dismissing September\'s overdue rent does not hide October\'s (the exact required scenario)', () => {
    const september = buildAttentionDismissalKey(item({ type: 'Rent', id: 'lease-42', date: '2026-09-01' }))
    const october = buildAttentionDismissalKey(item({ type: 'Rent', id: 'lease-42', date: '2026-10-01' }))
    expect(september).not.toBe(october)
  })

  it('Maintenance: two different requests for the same property produce two different keys, so dismissing one never hides the other', () => {
    const requestA = buildAttentionDismissalKey(item({ type: 'Maintenance', id: 'maint-1', propertyId: 'p1', date: '2026-09-01' }))
    const requestB = buildAttentionDismissalKey(item({ type: 'Maintenance', id: 'maint-2', propertyId: 'p1', date: '2026-09-01' }))
    expect(requestA).not.toBe(requestB)
  })

  it('Lease: a renewal (same lease id, new end_date) produces a different key — an old dismissal never survives a genuine change to the underlying fact', () => {
    const original = buildAttentionDismissalKey(item({ type: 'Lease', id: 'lease-1', date: '2026-09-20' }))
    const renewed = buildAttentionDismissalKey(item({ type: 'Lease', id: 'lease-1', date: '2027-09-20' }))
    expect(original).not.toBe(renewed)
  })
})

describe('buildVacancyDismissalKey', () => {
  const property = { id: 'p1', created_at: '2024-01-01T00:00:00Z' }

  it('never-leased property: a stable key tied to the property\'s own creation date, never a random dismiss-time timestamp', () => {
    const key = buildVacancyDismissalKey(property, [])
    expect(key).toBe('vacancy:p1:never-leased:2024-01-01T00:00:00Z')
  })

  it('with ended leases: keys off the MOST RECENTLY ended lease (max end_date), not an arbitrary one', () => {
    const leases = [
      { id: 'lease-old', end_date: '2025-01-01' },
      { id: 'lease-newest', end_date: '2026-06-30' },
      { id: 'lease-middle', end_date: '2025-08-15' },
    ]
    expect(buildVacancyDismissalKey(property, leases)).toBe('vacancy:p1:lease-newest:2026-06-30')
  })

  it('the required lifecycle scenario: a new lease is created and later ends, producing a DIFFERENT key than the earlier vacancy episode — the old dismissal must not hide the new one', () => {
    const firstEpisode = buildVacancyDismissalKey(property, [{ id: 'lease-1', end_date: '2025-06-30' }])
    const secondEpisode = buildVacancyDismissalKey(property, [{ id: 'lease-1', end_date: '2025-06-30' }, { id: 'lease-2', end_date: '2026-09-30' }])
    expect(firstEpisode).not.toBe(secondEpisode)
  })

  it('the never-leased fallback key also differs from any real lease-anchored key, so a property\'s first-ever lease ending always produces a fresh, undismissed episode', () => {
    const neverLeased = buildVacancyDismissalKey(property, [])
    const afterFirstLease = buildVacancyDismissalKey(property, [{ id: 'lease-1', end_date: '2025-06-30' }])
    expect(neverLeased).not.toBe(afterFirstLease)
  })
})

describe('filterDismissedAttentionItems', () => {
  it('removes exactly the items whose own key is dismissed, leaving everything else untouched', () => {
    const items = [
      item({ id: 'l1', type: 'Lease', date: '2026-09-20' }),
      item({ id: 'l2', type: 'Lease', date: '2026-09-25' }),
      item({ id: 'r1', type: 'Rent', date: '2026-09-01' }),
    ]
    const dismissed = new Set([buildAttentionDismissalKey(items[0])])
    const result = filterDismissedAttentionItems(items, dismissed)
    expect(result).toHaveLength(2)
    expect(result.map((i) => i.id)).toEqual(['l2', 'r1'])
  })

  it('an empty dismissed set changes nothing', () => {
    const items = [item({ id: 'l1' }), item({ id: 'l2' })]
    expect(filterDismissedAttentionItems(items, new Set())).toEqual(items)
  })

  it('never mutates the input array or its items', () => {
    const items = [item({ id: 'l1' })]
    const copy = [...items]
    filterDismissedAttentionItems(items, new Set(['lease:l1:2026-10-10']))
    expect(items).toEqual(copy)
  })
})

// Property + Attention Usability V1 follow-up — Open Maintenance items
// are now dismissible too (see this file's own header comment for why
// the earlier V1 exclusion was overly cautious). The real-device report
// this closes: three separate AC-related requests for the same
// property ("5558 Pats Point") on three different dates, none of which
// could be cleared before this fix.
describe('buildOpenMaintenanceDismissalKey', () => {
  it('uses the canonical maintenance_requests id + date, never the visible title', () => {
    const key = buildOpenMaintenanceDismissalKey(openMaintenanceItem({ id: 'req-42', description: 'Ac not working', date: '2026-09-08' }))
    expect(key).toBe('open-maintenance:req-42:2026-09-08')
    expect(key).not.toContain('working')
  })

  it('the required scenario: three separate requests for the SAME property on different dates each get a distinct key', () => {
    const req1 = buildOpenMaintenanceDismissalKey(openMaintenanceItem({ id: 'req-1', propertyId: 'p1', date: '2026-09-08', description: 'Ac not working' }))
    const req2 = buildOpenMaintenanceDismissalKey(openMaintenanceItem({ id: 'req-2', propertyId: 'p1', date: '2026-09-09', description: 'Ac not cooling' }))
    const req3 = buildOpenMaintenanceDismissalKey(openMaintenanceItem({ id: 'req-3', propertyId: 'p1', date: '2026-09-11', description: 'ac not working' }))
    expect(new Set([req1, req2, req3]).size).toBe(3)
  })

  it('never collides with a maintenance_records-sourced ("maintenance") key even if the raw ids matched — genuinely different canonical sources', () => {
    const openKey = buildOpenMaintenanceDismissalKey(openMaintenanceItem({ id: 'shared-id', date: '2026-09-08' }))
    const recordKey = buildAttentionDismissalKey(item({ type: 'Maintenance', id: 'shared-id', date: '2026-09-08' }))
    expect(openKey).not.toBe(recordKey)
  })
})

describe('filterDismissedOpenMaintenanceItems', () => {
  it('clearing one of three same-property requests leaves the other two visible', () => {
    const items = [
      openMaintenanceItem({ id: 'req-1', date: '2026-09-08', description: 'Ac not working' }),
      openMaintenanceItem({ id: 'req-2', date: '2026-09-09', description: 'Ac not cooling' }),
      openMaintenanceItem({ id: 'req-3', date: '2026-09-11', description: 'ac not working' }),
    ]
    const dismissed = new Set([buildOpenMaintenanceDismissalKey(items[0])])
    const result = filterDismissedOpenMaintenanceItems(items, dismissed)
    expect(result.map((i) => i.id)).toEqual(['req-2', 'req-3'])
  })

  it('an empty dismissed set changes nothing', () => {
    const items = [openMaintenanceItem({ id: 'req-1' }), openMaintenanceItem({ id: 'req-2' })]
    expect(filterDismissedOpenMaintenanceItems(items, new Set())).toEqual(items)
  })
})
