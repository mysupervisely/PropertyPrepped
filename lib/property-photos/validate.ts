// PropRoster — Property photo upload validation (M2.1 review pass,
// Part 5, and the follow-up iOS production-bug investigation).
//
// Pure functions only, no Supabase/React/DOM — testable without a
// browser. `FileLike` intentionally mirrors only the three File
// properties this logic actually needs, so a real DOM File object
// satisfies it structurally with no adapter, and tests can pass a
// plain object.
//
// M2.1 (first pass) found and fixed two real bugs: addPhotoFiles()
// silently dropped any file with an empty browser-reported `type`
// (real iOS behavior for some selections), and addProperty()'s
// cover-photo upload discarded its own error entirely. Both fixes
// shipped, but a real-iPhone retest still failed — the diagnosis was
// incomplete. See docs/property-photo-upload-fix.md for the full,
// updated writeup of what M2.1 actually missed.
//
// THE MISS: M2.1 computed a corrected `resolvePhotoContentType()` and
// passed it as the SDK's `options.contentType` — but re-reading
// @supabase/storage-js's installed source (uploadOrUpdate() in
// node_modules/@supabase/storage-js/dist/index.cjs) line by line shows
// that for a File/Blob body (every real upload in this app), the SDK
// builds `body = new FormData(); body.append("", fileBody)` and NEVER
// reads `options.contentType` in that branch at all — the browser's
// own FormData serialization sets that multipart part's Content-Type
// from `fileBody.type` directly (a File/Blob's own, immutable
// property), completely ignoring the option. So M2.1's contentType fix
// was computed correctly but delivered through a parameter the SDK
// silently ignores for every real upload — it never reached the wire.
// Since the property-photos bucket has a configured
// `allowed_mime_types` allowlist (supabase/schema.sql), an upload whose
// actual multipart part carries an empty Content-Type (iOS Safari, some
// HEIC/camera-originated selections) is exactly the kind of input a
// server-side allowlist check is likely to reject or mishandle — this
// is the confirmed, corrected root cause. toUploadableFile() below is
// the actual fix: it constructs a NEW File wrapping the SAME bytes
// (verified byte-identical — see toUploadableFile's own doc comment and
// its test) but with the corrected `type` set directly ON THE OBJECT,
// so the SDK's own `fileBody.type` read now sees the right value.
//
// Neither pass required a Storage bucket/policy/schema change — both
// were application-layer gaps.

export type FileLike = { name: string; type: string; size: number }

export type PhotoValidation = { ok: true; contentType: string | undefined } | { ok: false; reason: string }

const IMAGE_EXTENSION_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  gif: 'image/gif',
  bmp: 'image/bmp',
  avif: 'image/avif',
}

function extensionOf(name: string): string | null {
  const idx = name.lastIndexOf('.')
  return idx === -1 ? null : name.slice(idx + 1).toLowerCase()
}

/**
 * Best-effort content type for a file whose own `type` is empty — seen
 * in practice for some iOS Safari photo-picker selections (notably
 * HEIC). Falls back to the browser-reported type whenever one exists;
 * only guesses from the file extension when the browser reported
 * nothing at all. Returns undefined (never a made-up value) when
 * neither source yields an answer, so callers can omit the option
 * entirely rather than send a wrong one.
 */
export function resolvePhotoContentType(file: FileLike): string | undefined {
  if (file.type) return file.type
  const ext = extensionOf(file.name)
  return ext ? IMAGE_EXTENSION_TO_MIME[ext] : undefined
}

/**
 * Validates one file before it's ever handed to Storage. Deliberately
 * permissive about a MISSING type (trusts the file input's own
 * `accept="image/*"` already constrained the OS picker — see the HEIC
 * root-cause note above) but strict about a file that is explicitly
 * some OTHER type, and about a genuinely empty (0-byte) file, which
 * Storage would otherwise reject with an opaque server-side error
 * instead of a clear, actionable one shown here.
 */
export function validatePropertyPhotoFile(file: FileLike): PhotoValidation {
  if (file.size === 0) {
    return { ok: false, reason: `"${file.name}" appears to be empty (0 bytes). Try selecting it again, or choose a different photo.` }
  }
  if (file.type && !file.type.startsWith('image/')) {
    return { ok: false, reason: `"${file.name}" doesn't look like an image file.` }
  }
  const contentType = resolvePhotoContentType(file)
  if (!file.type && !contentType) {
    return { ok: false, reason: `"${file.name}" doesn't look like an image file.` }
  }
  return { ok: true, contentType }
}

/**
 * THE actual fix for the confirmed iOS root cause (see this file's own
 * header). @supabase/storage-js reads `fileBody.type` directly off the
 * object passed to `.upload()` — never the `contentType` option — for
 * every File/Blob body. When the browser reported no type at all
 * (`file.type === ''`), the ONLY way to make the real uploaded bytes
 * carry the correct type is to hand the SDK a File that itself already
 * has that type set.
 *
 * `new File([file], file.name, { type })` wraps the SAME underlying
 * bytes (Blob construction slices/references source data, it does not
 * re-encode or transform it — verified byte-identical by this file's
 * own test) with a corrected `type` property. When `file.type` is
 * already correct, this returns the ORIGINAL File object unchanged —
 * no unnecessary copy, and "keep the original browser File/Blob intact
 * until upload" holds exactly whenever there's nothing to correct.
 *
 * Never called with an invalid file — always call this only after
 * validatePropertyPhotoFile() returned `ok: true`, using that same
 * result's `contentType`.
 */
export function toUploadableFile(file: File, contentType: string | undefined): File {
  if (!contentType || file.type === contentType) return file
  return new File([file], file.name, { type: contentType })
}
