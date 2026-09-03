// PropRoster — Property photo upload diagnostics (iOS production-bug
// investigation, follow-up to the M2.1 review pass, and the V2
// post-selection-failure follow-up).
//
// Development-only structured logging around the upload flow, so a
// real failure (on a real device this session has no access to) can be
// diagnosed from the browser console without needing another
// deploy-and-guess cycle. Gated on NODE_ENV !== 'production' — Next.js
// sets this automatically (`next dev` vs. a production build), so
// nothing here ever reaches a real user's console.
//
// NEVER logs: file bytes, private/signed URLs, auth tokens, secrets,
// or a full filename (only its extension — a filename can itself be
// identifying, e.g. "2026 Lease - Jane Doe.jpg" typed by a user into a
// photo's own name). Logs enough to answer "what actually happened":
// platform, extension, MIME type, byte size, File vs Blob, validation
// result, upload start, bucket/path, Storage success/error, DB write
// success/error, reload result, and render/signed-URL result.
//
// V2 stage taxonomy (PHOTO_*) traces the exact gallery flow end to end,
// one stage per real state transition: picker -> validation -> Storage
// upload -> property_photos DB write -> cover_photo_path DB write (only
// when this is the first photo) -> full-portfolio reload -> gallery
// render. The original M2.1/iOS-bug stage names (lowercase) are kept
// unchanged for the cover-photo-at-creation path (handleImage/
// addProperty) so nothing there is disturbed by this pass.

export type PhotoUploadStage =
  | 'file_selected'
  | 'validation_result'
  | 'upload_start'
  | 'upload_result'
  | 'db_update_result'
  | 'ui_state'
  | 'PHOTO_PICKER_SELECTED'
  | 'PHOTO_VALIDATION_RESULT'
  | 'PHOTO_UPLOAD_START'
  | 'PHOTO_UPLOAD_SUCCESS'
  | 'PHOTO_UPLOAD_ERROR'
  | 'PHOTO_DB_INSERT_START'
  | 'PHOTO_DB_INSERT_SUCCESS'
  | 'PHOTO_DB_INSERT_ERROR'
  | 'PHOTO_DB_UPDATE_START'
  | 'PHOTO_DB_UPDATE_SUCCESS'
  | 'PHOTO_DB_UPDATE_ERROR'
  | 'PHOTO_RELOAD_START'
  | 'PHOTO_RELOAD_SUCCESS'
  | 'PHOTO_RELOAD_ERROR'
  | 'PHOTO_RENDER_RESULT'
  | 'PHOTO_UNEXPECTED_EXCEPTION'

function isDev(): boolean {
  return process.env.NODE_ENV !== 'production'
}

/** Extension only (lowercased, with the dot) — never the full filename. `'(none)'` when there isn't one. */
export function fileExtension(name: string): string {
  const idx = name.lastIndexOf('.')
  return idx === -1 ? '(none)' : name.slice(idx).toLowerCase()
}

/** A safe-to-log summary of a File/Blob — no bytes, no full filename. */
export function safeFileSummary(file: { name?: string; type: string; size: number }): { extension: string; type: string; size: number; isFile: boolean; isBlob: boolean } {
  return {
    extension: file.name ? fileExtension(file.name) : '(blob, no name)',
    type: file.type || '(empty)',
    size: file.size,
    isFile: typeof File !== 'undefined' && file instanceof File,
    isBlob: typeof Blob !== 'undefined' && file instanceof Blob,
  }
}

/**
 * Safe-to-log summaries for an entire picked FileList/array at once —
 * PHOTO_PICKER_SELECTED logs file count plus each file's own summary in
 * one line, rather than one log line per file, so the exact set of
 * files iOS actually handed the app is visible together.
 */
export function safeFileListSummary(files: File[]): { fileCount: number; files: ReturnType<typeof safeFileSummary>[] } {
  return { fileCount: files.length, files: files.map(safeFileSummary) }
}

/** Safe-to-log fields off a Supabase Storage/PostgREST error — never the full error object (may embed request/response internals). */
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

function platformSummary(): string {
  if (typeof navigator === 'undefined') return '(no navigator — SSR or non-browser)'
  return navigator.userAgent
}

/**
 * Logs one stage of the upload flow. Every call includes the platform
 * string so an iOS-specific pattern is visible across stages without
 * repeating it manually at every call site.
 */
export function logPhotoUploadDiagnostic(stage: PhotoUploadStage, details: Record<string, unknown>): void {
  if (!isDev()) return
  // eslint-disable-next-line no-console
  console.log(`[property-photo:${stage}]`, { platform: platformSummary(), ...details })
}
