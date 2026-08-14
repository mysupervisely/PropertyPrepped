// PropPrepped Milestone 8: the testable core of the /api/document-intelligence/analyze
// route, expressed as plain async functions (a "ports and adapters" seam)
// rather than Supabase client calls, so authorization and error-handling
// behavior can be unit tested without a database, network, or paid AI call.
//
// Security note (Section Q): `getDocument` is expected to be backed by an
// RLS-scoped Supabase client (the caller's own access token, never a
// service-role key). Returning null must cover BOTH "document does not
// exist" and "document belongs to someone else" — the two are
// indistinguishable to the caller by design, so this endpoint never reveals
// which case occurred (no user enumeration).

import { DOCUMENT_TYPES, isDocumentType, type DocumentType } from './types'
import type { AnalyzeDocumentResult } from './analyze-document'
// TEMPORARY M8 DIAGNOSTIC (Netlify function-log outage) — remove this
// import, the `diagnosticsAuthorized` dep field, and the `if` block in the
// catch below once the new production failure is diagnosed. See
// lib/document-intelligence/temp-diagnostics.ts for the full rationale.
import { TempProviderDiagnosticError } from './temp-diagnostics'

export type PropertyDocumentRow = {
  id: string
  property_id: string
  owner_id: string
  name: string
  storage_path: string
  size_bytes: number
  mime_type: string | null
  document_type: string | null
  classification_source: string | null
  analysis_status: string | null
}

export type AnalyzeRequestDeps = {
  isAiConfigured: () => boolean
  /** Must be scoped so it can only ever return a document the caller owns. */
  getDocument: (documentId: string) => Promise<PropertyDocumentRow | null>
  /**
   * Atomically transitions the document to "Processing" — implemented as a
   * single conditional UPDATE (`WHERE analysis_status != 'Processing'`) so
   * two near-simultaneous requests (double-click, two tabs) can't both win
   * the race and trigger two paid AI calls for the same document. Returns
   * false when another request already claimed it.
   */
  claimProcessing: (documentId: string) => Promise<boolean>
  updateDocumentStatus: (documentId: string, patch: Record<string, unknown>) => Promise<void>
  createSignedUrl: (storagePath: string) => Promise<string | null>
  fetchFileBytes: (url: string) => Promise<ArrayBuffer>
  analyze: (input: { documentType: DocumentType; fileBuffer: ArrayBuffer; fileName: string }) => Promise<AnalyzeDocumentResult>
  getNextVersion: (documentId: string) => Promise<number>
  saveAnalysis: (row: Record<string, unknown>) => Promise<{ id: string } | null>
  recordUsage: (row: Record<string, unknown>) => Promise<void>
  /**
   * TEMPORARY M8 DIAGNOSTIC (Netlify function-log outage). Resolved
   * server-side by the route, ONCE, via a fresh RLS-scoped read of the
   * caller's own subscription row — never a client-supplied flag. When
   * true (and only then), a failed analysis's response body additionally
   * carries a `diagnostics` object with sanitized provider-error fields;
   * every other caller (including when this is omitted/false) gets
   * exactly the existing generic message, unchanged. Optional so every
   * existing caller/test of this function is unaffected. Remove this
   * field (and its one call site below) once the new production failure
   * is diagnosed.
   */
  diagnosticsAuthorized?: boolean
}

export type AnalyzeRequestResult = { status: number; body: Record<string, unknown> }

// Anthropic's PDF request-size limit is 32MB for the whole request, and the
// file travels to Anthropic as base64 (~1.33x the raw byte count) alongside
// the system/user prompt text. Capping the raw file at 20MB keeps the
// base64 payload (~26.7MB) comfortably under that ceiling with headroom for
// prompt overhead — 28MB raw would have produced a base64 payload
// (~37.3MB) that already exceeds the limit before any prompt text is added.
const MAX_FILE_BYTES = 20 * 1024 * 1024

