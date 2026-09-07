# Upload Reliability V1.1 — Real-Device Diagnostics

Follow-up to `docs/upload-reliability-audit-fix.md` (commit `87beb80`).
That pass fixed real, confirmed MIME/File bugs but could not conclusively
explain Smart Upload's production "Needs attention" symptom for
legitimate PNG/JPEG files without live-device evidence. This milestone
is purely about **observability** — making the exact failing stage
visible from an iPhone with no Safari Web Inspector — not a rewrite of
the upload architecture. Every confirmed fix from `87beb80` is
untouched: `lib/uploads/image-file.ts`'s three exported functions,
profile photo's validation/normalization, and Smart Upload's/Upload
Multiple's normalization are byte-for-byte the same logic, only with
additional logging layered around them.

## Section 8: tracing "Needs attention" — every producing code path

Read `components/SmartUpload/SmartUploadModal.tsx`'s actual state
machine directly (not guessed). There are **exactly two call sites**
that set the raw `status: 'Failed'` (displayed as "Needs attention" via
`QUEUE_STATUS_LABEL`) — a third status, `'Unsupported'`, is separate
and already has its own distinct label ("Not supported") and message,
so it was never part of this ambiguity:

**1. `processFile()` — an UPLOAD failure**, when
`uploadDocumentForReview()` returns `{ ok: false }`. Internally this
collapses three sub-stages into one string: the Storage upload itself,
the `property_documents` insert, or the `smart_upload_items` insert.

**2. `runAnalyze()` — an ANALYSIS failure**, when `analyzeDocument()`
returns `{ ok: false }`. Reading `lib/document-intelligence/
analyze-request.ts` directly (the actual server route this calls)
enumerates every distinct real cause this can be:

| Cause | HTTP status | Maps to brief's category |
|---|---|---|
| Session expired (client-side, before the request) | — | F |
| Network/fetch threw | — | F |
| Document not found (RLS/race) | 404 | F |
| AI not configured | 503 | F |
| Plan lacks AI, or monthly quota used up | 403 `AI_LIMIT_REACHED` | **B** — a very plausible explanation for "a previously-working account suddenly can't analyze anything" |
| `resolveMimeType()` returned null (genuinely unsupported/unresolvable file) | 415 | **C** |
| File empty (`size_bytes <= 0`, checked twice — DB column and re-checked against real downloaded bytes) | 400 | E |
| File too large (>20MB, checked twice the same way) | 413 | E |
| Signed URL creation failed | 500 | B |
| File download (`fetchFileBytes`) failed | 502 | B |
| Already being analyzed (double-tap/race) | 409 | F |
| The AI provider call itself threw | 502 (deliberately generic message — the route already avoids leaking provider internals) | B |
| Analysis "succeeded" per the route but the `document_analyses` row is missing on read-back | client-side only | B |

**"Missing property/document metadata" (category D) is NOT a cause of
`'Failed'` at all** — `SmartUploadModal.tsx` never uses
`lib/smart-upload/import-queue.ts#deriveImportStatus()`'s "Needs
property" status (that's Smart Import's own, separate queue). This
was confirmed by reading the component, not assumed.

## Was a more specific root cause found?

**No fix was made beyond what was already fixed in `87beb80`.** Every
individual failure reason above already returns its own specific,
safe `error` string from the server — the gap was never "no
information exists," it was "the queue LIST view only ever showed the
generic pill, and the only way to see the real reason was to tap into
the item." This milestone closes that observability gap; it does not
invent a new functional fix, per the brief's own "if the cause still
requires production evidence, do NOT guess" instruction. The most
plausible remaining candidate for "legitimate PNG/JPEG failing" —
`AI_LIMIT_REACHED` (a real account hitting its monthly AI-analysis
quota, or being on a plan without AI at all) — is now directly visible
in the debug line's "Reason" field on the very next retest, without
requiring another guess-and-deploy cycle.

## Smart Upload visible diagnostics

`SmartUploadModal.tsx`'s queue list (`SmartUploadQueue`) now renders a
compact `SmartUploadDebugLine` directly under any item showing "Needs
attention" — no tap-in required:

```
IMG_4817.png
Needs attention

Debug (smart-upload)
File received: Yes
Type: image/png
Validation: Accepted
Upload: Success
Database record: Success
Analysis: Failed
Failing stage: Analysis
Reason: <the server's own safe error string>
```

Each item's debug state (`SmartUploadDebugState`, extending the base
`UploadDebugState` shape with an `analysis` stage instead of
`renderUrl`, since Smart Upload's "final state" is Ready-to-review, not
a rendered image) is stored per-item and patched only by that item's
own id via a functional `setItems` update — never a stale closure,
never a batch-wide overwrite.

## Upload Multiple visible diagnostics

`app/page.tsx`'s Documents-tab "Drop a file here or choose one" (the
plain, non-AI multi-file upload) now populates one `UploadDebugPanel`
**per file**, patched by array index as each file's own upload
progresses through received → normalized → storage → DB. A failing
file's own panel shows its own failure; every other file's panel keeps
showing its own independent progress/success, never obscured.

