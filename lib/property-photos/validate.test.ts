import { describe, expect, it } from 'vitest'
import { validatePropertyPhotoFile, resolvePhotoContentType, toUploadableFile, classifyPhotoSelection, isFirstCoverPhoto } from './validate'

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

// V2 (post-selection-failure investigation): the real gallery flow
// hands addPhotoFiles() a multi-file selection, not one file at a time
// — these exercise classifyPhotoSelection() with real File[] batches,
// covering the exact iOS-shaped file variations from the brief (blank
// MIME, image/heic, image/heif, JPEG, PNG, zero-byte) together in one
// selection, which single-file tests above can't reach.
describe('classifyPhotoSelection — real multi-file batches, as addPhotoFiles() actually receives them', () => {
  it('a single valid JPEG is accepted with no rejection message (item: valid File reaches upload)', () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'house.jpg', { type: 'image/jpeg' })
    const result = classifyPhotoSelection([file])
    expect(result.accepted).toHaveLength(1)
    expect(result.accepted[0].file).toBe(file)
    expect(result.rejectionMessage).toBe('')
  })

  it('accepts a batch mixing every real iOS/browser MIME-type shape in one selection: blank type, image/heic, image/heif, JPEG, PNG', () => {
    const blank = new File([new Uint8Array([1])], 'IMG_0001.HEIC', { type: '' })
    const heic = new File([new Uint8Array([1])], 'IMG_0002.HEIC', { type: 'image/heic' })
    const heif = new File([new Uint8Array([1])], 'IMG_0003.HEIF', { type: 'image/heif' })
    const jpeg = new File([new Uint8Array([1])], 'house.jpg', { type: 'image/jpeg' })
    const png = new File([new Uint8Array([1])], 'screenshot.png', { type: 'image/png' })
    const result = classifyPhotoSelection([blank, heic, heif, jpeg, png])
    expect(result.accepted).toHaveLength(5)
    expect(result.rejectionMessage).toBe('')
    // The blank-type file was corrected — this is the exact object that
    // must reach .upload(), byte-identical, with a real Content-Type.
    expect(result.accepted[0].file.type).toBe('image/heic')
    expect(result.accepted[0].file).not.toBe(blank) // rewrapped, since its type changed
    expect(result.accepted[0].contentType).toBe('image/heic')
    // A file whose type was already correct is NOT needlessly rewrapped.
    expect(result.accepted[3].file).toBe(jpeg)
  })

  it('a zero-byte file (nonzero File remains nonzero after normalization, zero-byte rejected) is rejected with a clear reason, and does not block other valid files in the same batch', () => {
    const zeroByte = new File([], 'IMG_0004.HEIC', { type: '' })
    const valid = new File([new Uint8Array([1, 2, 3])], 'house.jpg', { type: 'image/jpeg' })
    const result = classifyPhotoSelection([zeroByte, valid])
    expect(result.accepted).toHaveLength(1)
    expect(result.accepted[0].file).toBe(valid)
    expect(result.accepted[0].file.size).toBeGreaterThan(0)
    expect(result.rejectionMessage).toMatch(/empty \(0 bytes\)/)
  })

  it('a selection with only rejected files leaves the gallery in its empty state (accepted is empty, rejection message present)', () => {
    const zeroByte = new File([], 'broken.jpg', { type: 'image/jpeg' })
    const result = classifyPhotoSelection([zeroByte])
    expect(result.accepted).toHaveLength(0)
    expect(result.rejectionMessage.length).toBeGreaterThan(0)
  })

  it('selecting the same File object twice in one batch (same file selected twice) processes both independently — no dedup, no shared mutable state', () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'house.jpg', { type: 'image/jpeg' })
    const result = classifyPhotoSelection([file, file])
    expect(result.accepted).toHaveLength(2)
    expect(result.accepted[0].file).toBe(result.accepted[1].file)
  })

  it('results carries one validation outcome per input file, in order — what addPhotoFiles() logs PHOTO_VALIDATION_RESULT from', () => {
    const good = new File([new Uint8Array([1])], 'house.jpg', { type: 'image/jpeg' })
    const bad = new File([], 'broken.jpg', { type: 'image/jpeg' })
    const result = classifyPhotoSelection([good, bad])
    expect(result.results).toHaveLength(2)
    expect(result.results[0].validation.ok).toBe(true)
    expect(result.results[1].validation.ok).toBe(false)
  })
})

describe('isFirstCoverPhoto', () => {
  it('the first photo in a batch becomes the cover when the property has no existing cover', () => {
    expect(isFirstCoverPhoto(false, 0)).toBe(true)
  })

  it('later photos in the same batch never become the cover, even without an existing one', () => {
    expect(isFirstCoverPhoto(false, 1)).toBe(false)
    expect(isFirstCoverPhoto(false, 2)).toBe(false)
  })

  it('no photo in the batch becomes the cover when the property already has one (existing cover plus new gallery photo)', () => {
    expect(isFirstCoverPhoto(true, 0)).toBe(false)
    expect(isFirstCoverPhoto(true, 1)).toBe(false)
  })
})
