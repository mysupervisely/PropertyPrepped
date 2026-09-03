import { describe, expect, it } from 'vitest'
import { validatePropertyPhotoFile, resolvePhotoContentType, toUploadableFile } from './validate'

describe('resolvePhotoContentType', () => {
  it('uses the browser-reported type when present', () => {
    expect(resolvePhotoContentType({ name: 'a.jpg', type: 'image/jpeg', size: 100 })).toBe('image/jpeg')
  })

  it('falls back to a guess from the file extension when type is empty (the real iOS HEIC case)', () => {
    expect(resolvePhotoContentType({ name: 'IMG_0001.HEIC', type: '', size: 100 })).toBe('image/heic')
    expect(resolvePhotoContentType({ name: 'photo.heif', type: '', size: 100 })).toBe('image/heif')
    expect(resolvePhotoContentType({ name: 'photo.png', type: '', size: 100 })).toBe('image/png')
  })

  it('is case-insensitive on the extension', () => {
    expect(resolvePhotoContentType({ name: 'photo.JPG', type: '', size: 100 })).toBe('image/jpeg')
  })

  it('returns undefined rather than guessing when there is no type and no recognizable extension', () => {
    expect(resolvePhotoContentType({ name: 'mystery-file', type: '', size: 100 })).toBeUndefined()
  })
})

describe('validatePropertyPhotoFile', () => {
  it('accepts a normal JPEG', () => {
    const result = validatePropertyPhotoFile({ name: 'house.jpg', type: 'image/jpeg', size: 204800 })
    expect(result.ok).toBe(true)
  })

  it('accepts a normal PNG', () => {
    expect(validatePropertyPhotoFile({ name: 'house.png', type: 'image/png', size: 204800 }).ok).toBe(true)
  })

  it('accepts an iOS HEIC file with an empty browser-reported type, resolving a real contentType for it', () => {
    const result = validatePropertyPhotoFile({ name: 'IMG_1234.HEIC', type: '', size: 3_500_000 })
    expect(result.ok).toBe(true)
    expect(result.ok && result.contentType).toBe('image/heic')
  })

  it('rejects a zero-byte file with a clear, specific reason, instead of letting an empty body reach Storage', () => {
    const result = validatePropertyPhotoFile({ name: 'house.jpg', type: 'image/jpeg', size: 0 })
    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toMatch(/empty \(0 bytes\)/)
  })

  it('rejects a file explicitly typed as something other than an image', () => {
    const result = validatePropertyPhotoFile({ name: 'notes.pdf', type: 'application/pdf', size: 5000 })
    expect(result.ok).toBe(false)
  })

  it('rejects a typeless file whose extension is not recognizable as an image, instead of silently dropping it', () => {
    const result = validatePropertyPhotoFile({ name: 'weird-upload', type: '', size: 5000 })
    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toMatch(/doesn't look like an image/)
  })

  it('never throws on an empty filename or missing extension', () => {
    expect(() => validatePropertyPhotoFile({ name: '', type: '', size: 100 })).not.toThrow()
  })
})

// Real File/Blob objects, not FileLike mocks — Node 22's global File/
// Blob/FormData/Request are spec-compliant, so these tests exercise
// actual byte-for-byte and wire-serialization behavior, not just typed
// interfaces. This is the "isolate the pure function so it can be
// tested with actual Blob/File inputs directly" coverage the iOS
// production-bug investigation asked for.
describe('toUploadableFile — the confirmed root-cause fix', () => {
  it('preserves the exact original bytes when rewrapping a typeless file', async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5])
    const original = new File([bytes], 'IMG_0001.HEIC', { type: '' })
    const fixed = toUploadableFile(original, 'image/heic')
    expect(fixed.size).toBe(original.size)
    const originalBytes = new Uint8Array(await original.arrayBuffer())
    const fixedBytes = new Uint8Array(await fixed.arrayBuffer())
    expect(Array.from(fixedBytes)).toEqual(Array.from(originalBytes))
  })

  it('sets the corrected type on the returned File', () => {
    const original = new File([new Uint8Array([1, 2, 3])], 'IMG_0001.HEIC', { type: '' })
    const fixed = toUploadableFile(original, 'image/heic')
    expect(fixed.type).toBe('image/heic')
    expect(fixed.name).toBe('IMG_0001.HEIC')
  })

  it('returns the SAME object (no unnecessary copy) when the type is already correct', () => {
    const original = new File([new Uint8Array([1, 2, 3])], 'house.jpg', { type: 'image/jpeg' })
    const fixed = toUploadableFile(original, 'image/jpeg')
    expect(fixed).toBe(original)
  })

  it('returns the original file unchanged when no contentType could be resolved', () => {
    const original = new File([new Uint8Array([1, 2, 3])], 'house.jpg', { type: 'image/jpeg' })
    const fixed = toUploadableFile(original, undefined)
    expect(fixed).toBe(original)
  })

  it('DEFINITIVE PROOF (not just SDK-source-reading): serializing the file directly into a real FormData/Request — the same construction @supabase/storage-js performs internally — shows the actual multipart Content-Type is "application/octet-stream" for a typeless file (NOT in the bucket\'s image/* allowlist), and is corrected to the real image type after toUploadableFile()', async () => {
    const original = new File([new Uint8Array([1, 2, 3, 4, 5])], 'IMG_0001.HEIC', { type: '' })

    const rawForm = new FormData()
    rawForm.append('', original)
    const rawBody = await new Request('http://example.com', { method: 'POST', body: rawForm }).text()
    expect(rawBody).toContain('Content-Type: application/octet-stream')
    expect(rawBody).not.toMatch(/Content-Type: image\//)

    const fixed = toUploadableFile(original, 'image/heic')
    const fixedForm = new FormData()
    fixedForm.append('', fixed)
    const fixedBody = await new Request('http://example.com', { method: 'POST', body: fixedForm }).text()
    expect(fixedBody).toContain('Content-Type: image/heic')
  })
})
