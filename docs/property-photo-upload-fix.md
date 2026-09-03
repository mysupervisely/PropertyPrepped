# Property Photo Upload Bug — Trace, Root Cause, and Fix

## UPDATE V2 (post-selection-failure investigation, after PR #53 shipped)

The iOS production-bug fix below (`toUploadableFile()`) shipped and was
merged as PR #53, but a real-iPhone retest **still failed** — with a
much more specific symptom this time: the photo picker opens, the user
picks a photo, the picker closes, and then **nothing happens at all**.
No photo in the gallery, the empty state ("No photos uploaded yet")
stays up, and no error is shown anywhere. This narrows the bug to
**after** file selection, in the gallery-add path specifically
(Documents -> Photos -> "Add property photos"), not the Add Property
modal's cover photo (a different call site, `handleImage`/`addProperty`
— not reported as broken).

**What a full re-audit of that exact path found:** every individual
stage was already correct and already checked (Storage upload error,
`property_photos` insert error, `cover_photo_path` update error — all
three check their own error post-PR-#53; the FileList is already copied
to a plain array synchronously before the input is reset, so no file is
lost; `selectedPhotos` is recomputed fresh every render, no stale
memoization; `loadPortfolio()` always regenerates fresh signed URLs).
**No single deterministic logic bug reproduces the exact reported
symptom in the current code.** Two real, concrete, non-speculative gaps
were found instead, and both are exactly the kind of gap that produces
*this* specific symptom set (total silence, no error, no photo):

1. **No exception safety.** Both real upload entry points
   (`addPhotoFiles()` and `addProperty()`) are invoked fire-and-forget
   — `void addPhotoFiles(files)` / `void addProperty()`, no `.catch()`
   anywhere. Every Supabase call already checked in this app converts
   network-level failures into a returned `{error}` object by design
   (verified by reading both `@supabase/storage-js`'s `handleOperation()`
   and `@supabase/postgrest-js`'s `PostgrestBuilder`'s fetch-retry/catch
   logic directly — both wrap raw `fetch()` rejections into their own
   typed error and resolve, they do not throw, for the common
   network-failure case). But that is not a guarantee against *every*
   possible exception — a bug in a helper, an unexpected null-deref if
   auth state changes mid-await, or a future SDK behavior change — and
   there was **zero** handling for anything outside the already-checked
   `{error}` returns. Any such exception becomes a silent unhandled
   promise rejection: no `setError`, no `console.error`, no
   `loadPortfolio()`, and `busy` left stuck. That is a byte-for-byte
   match for the reported symptom, regardless of what specifically
   triggers it.
2. **An error, even when it IS set, can render off-screen.** `.globalError`
   (`app/globals.css`) is a normal in-flow element right after the page
   header — not `position: sticky`/`fixed`. The property workspace page
   is long (hero, tabs, sub-tabs); a user scrolled down into Documents
   -> Photos who triggers *any* error would see nothing unless they
   scroll back to the very top. "No visible error is shown" does not
   require that no error was set — only that it wasn't seen.

Also found and fixed in the same pass: `loadPortfolio()`'s
`createSignedUrl()` call discarded its own error entirely (a photo
whose signed URL failed to generate would silently show "Photo
unavailable" with zero trace); `property_photos` INSERT/UPDATE RLS
policies don't verify `property_id` belongs to the authenticated owner
the way `property_documents`' policies explicitly do (a real,
pre-existing gap, confirmed by reading `supabase/schema.sql` — but not
implicated in this bug, since the reported failure is on the user's own
existing property; **not changed** in this pass, flagged for a future,
separately-scoped hardening pass rather than folded in here).