## Take Photo diagnostics

Confirmed (again, directly from source) that Take Photo is the exact
same pipeline as every other Smart Upload selection — no separate code
exists to fix. What changed: the camera-capture `<input capture=
"environment">`'s `onChange` now explicitly tags its call with `flow:
'smart-upload-camera'`, threaded through `handleFiles() ->
processFile() -> uploadDocumentForReview()/analyzeDocument()` and all
the way into the debug line's own "Debug (smart-upload-camera)"
heading — so a camera capture is visually and diagnostically
distinguishable from a Photo Library / Choose File / Upload Multiple
selection, without duplicating any logic.

## Profile Photo diagnostics — confirmed, unchanged

`UploadDebugPanel` (added in `87beb80`) is still imported and rendered
in `app/profile/page.tsx`, unmodified by this pass. Re-verified it
already distinguishes: file received, validation, storage upload,
profile DB update (`user_profiles` upsert), and render URL (the signed-
URL fetch effect) — exactly Section 5's checklist, already satisfied
before this milestone started.

## Property Photo diagnostics — confirmed, not reopened

`lib/property-photos/diagnostics.ts`'s `PHOTO_*` stage taxonomy
(`PHOTO_UPLOAD_START`, `PHOTO_UPLOAD_ERROR`, etc.) and its call sites
in `app/page.tsx` are untouched by this pass — verified present, not
re-fixed, not re-designed. No speculative property-photo change was
made.

## Safe error messages

Every new debug surface (the queue-list debug line, the per-file
Upload Multiple panels) reads only from `safeErrorSummary()` (message/
code/status) or the already-sanitized server-provided `error` strings
documented in the table above — the same discipline `87beb80`
established. Nothing new logs or displays a token, signed URL, storage
credential, or raw file content; a dedicated test
(`lib/uploads/real-device-diagnostics.test.ts`) asserts this
mechanically, not just by inspection.

## Files changed

- `lib/uploads/diagnostics.ts` — additive: `UPLOAD_ANALYSIS_START/
  SUCCESS/ERROR` stages, the `'smart-upload-camera'` flow value,
  `SmartUploadDebugState`/`initialSmartUploadDebugState()`. Nothing
  existing was removed or renamed.
- `lib/smart-upload/engine.ts` — `uploadDocumentForReview()` and
  `analyzeDocument()` both gained an optional `flow` parameter
  (defaulting to `'smart-upload'`, so Smart Import's pre-existing calls
  are unaffected) and logging at every real analysis-failure branch.
- `components/SmartUpload/SmartUploadModal.tsx` — `QueueItem` gained a
  `debug` field; `SmartUploadDebugLine` (new, local to this file); the
  camera input now tags its flow; per-item debug patches at every
  stage.
- `app/page.tsx` — `addDocumentFiles()` ("Upload Multiple") now builds
  and patches a `documentUploadDebug` array, one `UploadDebugState`
  per file, rendered via the existing `UploadDebugPanel`.
- `app/globals.css` — small additive rules for `.smartUploadDebugLine`
  and `.uploadDebugPanelGroup`; existing `.uploadDebugPanel` rules
  reused, not modified.
- Tests: `lib/uploads/real-device-diagnostics.test.ts` (new, 19 tests);
  two pre-existing assertions in `lib/uploads/upload-reliability-
  wiring.test.ts` updated for the intentional `processFile`/`onFiles`
  signature change (now threading `flow`).

## Schema/migration

None. This milestone is entirely client-side observability.

## iPhone test checklist

1. **Smart Upload:** select 2–3 PNG/JPEG files. If any shows "Needs
   attention," it now shows a Debug block directly in the list — note
   the "Failing stage" and "Reason" lines.
2. **Take Photo:** use the camera-capture option; confirm any failure's
   debug block reads "Debug (smart-upload-camera)".
3. **Upload Multiple (Documents tab):** select several files at once
   (mix of PDF/image); confirm each file gets its own debug panel and
   a failing file doesn't blank out the others' panels.
4. **Profile Photo:** unchanged from `87beb80`'s own retest steps.
5. **Property Photo:** not reopened; no retest needed for this pass
   specifically.

## Diagnostic text to send back

For Smart Upload/Take Photo/Upload Multiple: copy the exact "Failing
stage" and "Reason" lines shown in the new debug block (or, for Upload
Multiple, the equivalent panel fields — Storage upload / Database
record / their Reason lines). That is now sufficient on its own to
identify the real cause — no console access needed.

## Recommendation

The combined Upload Reliability work (`87beb80` + this pass) is ready
for a **PR and a Netlify deploy preview** for real-device retesting —
not for merge to `main` yet. The confirmed MIME/validation bugs are
fixed with strong evidence; the one remaining open question (Smart
Upload's exact "Needs attention" cause) now has the instrumentation in
place to be answered from the very next iPhone test, without another
code-and-guess cycle. Recommend merging only after that retest confirms
either (a) the debug line shows a specific, addressable cause (e.g.
`AI_LIMIT_REACHED`), or (b) all previously-failing files now succeed
outright because the MIME fixes already resolved it.