export async function handleAnalyzeRequest(
  input: { documentId?: unknown; documentType?: unknown },
  deps: AnalyzeRequestDeps,
): Promise<AnalyzeRequestResult> {
  const documentId = typeof input.documentId === 'string' ? input.documentId : ''
  if (!documentId || documentId.length > 200) return { status: 400, body: { error: 'A documentId is required.' } }

  // Never accept an arbitrary storage path from the browser — only a document
  // ID, resolved server-side through an RLS-scoped lookup (Section Q).
  const doc = await deps.getDocument(documentId)
  if (!doc) return { status: 404, body: { error: 'Document not found.' } }

  if (!deps.isAiConfigured()) {
    return { status: 503, body: { error: 'AI document analysis has not been configured yet.' } }
  }

  const isPdf = doc.mime_type === 'application/pdf' || doc.name.toLowerCase().endsWith('.pdf')
  if (!isPdf) {
    return { status: 415, body: { error: 'AI analysis currently supports PDF documents only.' } }
  }
  // Explicit server-side limits — never rely on the browser having validated
  // this. `size_bytes` is a bigint column; 0/undefined must fail closed
  // rather than silently bypassing the upper-bound check below.
  if (!doc.size_bytes || doc.size_bytes <= 0) {
    return { status: 400, body: { error: 'This file appears to be empty and cannot be analyzed.' } }
  }
  if (doc.size_bytes > MAX_FILE_BYTES) {
    return { status: 413, body: { error: `This file is too large for AI analysis (${MAX_FILE_BYTES / (1024 * 1024)}MB max).` } }
  }

  // Cost/usage protection: refuse to start a second analysis while one is
  // already running for this document. Atomic at the database level (see
  // claimProcessing's contract) — this is not merely a client-side disabled
  // button, it holds even across two tabs or a retried request.
  const claimed = await deps.claimProcessing(documentId)
  if (!claimed) {
    return { status: 409, body: { error: 'This document is already being analyzed. Please wait for it to finish.' } }
  }

  const signedUrl = await deps.createSignedUrl(doc.storage_path)
  if (!signedUrl) {
    await deps.updateDocumentStatus(documentId, { analysis_status: 'Failed', analysis_error: 'Could not access the stored file.' })
    return { status: 500, body: { error: 'Could not access the stored file.' } }
  }

  let fileBuffer: ArrayBuffer
  try {
    fileBuffer = await deps.fetchFileBytes(signedUrl)
  } catch {
    await deps.updateDocumentStatus(documentId, { analysis_status: 'Failed', analysis_error: 'Could not download the file for analysis.' })
    return { status: 502, body: { error: 'Could not download the file for analysis.' } }
  }
  if (fileBuffer.byteLength === 0) {
    // Defense in depth: the size_bytes column could be stale even though we
    // already rejected a 0-byte record above — check the bytes we actually got.
    await deps.updateDocumentStatus(documentId, { analysis_status: 'Failed', analysis_error: 'The stored file is empty.' })
    return { status: 400, body: { error: 'The stored file is empty and cannot be analyzed.' } }
  }
  if (fileBuffer.byteLength > MAX_FILE_BYTES) {
    await deps.updateDocumentStatus(documentId, { analysis_status: 'Failed', analysis_error: 'The stored file exceeds the size limit.' })
    return { status: 413, body: { error: `This file is too large for AI analysis (${MAX_FILE_BYTES / (1024 * 1024)}MB max).` } }
  }

  const requestedType: DocumentType = isDocumentType(input.documentType)
    ? input.documentType
    : isDocumentType(doc.document_type)
      ? doc.document_type
      : 'Other'

  let result: AnalyzeDocumentResult
  try {
    result = await deps.analyze({ documentType: requestedType, fileBuffer, fileName: doc.name })
  } catch (err) {
    // Never surface the raw provider error (could contain request internals,
    // or an UnverifiedModelError naming an internal config value) to the client.
    const reason = 'AI analysis failed. Your document and existing data are unchanged — you can retry.'
    await deps.updateDocumentStatus(documentId, { analysis_status: 'Failed', analysis_error: reason })
    const body: Record<string, unknown> = { error: reason }
    // TEMPORARY M8 DIAGNOSTIC (Netlify function-log outage): the generic
    // `error` message above is unchanged and always present — this only
    // ADDS a `diagnostics` field, and only when the caller was already
    // proven authorized server-side before this function was ever called.
    // Every normal customer (unauthorized, or diagnosticsAuthorized
    // omitted) gets exactly `{ error: reason }`, byte-for-byte identical
    // to this endpoint's behavior before this diagnostic existed.
    if (deps.diagnosticsAuthorized && err instanceof TempProviderDiagnosticError) {
      body.diagnostics = err.diagnostics
    }
    return { status: 502, body }
  }

  const nextVersion = await deps.getNextVersion(documentId)

  // sourcePage/sourceSnippet are the AI's own best-effort read of the
  // document, not the Messages API's citation feature (which requires
  // dropping structured outputs — see providers/anthropic.ts) — they are
  // reference pointers to verify against the original file, not guaranteed
  // citations. That framing is preserved verbatim into what gets stored and
  // shown; see DocumentIntelligencePanel.tsx for the UI-facing wording.
  const sourceReferences = result.output.groups.flatMap((group) =>
    group.fields
      .filter((f) => f.sourcePage !== null || f.sourceSnippet !== null)
      .map((f) => ({ group: group.title, label: f.label, page: f.sourcePage, snippet: f.sourceSnippet, confidence: f.confidence })),
  )

  const saved = await deps.saveAnalysis({
    document_id: documentId,
    property_id: doc.property_id,
    document_type: result.output.classification.documentType,
    summary: result.output.summary,
    structured_data: result.output,
    source_references: sourceReferences,
    model_provider: result.provider,
    model_name: result.modelName,
    analysis_version: nextVersion,
  })

  if (!saved) {
    await deps.updateDocumentStatus(documentId, { analysis_status: 'Failed', analysis_error: 'Could not save the analysis results.' })
    return { status: 500, body: { error: 'Could not save the analysis results.' } }
  }

  await deps
    .recordUsage({
      document_id: documentId,
      analysis_id: saved.id,
      provider: result.provider,
      model: result.modelName,
      input_tokens: result.usage.inputTokens,
      output_tokens: result.usage.outputTokens,
    })
    .catch(() => {
      // Usage tracking is best-effort — never fail a successful analysis over it.
    })

  const statusUpdate: Record<string, unknown> = {
    analysis_status: 'Completed',
    analysis_completed_at: new Date().toISOString(),
    analysis_error: null,
  }
  // Never overwrite a classification the user set themselves.
  if (doc.classification_source !== 'User') {
    statusUpdate.document_type = result.output.classification.documentType
    statusUpdate.classification_confidence = result.output.classification.confidence
    statusUpdate.classification_source = 'AI'
  }
  await deps.updateDocumentStatus(documentId, statusUpdate)

  return { status: 200, body: { analysisId: saved.id, analysisVersion: nextVersion, output: result.output } }
}

export { DOCUMENT_TYPES }
