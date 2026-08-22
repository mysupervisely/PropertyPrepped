import { describe, expect, it } from 'vitest'
import {
  buildLeaseDateItems, buildInsuranceDateItems, buildMortgageDateItems, buildMaintenanceDateItems,
  buildOpenMaintenanceItems, splitAttentionAndUpcoming, sortByDaysUntilAscending, limitItems,
} from './attention'

const TODAY = new Date(2026, 5, 17) // June 17, 2026
const dateStr = (offsetDays: number) => {
  const d = new Date(2026, 5, 17 + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const propertyLabelById = new Map([['p1', '5531 Turtle Crossing Loop'], ['p2', '12109 Rustic River Way']])

describe('buildLeaseDateItems', () => {
  it('flags an expired lease with the correct label and days', () => {
    const items = buildLeaseDateItems([{ id: 'l1', property_id: 'p1', tenant_name: 'Sean Urban', end_date: dateStr(-3) }], propertyLabelById, TODAY)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ label: 'Lease expired', urgency: 'Expired', daysUntil: -3, propertyLabel: '5531 Turtle Crossing Loop', nav: { tab: 'Rent', rentSubTab: 'Lease' } })
  })

  it('flags a lease expiring within 7 days as Urgent', () => {
    const items = buildLeaseDateItems([{ id: 'l1', property_id: 'p1', tenant_name: 'Sean Urban', end_date: dateStr(5) }], propertyLabelById, TODAY)
    expect(items[0].urgency).toBe('Urgent')
    expect(items[0].label).toBe('Lease expiring soon')
  })

  it('excludes a lease more than 30 days out', () => {
    expect(buildLeaseDateItems([{ id: 'l1', property_id: 'p1', tenant_name: 'Sean Urban', end_date: dateStr(60) }], propertyLabelById, TODAY)).toHaveLength(0)
  })
})

describe('buildInsuranceDateItems', () => {
  it('excludes a policy with no expiration_date on file, never treating it as expired', () => {
    expect(buildInsuranceDateItems([{ id: 'i1', property_id: 'p1', carrier: 'State Farm', expiration_date: null }], propertyLabelById, TODAY)).toHaveLength(0)
  })

  it('flags an expiring policy within the Upcoming window', () => {
    const items = buildInsuranceDateItems([{ id: 'i1', property_id: 'p1', carrier: 'State Farm', expiration_date: dateStr(20) }], propertyLabelById, TODAY)
    expect(items[0]).toMatchObject({ label: 'Insurance expiring', urgency: 'Upcoming', description: 'State Farm', nav: { tab: 'Details', propSubTab: 'Insurance' } })
  })
})

describe('buildMortgageDateItems', () => {
  it('excludes a mortgage with no maturity_date on file', () => {
    expect(buildMortgageDateItems([{ id: 'm1', property_id: 'p1', lender: 'Wells Fargo', maturity_date: null }], propertyLabelById, TODAY)).toHaveLength(0)
  })

  it('flags a mortgage maturing soon (rare, but same logic as every other date)', () => {
    const items = buildMortgageDateItems([{ id: 'm1', property_id: 'p1', lender: 'Wells Fargo', maturity_date: dateStr(2) }], propertyLabelById, TODAY)
    expect(items[0]).toMatchObject({ urgency: 'Urgent', nav: { tab: 'Details', propSubTab: 'Mortgage' } })
  })
})

describe('buildMaintenanceDateItems', () => {
  it('flags a Scheduled item whose date has passed as overdue', () => {
    const items = buildMaintenanceDateItems([{ id: 'mt1', property_id: 'p1', description: 'HVAC service', category: 'HVAC', vendor: 'ABC Air', status: 'Scheduled', service_date: dateStr(-2) }], propertyLabelById, TODAY)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ label: 'Maintenance overdue', urgency: 'Expired' })
  })

  it('never flags a Completed item, regardless of how old its service_date is', () => {
    expect(buildMaintenanceDateItems([{ id: 'mt1', property_id: 'p1', description: 'Done', category: 'Repair', vendor: null, status: 'Completed', service_date: dateStr(-400) }], propertyLabelById, TODAY)).toHaveLength(0)
  })

  it('never flags an In progress or Needs follow-up item from its service_date alone (that date means "when it happened," not a due date)', () => {
    expect(buildMaintenanceDateItems([
      { id: 'mt1', property_id: 'p1', description: 'a', category: 'Repair', vendor: null, status: 'In progress', service_date: dateStr(-30) },
      { id: 'mt2', property_id: 'p1', description: 'b', category: 'Repair', vendor: null, status: 'Needs follow-up', service_date: dateStr(-30) },
    ], propertyLabelById, TODAY)).toHaveLength(0)
  })

  it('classifies a Scheduled item more than 7 but within 30 days out as Upcoming, not overdue (matches the spec\'s own "scheduled maintenance" Upcoming example)', () => {
    const items = buildMaintenanceDateItems([{ id: 'mt1', property_id: 'p1', description: 'a', category: 'Repair', vendor: null, status: 'Scheduled', service_date: dateStr(20) }], propertyLabelById, TODAY)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ label: 'Maintenance scheduled', urgency: 'Upcoming' })
  })

  it('excludes a Scheduled item more than 30 days out', () => {
    expect(buildMaintenanceDateItems([{ id: 'mt1', property_id: 'p1', description: 'a', category: 'Repair', vendor: null, status: 'Scheduled', service_date: dateStr(60) }], propertyLabelById, TODAY)).toHaveLength(0)
  })
})

