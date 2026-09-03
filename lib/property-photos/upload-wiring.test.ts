import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// M2.1 review pass (Part 5) — source-read regression guards for the
// property-photo upload fix, matching this repo's established no-jsdom
// source-string-match convention.

const source = readFileSync(join(__dirname, '..', '..', 'app', 'page.tsx'), 'utf8')

describe('Property photo upload fix (Part 5 review pass)', () => {
  it('handleImage validates the picked cover photo and surfaces a rejection instead of silently accepting/dropping it', () => {
    const fnStart = source.indexOf('const handleImage = ')
    const fnBody = source.slice(fnStart, fnStart + 500)
    expect(fnBody).toContain('validatePropertyPhotoFile(file)')
    expect(fnBody).toContain('setError(validation.reason)')
  })

  it('handleImage resets the file input value after reading the file, so re-selecting the same file fires change again', () => {
    const fnStart = source.indexOf('const handleImage = ')
    const fnBody = source.slice(fnStart, fnStart + 500)
    expect(fnBody).toContain("e.target.value = ''")
  })

  it('addProperty() no longer silently swallows a cover-photo upload failure — the property still saves, but the failure is now shown', () => {
    const fnStart = source.indexOf('async function addProperty()')
    const fnEnd = source.indexOf('async function updateProperty()')
    const fnBody = source.slice(fnStart, fnEnd)
    expect(fnBody).toContain('validatePropertyPhotoFile(coverFile)')
    expect(fnBody).toMatch(/setError\(`Property saved, but the cover photo could not be uploaded/)
  })

  it('addPhotoFiles() no longer filters incoming files with the old file.type.startsWith(\'image/\') check, which silently dropped empty-type (iOS HEIC) files', () => {
    const fnStart = source.indexOf('async function addPhotoFiles(')
    const fnEnd = source.indexOf('\n  }', source.indexOf('await loadPortfolio()', fnStart))
    const fnBody = source.slice(fnStart, fnEnd)
    expect(fnBody).not.toContain(".filter((file) => file.type.startsWith('image/'))")
    expect(fnBody).toContain('validatePropertyPhotoFile(file)')
    expect(fnBody).toContain('rejections.push(validation.reason)')
  })

  it('both property-photo upload call sites use a resolved contentType (never a bare possibly-empty file.type)', () => {
    const uploadCalls = source.match(/storage\.from\('property-photos'\)\.upload\([^)]*\)/g) ?? []
    const uploadInserts = uploadCalls.filter((c) => c.includes('upsert'))
    expect(uploadInserts.length).toBeGreaterThanOrEqual(2)
    for (const call of uploadInserts) {
      expect(call).not.toMatch(/contentType:\s*(coverFile\.type|file\.type)\b/)
    }
  })

  it('the gallery photo-upload input resets its value after each selection', () => {
    const idx = source.indexOf("<input type=\"file\" accept=\"image/*\" multiple disabled={busy}")
    expect(idx).toBeGreaterThan(-1)
    expect(source.slice(idx, idx + 250)).toContain("e.target.value = ''")
  })

  it('imports the shared validation module rather than re-implementing the check inline in more than one place', () => {
    expect(source).toContain("import { validatePropertyPhotoFile } from '../lib/property-photos/validate'")
  })

  it('still uses the existing property-photos bucket and property_photos table — no new storage system was introduced', () => {
    expect(source).toContain("storage.from('property-photos')")
    expect(source).toContain("from('property_photos')")
    expect(source).not.toMatch(/storage\.from\(['"](?!property-documents|property-photos|tenant-connect-attachments)/)
  })
})
