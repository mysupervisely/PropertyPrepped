import { describe, expect, it, vi } from 'vitest'
import { uploadReceiptDocument, type UploadReceiptDeps } from './upload-receipt'

function fakeDeps(overrides: Partial<UploadReceiptDeps> = {}): UploadReceiptDeps {
  return {
    uploadFile: vi.fn(async () => ({ error: null })),
    insertDocumentRow: vi.fn(async () => ({ id: 'doc-1', error: null })),
    removeFile: vi.fn(async () => undefined),
    ...overrides,
  }
}

describe('uploadReceiptDocument — the happy path', () => {
  it('uploads to the property-documents-equivalent path, inserts a Receipts-category row, and returns its id', async () => {
    const deps = fakeDeps()
    const file = new File([new Uint8Array([1, 2, 3])], 'receipt.jpg', { type: 'image/jpeg' })
    const result = await uploadReceiptDocument('owner-1', 'prop-1', file, deps)
    expect(result).toEqual({ ok: true, documentId: 'doc-1' })
    expect(deps.uploadFile).toHaveBeenCalledTimes(1)
    const [path] = (deps.uploadFile as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(path).toMatch(/^owner-1\/prop-1\/documents\/[0-9a-f-]+-receipt\.jpg$/)
    expect(deps.insertDocumentRow).toHaveBeenCalledWith(expect.objectContaining({
      owner_id: 'owner-1', property_id: 'prop-1', name: 'receipt.jpg', category: 'Receipts',
    }))
    expect(deps.removeFile).not.toHaveBeenCalled()
  })

  it('corrects an empty-type iOS-shaped image file before upload — the confirmed root-cause fix reused, not reinvented', async () => {
    const deps = fakeDeps()
    const file = new File([new Uint8Array([1, 2, 3])], 'IMG_0001.HEIC', { type: '' })
    await uploadReceiptDocument('owner-1', 'prop-1', file, deps)
    const [, uploadedFile, contentType] = (deps.uploadFile as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(contentType).toBe('image/heic')
    expect(uploadedFile.type).toBe('image/heic')
  })

  it('leaves a non-image file (e.g. a PDF receipt) completely untouched — no image-correction logic applied to it', async () => {
    const deps = fakeDeps()
    const file = new File([new Uint8Array([1, 2, 3])], 'receipt.pdf', { type: 'application/pdf' })
    await uploadReceiptDocument('owner-1', 'prop-1', file, deps)
    const [, uploadedFile] = (deps.uploadFile as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(uploadedFile).toBe(file)
  })
})

describe('uploadReceiptDocument — failure handling', () => {
  it('a Storage upload failure returns the error and never attempts the DB insert', async () => {
    const deps = fakeDeps({ uploadFile: vi.fn(async () => ({ error: 'network error' })) })
    const file = new File([new Uint8Array([1])], 'receipt.jpg', { type: 'image/jpeg' })
    const result = await uploadReceiptDocument('owner-1', 'prop-1', file, deps)
    expect(result).toEqual({ ok: false, error: 'network error' })
    expect(deps.insertDocumentRow).not.toHaveBeenCalled()
  })

  it('a DB insert failure after a successful upload cleans up the orphaned Storage object', async () => {
    const deps = fakeDeps({ insertDocumentRow: vi.fn(async () => ({ id: null, error: 'insert failed' })) })
    const file = new File([new Uint8Array([1])], 'receipt.jpg', { type: 'image/jpeg' })
    const result = await uploadReceiptDocument('owner-1', 'prop-1', file, deps)
    expect(result).toEqual({ ok: false, error: 'insert failed' })
    expect(deps.removeFile).toHaveBeenCalledTimes(1)
  })

  it('a missing id with no error still cleans up and reports a safe fallback message, never crashes', async () => {
    const deps = fakeDeps({ insertDocumentRow: vi.fn(async () => ({ id: null, error: null })) })
    const file = new File([new Uint8Array([1])], 'receipt.jpg', { type: 'image/jpeg' })
    const result = await uploadReceiptDocument('owner-1', 'prop-1', file, deps)
    expect(result.ok).toBe(false)
    expect(deps.removeFile).toHaveBeenCalledTimes(1)
  })
})
