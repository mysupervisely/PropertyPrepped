import { describe, expect, it, vi, afterEach } from 'vitest'
import { fileExtension, safeFileSummary, safeFileListSummary, safeErrorSummary, logPhotoUploadDiagnostic } from './diagnostics'

describe('fileExtension', () => {
  it('extracts the extension, lowercased, with the dot', () => {
    expect(fileExtension('IMG_0001.HEIC')).toBe('.heic')
    expect(fileExtension('house.JPG')).toBe('.jpg')
  })

  it('returns "(none)" when there is no extension', () => {
    expect(fileExtension('mystery-file')).toBe('(none)')
  })
})

describe('safeFileSummary', () => {
  it('never includes the full filename — extension only', () => {
    const summary = safeFileSummary({ name: '2026 Lease - Jane Doe.jpg', type: 'image/jpeg', size: 1000 })
    expect(summary.extension).toBe('.jpg')
    expect(JSON.stringify(summary)).not.toContain('Jane Doe')
  })

  it('reports "(empty)" for a blank type rather than an empty string, so it is visually obvious in logs', () => {
    expect(safeFileSummary({ name: 'a.heic', type: '', size: 100 }).type).toBe('(empty)')
  })

  it('reports size and File-vs-Blob correctly (PHOTO_PICKER_SELECTED asks for both instanceof checks)', () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'a.jpg', { type: 'image/jpeg' })
    const summary = safeFileSummary(file)
    expect(summary.size).toBe(3)
    expect(summary.isFile).toBe(true)
    expect(summary.isBlob).toBe(true) // every File is also a Blob
    const blob = new Blob([new Uint8Array([1, 2])], { type: 'image/jpeg' })
    const blobSummary = safeFileSummary(blob)
    expect(blobSummary.isFile).toBe(false)
    expect(blobSummary.isBlob).toBe(true)
  })
})

describe('safeFileListSummary', () => {
  it('reports file count and one safe summary per file, in order', () => {
    const a = new File([new Uint8Array([1])], 'IMG_0001.HEIC', { type: '' })
    const b = new File([new Uint8Array([1, 2])], 'house.jpg', { type: 'image/jpeg' })
    const summary = safeFileListSummary([a, b])
    expect(summary.fileCount).toBe(2)
    expect(summary.files).toHaveLength(2)
    expect(summary.files[0].extension).toBe('.heic')
    expect(summary.files[1].extension).toBe('.jpg')
  })

  it('handles an empty selection (e.g. the user cancelled the picker) without throwing', () => {
    expect(() => safeFileListSummary([])).not.toThrow()
    expect(safeFileListSummary([]).fileCount).toBe(0)
  })
})

describe('safeErrorSummary', () => {
  it('extracts message/code/status from a Supabase-shaped error object', () => {
    expect(safeErrorSummary({ message: 'Bucket not found', statusCode: 404 })).toEqual({ message: 'Bucket not found', status: 404 })
    expect(safeErrorSummary({ message: 'duplicate key value', code: '23505' })).toEqual({ message: 'duplicate key value', code: '23505' })
  })

  it('falls back to String(error) for a non-object throw (e.g. a raw string or number)', () => {
    expect(safeErrorSummary('network down')?.message).toBe('network down')
  })

  it('returns undefined for a null/undefined error, so callers can spread it safely', () => {
    expect(safeErrorSummary(null)).toBeUndefined()
    expect(safeErrorSummary(undefined)).toBeUndefined()
  })

  it('never leaks anything beyond message/code/status — no stack traces or nested request/response internals', () => {
    const error = { message: 'failed', stack: 'at internal (secret/path.ts:1:1)', request: { headers: { authorization: 'Bearer secret' } } }
    const summary = safeErrorSummary(error)
    expect(JSON.stringify(summary)).not.toContain('secret')
    expect(JSON.stringify(summary)).not.toContain('Bearer')
  })
})

describe('logPhotoUploadDiagnostic', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('logs nothing in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const spy = vi.fn()
    vi.stubGlobal('console', { ...console, log: spy })
    logPhotoUploadDiagnostic('upload_start', { bucket: 'property-photos' })
    expect(spy).not.toHaveBeenCalled()
  })

  it('logs in development, never throws even without a browser navigator', () => {
    vi.stubEnv('NODE_ENV', 'development')
    const spy = vi.fn()
    vi.stubGlobal('console', { ...console, log: spy })
    expect(() => logPhotoUploadDiagnostic('upload_start', { bucket: 'property-photos' })).not.toThrow()
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0]).toBe('[property-photo:upload_start]')
  })
})
