import { describe, expect, it, vi } from 'vitest'
import { reassignDocumentToProperty, type ReassignDeps } from './reassign'

function makeDeps(overrides: Partial<ReassignDeps> = {}): ReassignDeps & {
  updateDocumentPropertyCalls: [string, string][]
  updateAnalysisPropertyCalls: [string, string][]
} {
  const updateDocumentPropertyCalls: [string, string][] = []
  const updateAnalysisPropertyCalls: [string, string][] = []
  return {
    isOwnedProperty: async () => true,
    findLinkedRecords: async () => [],
    updateDocumentProperty: async (documentId, propertyId) => {
      updateDocumentPropertyCalls.push([documentId, propertyId])
      return { error: null }
    },
    updateAnalysisProperty: async (documentId, propertyId) => {
      updateAnalysisPropertyCalls.push([documentId, propertyId])
    },
    updateDocumentPropertyCalls,
    updateAnalysisPropertyCalls,
    ...overrides,
  }
}

describe('reassignDocumentToProperty — assign an unassigned document', () => {
  it('assigns an unassigned document to an owned property', async () => {
    const deps = makeDeps()
    const result = await reassignDocumentToProperty({ id: 'doc-1', property_id: null }, 'prop-a', deps)
    expect(result).toEqual({ ok: true })
    expect(deps.updateDocumentPropertyCalls).toEqual([['doc-1', 'prop-a']])
  })

  it('never creates a duplicate document — only ever one property_id update, no insert dependency exists at all', async () => {
    const deps = makeDeps()
    await reassignDocumentToProperty({ id: 'doc-1', property_id: null }, 'prop-a', deps)
    expect(deps.updateDocumentPropertyCalls.length).toBe(1)
  })

  it('preserves the existing analysis by syncing document_analyses.property_id, never touching storage/file fields', async () => {
    const deps = makeDeps()
    await reassignDocumentToProperty({ id: 'doc-1', property_id: null }, 'prop-a', deps)
    expect(deps.updateAnalysisPropertyCalls).toEqual([['doc-1', 'prop-a']])
  })
})

describe('reassignDocumentToProperty — move an assigned document', () => {
  it('moves an assigned document to a different owned property', async () => {
    const deps = makeDeps()
    const result = await reassignDocumentToProperty({ id: 'doc-1', property_id: 'prop-a' }, 'prop-b', deps)
    expect(result).toEqual({ ok: true })
    expect(deps.updateDocumentPropertyCalls).toEqual([['doc-1', 'prop-b']])
  })

  it('is a no-op when re-selecting the same property — no write at all', async () => {
    const deps = makeDeps()
    const result = await reassignDocumentToProperty({ id: 'doc-1', property_id: 'prop-a' }, 'prop-a', deps)
    expect(result).toEqual({ ok: true })
    expect(deps.updateDocumentPropertyCalls.length).toBe(0)
    expect(deps.updateAnalysisPropertyCalls.length).toBe(0)
  })

  it('blocks the move (and makes no write) when the document is linked to a record on its current property', async () => {
    const deps = makeDeps({ findLinkedRecords: async () => ['a lease'] })
    const result = await reassignDocumentToProperty({ id: 'doc-1', property_id: 'prop-a' }, 'prop-b', deps)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('a lease')
    expect(deps.updateDocumentPropertyCalls.length).toBe(0)
  })
})

describe('reassignDocumentToProperty — cross-user security', () => {
  it('refuses to assign to a property the caller does not own, before ever attempting a write', async () => {
    const isOwnedProperty = vi.fn(async () => false)
    const updateDocumentProperty = vi.fn(async () => ({ error: null }))
    const deps = makeDeps({ isOwnedProperty, updateDocumentProperty })
    const result = await reassignDocumentToProperty({ id: 'doc-1', property_id: null }, 'someone-elses-property', deps)
    expect(result).toEqual({ ok: false, error: 'You can only assign documents to properties you own.' })
    expect(updateDocumentProperty).not.toHaveBeenCalled()
  })

  it('never exposes a raw database/RLS error if the update itself is rejected (defense-in-depth layer failing open on the client, RLS still refusing server-side)', async () => {
    const deps = makeDeps({
      updateDocumentProperty: async () => ({ error: 'new row violates row-level security policy for table "property_documents"' }),
    })
    const result = await reassignDocumentToProperty({ id: 'doc-1', property_id: null }, 'prop-a', deps)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).not.toMatch(/row-level security|postgres|rls/i)
    }
  })

  it('a notify-style analysis-sync failure never undoes an already-successful reassignment', async () => {
    const deps = makeDeps({ updateAnalysisProperty: async () => { throw new Error('network blip') } })
    const result = await reassignDocumentToProperty({ id: 'doc-1', property_id: null }, 'prop-a', deps)
    expect(result).toEqual({ ok: true })
  })
})
