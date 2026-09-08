// PropRoster — Upload Reliability Audit: shared, flow-agnostic upload
// diagnostics. Same safe/dev-only pattern lib/property-photos/
// diagnostics.ts established (that file is untouched — property
// photos already have their own instrumentation from the earlier
// investigations); this is the same idea, generalized so Smart
// Upload, "Upload Multiple" documents, and profile photos don't each
// duplicate it a third and fourth time.
//
// NEVER logs: file bytes, private/signed URLs, auth tokens, secrets,
// or a full filename (only its extension). Logs enough to answer
// "what actually happened, and at which stage": flow, extension,
// reported MIME, normalized MIME, size, stage, and a safe error
// code/message.

// V1.1 (real-device diagnostics): 'smart-upload-camera' is a DISTINCT
// flow tag from 'smart-upload' — same underlying pipeline
// (uploadDocumentForReview() in lib/smart-upload/engine.ts is never
// duplicated for the camera input), but tagged separately so a real-
// device console log (or a future analytics rollup) can tell a camera
// capture apart from a Photo Library / Choose File / Upload Multiple
// selection, per this milestone's explicit ask. Nothing about the
// UPLOAD/DB/analysis logic differs between the two — only this label.
export type UploadFlow = 'smart-upload' | 'smart-upload-camera' | 'upload-multiple' | 'profile-photo' | 'property-photo'

export type UploadStage =
  | 'UPLOAD_FILE_RECEIVED'
  | 'UPLOAD_VALIDATION_START'
  | 'UPLOAD_VALIDATION_ACCEPTED'
  | 'UPLOAD_VALIDATION_REJECTED'
  | 'UPLOAD_NORMALIZATION_COMPLETE'
  // V1.2 (real iPhone storage payload root-cause fix): logged once the
  // file's actual bytes have been read into memory and the durable,
  // picker-resource-independent upload File is built — see
  // lib/uploads/durable-file.ts's header for the full root-cause trace
  // ("No content provided"). Carries originalSize/originalByteLength/
  // normalizedSize/normalizedByteLength in `details` — a mismatch
  // between originalSize and originalByteLength (nonzero size, zero
  // bytes actually read) is the critical evidence this stage exists to
  // surface.
  | 'UPLOAD_PAYLOAD_READY'
  | 'UPLOAD_PAYLOAD_READ_ERROR'
  | 'UPLOAD_STORAGE_START'
  | 'UPLOAD_STORAGE_SUCCESS'
  | 'UPLOAD_STORAGE_ERROR'
  | 'UPLOAD_DB_START'
  | 'UPLOAD_DB_SUCCESS'
  | 'UPLOAD_DB_ERROR'
  // V1.1: Smart Upload's ONE extra real stage beyond every other flow —
  // the Document Intelligence analysis call. Added here (not a new,
  // separate diagnostics module) so it shows up in the exact same
  // console-log format/taxonomy as every other stage, and so
  // "UPLOAD_STORAGE_SUCCESS but UPLOAD_ANALYSIS_ERROR" is visible as
  // two distinct, ordered facts rather than one opaque "Failed".
  | 'UPLOAD_ANALYSIS_START'
  | 'UPLOAD_ANALYSIS_SUCCESS'
  | 'UPLOAD_ANALYSIS_ERROR'
  | 'UPLOAD_URL_START'
  | 'UPLOAD_URL_SUCCESS'
  | 'UPLOAD_URL_ERROR'
  | 'UPLOAD_RENDER_SUCCESS'

function isDev(): boolean {
  return process.env.NODE_ENV !== 'production'
}

/** Extension only (lowercased, with the dot) — never the full filename. `'(none)'` when there isn't one. */
export function fileExtension(name: string): string {
  const idx = name.lastIndexOf('.')
  return idx === -1 ? '(none)' : name.slice(idx).toLowerCase()
}

function platformSummary(): string {
  if (typeof navigator === 'undefined') return '(no navigator — SSR or non-browser)'
  return navigator.userAgent
}

