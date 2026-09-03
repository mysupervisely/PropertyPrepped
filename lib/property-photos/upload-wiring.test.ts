import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Source-read regression guards for the property-photo upload fixes —
// M2.1 (Part 5), the iOS production-bug follow-up, and the V2
// post-selection-failure investigation — matching this repo's
// established no-jsdom source-string-match convention.

const source = readFileSync(join(__dirname, '..', '..', 'app', 'page.tsx'), 'utf8')

function sliceFunction(name: string, nextFnMarker: string): string {
  const fnStart = source.indexOf(name)
  expect(fnStart).toBeGreaterThan(-1)
  const fnEnd = source.indexOf(nextFnMarker, fnStart)
  expect(fnEnd).toBeGreaterThan(fnStart)
  return source.slice(fnStart, fnEnd)
}

const addPhotoFilesBody = sliceFunction('async function addPhotoFiles(', 'async function openDocument(')
const addPropertyBody = sliceFunction('async function addProperty()', 'function openEditProperty(')

describe('Property photo upload — M2.1 fixes (still in place)', () => {
  it('handleImage validates the picked cover photo and surfaces a rejection instead of silently accepting/dropping it', () => {
    const fnStart = source.indexOf('const handleImage = ')
    const fnBody = source.slice(fnStart, fnStart + 700)
    expect(fnBody).toContain('validatePropertyPhotoFile(file)')
    expect(fnBody).toContain('setError(validation.reason)')
  })

  it('handleImage resets the file input value after reading the file, so re-selecting the same file fires change again', () => {
    const fnStart = source.indexOf('const handleImage = ')
    const fnBody = source.slice(fnStart, fnStart + 700)
    expect(fnBody).toContain("e.target.value = ''")
  })

  it('addPhotoFiles() no longer filters incoming files with the old file.type.startsWith(\'image/\') check, which silently dropped empty-type (iOS HEIC) files', () => {
    expect(addPhotoFilesBody).not.toContain(".filter((file) => file.type.startsWith('image/'))")
    // V2 refactor: the per-file accept/reject decision now lives in
    // classifyPhotoSelection() (lib/property-photos/validate.ts), which
    // itself calls validatePropertyPhotoFile() — see that file's own
    // "still uses validatePropertyPhotoFile" coverage below.
    expect(addPhotoFilesBody).toContain('classifyPhotoSelection(incomingRaw)')
    const validateSource = readFileSync(join(__dirname, 'validate.ts'), 'utf8')
    const fnStart = validateSource.indexOf('export function classifyPhotoSelection')
    const fnBody = validateSource.slice(fnStart, fnStart + 700)
    expect(fnBody).toContain('validatePropertyPhotoFile(file)')
    expect(fnBody).toContain('.reason)')
  })

  it('the gallery photo-upload input resets its value after each selection', () => {
    const idx = source.indexOf("<input type=\"file\" accept=\"image/*\" multiple disabled={busy}")
    expect(idx).toBeGreaterThan(-1)
    expect(source.slice(idx, idx + 250)).toContain("e.target.value = ''")
  })

  it('still uses the existing property-photos bucket and property_photos table — no new storage system was introduced', () => {
    expect(source).toContain("storage.from('property-photos')")
    expect(source).toContain("from('property_photos')")
    expect(source).not.toMatch(/storage\.from\(['"](?!property-documents|property-photos|tenant-connect-attachments)/)
  })
})

describe('Property photo upload — iOS production-bug fix (toUploadableFile)', () => {
  it('handleImage rewraps the file with toUploadableFile() at selection time, before it is ever stored in coverFile state', () => {
    const fnStart = source.indexOf('const handleImage = ')
    const fnBody = source.slice(fnStart, fnStart + 1300)
    const rewrapIdx = fnBody.indexOf('toUploadableFile(file, validation.contentType)')
    const setCoverIdx = fnBody.indexOf('setCoverFile(')
    expect(rewrapIdx).toBeGreaterThan(-1)
    expect(setCoverIdx).toBeGreaterThan(-1)
    expect(rewrapIdx).toBeLessThan(setCoverIdx)
  })

  it('addProperty() re-applies toUploadableFile() to coverFile right before uploading it', () => {
    expect(addPropertyBody).toContain('toUploadableFile(coverFile, validation.contentType)')
    // The rewrapped object, not the raw coverFile, must be what's handed to .upload().
    expect(addPropertyBody).toMatch(/\.upload\(path, uploadable,/)
  })

  it('addPhotoFiles() rewraps every incoming file with toUploadableFile() before it enters the upload queue, via the shared classifyPhotoSelection() helper (V2 refactor — see lib/property-photos/validate.test.ts for its own direct File[] coverage)', () => {
    expect(addPhotoFilesBody).toContain('classifyPhotoSelection(incomingRaw)')
    const validateSource = readFileSync(join(__dirname, 'validate.ts'), 'utf8')
    const fnStart = validateSource.indexOf('export function classifyPhotoSelection')
    expect(validateSource.slice(fnStart, fnStart + 700)).toContain('toUploadableFile(r.file, r.validation.contentType)')
  })

  it('imports toUploadableFile from the shared validation module', () => {
    expect(source).toContain('toUploadableFile')
    expect(source).toMatch(/from '\.\.\/lib\/property-photos\/validate'/)
  })
})

describe('Property photo upload — DB-write failure after a successful storage upload is now checked', () => {
  it('addProperty(): the property_photos insert and the cover_photo_path update both check their own error (M2.1 checked neither)', () => {
    expect(addPropertyBody).toMatch(/const \{ error: rowError \} = await supabase\.from\('property_photos'\)\.insert/)
    expect(addPropertyBody).toMatch(/const \{ error: updateError \} = await supabase\.from\('properties'\)\.update\(\{ cover_photo_path: path \}\)/)
    // On a failed insert after a successful upload, the orphaned storage object is cleaned up.
    expect(addPropertyBody).toMatch(/if \(rowError\) \{[\s\S]*?storage\.from\('property-photos'\)\.remove\(\[path\]\)/)
  })

  it('addPhotoFiles(): the cover_photo_path update (previously entirely unchecked) now checks its own error', () => {
    expect(addPhotoFilesBody).toMatch(/const \{ error: updateError \} = await supabase\.from\('properties'\)\.update\(\{ cover_photo_path: path \}\)/)
    expect(addPhotoFilesBody).toContain('if (updateError)')
  })
})

describe('Property photo upload — user-facing error text no longer exposes raw storage/DB internals', () => {
  it('a storage/DB failure shows a concise, actionable message, not the raw error string, in both upload paths', () => {
    expect(source).toMatch(/Please try a JPEG or PNG, or choose another photo\./)
    // The raw error is still preserved for debugging, just not shown to the user directly.
    expect(source).toMatch(/console\.error\('property-photo (cover|gallery)/)
  })

  it('validation rejections (already user-authored, specific reasons) are shown as-is, unlike raw storage/DB errors', () => {
    expect(source).toContain('setError(validation.reason)')
  })
})

describe('Property photo upload — development-only diagnostics', () => {
  it('imports the diagnostics logger and helpers from the shared module', () => {
    expect(source).toContain("import { logPhotoUploadDiagnostic, safeFileSummary, safeFileListSummary, safeErrorSummary } from '../lib/property-photos/diagnostics'")
    for (const stage of ['file_selected', 'validation_result', 'upload_start', 'upload_result', 'db_update_result']) {
      expect(source).toContain(`'${stage}'`)
    }
  })
})

// V2: real product-owner retest after PR #53 still failed, narrowed to
// "file selection works, nothing visible happens after that" — the
// gallery-add path specifically (Documents -> Photos -> Add property
// photos), not the Add Property modal's cover photo. This describe
// block covers what changed in THIS pass: the full PHOTO_* diagnostic
// taxonomy tracing every stage of that exact flow, unconditional
// exception-safety around both upload entry points (neither was
// previously guarded against anything other than a Supabase-returned
// `{error}` object), and guaranteed error-banner visibility.
describe('Property photo upload — V2 post-selection-failure investigation', () => {
  it('addPhotoFiles() logs every stage of the PHOTO_* taxonomy for the gallery-add flow', () => {
    for (const stage of [
      'PHOTO_PICKER_SELECTED',
      'PHOTO_VALIDATION_RESULT',
      'PHOTO_UPLOAD_START',
      'PHOTO_UPLOAD_SUCCESS',
      'PHOTO_UPLOAD_ERROR',
      'PHOTO_DB_INSERT_START',
      'PHOTO_DB_INSERT_SUCCESS',
      'PHOTO_DB_INSERT_ERROR',
      'PHOTO_DB_UPDATE_START',
      'PHOTO_DB_UPDATE_SUCCESS',
      'PHOTO_DB_UPDATE_ERROR',
    ]) {
      expect(addPhotoFilesBody, `expected ${stage} to appear in addPhotoFiles()`).toContain(`'${stage}'`)
    }
  })

  it('the PHOTO_* stages that are always on the main line (not mutually-exclusive success/error branches) fire in the real execution order', () => {
    // PICKER -> VALIDATION -> UPLOAD_START -> DB_INSERT_START -> DB_UPDATE_START
    // is the one true happy-path ordering; UPLOAD_SUCCESS/ERROR and
    // DB_INSERT_SUCCESS/ERROR are siblings inside if/else branches, so
    // their own relative source position isn't a real ordering to assert.
    const picker = addPhotoFilesBody.indexOf("'PHOTO_PICKER_SELECTED'")
    const validation = addPhotoFilesBody.indexOf("'PHOTO_VALIDATION_RESULT'")
    const uploadStart = addPhotoFilesBody.indexOf("'PHOTO_UPLOAD_START'")
    const dbInsertStart = addPhotoFilesBody.indexOf("'PHOTO_DB_INSERT_START'")
    const dbUpdateStart = addPhotoFilesBody.indexOf("'PHOTO_DB_UPDATE_START'")
    expect(picker).toBeGreaterThan(-1)
    expect(validation).toBeGreaterThan(picker)
    expect(uploadStart).toBeGreaterThan(validation)
    expect(dbInsertStart).toBeGreaterThan(uploadStart)
    expect(dbUpdateStart).toBeGreaterThan(dbInsertStart)
  })

  it('PHOTO_PICKER_SELECTED fires from a synchronous Array.from(files) copy, before any real await in the function — the FileList/event-reset lifecycle class', () => {
    const copyIdx = addPhotoFilesBody.indexOf('const incomingRaw = Array.from(files)')
    const logIdx = addPhotoFilesBody.indexOf("logPhotoUploadDiagnostic('PHOTO_PICKER_SELECTED'")
    // A real `await <expression>` in code, not the word "await" appearing
    // in this file's own explanatory prose comments above the copy line.
    const firstRealAwaitIdx = addPhotoFilesBody.search(/\bawait (supabase|loadPortfolio)/)
    expect(copyIdx).toBeGreaterThan(-1)
    expect(logIdx).toBeGreaterThan(copyIdx)
    expect(firstRealAwaitIdx).toBeGreaterThan(copyIdx)
  })

  it("the gallery input captures e.target.files into a local const BEFORE resetting e.target.value, so the reset can't clear what was already captured", () => {
    const idx = source.indexOf("<input type=\"file\" accept=\"image/*\" multiple disabled={busy}")
    const handlerBody = source.slice(idx, idx + 250)
    const filesIdx = handlerBody.indexOf('const files = e.target.files')
    const resetIdx = handlerBody.indexOf("e.target.value = ''")
    expect(filesIdx).toBeGreaterThan(-1)
    expect(resetIdx).toBeGreaterThan(filesIdx)
  })

  it('addPhotoFiles() wraps its upload loop in try/catch/finally — an unexpected exception can no longer escape as a silent, unhandled promise rejection', () => {
    expect(addPhotoFilesBody).toMatch(/\btry\s*\{/)
    expect(addPhotoFilesBody).toContain('} catch (unexpected) {')
    expect(addPhotoFilesBody).toContain('} finally {')
    expect(addPhotoFilesBody).toContain("logPhotoUploadDiagnostic('PHOTO_UNEXPECTED_EXCEPTION'")
    // busy is reset unconditionally in `finally`, not only on the happy path.
    const finallyIdx = addPhotoFilesBody.indexOf('} finally {')
    expect(addPhotoFilesBody.slice(finallyIdx, finallyIdx + 60)).toContain('setBusy(false)')
  })

  it('addProperty() gets the identical exception-safety net (same fire-and-forget call pattern, same previously-unguarded gap)', () => {
    expect(addPropertyBody).toMatch(/\btry\s*\{/)
    expect(addPropertyBody).toContain('} catch (unexpected) {')
    expect(addPropertyBody).toContain('} finally {')
    expect(addPropertyBody).toContain("logPhotoUploadDiagnostic('PHOTO_UNEXPECTED_EXCEPTION'")
  })

  it('both real upload call sites are invoked fire-and-forget with no .catch() — confirming the try/catch above is load-bearing, not redundant belt-and-suspenders', () => {
    expect(source).toContain('void addPhotoFiles(files)')
    expect(source).toContain('void addProperty()')
    expect(source).not.toMatch(/addPhotoFiles\([^)]*\)\.catch/)
    expect(source).not.toMatch(/addProperty\(\)\.catch/)
  })

  it('a storage/DB/exception failure on either upload path is surfaced through surfaceError(), which scrolls the page so the error banner is guaranteed visible even deep in a scrolled tab', () => {
    expect(source).toContain('function surfaceError(message: string)')
    const fnStart = source.indexOf('function surfaceError(message: string)')
    const fnBody = source.slice(fnStart, fnStart + 400)
    expect(fnBody).toContain('setError(message)')
    expect(fnBody).toContain('window.scrollTo(')
    // Both upload paths use it for their failure messages, not the raw setError().
    expect(addPhotoFilesBody).toMatch(/surfaceError\('Photo upload failed/)
    expect(addPropertyBody).toMatch(/surfaceError\('Property saved, but the cover photo/)
  })

  it('loadPortfolio() logs PHOTO_RELOAD_START/SUCCESS/ERROR, and PHOTO_RELOAD_SUCCESS reports the fresh count for the just-mutated property — not stale closure state', () => {
    const fnStart = source.indexOf('async function loadPortfolio()')
    const fnEnd = source.indexOf('function openAddProperty()')
    const fnBody = source.slice(fnStart, fnEnd)
    expect(fnBody).toContain("logPhotoUploadDiagnostic('PHOTO_RELOAD_START'")
    expect(fnBody).toContain("logPhotoUploadDiagnostic('PHOTO_RELOAD_SUCCESS'")
    expect(fnBody).toContain("logPhotoUploadDiagnostic('PHOTO_RELOAD_ERROR'")
    // Uses the freshly-fetched array (signedPhotos), not the `photos` state variable.
    expect(fnBody).toMatch(/totalPhotos: signedPhotos\.length/)
  })

  it("loadPortfolio()'s createSignedUrl() call now checks its own error instead of silently discarding it", () => {
    const fnStart = source.indexOf('async function loadPortfolio()')
    const fnEnd = source.indexOf('function openAddProperty()')
    const fnBody = source.slice(fnStart, fnEnd)
    expect(fnBody).toMatch(/const \{ data, error: signError \} = await client\.storage\.from\('property-photos'\)\.createSignedUrl/)
    expect(fnBody).toContain('if (signError)')
  })

  it('a dedicated effect logs PHOTO_RENDER_RESULT whenever the photos/selectedId state the gallery renders from changes — closing the loop between "DB write succeeded" and "the UI actually shows it"', () => {
    const idx = source.indexOf("logPhotoUploadDiagnostic('PHOTO_RENDER_RESULT'")
    expect(idx).toBeGreaterThan(-1)
    const effectStart = source.lastIndexOf('useEffect(', idx)
    const effectBody = source.slice(effectStart, idx + 300)
    expect(effectBody).toContain('galleryCount')
    expect(effectBody).toContain('withSignedUrl')
    expect(effectBody).toContain('[selectedId, photos]')
  })
})
