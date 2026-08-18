import { describe, expect, it } from 'vitest'
import {
  deriveImportStatus, summarizeImportProgress, groupImportItemsByProperty, groupImportItemsByDocumentType,
  type ImportItemForStatus, type ImportDisplayStatus,
} from './import-queue'

function item(overrides: Partial<ImportItemForStatus> = {}): ImportItemForStatus {
  return {
    status: 'Ready', confirmedPropertyId: null, completedAt: null,
    possibleDuplicateDismissed: false, hasPossibleDuplicate: false,
    ...overrides,
  }
}

describe('deriveImportStatus', () => {
  it('is Uploading while the file is still uploading', () => {
    expect(deriveImportStatus(item({ status: 'Uploading' }))).toBe('Uploading')
  })

  it('is Analyzing while the AI call is in flight', () => {
    expect(deriveImportStatus(item({ status: 'Analyzing' }))).toBe('Analyzing')
  })

  it('is Failed when upload or analysis failed', () => {
    expect(deriveImportStatus(item({ status: 'Failed' }))).toBe('Failed')
  })

  it('is Failed for an unsupported file type', () => {
    expect(deriveImportStatus(item({ status: 'Unsupported' }))).toBe('Failed')
  })

  it('is Needs property once analysis succeeds but no property is confirmed', () => {
    expect(deriveImportStatus(item({ status: 'Ready', confirmedPropertyId: null }))).toBe('Needs property')
  })

  it('is Needs attention when a possible duplicate has not been dismissed, even with a property confirmed', () => {
    expect(deriveImportStatus(item({ status: 'Ready', confirmedPropertyId: 'p1', hasPossibleDuplicate: true }))).toBe('Needs attention')
  })

  it('is Ready to review once the duplicate warning is dismissed and a property is confirmed', () => {
    expect(deriveImportStatus(item({ status: 'Ready', confirmedPropertyId: 'p1', hasPossibleDuplicate: true, possibleDuplicateDismissed: true }))).toBe('Ready to review')
  })

  it('is Ready to review once a property is confirmed with no duplicate flag', () => {
    expect(deriveImportStatus(item({ status: 'Ready', confirmedPropertyId: 'p1' }))).toBe('Ready to review')
  })

  it('is Completed once completedAt is set, regardless of any other field', () => {
    expect(deriveImportStatus(item({ status: 'Ready', confirmedPropertyId: null, completedAt: '2026-01-01T00:00:00Z' }))).toBe('Completed')
    expect(deriveImportStatus(item({ status: 'Failed', completedAt: '2026-01-01T00:00:00Z' }))).toBe('Completed')
  })
})

describe('summarizeImportProgress', () => {
  it('matches the example: 12 of 20 analyzed, 5 ready to review, 2 need attention, 1 failed', () => {
    const statuses: ImportDisplayStatus[] = [
      ...Array(3).fill('Uploading'), ...Array(5).fill('Analyzing'),
      ...Array(5).fill('Ready to review'), ...Array(2).fill('Needs attention'),
      ...Array(4).fill('Needs property'), ...Array(1).fill('Failed'),
    ]
    const summary = summarizeImportProgress(statuses)
    expect(summary.total).toBe(20)
    expect(summary.analyzed).toBe(12) // 20 total - 3 still uploading - 5 still analyzing
    expect(summary.readyToReview).toBe(5)
    expect(summary.needsAttention).toBe(2)
    expect(summary.failed).toBe(1)
  })

  it('counts Completed items separately from the in-progress/attention buckets', () => {
    const statuses: ImportDisplayStatus[] = ['Completed', 'Completed', 'Ready to review']
    const summary = summarizeImportProgress(statuses)
    expect(summary.completed).toBe(2)
    expect(summary.total).toBe(3)
  })

  it('handles an empty batch without dividing by zero or erroring', () => {
    const summary = summarizeImportProgress([])
    expect(summary).toEqual({ total: 0, analyzed: 0, readyToReview: 0, needsAttention: 0, needsProperty: 0, completed: 0, failed: 0 })
  })
})

describe('groupImportItemsByProperty', () => {
  it('groups confirmed items under their property id and unconfirmed items under null', () => {
    const items = [
      { id: 'a', confirmedPropertyId: 'p1' },
      { id: 'b', confirmedPropertyId: 'p1' },
      { id: 'c', confirmedPropertyId: 'p2' },
      { id: 'd', confirmedPropertyId: null },
    ]
    const groups = groupImportItemsByProperty(items)
    expect(groups.find((g) => g.propertyId === 'p1')?.items.map((i) => i.id)).toEqual(['a', 'b'])
    expect(groups.find((g) => g.propertyId === 'p2')?.items.map((i) => i.id)).toEqual(['c'])
    expect(groups.find((g) => g.propertyId === null)?.items.map((i) => i.id)).toEqual(['d'])
  })
})

describe('groupImportItemsByDocumentType', () => {
  it('groups by document type and buckets missing types under Unclassified', () => {
    const items = [
      { id: 'a', confirmedPropertyId: null, documentType: 'Insurance Policy' },
      { id: 'b', confirmedPropertyId: null, documentType: 'Insurance Policy' },
      { id: 'c', confirmedPropertyId: null },
    ]
    const groups = groupImportItemsByDocumentType(items)
    expect(groups.find((g) => g.documentType === 'Insurance Policy')?.items.map((i) => i.id)).toEqual(['a', 'b'])
    expect(groups.find((g) => g.documentType === 'Unclassified')?.items.map((i) => i.id)).toEqual(['c'])
  })
})