/** Safe fields off a Supabase Storage/PostgREST/fetch error — never the full error object (may carry request/response internals). */
export function safeErrorSummary(error: unknown): { message: string; code?: string; status?: number } | undefined {
  if (error === null || error === undefined) return undefined
  if (typeof error !== 'object') return { message: String(error) }
  const e = error as { message?: unknown; code?: unknown; status?: unknown; statusCode?: unknown }
  return {
    message: typeof e.message === 'string' ? e.message : String(error),
    ...(typeof e.code === 'string' ? { code: e.code } : {}),
    ...(typeof e.status === 'number' ? { status: e.status } : typeof e.statusCode === 'number' ? { status: e.statusCode } : {}),
  }
}

export function logUploadDiagnostic(
  flow: UploadFlow,
  stage: UploadStage,
  details: { extension?: string; reportedMime?: string; normalizedMime?: string; size?: number } & Record<string, unknown>,
): void {
  if (!isDev()) return
  // eslint-disable-next-line no-console
  console.log(`[upload:${flow}:${stage}]`, { platform: platformSummary(), ...details })
}

/**
 * The per-file state a temporary, user-visible debug panel renders —
 * Section 11's "the exact raw technical error does not need to be
 * shown to normal users, but in this debugging branch we need enough
 * information to identify the stage." Never carries bytes/URLs/
 * tokens — only what's already safe to console.log above.
 */
export type UploadDebugState = {
  fileReceived: boolean
  extension: string
  reportedMime: string
  validation: 'pending' | 'accepted' | 'rejected'
  validationReason?: string
  // V1.2 — Section 3/10's byte-length evidence, filled in once
  // toDurableUploadableFile() (lib/uploads/durable-file.ts) actually
  // reads the file. `originalByteLength`/`normalizedByteLength` are
  // the REAL bytes read via arrayBuffer(), not just the picker's
  // reported `.size` — the whole point is to catch a mismatch between
  // the two (nonzero size, zero bytes actually readable).
  originalSize?: number
  originalByteLength?: number
  normalizedSize?: number
  normalizedByteLength?: number
  payloadError?: string
  storageUpload: 'pending' | 'success' | 'failed'
  storageError?: string
  databaseRecord: 'pending' | 'success' | 'failed' | 'skipped'
  databaseError?: string
  renderUrl: 'pending' | 'success' | 'failed' | 'skipped'
  renderError?: string
}

export function initialUploadDebugState(file: { name: string; type: string }): UploadDebugState {
  return {
    fileReceived: true,
    extension: fileExtension(file.name),
    reportedMime: file.type || '(empty)',
    validation: 'pending',
    storageUpload: 'pending',
    databaseRecord: 'pending',
    renderUrl: 'pending',
  }
}

/**
 * Smart Upload's own debug shape — Section 2/8's explicit ask to
 * distinguish "upload failed" from "analysis/classification failed
 * AFTER a successful upload" instead of collapsing both into one
 * "Needs attention" pill. `renderUrl` from the base UploadDebugState
 * doesn't apply here (Smart Upload never renders a signed-URL image —
 * its "final state" is the Ready-to-review screen) — replaced with
 * `analysis`, which is Smart Upload's actual last real stage.
 */
export type SmartUploadDebugState = Omit<UploadDebugState, 'renderUrl' | 'renderError'> & {
  flow: Extract<UploadFlow, 'smart-upload' | 'smart-upload-camera'>
  analysis: 'pending' | 'success' | 'failed' | 'skipped'
  analysisError?: string
}

export function initialSmartUploadDebugState(file: { name: string; type: string }, flow: Extract<UploadFlow, 'smart-upload' | 'smart-upload-camera'>): SmartUploadDebugState {
  return {
    fileReceived: true,
    extension: fileExtension(file.name),
    reportedMime: file.type || '(empty)',
    validation: 'pending',
    storageUpload: 'pending',
    databaseRecord: 'pending',
    flow,
    analysis: 'pending',
  }
}
