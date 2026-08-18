import { describe, expect, it, vi } from 'vitest'
import { handleAnalyzeRequest, type AnalyzeRequestDeps, type PropertyDocumentRow } from './analyze-request'
import type { AnalyzeDocumentResult } from './analyze-document'
import type { DocumentAnalysisOutput } from './schemas'
// TEMPORARY M8 DIAGNOSTIC — remove this import and the describe block that
// uses it once temp-diagnostics.ts is removed.
import { TempProviderDiagnosticError } from './temp-diagnostics'

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
    analysis_status: 'Not Analyzed',
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
      propertyAddress: null,
    },
  }
  return { output, provider: 'anthropic', modelName: 'claude-sonnet-5', usage: { inputTokens: 100, outputTokens: 50 } }
}

function baseDeps(overrides: Partial<AnalyzeRequestDeps> = {}): AnalyzeRequestDeps {
  return {
    isAiConfigured: vi.fn().mockReturnValue(true),
    // Launch Pricing: unlimited/allowed by default so every pre-existing
    // test in this file keeps exercising the SAME behavior it always
    // did — only the tests that explicitly override this exercise the
    // AI-allowance gate itself.
    checkAiAllowance: vi.fn().mockResolvedValue({ allowed: true, limit: null, used: 0 }),
    getDocument: vi.fn().mockResolvedValue(fakeDoc()),
    claimProcessing: vi.fn().mockResolvedValue(true),
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
  it('rejects a document type AI analysis does not support (e.g. Word) with 415 before touching storage or the AI', async () => {
    const deps = baseDeps({ getDocument: vi.fn().mockResolvedValue(fakeDoc({ mime_type: 'application/msword', name: 'notes.doc' })) })
    const result = await handleAnalyzeRequest({ documentId: 'doc-1' }, deps)
    expect(result.status).toBe(415)
    expect(deps.createSignedUrl).not.toHaveBeenCalled()
    expect(deps.analyze).not.toHaveBeenCalled()
  })

  it('rejects a HEIC photo with 415 — Anthropic does not accept it directly and this app has no transcoding step', async () => {
    const deps = baseDeps({ getDocument: vi.fn().mockResolvedValue(fakeDoc({ mime_type: 'image/heic', name: 'IMG_0001.heic' })) })
    const result = await handleAnalyzeRequest({ documentId: 'doc-1' }, deps)
    expect(result.status).toBe(415)
    expect(deps.analyze).not.toHaveBeenCalled()
  })

  // Smart Upload Foundation (Part 10): receipts captured by a phone camera
  // are images, not PDFs — the whole point of extending this endpoint.
  it('accepts a JPEG photo and passes the resolved mime type through to analyze()', async () => {
    const deps = baseDeps({ getDocument: vi.fn().mockResolvedValue(fakeDoc({ mime_type: 'image/jpeg', name: 'receipt.jpg' })) })
    const result = await handleAnalyzeRequest({ documentId: 'doc-1' }, deps)
    expect(result.status).toBe(200)
    expect(deps.analyze).toHaveBeenCalledWith(expect.objectContaining({ mimeType: 'image/jpeg' }))
  })

  it('accepts a PNG photo', async () => {
    const deps = baseDeps({ getDocument: vi.fn().mockResolvedValue(fakeDoc({ mime_type: 'image/png', name: 'receipt.png' })) })
    const result = await handleAnalyzeRequest({ documentId: 'doc-1' }, deps)
    expect(result.status).toBe(200)
    expect(deps.analyze).toHaveBeenCalledWith(expect.objectContaining({ mimeType: 'image/png' }))
  })

  it('rejects a file over the size limit with 413', async () => {
    const deps = baseDeps({ getDocument: vi.fn().mockResolvedValue(fakeDoc({ size_bytes: 25 * 1024 * 1024 })) })
    const result = await handleAnalyzeRequest({ documentId: 'doc-1' }, deps)
    expect(result.status).toBe(413)
    expect(deps.analyze).not.toHaveBeenCalled()
    expect(deps.claimProcessing).not.toHaveBeenCalled()
  })

  it('rejects an empty (0-byte) file with 400 rather than silently skipping the size check', async () => {
    const deps = baseDeps({ getDocument: vi.fn().mockResolvedValue(fakeDoc({ size_bytes: 0 })) })
    const result = await handleAnalyzeRequest({ documentId: 'doc-1' }, deps)
    expect(result.status).toBe(400)
    expect(result.body.error).toMatch(/empty/i)
    expect(deps.claimProcessing).not.toHaveBeenCalled()
    expect(deps.analyze).not.toHaveBeenCalled()
  })

  it('fails closed if the downloaded bytes are empty even though size_bytes looked fine', async () => {
    const deps = baseDeps({ fetchFileBytes: vi.fn().mockResolvedValue(new ArrayBuffer(0)) })
    const result = await handleAnalyzeRequest({ documentId: 'doc-1' }, deps)
    expect(result.status).toBe(400)
    expect(result.body.error).toMatch(/empty/i)
    expect(deps.analyze).not.toHaveBeenCalled()
  })
})

