import { describe, expect, it, vi } from 'vitest'
import { handleAnalyzeRequest, type AnalyzeRequestDeps, type PropertyDocumentRow } from './analyze-request'
import type { AnalyzeDocumentResult } from './analyze-document'
import type { DocumentAnalysisOutput } from './schemas'

function fakeDoc(overrides: Partial<PropertyDocumentRow> = {}): PropertyDocumentRow {
  return {
    id: 'doc-1',
    property_id: 'prop-1',
    owner_id: 'user-1',
    name: 'policy.pdf',
    storage_path: 'user-1/prop-1/documents/policy.pdf',
    size_bytes: 1024,
    mime_type: 'application/pdf',
    document_type: 'Insurance Policy',
    classification_source: 'User',
    ...overrides,
  }
}

function fakeAnalyzeResult(): AnalyzeDocumentResult {
  const output: DocumentAnalysisOutput = {
    classification: { documentType: 'Insurance Policy', confidence: 'High' },
    overview: 'Overview.',
    summary: 'Summary.',
    groups: [{ title: 'Coverage', fields: [{ label: 'Dwelling Coverage', value: '$425,000', confidence: 'High', sourcePage: 3, sourceSnippet: 'Coverage A' }] }],
    itemsToReview: [],
    missingOrUnclear: [],
    sourceTraceabilityNote: 'Page references reflect the uploaded PDF.',
    applyFields: {
      carrier: 'Acme Insurance', policyNumber: null, annualPremium: '2850', deductible: null, effectiveDate: null, expirationDate: null,
      lender: null, loanNumber: null, originalBalance: null, currentBalance: null, interestRate: null, monthlyPayment: null,
      escrowAmount: null, loanTermYears: null, maturityDate: null, tenantName: null, tenantEmail: null, monthlyRent: null,
      securityDeposit: null, startDate: null, endDate: null, vendor: null, description: null, cost: null, amount: null,
      date: null, category: null, name: null, businessName: null, phone: null, email: null, website: null, estimatedValue: null,
    },
  }
  return { output, provider: 'anthropic', modelName: 'claude-sonnet-5', usage: { inputTokens: 100, outputTokens: 50 } }
}

