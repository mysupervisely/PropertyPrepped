import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Upload Reliability Audit — source-read regression guards, matching
// this repo's established no-jsdom convention (lib/property-photos/
// upload-wiring.test.ts is the direct precedent).

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const profileSource = readFile('app/profile/page.tsx')
const pageSource = readFile('app/page.tsx')
const engineSource = readFile('lib/smart-upload/engine.ts')
const smartUploadModalSource = readFile('components/SmartUpload/SmartUploadModal.tsx')

describe('Profile photo — the confirmed root cause is fixed', () => {
  it('no longer rejects a blank-reported-type file outright with the old strict check', () => {
    expect(profileSource).not.toContain("if (!file.type.startsWith('image/')) { setPhotoError('Choose an image file.'); return }")
  })

  it('validates via the shared, permissive-on-missing-type validateImageFile()', () => {
    expect(profileSource).toContain("import { validateImageFile } from '../../lib/uploads/image-file'")
    expect(profileSource).toContain('validateImageFile(file)')
  })

  it('V1.2: rewraps the file with toDurableUploadableFile() BEFORE it reaches .upload() — reads the ALREADY-STARTED bytesPromise rather than re-wrapping the original picker-tied File, fixing the confirmed "No content provided" root cause (lib/uploads/durable-file.ts)', () => {
    expect(profileSource).toContain("import { beginReadingFileBytes, toDurableUploadableFile } from '../../lib/uploads/durable-file'")
    const fnStart = profileSource.indexOf('async function uploadPhoto(')
    const fnEnd = profileSource.indexOf('\n  }', profileSource.indexOf('setPhotoBusy(false)', fnStart))
    const fnBody = profileSource.slice(fnStart, fnEnd)
    const rewrapIdx = fnBody.indexOf('toDurableUploadableFile(file, validation.contentType, bytesPromise)')
    const uploadIdx = fnBody.indexOf(".storage.from('profile-photos').upload(path, uploadable,")
    expect(rewrapIdx).toBeGreaterThan(-1)
    expect(uploadIdx).toBeGreaterThan(rewrapIdx)
  })

  it('V1.2: the input\'s onChange begins reading the file\'s bytes SYNCHRONOUSLY, before resetting the input\'s value — the confirmed fix ordering', () => {
    const inputIdx = profileSource.indexOf('<input type="file" accept="image/*" disabled={photoBusy}')
    const inputEnd = profileSource.indexOf('/>', inputIdx)
    const inputBody = profileSource.slice(inputIdx, inputEnd)
    const readIdx = inputBody.indexOf('beginReadingFileBytes(file)')
    const resetIdx = inputBody.indexOf("e.target.value = ''")
    expect(readIdx).toBeGreaterThan(-1)
    expect(resetIdx).toBeGreaterThan(readIdx)
  })

  it('checks the DB upsert error and cleans up the orphaned storage object on failure (was already correct — re-verified, not re-broken)', () => {
    expect(profileSource).toContain('if (saveError) {')
    expect(profileSource).toContain("await supabase.storage.from('profile-photos').remove([path])")
  })

  it('logs diagnostics at every stage and renders the temporary debug panel', () => {
    expect(profileSource).toContain("import { logUploadDiagnostic, safeErrorSummary, initialUploadDebugState, type UploadDebugState } from '../../lib/uploads/diagnostics'")
    expect(profileSource).toContain("import { UploadDebugPanel } from '../../components/uploads/UploadDebugPanel'")
    for (const stage of ['UPLOAD_FILE_RECEIVED', 'UPLOAD_VALIDATION_START', 'UPLOAD_STORAGE_START', 'UPLOAD_STORAGE_SUCCESS', 'UPLOAD_DB_START', 'UPLOAD_DB_SUCCESS', 'UPLOAD_URL_START', 'UPLOAD_RENDER_SUCCESS']) {
      expect(profileSource).toContain(`'${stage}'`)
    }
    expect(profileSource).toContain('<UploadDebugPanel state={photoDebug} />')
  })

  it('cache-busting is already correct: every upload gets a fresh random path, and the signed URL is re-fetched whenever profile.photo_path changes — no stale-cache fix was needed', () => {
    expect(profileSource).toContain('const path = `${user.id}/avatar/${crypto.randomUUID()}')
    expect(profileSource).toContain('}, [profile?.photo_path])')
  })
})

