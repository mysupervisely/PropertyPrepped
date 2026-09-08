# Upload Reliability V1.2 — Real iPhone Storage Payload Root-Cause Fix

Follow-up to `docs/upload-reliability-audit-fix.md` (`87beb80`, the
confirmed MIME/File fixes) and `docs/upload-reliability-real-device-
diagnostics.md` (`9037618`, the observability pass). Real-device testing
on the CORRECT Netlify Deploy Preview (`sensational-platypus-3da0b7`,
fully Supabase-configured — see `docs/netlify-deploy-preview-env-debug.md`)
confirmed the remaining failures are application-layer, not environment
config: Profile Photo replacement fails with **"No content provided"**,
and Property Photo / Smart Upload / Upload Multiple / Take Photo are all
still unreliable.

## Section 1: exact source of "No content provided" — confirmed, not guessed

This string does not appear anywhere in this repo's source, nor in
`node_modules/@supabase` (`lib/uploads/v1-2-payload-root-cause.test.ts`
locks this in). It is **Supabase Storage's own server-side error** —
found by reading `supabase/storage`'s actual source on GitHub:

`src/internal/errors/codes.ts`:
```ts
NoContentProvided: (e?: Error) => new StorageBackendError({
  code: ErrorCode.InvalidRequest, httpStatusCode: 400,
  message: e?.message || 'No content provided', originalError: e,
})
```

Thrown by `src/storage/uploader.ts`'s `fileUploadFromRequest()`:
```ts
const formData = await request.file({ limits: { fileSize: maxFileSize } })
if (!formData) throw ERRORS.NoContentProvided()
// ...
} catch (e) { throw ERRORS.NoContentProvided(e as Error) }
```

`request.file()` is Fastify's `@fastify/multipart` plugin — a real,
stream-based (busboy-derived) multipart parser reading the actual bytes
the CLIENT sent. `!formData` fires when no file part is found in the
incoming request at all; the catch fires on a malformed/premature
stream. **Both are exactly what the server sees when the client's own
multipart body was built from a File whose bytes could not actually be
read at send time** — not a config, RLS, or bucket-policy issue.

## Section 2: the actual client-side mechanism

Every upload flow in this app gets its File from an
`<input type="file">`, then resets that input's `.value` to `''` (so
the same file can be re-selected again) — either immediately after
handing the File to an async upload function, or (Property Photo's
cover-photo picker) well before the file is actually uploaded, since
it's held in React state until "Save Property" is clicked.

On iOS Safari, this is a documented class of bug (WebKit's
"WebkitBlobResource error 1" and related picker-resource-lifetime
issues — see the docs comment at the top of `lib/uploads/durable-file.ts`
for citations): **the native/platform resource backing a File obtained
from a picker selection can be invalidated once the input's selection
state changes or enough time passes, even though the File object's own
cached metadata (`name`/`size`/`type`) keeps reporting correctly.**
`@supabase/storage-js`'s `uploadOrUpdate()` builds a `FormData` and
hands the File straight to `fetch()` — the browser doesn't actually
stream that File's bytes onto the wire until the network layer needs
them, which in every flow here is **after** the input has already been
reset. If that later read comes back empty (or throws), the multipart
body Storage's server receives has no usable file content — producing
the exact observed symptom.

This is real-device-only by nature — jsdom (which this repo doesn't use
anyway) has no concept of a native picker resource to invalidate, so it
cannot be reproduced in a unit test. What CAN be, and is
(`lib/uploads/durable-file.test.ts`), is that once bytes are captured,
the fix's resulting File carries those exact bytes regardless of what
happens to the original File afterward.

## Section 3/10: byte-length diagnostics added

Every flow now logs `UPLOAD_PAYLOAD_READY` / `UPLOAD_PAYLOAD_READ_ERROR`
(`lib/uploads/diagnostics.ts`, `lib/property-photos/diagnostics.ts`)
with the original reported size, the ACTUAL bytes read via
`arrayBuffer()`, and — the critical evidence this exists to catch — an
explicit flag when `file.size > 0` but 0 bytes were actually readable.
Profile Photo's and Upload Multiple's on-screen `UploadDebugPanel` now
render "Original size" / "Original bytes read" / "Normalized size" /
"Normalized bytes read" / "Payload read error" fields (all optional,
only shown once populated).

## Section 4: original vs. reconstructed File — the OLD fix was already byte-safe, just not resource-safe

`toUploadableImageFile()`/`toUploadableFile()`'s `new File([file], name,
{ type })` pattern was already proven byte-identical in Node (see
`lib/property-photos/validate.test.ts`'s "DEFINITIVE PROOF" test) — that
was never the bug. The bug is that this wrap is **lazy**: it still
references the SAME underlying picker-tied resource as `file`, so it
inherits whatever invalidation happens to that resource later. Node has
no such resource to invalidate, which is exactly why this repo's
extensive existing test suite passed while the real device kept
failing.

## Section 5: async File lifetime audit

Checked every flow for: React-state-held Files (property cover —
confirmed the highest-risk case, held until a later "Save Property"
click), input value resets (present on every picker in this app except
Upload Multiple's, which had its own separate "can't re-select the same
file" gap — now fixed too), FileList mutation (none found — every flow
already copies to a plain array/uses `Array.from()` synchronously, per
the pre-existing V2 investigation), and File-through-JSON serialization
(none found anywhere — no flow sends a File through a JSON body or a
server action boundary).

## Section 13: the fix — one shared helper, applied at every entry point

New module: `lib/uploads/durable-file.ts`.

```ts
export function beginReadingFileBytes(file: File): Promise<ArrayBuffer> {
  return file.arrayBuffer()
}