describe('buildOpenMaintenanceItems', () => {
  it('includes every non-Completed status regardless of date', () => {
    const items = buildOpenMaintenanceItems([
      { id: 'mt1', property_id: 'p1', description: 'a', category: 'Repair', vendor: null, status: 'Scheduled', service_date: dateStr(20) },
      { id: 'mt2', property_id: 'p1', description: 'b', category: 'Repair', vendor: null, status: 'In progress', service_date: dateStr(-30) },
      { id: 'mt3', property_id: 'p1', description: 'c', category: 'Repair', vendor: null, status: 'Needs follow-up', service_date: dateStr(-1) },
      { id: 'mt4', property_id: 'p1', description: 'd', category: 'Repair', vendor: null, status: 'Completed', service_date: dateStr(-1) },
    ], propertyLabelById)
    expect(items.map((i) => i.id).sort()).toEqual(['mt1', 'mt2', 'mt3'])
  })

  it('sorts most recent service_date first', () => {
    const items = buildOpenMaintenanceItems([
      { id: 'mt1', property_id: 'p1', description: 'older', category: 'Repair', vendor: null, status: 'Scheduled', service_date: dateStr(-10) },
      { id: 'mt2', property_id: 'p1', description: 'newer', category: 'Repair', vendor: null, status: 'Scheduled', service_date: dateStr(-1) },
    ], propertyLabelById)
    expect(items.map((i) => i.id)).toEqual(['mt2', 'mt1'])
  })
})

describe('splitAttentionAndUpcoming', () => {
  it('routes Expired/Urgent to needsAttention and Upcoming to upcoming, with no item in both', () => {
    const items = [
      ...buildLeaseDateItems([{ id: 'l1', property_id: 'p1', tenant_name: 'A', end_date: dateStr(-1) }], propertyLabelById, TODAY),
      ...buildLeaseDateItems([{ id: 'l2', property_id: 'p1', tenant_name: 'B', end_date: dateStr(5) }], propertyLabelById, TODAY),
      ...buildLeaseDateItems([{ id: 'l3', property_id: 'p1', tenant_name: 'C', end_date: dateStr(20) }], propertyLabelById, TODAY),
    ]
    const { needsAttention, upcoming } = splitAttentionAndUpcoming(items)
    expect(needsAttention.map((i) => i.id).sort()).toEqual(['l1', 'l2'])
    expect(upcoming.map((i) => i.id)).toEqual(['l3'])
    const attentionIds = new Set(needsAttention.map((i) => i.id))
    expect(upcoming.some((i) => attentionIds.has(i.id))).toBe(false)
  })
})

describe('sortByDaysUntilAscending', () => {
  it('sorts soonest first, including negative (already-past) values', () => {
    const items = [{ id: 'a', daysUntil: 20 }, { id: 'b', daysUntil: -3 }, { id: 'c', daysUntil: 5 }]
    expect(sortByDaysUntilAscending(items).map((i) => i.id)).toEqual(['b', 'c', 'a'])
  })

  it('does not mutate the input array', () => {
    const items = [{ id: 'a', daysUntil: 20 }, { id: 'b', daysUntil: -3 }]
    const original = [...items]
    sortByDaysUntilAscending(items)
    expect(items).toEqual(original)
  })
})

describe('limitItems', () => {
  it('caps the array at the given limit', () => {
    expect(limitItems([1, 2, 3, 4, 5], 3)).toEqual([1, 2, 3])
  })

  it('returns the whole array when under the limit', () => {
    expect(limitItems([1, 2], 5)).toEqual([1, 2])
  })

  it('returns an empty array for a limit of 0', () => {
    expect(limitItems([1, 2], 0)).toEqual([])
  })
})
