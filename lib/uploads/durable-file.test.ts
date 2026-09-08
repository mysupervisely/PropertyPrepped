import { describe, expect, it } from 'vitest'
import { beginReadingFileBytes, toDurableUploadableFile } from './durable-file'

// Upload Reliability V1.2 — real iPhone storage payload root-cause fix.
//
// This proves the ACTUAL byte-preservation guarantee toDurableUploadableFile()
// makes, using Node's real (spec-compliant) File/Blob implementation — not
// jsdom, which this repo deliberately doesn't use (see this file's sibling
// tests for the established convention). It does NOT and CANNOT reproduce
// the iOS Safari WebKit picker-resource-invalidation bug itself — that
// mechanism has no analog in Node (there is no native picker resource to
// invalidate). What IS provable here, and is the actual point of this
// module: once bytes are captured via beginReadingFileBytes(), the
// resulting durable File carries those EXACT bytes and the corrected
// content type, regardless of what happens to the original File
// afterward.

describe('beginReadingFileBytes / toDurableUploadableFile — byte preservation', () => {
  it('preserves every byte, for a real (non-empty) file', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 250, 251, 252, 253, 254, 255])
    const original = new File([bytes], 'photo.jpg', { type: 'image/jpeg' })
    const bytesPromise = beginReadingFileBytes(original)
    const durable = await toDurableUploadableFile(original, 'image/jpeg', bytesPromise)
    expect(durable.byteLength).toBe(bytes.length)
    expect(durable.file.size).toBe(bytes.length)
    const readBack = new Uint8Array(await durable.file.arrayBuffer())
    expect(Array.from(readBack)).toEqual(Array.from(bytes))
  })

  it('corrects a blank-reported content type onto the durable file, same as the original toUploadableImageFile() fix', async () => {
    const original = new File([new Uint8Array([9, 9, 9])], 'IMG_0001.HEIC', { type: '' })
    const bytesPromise = beginReadingFileBytes(original)
    const durable = await toDurableUploadableFile(original, 'image/heic', bytesPromise)
    expect(durable.file.type).toBe('image/heic')
    expect(durable.file.name).toBe('IMG_0001.HEIC')
  })

  it('falls back to the original file.type when no contentType correction is given', async () => {
    const original = new File([new Uint8Array([1])], 'doc.pdf', { type: 'application/pdf' })
    const durable = await toDurableUploadableFile(original, undefined, beginReadingFileBytes(original))
    expect(durable.file.type).toBe('application/pdf')
  })

  it('preserves bytes for a genuinely empty (0-byte) file — reports byteLength 0, not a false positive', async () => {
    const original = new File([], 'empty.jpg', { type: 'image/jpeg' })
    const durable = await toDurableUploadableFile(original, 'image/jpeg', beginReadingFileBytes(original))
    expect(original.size).toBe(0)
    expect(durable.byteLength).toBe(0)
  })

  it('the durable file is a NEW object, decoupled from the original — mutating/discarding the original reference cannot affect it', async () => {
    const bytes = new Uint8Array([7, 7, 7, 7])
    let original: File | null = new File([bytes], 'a.png', { type: 'image/png' })
    const bytesPromise = beginReadingFileBytes(original)
    const durable = await toDurableUploadableFile(original, 'image/png', bytesPromise)
    original = null // simulates the picker's resource going away
    const readBack = new Uint8Array(await durable.file.arrayBuffer())
    expect(Array.from(readBack)).toEqual([7, 7, 7, 7])
  })

  it('propagates a rejected bytesPromise as a rejection, never a silent empty file — callers must catch this (see upload-reliability-wiring.test.ts for every call site\'s try/catch)', async () => {
    const original = new File([new Uint8Array([1])], 'a.jpg', { type: 'image/jpeg' })
    const failingRead = Promise.reject(new Error('simulated WebkitBlobResource error'))
    await expect(toDurableUploadableFile(original, 'image/jpeg', failingRead)).rejects.toThrow('simulated WebkitBlobResource error')
  })
})

describe('beginReadingFileBytes — must be a plain, immediate call (not itself awaited by the caller before returning)', () => {
  it('returns a Promise synchronously, so callers can start it before doing anything else (including resetting an <input>\'s value)', () => {
    const file = new File([new Uint8Array([1, 2])], 'a.jpg', { type: 'image/jpeg' })
    const result = beginReadingFileBytes(file)
    expect(result).toBeInstanceOf(Promise)
  })
})