**The fix, matching "smallest robust fix, no speculative root-cause
chasing":** wrap both upload entry points in `try/catch/finally` so an
unexpected exception is always caught, logged, surfaced to the user,
and never leaves `busy` stuck; add `surfaceError()` (scrolls to top on
any new error) so a shown error is actually seen; check
`createSignedUrl()`'s own error; and add the full `PHOTO_*` diagnostic
taxonomy end-to-end (picker -> validation -> upload -> DB insert -> DB
update -> reload -> render) so if this is *still* wrong on the next
real-device retest, the product owner's own browser console will show
exactly which stage stopped, without another deploy-and-guess cycle
(open Safari's Web Inspector, or `console.log` output relayed by the
product owner, and look for the last `[property-photo:PHOTO_*]` line
before the failure — that names the exact stage that didn't complete).
The diagnostic taxonomy, the exact code changes, and the corresponding
test coverage are described in the session's own completion report for
this pass — this document's job is the durable trace/root-cause record,
not a running changelog of every file touched.

---

**UPDATE (iOS production-bug investigation, post-merge/deploy):** the
M2.1 fix below shipped to production, but a real-iPhone retest still
failed — the M2.1 diagnosis was **incomplete**, not wrong about the two
bugs it found (both were real and are still fixed), but it missed the
actual mechanism that matters for a real upload. See "UPDATE: the
confirmed real root cause" below, added after this document's original
M2.1 content (preserved as-is beneath it for the historical record).

## UPDATE: the confirmed real root cause (this is the one that matters)

M2.1 computed a corrected content type (`resolvePhotoContentType()`)
for a file whose browser-reported `type` was empty, and passed it as
`{ contentType: ... }` to `.upload()`. This was **verified, on
re-inspection, to have zero effect on any real upload in this app.**

Re-reading `@supabase/storage-js`'s installed source
(`uploadOrUpdate()` in `node_modules/@supabase/storage-js/dist/
index.cjs`) line by line: for a `File`/`Blob` body — which every real
upload in this app is, always — the SDK does:

```js
if (typeof Blob !== "undefined" && fileBody instanceof Blob) {
  body = new FormData()
  body.append("cacheControl", options.cacheControl)
  body.append("", fileBody)   // <-- options.contentType is NEVER read here
}
```

`options.contentType` is only read in a different branch (raw streams/
ArrayBuffers — not what this app ever passes). The actual Content-Type
of the uploaded file, as far as the wire request and the server are
concerned, comes from the browser's own `FormData` serialization of
`fileBody`, which uses **`fileBody.type` directly** (a File/Blob's own,
immutable property) — not any option we pass.

**This was proven empirically, not just by reading source** — a test
(`validate.test.ts`, "DEFINITIVE PROOF") constructs a real `File` with
an empty `type`, appends it to a real `FormData`, and serializes it via
`new Request(..., { body: formData }).text()` — the same construction
path a browser and the SDK actually use. The result:

```
Content-Disposition: form-data; name=""; filename="IMG_0001.HEIC"
Content-Type: application/octet-stream
```

**`application/octet-stream`** — not empty, not omitted, but a
concrete, wrong MIME type, and NOT one of the `property-photos`
bucket's configured `allowed_mime_types` (`image/jpeg`, `image/png`,
`image/webp`, `image/heic`, `image/heif` — `supabase/schema.sql`). A
bucket-level MIME allowlist is a server-side enforcement feature —
that's its entire purpose — so an upload whose actual multipart part
declares `application/octet-stream` is exactly the shape of request a
server-side allowlist check would reject. This is the confirmed root
cause: **the real uploaded bytes never carried a usable content type
for a subset of iOS selections, and M2.1's fix never reached them.**

### Why M2.1 did not fix it

M2.1 fixed two real, separate bugs (both still fixed, see below) but
never addressed the ACTUAL upload payload's content type — it only ever
changed a `contentType` SDK option that, for this app's exact call
pattern (always a real File object), the SDK silently discards. The
unit/wiring tests written at the time all passed because they tested
`validatePropertyPhotoFile()`'s return value and (via source-string
matching) that `contentType` was passed as an option — they never
serialized a real request and inspected what actually got sent, which
is the only way this specific gap would have been visible.

### The actual fix: `toUploadableFile()`

`lib/property-photos/validate.ts` — `new File([file], file.name, {
type: contentType })` constructs a NEW File wrapping the exact same
underlying bytes (verified byte-identical in `validate.test.ts`) but
with the corrected `type` set directly on the object. Since the SDK
reads `fileBody.type` from whatever object we hand it, this is the only
place the correction can actually take effect. When the browser already
reported a correct type, this returns the original File unchanged (no
copy, no behavior change) — the fix only ever does something when there
was actually something wrong to fix.

Applied at both real upload call sites (`handleImage`'s cover-photo
selection and `addPhotoFiles()`'s gallery uploader) in `app/page.tsx`,
immediately after validation and before the file is stored in state or
handed to `.upload()`.

### Other findings from this pass

- **Two more silent-failure gaps found and fixed**, matching the
  brief's own "database update failure after successful storage
  upload" test scenario: neither the `property_photos` row insert nor
  the `properties.cover_photo_path` update checked their own error in
  `addProperty()`'s cover-photo block, and the `cover_photo_path`
  update was entirely unchecked in `addPhotoFiles()` too. A storage
  upload could now succeed while the DB never actually reflected it —
  the photo would be gone from the user's view (or the cover wouldn't
  change) with no explanation. Fixed: every DB write following a
  successful upload now checks its own error, cleans up the orphaned
  storage object on an insert failure, and shows a clear message.
