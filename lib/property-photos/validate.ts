// PropRoster — Property photo upload validation (M2.1 review pass,
// Part 5: "the product owner cannot reliably upload a new property
// picture / replace an existing property picture").
//
// Pure functions only, no Supabase/React/DOM — testable without a
// browser. `FileLike` intentionally mirrors only the three File
// properties this logic actually needs, so a real DOM File object
// satisfies it structurally with no adapter, and tests can pass a
// plain object.
//
// TRACED ROOT CAUSE (see docs/property-photo-upload-fix.md for the
// full writeup): app/page.tsx's addPhotoFiles() filtered incoming
// files with `file.type.startsWith('image/')`, which SILENTLY dropped
// any file with an empty `type` string — a real, documented behavior
// for some iOS photo-picker selections (particularly HEIC), where the
// browser reports no MIME type at all. A single such file being the
// only one selected made the whole upload silently no-op (the function
// returned before ever calling Storage). Separately, the "add a cover
// photo while creating a new property" path (addProperty()) never
// surfaced its own upload error to the user at all — a genuine failure
// (which could read exactly like "No content provided" from Supabase
// Storage) produced zero visible feedback. Neither of these was a
// Storage bucket/policy defect — both were application-layer gaps, so
// no migration was needed.

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
