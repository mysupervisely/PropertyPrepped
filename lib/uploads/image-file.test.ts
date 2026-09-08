import { describe, expect, it } from 'vitest'
import { resolveImageContentType, validateImageFile, toUploadableImageFile } from './image-file'

// Upload Reliability Audit — real File/Blob/FormData/Request objects
// (Node 22 globals), same "DEFINITIVE PROOF" technique
// lib/property-photos/validate.test.ts established, since this module
// is a generalization of that one's confirmed fix.

describe('resolveImageContentType', () => {
  it('uses the browser-reported type when present', () => {
    expect(resolveImageContentType({ name: 'a.jpg', type: 'image/jpeg', size: 100 })).toBe('image/jpeg')
  })

  it('falls back to a guess from the file extension when type is empty (the real iOS behavior this whole audit is about)', () => {
    expect(resolveImageContentType({ name: 'IMG_0001.HEIC', type: '', size: 100 })).toBe('image/heic')
    expect(resolveImageContentType({ name: 'photo.PNG', type: '', size: 100 })).toBe('image/png')
    expect(resolveImageContentType({ name: 'photo.JPG', type: '', size: 100 })).toBe('image/jpeg')
    expect(resolveImageContentType({ name: 'photo.jpeg', type: '', size: 100 })).toBe('image/jpeg')
    expect(resolveImageContentType({ name: 'photo.heif', type: '', size: 100 })).toBe('image/heif')
  })

  it('returns undefined rather than guessing when there is no type and no recognizable extension', () => {
    expect(resolveImageContentType({ name: 'mystery-file', type: '', size: 100 })).toBeUndefined()
  })
})

describe('validateImageFile', () => {
  it('accepts JPEG, PNG', () => {
    expect(validateImageFile({ name: 'house.jpg', type: 'image/jpeg', size: 204800 }).ok).toBe(true)
    expect(validateImageFile({ name: 'house.png', type: 'image/png', size: 204800 }).ok).toBe(true)
  })

  it('accepts a blank-MIME .JPG/.PNG file — the exact case app/profile/page.tsx used to reject outright with "Choose an image file"', () => {
    const jpg = validateImageFile({ name: 'IMG_0001.JPG', type: '', size: 204800 })
    expect(jpg.ok).toBe(true)
    expect(jpg.ok && jpg.contentType).toBe('image/jpeg')
    const png = validateImageFile({ name: 'Screenshot.PNG', type: '', size: 204800 })
    expect(png.ok).toBe(true)
    expect(png.ok && png.contentType).toBe('image/png')
  })

  it('accepts a blank-MIME HEIC file, resolving a real contentType for it', () => {
    const result = validateImageFile({ name: 'IMG_1234.HEIC', type: '', size: 3_500_000 })
    expect(result.ok).toBe(true)
    expect(result.ok && result.contentType).toBe('image/heic')
  })

  it('rejects a zero-byte file with a clear, specific reason', () => {
    const result = validateImageFile({ name: 'house.jpg', type: 'image/jpeg', size: 0 })
    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toMatch(/empty \(0 bytes\)/)
  })

  it('rejects a file explicitly typed as something other than an image', () => {
    expect(validateImageFile({ name: 'notes.pdf', type: 'application/pdf', size: 5000 }).ok).toBe(false)
  })

  it('rejects a typeless file whose extension is not recognizable as an image', () => {
    const result = validateImageFile({ name: 'weird-upload', type: '', size: 5000 })
    expect(result.ok).toBe(false)
    expect(!result.ok && result.reason).toMatch(/doesn't look like an image/)
  })

  it('never throws on an empty filename', () => {
    expect(() => validateImageFile({ name: '', type: '', size: 100 })).not.toThrow()
  })
})

describe('toUploadableImageFile — the confirmed shared root-cause fix, applied to every flow that upload real images', () => {
  it('preserves the exact original bytes when rewrapping a typeless file', async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5])
    const original = new File([bytes], 'IMG_0001.JPG', { type: '' })
    const fixed = toUploadableImageFile(original, 'image/jpeg')
    expect(fixed.size).toBe(original.size)
    expect(Array.from(new Uint8Array(await fixed.arrayBuffer()))).toEqual(Array.from(bytes))
  })

  it('sets the corrected type on the returned File', () => {
    const original = new File([new Uint8Array([1, 2, 3])], 'Screenshot.PNG', { type: '' })
    const fixed = toUploadableImageFile(original, 'image/png')
    expect(fixed.type).toBe('image/png')
    expect(fixed.name).toBe('Screenshot.PNG')
  })

  it('returns the SAME object when the type is already correct', () => {
    const original = new File([new Uint8Array([1, 2, 3])], 'house.jpg', { type: 'image/jpeg' })
    expect(toUploadableImageFile(original, 'image/jpeg')).toBe(original)
  })

  it('returns the original file unchanged when no contentType could be resolved', () => {
    const original = new File([new Uint8Array([1, 2, 3])], 'house.jpg', { type: 'image/jpeg' })
    expect(toUploadableImageFile(original, undefined)).toBe(original)
  })

  it('DEFINITIVE PROOF: serializing into a real FormData/Request — the same construction @supabase/storage-js performs internally — shows the actual multipart Content-Type is "application/octet-stream" for a typeless file, corrected after toUploadableImageFile()', async () => {
    const original = new File([new Uint8Array([1, 2, 3, 4, 5])], 'IMG_0001.PNG', { type: '' })

    const rawForm = new FormData()
    rawForm.append('', original)
    const rawBody = await new Request('http://example.com', { method: 'POST', body: rawForm }).text()
    expect(rawBody).toContain('Content-Type: application/octet-stream')

    const fixed = toUploadableImageFile(original, 'image/png')
    const fixedForm = new FormData()
    fixedForm.append('', fixed)
    const fixedBody = await new Request('http://example.com', { method: 'POST', body: fixedForm }).text()
    expect(fixedBody).toContain('Content-Type: image/png')
  })
})
