// PropRoster — Upload Reliability V1.2: durable file capture.
//
// THE CONFIRMED ROOT CAUSE for the real-iPhone "No content provided"
// failure (Profile Photo replacement, on the CORRECT, Supabase-backed
// sensational-platypus-3da0b7 Deploy Preview for PR #55 — ruling out
// every environment-config explanation).
//
// "No content provided" is NOT a string this app or @supabase/
// storage-js ever generates (confirmed: it does not appear anywhere in
// this repo's source or in node_modules/@supabase). It is the Supabase
// Storage SERVER's own error — supabase/storage's
// `src/internal/errors/codes.ts`:
//
//   NoContentProvided: (e?: Error) => new StorageBackendError({
//     code: ErrorCode.InvalidRequest, httpStatusCode: 400,
//     message: e?.message || 'No content provided', originalError: e,
//   })
//
// — thrown by `src/storage/uploader.ts`'s `fileUploadFromRequest()`
// when Fastify's `@fastify/multipart` plugin (`request.file({...})`,
// a busboy-based streaming multipart parser) either finds no file part
// in the incoming request body at all (`if (!formData) throw
// ERRORS.NoContentProvided()`) or the parse itself throws (a
// malformed/premature stream — caught and rethrown as
// `ERRORS.NoContentProvided(e)`). Both are exactly what the SERVER
// sees when the CLIENT's own multipart body was built from a File
// whose bytes could not actually be read at send time.
//
// Every upload flow in this app gets its File object from an
// `<input type="file">`, then resets that input's `.value` to `''`
// (every onChange handler in this repo does this, so the same file can
// be re-selected again later) — either immediately after handing the
// File to an async upload function, or (Property Photo's cover-photo
// picker) well before the file is actually uploaded, since it's held
// in React state until "Save Property" is clicked. On iOS Safari, this
// is a documented class of bug (WebKit's "WebkitBlobResource error 1"
// and related picker-resource-lifetime issues): the native/platform
// resource backing a File obtained from a picker selection can be
// invalidated once the input's selection state changes or enough time
// passes, even though the File object's own cached metadata
// (name/size/type) keeps reporting correctly. @supabase/storage-js's
// `uploadOrUpdate()` (node_modules/@supabase/storage-js) builds a
// FormData and hands the File straight to `fetch()` — the browser
// doesn't actually stream that File's bytes onto the wire until the
// network layer needs them, which is AFTER the input has already been
// reset in every flow here. If that later read comes back empty (or
// throws), the multipart body Storage's server receives has no usable
// file content, and the server reports the exact symptom observed:
// "No content provided".
//
// jsdom cannot reproduce this — it has no concept of a native picker
// resource to invalidate, so this mechanism is real-device-only by
// nature (see lib/uploads/durable-file.test.ts's own note on this).
//
// THE FIX: read a picked File's bytes into memory IMMEDIATELY —
// beginReadingFileBytes() must be called SYNCHRONOUSLY, in the exact
// same event-handler tick the file was selected, BEFORE the input's
// value is ever reset (and before storing the File in React state for
// later use, for flows like the property cover photo). That read is
// anchored to the moment the picker's underlying resource is still
// guaranteed valid — `Blob.prototype.arrayBuffer()` is invoked
// immediately (even though its resolution is async), which is what
// matters here. Once resolved, toDurableUploadableFile() turns those
// bytes into a plain, in-memory-backed File — completely decoupled
// from whatever platform resource originally backed the picked file —
// so nothing downstream (a later `await`, a value stored in React
// state until a subsequent click, @supabase/storage-js's own
// FormData/fetch body construction) can be affected by the input
// reset, or by how much time has passed, ever again.

/**
 * Starts reading a File's bytes into memory. Call this SYNCHRONOUSLY,
 * as the very first thing done with a freshly-picked File — before any
 * validation, before storing it in React state, and always before the
 * originating `<input type="file">`'s value is reset. See this
 * module's header for why the timing matters.
 */
export function beginReadingFileBytes(file: File): Promise<ArrayBuffer> {
  return file.arrayBuffer()
}

export type DurableFileResult = {
  /** A new File built entirely from already-read, in-memory bytes — never tied to the original picker resource. */
  file: File
  /** The actual number of bytes read — compare against the original File's `.size` for the critical zero-byte-despite-nonzero-size signal (Upload Reliability V1.2, Section 3). */
  byteLength: number
}

/**
 * Waits for bytes started via beginReadingFileBytes() and returns a
 * durable, in-memory-backed File carrying the corrected content type
 * (the separate, already-proven MIME fix from lib/uploads/image-file.ts
 * and lib/property-photos/validate.ts — preserved here, not replaced).
 * Can reject (surfaces whatever error the underlying picker resource's
 * failed read threw) — callers must catch this and show a safe,
 * actionable message; never let it become an unhandled rejection.
 */
export async function toDurableUploadableFile(
  file: File,
  contentType: string | undefined,
  bytesPromise: Promise<ArrayBuffer>,
): Promise<DurableFileResult> {
  const buffer = await bytesPromise
  const resolvedType = contentType || file.type || undefined
  const durable = resolvedType ? new File([buffer], file.name, { type: resolvedType }) : new File([buffer], file.name)
  return { file: durable, byteLength: buffer.byteLength }
}
