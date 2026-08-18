// PropRoster — Smart Upload Foundation: client-side file-type pre-check.
//
// Advisory only — a fast, friendly "we can't analyze this" message before
// spending an upload. The AUTHORITATIVE check is server-side
// (lib/document-intelligence/analyze-request.ts's resolveMimeType(),
// never trusting what the browser reports) — this is a separate, small,
// intentionally duplicated Set rather than importing that server module
// into client bundles. Same accepted formats either way: PDF, JPEG, PNG,
// WEBP — the same document types this app has always accepted, plus the
// images the existing pipeline gained. HEIC/HEIF is deliberately excluded
// (see analyze-request.ts) even though this app's photo-upload bucket
// accepts it for regular property photos — Anthropic's vision input does
// not take HEIC directly and this app has no transcoding step.

const SUPPORTED_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])

export function isSupportedForSmartUpload(file: Pick<File, 'type' | 'name'>): boolean {
  if (SUPPORTED_MIME_TYPES.has(file.type)) return true
  if (file.type) return false
  const lower = file.name.toLowerCase()
  return lower.endsWith('.pdf') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.png') || lower.endsWith('.webp')
}

/** File input `accept` attribute — matches the same set, plus a broad "image/*" so a camera app that reports a slightly different image mime (still ultimately jpeg/png) isn't blocked at the OS picker level; isSupportedForSmartUpload() above still gates what actually proceeds. */
export const SMART_UPLOAD_ACCEPT = 'application/pdf,image/jpeg,image/png,image/webp,image/*'
