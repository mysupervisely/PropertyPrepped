import { describe, expect, it } from 'vitest'
import { deriveDocumentWatchDrafts, type DocumentAnalysisLike } from './document-intelligence'
import type { PropertyLike } from './lease'

const NOW = new Date('2026-08-14T12:00:00')
const at = (daysFromNow: number) => {
  const d = new Date(NOW)
  d.setDate(d.getDate() + daysFromNow)
  return d.toISOString().slice(0, 10)
}

const property: PropertyLike = { id: 'prop-1', owner_id: 'owner-1', address: '77 Extract Ave' }

function analysis(overrides: Partial<DocumentAnalysisLike> = {}): DocumentAnalysisLike {
  return { analysisId: 'analysis-1', documentId: 'doc-1', classificationConfidence: 'High', applyFields: { endDate: at(20) }, ...overrides }
}

describe('deriveDocumentWatchDrafts', () => {
  it('a high-confidence extraction produces a correctly-dated, correctly-prioritized item', () => {
    const drafts = deriveDocumentWatchDrafts(analysis({ classificationConfidence: 'High', applyFields: { endDate: at(20) } }), property, NOW)
    expect(drafts).toHaveLength(1)
    expect(drafts[0].category).toBe('Lease')
    expect(drafts[0].event_date).toBe(at(20))
    expect(drafts[0].priority).toBe('High') // 20 days -> High band, applied normally since confidence is High
    expect(drafts[0].metadata.needsConfirmation).toBe(false)
  })

  it('a medium-confidence extraction also auto-applies', () => {
    const drafts = deriveDocumentWatchDrafts(analysis({ classificationConfidence: 'Medium', applyFields: { expirationDate: at(5) } }), property, NOW)
    expect(drafts[0].priority).toBe('Urgent')
    expect(drafts[0].metadata.needsConfirmation).toBe(false)
  })

  it('a low-confidence extraction NEVER silently produces a critical reminder — priority capped Low, status capped Upcoming', () => {
    // Even though the date itself is only 2 days out (which would normally be Urgent/Needs Attention).
    const drafts = deriveDocumentWatchDrafts(analysis({ classificationConfidence: 'Low', applyFields: { endDate: at(2) } }), property, NOW)
    expect(drafts).toHaveLength(1)
    expect(drafts[0].priority).toBe('Low')
    expect(drafts[0].status).toBe('Upcoming')
    expect(drafts[0].metadata.needsConfirmation).toBe(true)
    expect(drafts[0].metadata.confidence).toBe('Low')
  })

  it('is never silent — a low-confidence item still exists (visible on Upcoming), just not critical', () => {
    const drafts = deriveDocumentWatchDrafts(analysis({ classificationConfidence: 'Low', applyFields: { endDate: at(2) } }), property, NOW)
    expect(drafts).toHaveLength(1) // still produced, not dropped entirely
  })

  it('re-analysis of the same document (new analysisId, same documentId) keeps the same dedup identity', () => {
    const first = deriveDocumentWatchDrafts(analysis({ analysisId: 'analysis-1', documentId: 'doc-1' }), property, NOW)[0]
    const second = deriveDocumentWatchDrafts(analysis({ analysisId: 'analysis-2', documentId: 'doc-1' }), property, NOW)[0]
    expect(first.source_id).toBe(second.source_id)
    expect(first.event_key).toBe(second.event_key)
    expect(first.source_type).toBe('document')
  })

  it('produces multiple drafts when multiple supported fields are present', () => {
    const drafts = deriveDocumentWatchDrafts(
      analysis({ applyFields: { endDate: at(20), expirationDate: at(40), maturityDate: at(60) } }),
      property,
      NOW
    )
    expect(drafts.map((d) => d.category).sort()).toEqual(['Insurance', 'Lease', 'Mortgage'])
  })

  it('produces nothing for fields that are absent', () => {
    expect(deriveDocumentWatchDrafts(analysis({ applyFields: {} }), property, NOW)).toHaveLength(0)
  })

  it('produces nothing when the extracted date is outside the warning window', () => {
    expect(deriveDocumentWatchDrafts(analysis({ applyFields: { endDate: at(300) } }), property, NOW)).toHaveLength(0)
  })
})
