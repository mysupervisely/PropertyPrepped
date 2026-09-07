// PropRoster — Upload Reliability Audit: shared image-file MIME
// handling, generalized from lib/property-photos/validate.ts's
// resolvePhotoContentType()/toUploadableFile() (the CONFIRMED fix from
// the property-photo iOS investigations — see that file's own header
// for the full trace).
//
// THE CONFIRMED, SHARED ROOT CAUSE THIS FIXES: @supabase/storage-js's
// uploadOrUpdate() (node_modules/@supabase/storage-js/dist/index.cjs)
// builds a FormData and appends the File/Blob body directly for every
// real upload in this app — it NEVER reads the `contentType` option in
// that branch. The actual wire Content-Type comes from the browser's
// own FormData serialization of the File object, using the File's own
// `.type` property — a fact proven (not assumed) by reading the SDK
// source directly, and by serializing a real File into a real
// FormData/Request in Node and inspecting the actual bytes (see
// lib/property-photos/validate.test.ts's "DEFINITIVE PROOF" test).
// iOS Safari frequently reports an EMPTY `file.type` for a photo
// picked from the library — passing `{ contentType: file.type }` to
// `.upload()` therefore has NO EFFECT on what actually gets sent; the
// object still uploads with `Content-Type: application/octet-stream`
// (the browser's default for an untyped Blob).
//
// This was fixed for property photos (M2.1/V1-V3) but never applied to
// the other flows this repo also uploads images through — profile
// photos (app/profile/page.tsx) and Smart Upload's image path
// (lib/smart-upload/engine.ts, which also serves the header's "Take
// Photo" capture input and app/page.tsx's document "Upload Multiple" —
// all three share this one engine/bucket). This module is the ONE
// place that fix now lives for those flows, rather than a third and
// fourth independently-drifting copy of the same logic.

export type UploadableImage = { name: string; type: string; size: number }

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
 * Best-effort content type for an image file whose own `type` is
 * empty — falls back to the browser-reported type whenever one
 * exists; only guesses from the file extension when the browser
 * reported nothing at all. Returns undefined (never a made-up value)
 * when neither source yields an answer.
 */
export function resolveImageContentType(file: UploadableImage): string | undefined {
  if (file.type) return file.type
  const ext = extensionOf(file.name)
  return ext ? IMAGE_EXTENSION_TO_MIME[ext] : undefined
}

export type ImageValidation = { ok: true; contentType: string | undefined } | { ok: false; reason: string }

/**
 * Validates one picked file before it's ever handed to Storage.
 * Deliberately permissive about a MISSING type (a real, common iOS
 * Safari behavior — the browser's own `accept="image/*"` already
 * constrained the OS picker) but strict about a file explicitly typed
 * as something else, and about a genuinely empty (0-byte) file.
 *
 * This REPLACES the strict `!file.type.startsWith('image/')` check
 * that app/profile/page.tsx used before this audit — that check
 * rejected any iOS photo with a blank reported type outright, with a
 * generic "Choose an image file" message, even though the file was a
 * perfectly valid image.
 */
export function validateImageFile(file: UploadableImage): ImageValidation {
  if (file.size === 0) {
    return { ok: false, reason: `"${file.name}" appears to be empty (0 bytes). Try selecting it again, or choose a different photo.` }
  }
  if (file.type && !file.type.startsWith('image/')) {
    return { ok: false, reason: `"${file.name}" doesn't look like an image file.` }
  }
  const contentType = resolveImageContentType(file)
  if (!file.type && !contentType) {
    return { ok: false, reason: `"${file.name}" doesn't look like an image file.` }
  }
  return { ok: true, contentType }
}

/**
 * THE actual fix: @supabase/storage-js reads `fileBody.type` directly
 * off the object passed to `.upload()` — never the `contentType`
 * option — for every File/Blob body. When the browser reported no type
 * at all, the only way to make the real uploaded bytes carry the
 * correct Content-Type is to hand the SDK a File that itself already
 * has that type set.
 *
 * `new File([file], file.name, { type })` wraps the SAME underlying
 * bytes (Blob construction slices/references source data, it does not
 * re-encode or transform it) with a corrected `type` property. When
 * `file.type` is already correct, this returns the ORIGINAL File
 * object unchanged — no unnecessary copy.
 */
export function toUploadableImageFile(file: File, contentType: string | undefined): File {
  if (!contentType || file.type === contentType) return file
  return new File([file], file.name, { type: contentType })
}
