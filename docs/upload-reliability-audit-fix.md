# Upload Reliability Audit + Fix

Real production failures were reported across five upload surfaces on
a real iPhone: Smart Upload, "Upload Multiple" (Documents tab), Take
Photo, Property Photo, and Profile Photo replacement. This document is
the trace, comparison matrix, confirmed root causes, and fixes.

## Comparison matrix

| Flow | Input component | Upload helper | Bucket | MIME allowlist | DB table | Signed/public URL |
|---|---|---|---|---|---|---|
| Property Photo | `app/page.tsx` (`handleImage`/`addPhotoFiles`) | inline in `app/page.tsx`, using `lib/property-photos/validate.ts` | `property-photos` | jpeg/png/webp/heic/heif | `property_photos` | signed |
| Profile Photo | `app/profile/page.tsx` | inline in `app/profile/page.tsx` | `profile-photos` | jpeg/png/webp/heic/heif | `user_profiles.photo_path` | signed |
| Smart Upload / Take Photo | `components/SmartUpload/SmartUploadModal.tsx` (`SmartUploadEntry`, incl. the `capture="environment"` camera input) | `lib/smart-upload/engine.ts#uploadDocumentForReview()` | `property-documents` | none (unrestricted) | `property_documents` + `smart_upload_items` | signed (server-side, 60s) |
| "Upload Multiple" (Documents tab) | `app/page.tsx` (`addDocumentFiles`) | inline in `app/page.tsx` | `property-documents` | none (unrestricted) | `property_documents` | signed |

**Shared infrastructure confirmed:** Take Photo is not a separate
upload path — `SmartUploadModal.tsx`'s camera-capture `<input
capture="environment">` feeds the exact same `handleFiles() ->
processFile() -> uploadDocumentForReview()` pipeline every other Smart
Upload selection uses. "Upload Multiple" and Smart Upload both target
the same `property-documents` bucket and `property_documents` table,
but through **two independently-written upload functions**
(`app/page.tsx#addDocumentFiles()` and
`lib/smart-upload/engine.ts#uploadDocumentForReview()`) that had
drifted into carrying the identical bug independently, rather than one
shared implementation. Property Photo and Profile Photo are structurally
identical flows (private bucket, folder-scoped-by-uid RLS, a DB row
storing the path) implemented as two more separate copies — one already
fixed (property photos, by the earlier iOS investigations), one not
(profile photos, until this pass).

## The confirmed, shared root cause

**`@supabase/storage-js`'s `uploadOrUpdate()` never reads the
`contentType` option for a File/Blob upload body — it builds a
`FormData` and lets the browser set the multipart Content-Type from the
File object's own `.type` property.** This was proven (not assumed) in
the earlier property-photo investigation by reading the installed SDK
source directly and by serializing a real `File` into a real
`FormData`/`Request` in Node 22 and inspecting the actual bytes sent —
see `lib/property-photos/validate.test.ts`'s "DEFINITIVE PROOF" test,
reused verbatim for this audit's own `lib/uploads/image-file.test.ts`.

