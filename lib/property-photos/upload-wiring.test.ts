import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Source-read regression guards for the property-photo upload fixes —
// M2.1 (Part 5) and the iOS production-bug follow-up — matching this
// repo's established no-jsdom source-string-match convention.

const source = readFileSync(join(__dirname, '..', '..', 'app', 'page.tsx'), 'utf8')

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
    const fnStart = source.indexOf('async function addPhotoFiles(')
    const fnEnd = source.indexOf('\n  }', source.indexOf('await loadPortfolio()', fnStart))
    const fnBody = source.slice(fnStart, fnEnd)
    expect(fnBody).not.toContain(".filter((file) => file.type.startsWith('image/'))")
    expect(fnBody).toContain('validatePropertyPhotoFile(file)')
    expect(fnBody).toContain('rejections.push(validation.reason)')
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
    const fnStart = source.indexOf('async function addProperty()')
    const fnEnd = source.indexOf('async function updateProperty()')
    const fnBody = source.slice(fnStart, fnEnd)
    expect(fnBody).toContain('toUploadableFile(coverFile, validation.contentType)')
    // The rewrapped object, not the raw coverFile, must be what's handed to .upload().
    expect(fnBody).toMatch(/\.upload\(path, uploadable,/)
  })

  it('addPhotoFiles() rewraps every incoming file with toUploadableFile() before it enters the upload queue', () => {
    const fnStart = source.indexOf('async function addPhotoFiles(')
    const fnEnd = source.indexOf('\n  }', source.indexOf('await loadPortfolio()', fnStart))
    const fnBody = source.slice(fnStart, fnEnd)
    expect(fnBody).toContain('toUploadableFile(file, validation.contentType)')
  })

  it('imports toUploadableFile from the shared validation module', () => {
    expect(source).toContain('toUploadableFile')
    expect(source).toMatch(/from '\.\.\/lib\/property-photos\/validate'/)
  })
})

describe('Property photo upload — DB-write failure after a successful storage upload is now checked', () => {
  it('addProperty(): the property_photos insert and the cover_photo_path update both check their own error (M2.1 checked neither)', () => {
    const fnStart = source.indexOf('async function addProperty()')
    const fnEnd = source.indexOf('async function updateProperty()')
    const fnBody = source.slice(fnStart, fnEnd)
    expect(fnBody).toMatch(/const \{ error: rowError \} = await supabase\.from\('property_photos'\)\.insert/)
    expect(fnBody).toMatch(/const \{ error: updateError \} = await supabase\.from\('properties'\)\.update\(\{ cover_photo_path: path \}\)/)
    // On a failed insert after a successful upload, the orphaned storage object is cleaned up.
    expect(fnBody).toMatch(/if \(rowError\) \{[\s\S]*?storage\.from\('property-photos'\)\.remove\(\[path\]\)/)
  })

  it('addPhotoFiles(): the cover_photo_path update (previously entirely unchecked) now checks its own error', () => {
    const fnStart = source.indexOf('async function addPhotoFiles(')
    const fnEnd = source.indexOf('\n  }', source.indexOf('await loadPortfolio()', fnStart))
    const fnBody = source.slice(fnStart, fnEnd)
    expect(fnBody).toMatch(/const \{ error: updateError \} = await supabase\.from\('properties'\)\.update\(\{ cover_photo_path: path \}\)/)
    expect(fnBody).toContain('if (updateError)')
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
  it('imports the diagnostics logger and calls it at each real stage of both upload paths', () => {
    expect(source).toContain("import { logPhotoUploadDiagnostic, safeFileSummary } from '../lib/property-photos/diagnostics'")
    for (const stage of ['file_selected', 'validation_result', 'upload_start', 'upload_result', 'db_update_result']) {
      expect(source).toContain(`'${stage}'`)
    }
  })
})
