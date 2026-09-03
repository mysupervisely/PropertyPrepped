// PropRoster — Property photo upload diagnostics (iOS production-bug
// investigation, follow-up to the M2.1 review pass).
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
// result, upload start, bucket/path, Storage success/error, DB update
// success/error, and the final UI state.

export type PhotoUploadStage =
  | 'file_selected'
  | 'validation_result'
  | 'upload_start'
  | 'upload_result'
  | 'db_update_result'
  | 'ui_state'

function isDev(): boolean {
  return process.env.NODE_ENV !== 'production'
}

/** Extension only (lowercased, with the dot) — never the full filename. `'(none)'` when there isn't one. */
export function fileExtension(name: string): string {
  const idx = name.lastIndexOf('.')
  return idx === -1 ? '(none)' : name.slice(idx).toLowerCase()
}

/** A safe-to-log summary of a File/Blob — no bytes, no full filename. */
export function safeFileSummary(file: { name?: string; type: string; size: number }): { extension: string; type: string; size: number; isFile: boolean } {
  return {
    extension: file.name ? fileExtension(file.name) : '(blob, no name)',
    type: file.type || '(empty)',
    size: file.size,
    isFile: typeof File !== 'undefined' && file instanceof File,
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