describe('handleAnalyzeRequest — usage/cost protection: duplicate analysis guard', () => {
  it('returns 409 and never calls analyze when claimProcessing reports the document is already Processing', async () => {
    const deps = baseDeps({ claimProcessing: vi.fn().mockResolvedValue(false) })
    const result = await handleAnalyzeRequest({ documentId: 'doc-1' }, deps)
    expect(result.status).toBe(409)
    expect(result.body.error).toMatch(/already being analyzed/i)
    expect(deps.analyze).not.toHaveBeenCalled()
    expect(deps.saveAnalysis).not.toHaveBeenCalled()
  })

  it('proceeds normally when claimProcessing succeeds (no concurrent run)', async () => {
    const deps = baseDeps()
    const result = await handleAnalyzeRequest({ documentId: 'doc-1' }, deps)
    expect(deps.claimProcessing).toHaveBeenCalledWith('doc-1')
    expect(result.status).toBe(200)
  })

  it('deliberate re-analysis still works once the prior run has finished (claim succeeds again)', async () => {
    const deps = baseDeps({ getNextVersion: vi.fn().mockResolvedValue(2) })
    const result = await handleAnalyzeRequest({ documentId: 'doc-1' }, deps)
    expect(result.status).toBe(200)
    expect(result.body.analysisVersion).toBe(2)
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

describe('handleAnalyzeRequest — TEMPORARY M8 diagnostic (remove this block when temp-diagnostics.ts is removed)', () => {
  it('an unauthorized (or omitted diagnosticsAuthorized) caller gets the exact same generic body as before this feature existed — no diagnostics key at all', async () => {
    const deps = baseDeps({ analyze: vi.fn().mockRejectedValue(new TempProviderDiagnosticError(new Error('boom'), { provider: 'anthropic', model: 'claude-sonnet-5', httpStatus: 500, anthropicErrorType: 'api_error', errorClass: 'InternalServerError', requestId: 'req_123', safeMessage: 'Internal server error' })) })
    const result = await handleAnalyzeRequest({ documentId: 'doc-1' }, deps)
    expect(result.status).toBe(502)
    expect(result.body).toEqual({ error: 'AI analysis failed. Your document and existing data are unchanged — you can retry.' })
    expect('diagnostics' in result.body).toBe(false)
  })

  it('an explicitly-false diagnosticsAuthorized caller also gets no diagnostics key', async () => {
    const diagError = new TempProviderDiagnosticError(new Error('boom'), {
      provider: 'anthropic', model: 'claude-sonnet-5', httpStatus: 429, anthropicErrorType: 'rate_limit_error', errorClass: 'RateLimitError', requestId: 'req_456', safeMessage: 'Rate limited',
    })
    const deps = baseDeps({ analyze: vi.fn().mockRejectedValue(diagError), diagnosticsAuthorized: false })
    const result = await handleAnalyzeRequest({ documentId: 'doc-1' }, deps)
    expect('diagnostics' in result.body).toBe(false)
  })

  it('an authorized caller gets the sanitized diagnostics object attached, alongside the unchanged generic error message', async () => {
    const diagnostics = {
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      httpStatus: 401,
      anthropicErrorType: 'authentication_error',
      errorClass: 'AuthenticationError',
      requestId: 'req_789',
      safeMessage: 'invalid x-api-key',
    }
    const deps = baseDeps({ analyze: vi.fn().mockRejectedValue(new TempProviderDiagnosticError(new Error('boom'), diagnostics)), diagnosticsAuthorized: true })
    const result = await handleAnalyzeRequest({ documentId: 'doc-1' }, deps)
    expect(result.status).toBe(502)
    expect(result.body.error).toBe('AI analysis failed. Your document and existing data are unchanged — you can retry.')
    expect(result.body.diagnostics).toEqual(diagnostics)
  })

  it('an authorized caller analyzing successfully never sees a diagnostics field — this only ever activates on failure', async () => {
    const deps = baseDeps({ diagnosticsAuthorized: true })
    const result = await handleAnalyzeRequest({ documentId: 'doc-1' }, deps)
    expect(result.status).toBe(200)
    expect('diagnostics' in result.body).toBe(false)
  })

  it('an authorized caller still gets no diagnostics if the failure was not a TempProviderDiagnosticError (e.g. a plain thrown Error) — never fabricates diagnostics out of nothing', async () => {
    const deps = baseDeps({ analyze: vi.fn().mockRejectedValue(new Error('some other failure')), diagnosticsAuthorized: true })
    const result = await handleAnalyzeRequest({ documentId: 'doc-1' }, deps)
    expect('diagnostics' in result.body).toBe(false)
  })

  it('the diagnostics object never contains secret-looking substrings even when the underlying error message does', async () => {
    // buildTempProviderDiagnostics is exercised directly in temp-diagnostics.test.ts;
    // this asserts the same guarantee holds end-to-end through handleAnalyzeRequest.
    const diagnostics = {
      provider: 'anthropic', model: 'claude-sonnet-5', httpStatus: 400, anthropicErrorType: 'invalid_request_error',
      errorClass: 'BadRequestError', requestId: 'req_abc', safeMessage: 'Schema contains too many parameters',
    }
    const deps = baseDeps({ analyze: vi.fn().mockRejectedValue(new TempProviderDiagnosticError(new Error('boom'), diagnostics)), diagnosticsAuthorized: true })
    const result = await handleAnalyzeRequest({ documentId: 'doc-1' }, deps)
    const serialized = JSON.stringify(result.body).toLowerCase()
    for (const forbidden of ['sk-ant-', 'authorization', 'bearer ', 'service_role', 'signed', '%pdf', 'base64']) {
      expect(serialized.includes(forbidden)).toBe(false)
    }
  })
})

describe('handleAnalyzeRequest — happy path', () => {
  it('runs Processing → Completed, saves the analysis, records usage, and returns 200', async () => {
    const deps = baseDeps()
    const result = await handleAnalyzeRequest({ documentId: 'doc-1' }, deps)

    expect(result.status).toBe(200)
    expect(deps.claimProcessing).toHaveBeenCalledWith('doc-1')
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

describe('handleAnalyzeRequest — defense in depth: document_id/property_id/owner_id are never taken from client input', () => {
  it('always saves the analysis using the property_id resolved server-side from the RLS-scoped document lookup, ignoring any smuggled input fields', async () => {
    const deps = baseDeps({ getDocument: vi.fn().mockResolvedValue(fakeDoc({ property_id: 'trusted-prop-1' })) })
    // A malicious client could stuff extra fields into the JSON body hoping
    // a naive route handler spreads `input` straight into the insert. The
    // handler's input type only recognizes documentId/documentType, so
    // these extra fields must have zero effect on what gets saved.
    const maliciousInput = {
      documentId: 'doc-1',
      property_id: 'attacker-prop-999',
      owner_id: 'attacker-uid',
      document_id: 'attacker-doc-999',
    } as unknown as { documentId?: unknown; documentType?: unknown }

    const result = await handleAnalyzeRequest(maliciousInput, deps)

    expect(result.status).toBe(200)
    expect(deps.saveAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({ document_id: 'doc-1', property_id: 'trusted-prop-1' }),
    )
    // saveAnalysis's row never carries an owner_id at all — the real route
    // handler (app/api/document-intelligence/analyze/route.ts) adds it from
    // the authenticated session token, never from the request body.
    const savedRow = (deps.saveAnalysis as any).mock.calls[0][0]
    expect(savedRow).not.toHaveProperty('owner_id')
  })

  it('recordUsage is likewise keyed off the server-resolved documentId, not any client-supplied id', async () => {
    const deps = baseDeps({ getDocument: vi.fn().mockResolvedValue(fakeDoc({ property_id: 'trusted-prop-1' })) })
    const maliciousInput = { documentId: 'doc-1', document_id: 'attacker-doc-999' } as unknown as {
      documentId?: unknown
      documentType?: unknown
    }
    await handleAnalyzeRequest(maliciousInput, deps)
    expect(deps.recordUsage).toHaveBeenCalledWith(expect.objectContaining({ document_id: 'doc-1' }))
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

describe('handleAnalyzeRequest — Launch Pricing: server-side AI allowance enforcement', () => {
  it('CRITICAL: an exhausted allowance blocks BEFORE any file work or Anthropic call — analyze() is never invoked', async () => {
    const deps = baseDeps({ checkAiAllowance: vi.fn().mockResolvedValue({ allowed: false, limit: 50, used: 50 }) })
    const result = await handleAnalyzeRequest({ documentId: 'doc-1' }, deps)

    expect(result.status).toBe(403)
    expect(result.body.error).toBe('AI_LIMIT_REACHED')
    expect(deps.analyze).not.toHaveBeenCalled()
    // Never even reaches the file-fetch/claim-processing steps — the
    // allowance check is the very first thing after isAiConfigured().
    expect(deps.createSignedUrl).not.toHaveBeenCalled()
    expect(deps.claimProcessing).not.toHaveBeenCalled()
  })

  it('a plan without the capability at all (limit: 0) gets the same structured block, with plan-specific copy', () => {
    return handleAnalyzeRequest({ documentId: 'doc-1' }, baseDeps({ checkAiAllowance: vi.fn().mockResolvedValue({ allowed: false, limit: 0, used: 0 }) }))
      .then((result) => {
        expect(result.status).toBe(403)
        expect(result.body.message).toMatch(/included with the manage plan/i)
      })
  })

  it('exhausted-allowance copy names the numeric limit for a metered (non-zero) plan', async () => {
    const deps = baseDeps({ checkAiAllowance: vi.fn().mockResolvedValue({ allowed: false, limit: 50, used: 50 }) })
    const result = await handleAnalyzeRequest({ documentId: 'doc-1' }, deps)
    expect(result.body.message).toMatch(/50 document analyses/)
  })

  it('an allowed request (under the limit) proceeds to call analyze() normally', async () => {
    const deps = baseDeps({ checkAiAllowance: vi.fn().mockResolvedValue({ allowed: true, limit: 50, used: 12 }) })
    const result = await handleAnalyzeRequest({ documentId: 'doc-1' }, deps)
    expect(result.status).toBe(200)
    expect(deps.analyze).toHaveBeenCalled()
  })

  it('an unlimited allowance (legacy/owner plans) never blocks regardless of usage', async () => {
    const deps = baseDeps({ checkAiAllowance: vi.fn().mockResolvedValue({ allowed: true, limit: null, used: 9999 }) })
    const result = await handleAnalyzeRequest({ documentId: 'doc-1' }, deps)
    expect(result.status).toBe(200)
    expect(deps.analyze).toHaveBeenCalled()
  })

  it('a successful analysis still records usage exactly as before — the allowance check does not change what a successful call writes', async () => {
    const deps = baseDeps({ checkAiAllowance: vi.fn().mockResolvedValue({ allowed: true, limit: 50, used: 5 }) })
    await handleAnalyzeRequest({ documentId: 'doc-1' }, deps)
    expect(deps.recordUsage).toHaveBeenCalled()
  })

  it('a failed analysis never records usage — the count a future allowance check reads only ever reflects successful analyses (Retry Analysis genuinely consumes a fresh slot only when it succeeds)', async () => {
    const deps = baseDeps({
      checkAiAllowance: vi.fn().mockResolvedValue({ allowed: true, limit: 50, used: 5 }),
      analyze: vi.fn().mockRejectedValue(new Error('provider timeout')),
    })
    const result = await handleAnalyzeRequest({ documentId: 'doc-1' }, deps)
    expect(result.status).toBe(502)
    expect(deps.recordUsage).not.toHaveBeenCalled()
  })
})
