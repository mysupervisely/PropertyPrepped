import { describe, expect, it } from 'vitest'
import {
  documentActivity, maintenanceActivity, financialActivity, noteActivity,
  propertyActivity, propCrewActivity, sortByTimestampDescending,
} from './activity'

const propertyLabelById = new Map([['p1', '5531 Turtle Crossing Loop'], ['p2', '17 Amaryllis Ln']])

describe('documentActivity', () => {
  it('labels an assigned document with its property and a navigable target', () => {
    const items = documentActivity([{ id: 'd1', property_id: 'p1', name: 'Roof Invoice.pdf', created_at: '2026-06-01T00:00:00Z' }], propertyLabelById)
    expect(items[0].description).toBe('Document uploaded to 5531 Turtle Crossing Loop')
    expect(items[0].nav).toEqual({ tab: 'Documents', docsSubTab: 'Documents' })
  })

  it('labels an unassigned (Smart Import) document honestly, with no property-workspace navigable target', () => {
    const items = documentActivity([{ id: 'd1', property_id: null, name: 'scan.pdf', created_at: '2026-06-01T00:00:00Z' }], propertyLabelById)
    expect(items[0].description).toBe('Document uploaded (not yet assigned to a property)')
    expect(items[0].nav).toBeNull()
    expect(items[0].propertyId).toBeNull()
  })

  it('always carries the document\'s own safe id as documentId, assigned or not — the Recent Activity → /documents linkage', () => {
    const assigned = documentActivity([{ id: 'd1', property_id: 'p1', name: 'Roof Invoice.pdf', created_at: '2026-06-01T00:00:00Z' }], propertyLabelById)
    expect(assigned[0].documentId).toBe('d1')
    const unassigned = documentActivity([{ id: 'd2', property_id: null, name: 'scan.pdf', created_at: '2026-06-01T00:00:00Z' }], propertyLabelById)
    expect(unassigned[0].documentId).toBe('d2')
  })

  it('every non-Document activity type leaves documentId null', () => {
    const items = maintenanceActivity([{ id: 'm1', property_id: 'p2', description: 'HVAC tune-up', created_at: '2026-06-01T00:00:00Z' }], propertyLabelById)
    expect(items[0].documentId).toBeNull()
  })
})

describe('maintenanceActivity', () => {
  it('matches the spec\'s own example style', () => {
    const items = maintenanceActivity([{ id: 'm1', property_id: 'p2', description: 'HVAC tune-up', created_at: '2026-06-01T00:00:00Z' }], propertyLabelById)
    expect(items[0].description).toBe('Maintenance item added for 17 Amaryllis Ln')
  })
})

describe('financialActivity', () => {
  it('includes the category but never a dollar amount', () => {
    const items = financialActivity([{ id: 't1', property_id: 'p1', category: 'Repairs', created_at: '2026-06-01T00:00:00Z' }], propertyLabelById)
    expect(items[0].description).toContain('Repairs')
    expect(items[0].description).not.toMatch(/\$/)
  })
})

describe('noteActivity', () => {
  it('never includes the note body', () => {
    const items = noteActivity([{ id: 'n1', property_id: 'p1', created_at: '2026-06-01T00:00:00Z' }], propertyLabelById)
    expect(items[0].description).toBe('Note added to 5531 Turtle Crossing Loop')
  })
})

describe('propertyActivity', () => {
  it('describes the property being added', () => {
    const items = propertyActivity([{ id: 'p1', address: '5531 Turtle Crossing Loop', created_at: '2026-06-01T00:00:00Z' }])
    expect(items[0].description).toBe('Property added: 5531 Turtle Crossing Loop')
  })
})

describe('propCrewActivity', () => {
  it('never exposes a private note, only name/business and property context', () => {
    const items = propCrewActivity([{ id: 'c1', property_id: 'p1', name: 'Mike Alvarez', business_name: 'ABC Air', created_at: '2026-06-01T00:00:00Z' }], propertyLabelById)
    expect(items[0].description).toBe('ABC Air added to PropCrew (5531 Turtle Crossing Loop)')
    expect(items[0].description).not.toContain('notes')
  })

  it('falls back to the person name when there is no business name', () => {
    const items = propCrewActivity([{ id: 'c1', property_id: 'p1', name: 'Mike Alvarez', business_name: null, created_at: '2026-06-01T00:00:00Z' }], propertyLabelById)
    expect(items[0].description).toContain('Mike Alvarez')
  })
})

describe('sortByTimestampDescending', () => {
  it('orders newest first', () => {
    const items = [
      { id: 'a', timestamp: '2026-01-01T00:00:00Z' },
      { id: 'b', timestamp: '2026-06-01T00:00:00Z' },
      { id: 'c', timestamp: '2026-03-01T00:00:00Z' },
    ]
    expect(sortByTimestampDescending(items).map((i) => i.id)).toEqual(['b', 'c', 'a'])
  })

  it('does not mutate the input array', () => {
    const items = [{ id: 'a', timestamp: '2026-01-01T00:00:00Z' }, { id: 'b', timestamp: '2026-06-01T00:00:00Z' }]
    const original = [...items]
    sortByTimestampDescending(items)
    expect(items).toEqual(original)
  })
})