- **User-facing error text no longer echoes raw storage/DB internals.**
  Previously `setError(`...${uploadError.message}`)` could put a raw
  string like "No content provided" directly in front of the user. Now:
  a concise, actionable message ("Please try a JPEG or PNG, or choose
  another photo."), with the real technical error preserved via
  `console.error` for safe debugging.
- **Development-only diagnostics added** (`lib/property-photos/
  diagnostics.ts`) — gated on `NODE_ENV !== 'production'`, logs
  platform, file extension (never the full filename), MIME type, byte
  size, File-vs-Blob, validation result, upload start/result, and DB
  update result at every real stage of both upload paths. Never logs
  bytes, URLs, tokens, or secrets.
- **Cache/replacement re-verified, not just assumed:** every upload
  gets a fresh `crypto.randomUUID()` path — paths are never reused, so
  there is no stale-URL/cache risk at the storage-object level. Every
  photo mutation (`addProperty`, `addPhotoFiles`, `setCover`,
  `removePhoto`) calls `loadPortfolio()`, which re-fetches every photo
  and generates a brand-new signed URL every time — the displayed image
  can never be a cached response for a since-replaced object. No
  existing code path deletes the previous cover image before a new
  upload+DB update both succeed — "replacing" a cover is a separate,
  explicit two-step user action (upload, then Set Cover), never an
  atomic delete-then-upload.
- **Bucket/policy audit (read-only, no changes):** `property-photos`
  bucket — `public: false`, `file_size_limit: 20971520` (20MB),
  `allowed_mime_types: ['image/jpeg','image/png','image/webp',
  'image/heic','image/heif']` (the exact mechanism this whole
  investigation traces back to). RLS policies
  (`property_photos_select_own`/`_insert_own`/etc., `supabase/
  schema.sql`) are the standard, unchanged
  `(storage.foldername(name))[1] = auth.uid()` folder-scoping pattern —
  not implicated, not changed. **No migration was needed** — this bug
  was never a policy/bucket misconfiguration, it was the client sending
  the wrong Content-Type for the actual bytes.
- **Upload failure vs. preview/render failure — explicitly checked,
  kept separate:** the brief asked us to distinguish these, so two
  distinct rendering paths were traced independently of the upload fix
  above.
  - *Selection-time preview* (`handleImage`'s `<img src={imagePreview}>`
    in the Add Property modal): this is a `FileReader.readAsDataURL()`
    data URL, decoded and painted entirely by the browser the user is
    uploading *from*. For the real-world failure this bug report is
    about — a photo picked in iOS Safari — that's WebKit, and WebKit's
    `<img>`/ImageIO stack has decoded and displayed HEIC natively since
    Safari 11. So on the one browser this bug is actually about, this
    preview path was not a suspect and testing confirmed nothing here
    needed to change.
  - *Gallery/cover thumbnails after upload* (`<img src={photo.
    signedUrl}>`, line ~1783): these come straight from the Storage
    signed URL, rendered by whatever browser is later viewing the
    dashboard — which will not always be Safari (e.g. a desktop Chrome/
    Firefox session). Chromium- and Gecko-based browsers still do not
    decode HEIC/HEIF for `<img>`. This is a **real, pre-existing, and
    separate** limitation: even after this fix, a HEIC file that now
    uploads and stores correctly can still render as a broken image
    icon in a non-Safari viewer. It is not the bug reported (nothing
    reported "the photo looks broken" — the report was "upload does not
    work") and it predates this investigation.
  - **No fix was made for this.** Per the brief's own instruction not to
    add a heavy HEIC→JPEG conversion dependency without a demonstrated
    need, and since no failure of this kind was reproduced or reported,
    this is documented here as a known follow-up candidate rather than
    acted on speculatively. If cross-browser gallery rendering of HEIC
    photos becomes a real complaint, the fix would be server-side
    normalization to JPEG at upload time (a background conversion step,
    not a client-side one) — a new, separate, deliberately-scoped piece
    of work, not a change to bundle into this bug fix.

### What could not be verified from this sandbox

This environment has no live network path to the production Supabase
project (confirmed in an earlier, unrelated investigation — outbound
requests to the project's own host are blocked by this sandbox's
network policy) and no real iOS device. Everything above was verified
by: reading the exact installed SDK source, and reproducing its exact
`FormData`/multipart construction in a real Node 22 environment (which
has spec-compliant global `File`/`Blob`/`FormData`/`Request`) to observe
the actual bytes that would be sent. This is strong, mechanistic
evidence, not a live end-to-end confirmation against the real bucket.
**Recommended production checks for the product owner** (read-only,
no risk):

1. In the Supabase dashboard → Storage → `property-photos` → confirm
   the bucket's `allowed_mime_types` still matches what's in
   `supabase/schema.sql` (a manual dashboard edit could have drifted
   from the migration file).
2. After this fix deploys, retry the exact same failing upload from the
   same iPhone, and if it still fails, capture the Network tab's
   request/response for the `POST .../storage/v1/object/property-photos/...`
   call — the response body and status code will confirm or rule this
   out immediately (a 400 with a MIME-type-related message would
   confirm this; anything else points elsewhere).
3. If still failing, check Supabase's own Storage logs (dashboard →
   Logs → Storage) for the exact rejected request around the failure
   timestamp.

---

*Everything below this line is the original M2.1 document, preserved
as-is.*

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
