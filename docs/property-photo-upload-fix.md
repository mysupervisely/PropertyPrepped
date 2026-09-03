# Property Photo Upload Bug — Trace, Root Cause, and Fix

M2.1 review pass (Part 5), secondary to the M2 Guided Intake review.
Application-only fix — **no Supabase Storage bucket/policy change and no
migration were needed.**

## The full path, traced

`file selection` (`<input type="file" accept="image/*">`, two call
sites: the "Add Property" modal's optional cover photo, and the
property Overview tab's "+ Add property photos" gallery uploader) →
`File` object in React state (`coverFile`) or a `FileList` handed
directly to `addPhotoFiles()` → an old MIME-type filter → `supabase
.storage.from('property-photos').upload(path, file, {...})` → (on
success) a `property_photos` row insert + `properties.cover_photo_path`
update → `loadPortfolio()` re-fetches every photo and generates a fresh
1-hour signed URL for each → `<img src={signedUrl}>`.

## Two concrete, confirmed bugs found

**1. `addPhotoFiles()` silently dropped files with no browser-reported
MIME type.** The filter was `Array.from(files).filter((file) =>
file.type.startsWith('image/'))`. Some iOS Safari photo-picker
selections (particularly HEIC) report `file.type === ''` — an empty
string never starts with `'image/'`, so the file was filtered out with
**zero feedback**. If it was the only file picked, the function
returned via `if (!incoming.length) return` having done nothing at all —
from the tenant/landlord's perspective, they picked a photo and nothing
happened.

**2. `addProperty()` silently discarded a cover-photo upload failure.**
The code was `const { error: uploadError } = await ...upload(...); if
(!uploadError) { ...insert row, update cover_photo_path... }` — if
`uploadError` WAS set, nothing happened: no `setError()` call, not even
a `console.error`. The property itself still saved successfully, so the
whole action appeared to "work," but the cover photo silently never
attached. This is the most likely source of a directly-observed
error message like "No content provided" — a developer inspecting the
network tab during this exact failure would see that text in the raw
response, while the on-screen UI showed nothing at all. Every OTHER
upload path in this file (`addDocumentFiles`, and `addPhotoFiles`
itself) already calls `setError(uploadError.message)` on failure — this
one path was the sole inconsistency.

## A theory investigated and ruled out

An initial hypothesis was that `contentType: file.type` (no `|| undefined`
fallback, unlike `addDocumentFiles`'s `contentType: file.type ||
undefined`) sent an empty `Content-Type` header when `file.type` was
empty, and that this caused Storage's multipart parser to choke,
producing "No content provided". **Traced directly against the
installed `@supabase/storage-js` v2.112.3 source** (`node_modules/
@supabase/storage-js/dist/index.cjs`, `uploadOrUpdate()`): when the
upload body is a `Blob`/`File` (which it always is here), the SDK
builds `body = new FormData(); body.append("", fileBody)` and **never
reads `options.contentType` at all in that branch** — the browser's own
`FormData` serialization uses the File's own internal type for that
multipart part, and `options.contentType` is only consulted in a
different branch (streams/plain objects, not Files). So an empty
`contentType` option could not have been the mechanism causing this
specific error with this SDK version. This is documented here so a
future investigation doesn't re-tread the same dead end.

## The fix

New module, `lib/property-photos/validate.ts` (pure, independently
tested, no DOM/Supabase dependency):

- `resolvePhotoContentType(file)` — uses the browser-reported
  `file.type` when present; falls back to a real extension-based guess
  (`.heic` → `image/heic`, etc.) only when the browser reported
  nothing at all. Used for the upload's `contentType` option at both
  call sites now — not because it was the root cause, but because it's
  more correct or future-SDK-safe, and costs nothing.
- `validatePropertyPhotoFile(file)` — the actual behavior fix. Rejects
  a genuinely empty (0-byte) file with a clear, specific message
  (Part 5's "zero-byte/invalid file handling" ask) instead of letting
  an empty body ever reach Storage. Rejects a file explicitly typed as
  something other than an image. **Accepts a file with no reported
  type at all, as long as its extension looks like a real image** — the
  direct fix for bug #1, since the OS-level file picker (`accept=
  "image/*"`) already constrained what could be selected in the first
  place; this validator no longer distrusts that.

Wired into both real upload sites in `app/page.tsx`:
`handleImage()` (the Add Property cover photo picker) now validates at
selection time and shows a clear error immediately if rejected.
`addProperty()` re-validates `coverFile` right before uploading (state
can sit for a while before this async function runs) and — the actual
bug #2 fix — now surfaces both a validation rejection and a real
upload error, instead of either being silently swallowed.
`addPhotoFiles()` validates every incoming file, uploads the valid ones,
and shows every rejection reason to the user rather than silently
dropping any of them. Both file inputs now reset their own `value`
after each selection, so re-picking the exact same file (a natural
retry) fires a fresh `change` event instead of doing nothing (browsers
don't re-fire `change` for a re-selected identical `File` object
against an unreset input).

## What was explicitly NOT changed

- The `property-photos` Storage bucket, its RLS policies, and the
  `property_photos`/`properties.cover_photo_path` schema — all
  unchanged. No migration was created; none was needed.
- No new upload/storage architecture was introduced — same bucket,
  same table, same signed-URL-on-read pattern as before.
- Video was never in scope here (property photos, not attachments) and
  wasn't touched.

## Test results (see the milestone's completion report for exact counts)

- `lib/property-photos/validate.test.ts` — pure validation logic:
  accepts real JPEG/PNG, accepts a typeless HEIC file (resolving a real
  contentType for it), rejects a 0-byte file with a specific reason,
  rejects a wrongly-typed file, rejects a typeless file with an
  unrecognizable extension, never throws on an empty filename.
- `lib/property-photos/upload-wiring.test.ts` — source-read regression
  guards (this repo's established no-jsdom convention) confirming both
  bugs are actually fixed in the real `app/page.tsx` source: the old
  silent filter is gone, both upload sites use the shared validator,
  the swallowed-error path now calls `setError`, both file inputs reset
  their value, and — importantly — that no new storage bucket/table was
  introduced (`property-photos`/`property_photos` are still the only
  ones referenced).

## Honest caveat

This fix addresses two confirmed, verifiable, reproducible-in-source
bugs. It's a strong candidate for the reported symptoms (a
zero-feedback failure exactly matches "cannot reliably upload," and the
silently-swallowed error is a plausible source of an observed "No
content provided" string). It has **not** been verified against a real
iOS Safari device with an actual HEIC photo in this sandboxed
environment — no device access exists here. If the product owner still
sees a failure after this fix ships, the next diagnostic step is
capturing the exact Storage response body/status code from a real
failing upload (browser dev tools → Network tab), which would confirm
or rule out a genuinely different cause (e.g. an actual Storage-side
size/policy limit).