describe('Smart Upload / Take Photo shared engine — the confirmed root cause is fixed', () => {
  it('Take Photo is confirmed to share this exact engine — no separate capture-input upload path exists', () => {
    expect(smartUploadModalSource).toContain('capture="environment"')
    // The capture input's onChange feeds handleFiles() -> processFile() -> uploadDocumentForReview(), the SAME function this file fixes.
    // V1.1: it now also tags this call 'smart-upload-camera' (see the
    // dedicated describe block below) — same pipeline, distinguishable flow.
    expect(smartUploadModalSource).toContain("onFiles(e.target.files, bytesPromises, 'smart-upload-camera')")
    expect(smartUploadModalSource).toContain('Array.from(fileList).forEach((file, i) => { void processFile(file, batchId, flow, bytesPromises[i]) })')
  })

  it('normalizes an image file with resolveImageContentType() before it reaches .upload(), leaving PDFs\' content type untouched; V1.2 builds the actual uploadable File from an early-started bytesPromise when the caller provides one (lib/uploads/durable-file.ts), falling back to the original toUploadableImageFile() wrap for Smart Import\'s pre-existing calls that don\'t yet pass one', () => {
    const fnStart = engineSource.indexOf('export async function uploadDocumentForReview(')
    const fnEnd = engineSource.indexOf('\nexport type AnalyzeResult')
    const fnBody = engineSource.slice(fnStart, fnEnd)
    expect(fnBody).toContain('resolveImageContentType(file)')
    expect(fnBody).toContain('toDurableUploadableFile(file, resolvedContentType, bytesPromise)')
    expect(fnBody).toContain('toUploadableImageFile(file, resolvedContentType)')
    expect(fnBody).toContain('looksLikeImage')
    expect(fnBody).toContain('bytesPromise?: Promise<ArrayBuffer>')
    expect(fnBody).toMatch(/\.upload\(path, uploadable,/)
  })

  it('stores the CORRECTED mime_type on the property_documents row, not the raw (possibly blank) browser-reported one', () => {
    const fnStart = engineSource.indexOf('export async function uploadDocumentForReview(')
    const fnEnd = engineSource.indexOf('\nexport type AnalyzeResult')
    const fnBody = engineSource.slice(fnStart, fnEnd)
    expect(fnBody).toContain('mime_type: uploadable.type || null')
  })

  it('each file gets independent per-item state (own localId, own patchItem calls) — a single bad file cannot mark every file as failed', () => {
    expect(smartUploadModalSource).toContain('function patchItem(id: string, patch: Partial<QueueItem>)')
    expect(smartUploadModalSource).toContain('setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)))')
    // processFile() is called per-file inside forEach with `void`, never
    // awaited sequentially in a way that would let one file's rejection
    // stop the loop from reaching the next file.
    const handleFilesBody = smartUploadModalSource.slice(smartUploadModalSource.indexOf('function handleFiles('), smartUploadModalSource.indexOf('function handleFiles(') + 400)
    expect(handleFilesBody).toMatch(/forEach\(\(file, i\) => \{ void processFile\(file, batchId, flow, bytesPromises\[i\]\) \}\)/)
  })

  it('logs diagnostics at every real stage', () => {
    expect(engineSource).toContain("import { logUploadDiagnostic, safeErrorSummary, type UploadFlow } from '../uploads/diagnostics'")
    for (const stage of ['UPLOAD_FILE_RECEIVED', 'UPLOAD_NORMALIZATION_COMPLETE', 'UPLOAD_STORAGE_START', 'UPLOAD_STORAGE_SUCCESS', 'UPLOAD_STORAGE_ERROR', 'UPLOAD_DB_START', 'UPLOAD_DB_SUCCESS', 'UPLOAD_DB_ERROR']) {
      expect(engineSource).toContain(`'${stage}'`)
    }
  })
})

describe('"Upload Multiple" (app/page.tsx addDocumentFiles) — the confirmed root cause is fixed', () => {
  it('resolves an image file\'s content type, then builds the actual uploadable File from an early-started bytesPromise (V1.2 — lib/uploads/durable-file.ts), leaving PDFs/non-images\' content type untouched but equally protected against the confirmed byte-loss root cause', () => {
    const fnStart = pageSource.indexOf('async function addDocumentFiles(')
    const fnEnd = pageSource.indexOf('\n  }', fnStart)
    const fnBody = pageSource.slice(fnStart, fnEnd)
    expect(fnBody).toContain('resolveImageContentType(file)')
    expect(fnBody).toContain('toDurableUploadableFile(file, looksLikeImage ? resolvedContentType : file.type || undefined, bytesPromises[index])')
    expect(fnBody).toMatch(/\.upload\(path, uploadable,/)
  })

  it('a failed file continues to the next file rather than aborting the whole batch — already correct, re-verified', () => {
    const fnStart = pageSource.indexOf('async function addDocumentFiles(')
    const fnEnd = pageSource.indexOf('\n  }', fnStart)
    const fnBody = pageSource.slice(fnStart, fnEnd)
    expect(fnBody).toContain('continue')
  })

  it('logs diagnostics at every real stage, including the new V1.2 payload-ready/read-error stages', () => {
    const fnStart = pageSource.indexOf('async function addDocumentFiles(')
    const fnEnd = pageSource.indexOf('\n  }', fnStart)
    const fnBody = pageSource.slice(fnStart, fnEnd)
    for (const stage of ['UPLOAD_FILE_RECEIVED', 'UPLOAD_PAYLOAD_READY', 'UPLOAD_NORMALIZATION_COMPLETE', 'UPLOAD_STORAGE_START', 'UPLOAD_STORAGE_SUCCESS', 'UPLOAD_STORAGE_ERROR', 'UPLOAD_DB_ERROR', 'UPLOAD_DB_SUCCESS']) {
      expect(fnBody).toContain(`'${stage}'`)
    }
  })

  it('the input begins reading every selected file\'s bytes SYNCHRONOUSLY before resetting its own value — and now resets it at all, fixing the separate "can\'t re-select the same file" gap this input previously had', () => {
    const inputIdx = pageSource.indexOf('<input type="file" multiple disabled={busy} onChange={(e) => {')
    const inputEnd = pageSource.indexOf('}} /></label>', inputIdx)
    const inputBody = pageSource.slice(inputIdx, inputEnd)
    const readIdx = inputBody.indexOf('beginReadingFileBytes')
    const resetIdx = inputBody.indexOf("e.target.value = ''")
    expect(readIdx).toBeGreaterThan(-1)
    expect(resetIdx).toBeGreaterThan(readIdx)
  })
})

describe('Property photos — V1.2 applies the same durable-byte fix on top of the already-fixed MIME correction', () => {
  it('still uses its own validation/content-type logic from lib/property-photos/validate.ts, not the new shared image-file module', () => {
    expect(pageSource).toContain("from '../lib/property-photos/validate'")
    expect(pageSource).toContain('toUploadableFile(')
  })

  it('both the cover-photo picker (handleImage) and the gallery-add picker begin reading bytes synchronously before their input value is reset, and rebuild the actual uploaded File from those bytes via toDurableUploadableFile()', () => {
    expect(pageSource).toContain('import { beginReadingFileBytes, toDurableUploadableFile } from \'../lib/uploads/durable-file\'')
    const handleImageStart = pageSource.indexOf('const handleImage = (e: ChangeEvent<HTMLInputElement>) => {')
    const handleImageEnd = pageSource.indexOf('\n  }', handleImageStart)
    const handleImageBody = pageSource.slice(handleImageStart, handleImageEnd)
    const readIdx = handleImageBody.indexOf('beginReadingFileBytes(file)')
    const resetIdx = handleImageBody.indexOf("e.target.value = ''")
    expect(readIdx).toBeGreaterThan(-1)
    expect(resetIdx).toBeGreaterThan(readIdx)
    expect(handleImageBody).toContain('toDurableUploadableFile(file, validation.contentType, bytesPromise)')

    const addPhotoFilesStart = pageSource.indexOf('async function addPhotoFiles(')
    const addPhotoFilesEnd = pageSource.indexOf('\n  async function', addPhotoFilesStart + 1)
    const addPhotoFilesBody = pageSource.slice(addPhotoFilesStart, addPhotoFilesEnd)
    expect(addPhotoFilesBody).toContain('toDurableUploadableFile(file, validation.contentType, bytesPromises[i])')
  })
})

describe('Security: no RLS was weakened to make any of this work', () => {
  it('every fixed flow still uploads through the caller\'s own RLS-scoped supabase client — no service-role key, no admin client', () => {
    for (const source of [profileSource, engineSource]) {
      expect(source).not.toMatch(/service_role|SUPABASE_SERVICE_ROLE|supabaseAdmin/)
    }
  })

  it('addDocumentFiles()/uploadDocumentForReview() still scope every path under the caller\'s own user id, never a client-suppliable prefix', () => {
    expect(pageSource).toMatch(/\$\{user\.id\}\/\$\{selectedId\}\/documents\//)
    expect(engineSource).toMatch(/\$\{ownerId\}\/smart-upload\//)
  })
})