iOS Safari frequently reports an **empty `file.type`** for a photo
picked from the library. Every upload call site in this app that
passed `{ contentType: file.type }` (or `file.type || undefined`) as an
**option** to `.upload()` had zero effect on the real uploaded bytes —
the object still uploads with `Content-Type: application/octet-stream`
(the browser's default for an untyped Blob). On a bucket with an
`allowed_mime_types` allowlist (`property-photos`, `profile-photos`),
Storage rejects that upload outright. On a bucket with no allowlist
(`property-documents`), Storage accepts it, but the wrong Content-Type
still gets stored, and `mime_type` in the database ends up recording
the raw (possibly blank) browser value instead of a resolved one.

This bug was **already fixed for property photos** (M2.1 / the V1–V3
iOS investigations, `lib/property-photos/validate.ts`) but was never
applied anywhere else it was independently duplicated.

## Flow-by-flow root cause

**Smart Upload — root cause:** `lib/smart-upload/engine.ts#uploadDocumentForReview()`
had the same ignored-`contentType`-option bug (line: `.upload(path,
file, { contentType: file.type || undefined, upsert: false })`).
Because `property-documents` has no MIME allowlist, this does not cause
Storage to *reject* the upload the way it does for property/profile
photos — so it is **not, by itself,** a proven explanation for the
reported "multiple PNG/JPEG show Needs attention" symptom. It is fixed
here regardless, for two real reasons: consistency with the two other
photo-upload flows, and because it gives
`lib/document-intelligence/analyze-request.ts#resolveMimeType()` a
correctly-resolved `mime_type` to read from the database, instead of
relying solely on its own extension-fallback for a blank-type file.
**What could not be confirmed from this sandbox:** the actual AI
analysis-call failure behind "Needs attention" for a legitimate
PNG/JPEG (`analysis_status = 'Failed'`, displayed as "Needs attention"
per `SmartUploadModal.tsx`'s `STATUS_LABELS`) could not be reproduced
or diagnosed further without live production logs or a real device —
this sandbox has no path to the production Anthropic call, the real
signed-URL fetch, or real iOS-originated file bytes. The full
`UPLOAD_*` diagnostic taxonomy (below) was added specifically so the
next real-device retest surfaces the exact stage.

**Upload Multiple — root cause:** the exact same bug, independently
duplicated a second time in `app/page.tsx#addDocumentFiles()`. Its
per-file loop was already correctly isolated (`continue` on a failed
file, never aborting the batch) — audited and confirmed, not
re-engineered.

**Take Photo — root cause:** none separate from Smart Upload's — see
"shared infrastructure confirmed" above. No code exists at this input
that isn't already covered by the `uploadDocumentForReview()` fix.

**Property Photo — root cause:** none remaining. Already fixed by the
earlier M2.1/V1–V3 investigations (`lib/property-photos/validate.ts`'s
`toUploadableFile()`); re-audited this pass and confirmed still
correct, not touched.

**Profile Photo — root cause, TWO confirmed bugs:**
1. The same ignored-`contentType`-option bug
   (`.upload(path, file, { contentType: file.type, upsert: false })`),
   and `profile-photos` **does** have an `allowed_mime_types` allowlist
   — so this one **does** cause a real, reproducible Storage rejection
   for a blank-type iOS file, exactly like the original property-photo
   bug.
2. A second, even more direct bug that fires **before** the upload is
   ever attempted: `if (!file.type.startsWith('image/')) { setPhotoError('Choose
   an image file.'); return }`. An empty string never starts with
   `'image/'`, so this rejected a perfectly valid iOS photo outright,
   with a **misleading error message** ("Choose an image file"),
   without ever reaching Storage. This is the single most likely
   explanation for "New image does not successfully upload/replace the
   current profile picture" — it never got the chance to fail at
   Storage at all.

## Storage bucket findings

| Bucket | Public | Allowed MIME types | Size limit |
|---|---|---|---|
| `property-photos` | No | jpeg, png, webp, heic, heif | 20MB |
| `profile-photos` | No | jpeg, png, webp, heic, heif | 5MB |
| `property-documents` | No | *(none — unrestricted)* | 50MB |

No inconsistency was found between the frontend's accepted types and
each bucket's allowlist — `image/heic`/`image/heif` are accepted on
both buckets that have an allowlist. The inconsistency was entirely on
the **client side**: the actual wire Content-Type sent for an
untyped file never matched what the code believed it was sending,
because the `contentType` option was silently ignored.

## RLS findings

No RLS policy was found to be wrong. `user_profiles`
(`select/insert/update_own`, `id = auth.uid()`),
`profile-photos`/`property-photos`/`property-documents` storage
policies (folder-scoped-by-uid, `(storage.foldername(name))[1] =
auth.uid()::text`), and `property_documents`/`property_photos` table
RLS were all re-verified against `supabase/schema.sql` and found
correctly owner-scoped. **No RLS was weakened, and no migration was
needed or created** — every confirmed root cause was
application-layer.

## The fix: `lib/uploads/`

New shared module, generalized from `lib/property-photos/validate.ts`'s
already-proven fix rather than writing a third/fourth copy of the same
logic:

- `lib/uploads/image-file.ts` — `resolveImageContentType()`,
  `validateImageFile()`, `toUploadableImageFile()`. Same permissive-on-
  missing-type validation and File-retyping fix property photos already
  had, usable by any flow that uploads real images.
- `lib/uploads/diagnostics.ts` — the requested `UPLOAD_*` stage
  taxonomy (`UPLOAD_FILE_RECEIVED` through `UPLOAD_RENDER_SUCCESS`),
  dev-only console logging (never bytes/URLs/tokens/full filenames),
  `safeErrorSummary()`, and `UploadDebugState`/`initialUploadDebugState()`
  for the temporary on-screen debug panel.
- `components/uploads/UploadDebugPanel.tsx` — the temporary,
  easily-removable debug panel (Section 11), wired into
  `app/profile/page.tsx` only in this pass (the single-file, simplest
  case to instrument cleanly without redesigning `SmartUploadModal.tsx`'s
  own richer per-item review UI, which already has its own failure
  surfacing via `FailedItemFallback`).

**Applied to:** `app/profile/page.tsx` (both confirmed bugs fixed),
`lib/smart-upload/engine.ts#uploadDocumentForReview()` (covers Smart
Upload AND Take Photo, being the same function), and
`app/page.tsx#addDocumentFiles()` ("Upload Multiple"). **Not touched:**
`lib/property-photos/validate.ts` and its call sites — already correct,
already has its own instrumentation from the earlier investigation; a
rewrite to point at the new shared module was deliberately avoided to
carry zero risk into a flow that already works, for a purely-cosmetic
consolidation with no functional benefit.

## Profile photo replacement — specifically re-audited (Section 6)

- **Path:** every upload gets a fresh `crypto.randomUUID()` path — no
  filename reuse, no upsert.
- **Insert vs update:** `.upload(..., { upsert: false })`, then a
  separate `user_profiles` upsert sets `photo_path` to the new path.
- **Conflict:** impossible — the path is always new.
- **Storage cache:** not a risk — the signed URL is re-fetched by a
  `useEffect` keyed on `profile.photo_path`, and that path changes on
  every replacement, so the browser is never asked to reuse a cached
  response for a since-replaced object. **No cache-busting fix was
  needed** — this was already correct.
- **Old-image cleanup:** the old storage object is removed only
  *after* the new upload and DB write both succeed — confirmed
  unchanged, correct ordering.
- **RLS:** confirmed allows replacement (owner-scoped, no gap).

## Temporary diagnostics

Dev-only console logging (`NODE_ENV !== 'production'`) at every real
stage, tagged `[upload:<flow>:<STAGE>]`, for: `profile-photo`,
`smart-upload` (covers Take Photo), and `upload-multiple`. A
user-visible debug panel (Section 11) was added to the profile photo
flow specifically, since that is the simplest single-file case and the
one flow this audit found a fully confirmed, currently-broken bug on
that a real device retest can directly verify.

**Removal plan:** delete `components/uploads/UploadDebugPanel.tsx`,
its one call site in `app/profile/page.tsx`, and the `logUploadDiagnostic(...)`
calls (or simply leave them — they are inert in production builds by
construction) once root causes are confirmed fixed on a real device.

## Production rollout plan

No migration, no schema change, no production SQL. This is an
application-code-only fix:
1. Deploy this branch's changes (after review/merge, not part of this
   pass).
2. Ask the product owner to re-run the real-iPhone retest steps below.
3. If Smart Upload's "Needs attention" for legitimate PNG/JPEG
   persists, capture the `[upload:smart-upload:*]` console lines (or,
   if unavailable without Safari Web Inspector, the failure reason the
   existing `FailedItemFallback` UI already surfaces) and treat that as
   the next investigation's starting evidence — do not re-guess a MIME
   cause without it.

## Real-iPhone retest plan

- **Smart Upload:** open Smart Upload, select 2–3 PNG/JPEG files at
  once, confirm each completes to "Ready to review" (not "Needs
  attention") independently.
- **Upload Multiple:** open a property's Documents tab, use "Upload
  normally" with multiple files selected at once (mix of PDF and
  images), confirm all appear with no error.
- **Take Photo:** in Smart Upload, tap the camera-capture option, take
  a photo, confirm it uploads and reaches "Ready to review".
- **Property Photo:** unchanged from the prior investigation's own
  retest steps (docs/property-photo-upload-fix.md) — included here
  only for completeness of this pass's correlation, not re-tested.
- **Profile Photo:** open Profile, tap "Change photo" (with an
  existing photo already set), pick a photo from the library, confirm
  it replaces the existing photo and no "Choose an image file" error
  appears for a normal photo.

## Diagnostic text to send back if a flow still fails

"Flow: <Smart Upload / Upload Multiple / Take Photo / Property Photo /
Profile Photo>. File received: yes/no. Type: <shown in the debug panel
or console>. Validation: accepted/rejected + reason. Storage upload:
success/failed + reason. Database record: success/failed + reason.
Render URL: success/failed." — for Profile Photo, this is now shown
directly on-screen by the temporary debug panel; for the others, it is
the `[upload:<flow>:<STAGE>]` console line immediately before the
failure.
