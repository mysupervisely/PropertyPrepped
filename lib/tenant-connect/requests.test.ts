import { describe, expect, it } from 'vitest'
import { buildTenantRequestDateItems } from './requests'

const propertyLabelById = new Map([['p1', '5531 Turtle Crossing Loop'], ['p2', '12109 Rustic River Way']])

describe('buildTenantRequestDateItems (PropWatch integration, Tenant Connect V1)', () => {
  it('surfaces a New request as an Urgent, date-independent attention item', () => {
    const items = buildTenantRequestDateItems(
      [{ id: 'r1', property_id: 'p1', title: 'Kitchen sink leaking', status: 'New', created_at: '2026-06-01T00:00:00Z' }],
      propertyLabelById,
    )
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      type: 'TenantRequest',
      label: 'New maintenance request',
      description: 'Kitchen sink leaking',
      propertyId: 'p1',
      propertyLabel: '5531 Turtle Crossing Loop',
      daysUntil: 0,
      urgency: 'Urgent',
      nav: { tab: 'Rent', rentSubTab: 'Tenant' },
    })
  })

  it('excludes In Progress requests — already being handled, no repeat nudge', () => {
    const items = buildTenantRequestDateItems(
      [{ id: 'r1', property_id: 'p1', title: 'Leak', status: 'In Progress', created_at: '2026-06-01T00:00:00Z' }],
      propertyLabelById,
    )
    expect(items).toHaveLength(0)
  })

  it('excludes Resolved requests', () => {
    const items = buildTenantRequestDateItems(
      [{ id: 'r1', property_id: 'p1', title: 'Leak', status: 'Resolved', created_at: '2026-06-01T00:00:00Z' }],
      propertyLabelById,
    )
    expect(items).toHaveLength(0)
  })

  it('handles multiple properties, each labeled correctly', () => {
    const items = buildTenantRequestDateItems(
      [
        { id: 'r1', property_id: 'p1', title: 'Leak', status: 'New', created_at: '2026-06-01T00:00:00Z' },
        { id: 'r2', property_id: 'p2', title: 'No heat', status: 'New', created_at: '2026-06-02T00:00:00Z' },
      ],
      propertyLabelById,
    )
    expect(items.map((i) => i.propertyLabel).sort()).toEqual(['12109 Rustic River Way', '5531 Turtle Crossing Loop'])
  })

  it('falls back to an empty label for an unknown property id rather than throwing', () => {
    const items = buildTenantRequestDateItems(
      [{ id: 'r1', property_id: 'unknown', title: 'Leak', status: 'New', created_at: '2026-06-01T00:00:00Z' }],
      propertyLabelById,
    )
    expect(items[0].propertyLabel).toBe('')
  })
})
