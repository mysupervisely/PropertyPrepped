import { describe, expect, it } from 'vitest'
import { validatePropertyPhotoFile, resolvePhotoContentType } from './validate'

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
