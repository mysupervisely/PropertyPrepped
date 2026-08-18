import { describe, expect, it } from 'vitest'
import { isSupportedForSmartUpload } from './supported-file-types'

describe('isSupportedForSmartUpload — SMART UPLOAD unsupported file', () => {
  it('accepts PDF, JPEG, PNG, WEBP by mime type', () => {
    expect(isSupportedForSmartUpload({ type: 'application/pdf', name: 'lease.pdf' })).toBe(true)
    expect(isSupportedForSmartUpload({ type: 'image/jpeg', name: 'receipt.jpg' })).toBe(true)
    expect(isSupportedForSmartUpload({ type: 'image/png', name: 'receipt.png' })).toBe(true)
    expect(isSupportedForSmartUpload({ type: 'image/webp', name: 'receipt.webp' })).toBe(true)
  })

  it('rejects an unsupported mime type (e.g. Word, HEIC)', () => {
    expect(isSupportedForSmartUpload({ type: 'application/msword', name: 'notes.doc' })).toBe(false)
    expect(isSupportedForSmartUpload({ type: 'image/heic', name: 'IMG_0001.heic' })).toBe(false)
  })

  it('falls back to extension when the browser reports no mime type', () => {
    expect(isSupportedForSmartUpload({ type: '', name: 'lease.pdf' })).toBe(true)
    expect(isSupportedForSmartUpload({ type: '', name: 'weird-file.xyz' })).toBe(false)
  })
})
