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
}

export type AnalyzeRequestDeps = {
  isAiConfigured: () => boolean
  /** Must be scoped so it can only ever return a document the caller owns. */
  getDocument: (documentId: string) => Promise<PropertyDocumentRow | null>
  updateDocumentStatus: (documentId: string, patch: Record<string, unknown>) => Promise<void>
  createSignedUrl: (storagePath: string) => Promise<string | null>
  fetchFileBytes: (url: string) => Promise<ArrayBuffer>
  analyze: (input: { documentType: DocumentType; fileBuffer: ArrayBuffer; fileName: string }) => Promise<AnalyzeDocumentResult>
  getNextVersion: (documentId: string) => Promise<number>
  saveAnalysis: (row: Record<string, unknown>) => Promise<{ id: string } | null>
  recordUsage: (row: Record<string, unknown>) => Promise<void>
}

export type AnalyzeRequestResult = { status: number; body: Record<string, unknown> }

const MAX_FILE_BYTES = 28 * 1024 * 1024 // safety margin under Claude's 32MB PDF request limit

export async function handleAnalyzeRequest(
  input: { documentId?: unknown; documentType?: unknown },
  deps: AnalyzeRequestDeps,
): Promise<AnalyzeRequestResult> {
  const documentId = typeof input.documentId === 'string' ? input.documentId : ''
  if (!documentId) return { status: 400, body: { error: 'A documentId is required.' } }

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
  if (doc.size_bytes && doc.size_bytes > MAX_FILE_BYTES) {
    return { status: 413, body: { error: 'This file is too large for AI analysis (28MB max).' } }
  }

  await deps.updateDocumentStatus(documentId, {
    analysis_status: 'Processing',
    analysis_requested_at: new Date().toISOString(),
    analysis_error: null,
  })

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

  const requestedType: DocumentType = isDocumentType(input.documentType)
    ? input.documentType
    : isDocumentType(doc.document_type)
      ? doc.document_type
      : 'Other'

  let result: AnalyzeDocumentResult
  try {
    result = await deps.analyze({ documentType: requestedType, fileBuffer, fileName: doc.name })
  } catch {
    // Never surface the raw provider error (could contain request internals) to the client.
    const reason = 'AI analysis failed. Your document and existing data are unchanged — you can retry.'
    await deps.updateDocumentStatus(documentId, { analysis_status: 'Failed', analysis_error: reason })
    return { status: 502, body: { error: reason } }
  }

  const nextVersion = await deps.getNextVersion(documentId)

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