export async function toDurableUploadableFile(
  file: File, contentType: string | undefined, bytesPromise: Promise<ArrayBuffer>,
): Promise<{ file: File; byteLength: number }> {
  const buffer = await bytesPromise
  const resolvedType = contentType || file.type || undefined
  const durable = resolvedType ? new File([buffer], file.name, { type: resolvedType }) : new File([buffer], file.name)
  return { file: durable, byteLength: buffer.byteLength }
}
```

**The rule, applied at every single picker input in this app:**
`beginReadingFileBytes()` is called SYNCHRONOUSLY, in the onChange
handler itself, as close to file-selection as possible — always before
the input's value is reset, and (for the property cover photo) before
the File is ever stored in React state. The resulting Promise is
threaded through to wherever the actual upload happens; the durable
File built from it is what actually reaches `.upload()` — never the
original, picker-tied File.

Applied at:
- **Profile Photo** (`app/profile/page.tsx`) — `uploadPhoto()`.
- **Property Photo cover** (`app/page.tsx` `handleImage`/`addProperty`) —
  the highest-risk flow (longest gap between selection and upload);
  `coverFile` React state now holds an already-durable File.
- **Property Photo gallery-add** (`app/page.tsx` `addPhotoFiles`).
- **Upload Multiple** (`app/page.tsx` `addDocumentFiles`, both the file
  picker and drag-and-drop) — also fixed a separate, previously-present
  gap: this input never reset its value at all, so re-selecting the
  exact same file wouldn't fire `onChange` again.
- **Smart Upload / Take Photo** (`components/SmartUpload/
  SmartUploadModal.tsx` → `lib/smart-upload/engine.ts`'s
  `uploadDocumentForReview()`, now taking an optional `bytesPromise`
  parameter — defaults to `undefined` so Smart Import's pre-existing
  call, which predates this fix, is unaffected).

Every non-image file (PDFs, etc.) is equally protected — the fix isn't
image-specific; every file from these inputs is equally exposed to the
same picker-resource mechanism.

## Files changed

- `lib/uploads/durable-file.ts` (new) — the shared fix.
- `lib/uploads/diagnostics.ts` — `UPLOAD_PAYLOAD_READY`/
  `UPLOAD_PAYLOAD_READ_ERROR` stages; `UploadDebugState` gains
  `originalSize`/`originalByteLength`/`normalizedSize`/
  `normalizedByteLength`/`payloadError` (all optional, additive).
- `lib/property-photos/diagnostics.ts` — `PHOTO_PAYLOAD_READY`/
  `PHOTO_PAYLOAD_READ_ERROR` stages (additive).
- `components/uploads/UploadDebugPanel.tsx` — renders the new fields
  when present.
- `app/profile/page.tsx`, `app/page.tsx`,
  `components/SmartUpload/SmartUploadModal.tsx`,
  `lib/smart-upload/engine.ts` — the fix applied at every entry point
  described in Section 13.
- Tests: `lib/uploads/durable-file.test.ts` (new, 7 tests — byte
  preservation), `lib/uploads/v1-2-payload-root-cause.test.ts` (new, 12
  tests — "No content provided" source confirmation + read-before-reset
  ordering at every entry point + durable file reaches `.upload()`
  everywhere), plus updates to `lib/uploads/upload-reliability-
  wiring.test.ts`, `lib/uploads/real-device-diagnostics.test.ts`, and
  `lib/property-photos/upload-wiring.test.ts` for the intentional
  signature/implementation changes.

## Schema/migration

None. Entirely client-side.

## Real-iPhone retest steps

1. **Profile Photo:** tap "Change photo", select a new image. Should no
   longer show "No content provided" — if it still fails, the on-screen
   debug panel now shows "Original size" vs. "Original bytes read"; a
   0-byte read with a nonzero size is the exact signature to report.
2. **Property Photo:** add a cover photo when creating a property, and
   add/replace a gallery photo on an existing property.
3. **Smart Upload / Take Photo:** upload a PNG/JPEG via each entry
   point (Take Photo, Choose File, Upload Multiple inside the modal).
4. **Upload Multiple (Documents tab):** select several files at once,
   including re-selecting the SAME file twice in a row (previously
   impossible — this input never reset before).

## Diagnostic text to send back if anything still fails

The exact "Original size" / "Original bytes read" / "Normalized size" /
"Normalized bytes read" / "Payload read error" lines from the on-screen
debug panel (Profile Photo, Upload Multiple), or the equivalent
`UPLOAD_PAYLOAD_READY`/`UPLOAD_PAYLOAD_READ_ERROR` console lines for
Smart Upload/Property Photo. A 0-byte "Original bytes read" against a
nonzero "Original size" is the specific, actionable signature that
would mean this exact root cause persists in some remaining edge case
(e.g., an iOS version whose invalidation timing beats even this fix) —
anything else is a new, different failure.

## Recommendation

This closes the ONE mechanism that fully and specifically explains every
symptom described (build/environment already ruled out by the separate
Netlify investigation; the confirmed MIME fixes from `87beb80` already
correct; this is the remaining, real, application-layer gap). Recommend
the real-device retest above before merging PR #55 — do not merge based
on this fix alone without that confirmation.