function baseDeps(overrides: Partial<AnalyzeRequestDeps> = {}): AnalyzeRequestDeps {
  return {
    isAiConfigured: vi.fn().mockReturnValue(true),
    getDocument: vi.fn().mockResolvedValue(fakeDoc()),
    updateDocumentStatus: vi.fn().mockResolvedValue(undefined),
    createSignedUrl: vi.fn().mockResolvedValue('https://example.com/signed'),
    fetchFileBytes: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
    analyze: vi.fn().mockResolvedValue(fakeAnalyzeResult()),
    getNextVersion: vi.fn().mockResolvedValue(1),
    saveAnalysis: vi.fn().mockResolvedValue({ id: 'analysis-1' }),
    recordUsage: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('handleAnalyzeRequest — 8/9. unauthorized / another user\'s document', () => {
  it('returns 404 (not 401/403) when getDocument finds nothing — RLS makes "not mine" indistinguishable from "does not exist"', async () => {
    const deps = baseDeps({ getDocument: vi.fn().mockResolvedValue(null) })
    const result = await handleAnalyzeRequest({ documentId: 'someone-elses-doc' }, deps)
    expect(result.status).toBe(404)
    expect(result.body.error).toMatch(/not found/i)
    // Never reached the AI call for a document the caller doesn't own.
    expect(deps.analyze).not.toHaveBeenCalled()
  })

  it('rejects a request with no documentId at all', async () => {
    const deps = baseDeps()
    const result = await handleAnalyzeRequest({}, deps)
    expect(result.status).toBe(400)
    expect(deps.getDocument).not.toHaveBeenCalled()
  })
})

describe('handleAnalyzeRequest — AI not configured', () => {
  it('returns 503 with a graceful message and never calls analyze', async () => {
    const deps = baseDeps({ isAiConfigured: vi.fn().mockReturnValue(false) })
    const result = await handleAnalyzeRequest({ documentId: 'doc-1' }, deps)
    expect(result.status).toBe(503)
    expect(result.body.error).toMatch(/not been configured/i)
    expect(deps.analyze).not.toHaveBeenCalled()
  })
})

describe('handleAnalyzeRequest — 10. unsupported file', () => {
  it('rejects a non-PDF document with 415 before touching storage or the AI', async () => {
    const deps = baseDeps({ getDocument: vi.fn().mockResolvedValue(fakeDoc({ mime_type: 'image/jpeg', name: 'photo.jpg' })) })
    const result = await handleAnalyzeRequest({ documentId: 'doc-1' }, deps)
    expect(result.status).toBe(415)
    expect(deps.createSignedUrl).not.toHaveBeenCalled()
    expect(deps.analyze).not.toHaveBeenCalled()
  })

  it('rejects a file over the size limit with 413', async () => {
    const deps = baseDeps({ getDocument: vi.fn().mockResolvedValue(fakeDoc({ size_bytes: 40 * 1024 * 1024 })) })
    const result = await handleAnalyzeRequest({ documentId: 'doc-1' }, deps)
    expect(result.status).toBe(413)
    expect(deps.analyze).not.toHaveBeenCalled()
  })
})

describe('handleAnalyzeRequest — 11. failed analysis', () => {
  it('marks the document Failed with a sanitized reason and never leaks the raw error', async () => {
    const deps = baseDeps({ analyze: vi.fn().mockRejectedValue(new Error('upstream stack trace with internal request id sk-secret-123')) })
    const result = await handleAnalyzeRequest({ documentId: 'doc-1' }, deps)

    expect(result.status).toBe(502)
    expect(JSON.stringify(result.body)).not.toContain('sk-secret-123')

    const failedCall = (deps.updateDocumentStatus as any).mock.calls.find((c: any[]) => c[1]?.analysis_status === 'Failed')
    expect(failedCall).toBeTruthy()
    expect(failedCall[1].analysis_error).not.toContain('sk-secret-123')
  })

  it('keeps the document\'s existing data intact — no destructive writes on failure', async () => {
    const deps = baseDeps({ createSignedUrl: vi.fn().mockResolvedValue(null) })
    const result = await handleAnalyzeRequest({ documentId: 'doc-1' }, deps)
    expect(result.status).toBe(500)
    expect(deps.saveAnalysis).not.toHaveBeenCalled()
  })
})

describe('handleAnalyzeRequest — happy path', () => {
  it('runs Processing → Completed, saves the analysis, records usage, and returns 200', async () => {
    const deps = baseDeps()
    const result = await handleAnalyzeRequest({ documentId: 'doc-1' }, deps)

    expect(result.status).toBe(200)
    expect(deps.updateDocumentStatus).toHaveBeenCalledWith('doc-1', expect.objectContaining({ analysis_status: 'Processing' }))
    expect(deps.saveAnalysis).toHaveBeenCalledWith(expect.objectContaining({ document_id: 'doc-1', analysis_version: 1 }))
    expect(deps.recordUsage).toHaveBeenCalledWith(expect.objectContaining({ analysis_id: 'analysis-1', input_tokens: 100, output_tokens: 50 }))
    expect(deps.updateDocumentStatus).toHaveBeenCalledWith('doc-1', expect.objectContaining({ analysis_status: 'Completed' }))
  })

  it('never overwrites a classification the user set themselves', async () => {
    const deps = baseDeps({ getDocument: vi.fn().mockResolvedValue(fakeDoc({ classification_source: 'User', document_type: 'Lease' })) })
    await handleAnalyzeRequest({ documentId: 'doc-1' }, deps)
    const completedCall = (deps.updateDocumentStatus as any).mock.calls.find((c: any[]) => c[1]?.analysis_status === 'Completed')
    expect(completedCall[1].document_type).toBeUndefined()
    expect(completedCall[1].classification_source).toBeUndefined()
  })

  it('adopts the AI classification when the document has no user-set type', async () => {
    const deps = baseDeps({ getDocument: vi.fn().mockResolvedValue(fakeDoc({ classification_source: null, document_type: null })) })
    await handleAnalyzeRequest({ documentId: 'doc-1' }, deps)
    const completedCall = (deps.updateDocumentStatus as any).mock.calls.find((c: any[]) => c[1]?.analysis_status === 'Completed')
    expect(completedCall[1].document_type).toBe('Insurance Policy')
    expect(completedCall[1].classification_source).toBe('AI')
  })
})

describe('handleAnalyzeRequest — 12. re-analysis / versioning', () => {
  it('requests the next version number and never calls an update-in-place for prior analyses', async () => {
    const deps = baseDeps({ getNextVersion: vi.fn().mockResolvedValue(3) })
    const result = await handleAnalyzeRequest({ documentId: 'doc-1' }, deps)

    expect(result.status).toBe(200)
    expect(result.body.analysisVersion).toBe(3)
    expect(deps.saveAnalysis).toHaveBeenCalledWith(expect.objectContaining({ analysis_version: 3 }))
    // The dependency surface has no "updateAnalysis" — re-analysis can only ever INSERT a new row.
    expect(Object.keys(deps)).not.toContain('updateAnalysis')
  })
})
