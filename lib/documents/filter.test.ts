import { describe, expect, it } from 'vitest'
import { filterDocuments, sortDocumentsNewestFirst, propertyLabelFor } from './filter'

const docs = [
  { id: 'd1', property_id: 'p1', created_at: '2026-06-01T00:00:00Z' },
  { id: 'd2', property_id: null, created_at: '2026-06-03T00:00:00Z' },
  { id: 'd3', property_id: 'p2', created_at: '2026-06-02T00:00:00Z' },
  { id: 'd4', property_id: null, created_at: '2026-06-04T00:00:00Z' },
]

describe('filterDocuments', () => {
  it('"All" returns every document', () => {
    expect(filterDocuments(docs, 'All').map((d) => d.id)).toEqual(['d1', 'd2', 'd3', 'd4'])
  })

  it('"Unassigned" returns only documents with no property', () => {
    expect(filterDocuments(docs, 'Unassigned').map((d) => d.id)).toEqual(['d2', 'd4'])
  })

  it('"Assigned" returns only documents with a property, across multiple owned properties', () => {
    expect(filterDocuments(docs, 'Assigned').map((d) => d.id)).toEqual(['d1', 'd3'])
  })

  it('never mutates the input array', () => {
    const original = [...docs]
    filterDocuments(docs, 'Unassigned')
    expect(docs).toEqual(original)
  })
})

describe('sortDocumentsNewestFirst', () => {
  it('orders newest first', () => {
    expect(sortDocumentsNewestFirst(docs).map((d) => d.id)).toEqual(['d4', 'd2', 'd3', 'd1'])
  })

  it('never mutates the input array', () => {
    const original = [...docs]
    sortDocumentsNewestFirst(docs)
    expect(docs).toEqual(original)
  })
})

describe('propertyLabelFor', () => {
  const labels = new Map([['p1', '5531 Turtle Crossing Loop']])

  it('returns the property label when assigned and known', () => {
    expect(propertyLabelFor('p1', labels)).toBe('5531 Turtle Crossing Loop')
  })

  it('returns null when unassigned', () => {
    expect(propertyLabelFor(null, labels)).toBeNull()
  })

  it('returns null when assigned to a property not in the lookup, rather than fabricating a label', () => {
    expect(propertyLabelFor('unknown-id', labels)).toBeNull()
  })
})
