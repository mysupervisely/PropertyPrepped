import { describe, expect, it, vi, afterEach } from 'vitest'
import { fileExtension, safeErrorSummary, logUploadDiagnostic, initialUploadDebugState } from './diagnostics'

describe('fileExtension', () => {
  it('extracts the extension, lowercased, with the dot', () => {
    expect(fileExtension('IMG_0001.HEIC')).toBe('.heic')
    expect(fileExtension('house.JPG')).toBe('.jpg')
  })

  it('returns "(none)" when there is no extension', () => {
    expect(fileExtension('mystery-file')).toBe('(none)')
  })
})

describe('safeErrorSummary', () => {
  it('extracts message/code/status from a Supabase-shaped error', () => {
    expect(safeErrorSummary({ message: 'Bucket not found', statusCode: 404 })).toEqual({ message: 'Bucket not found', status: 404 })
  })

  it('returns undefined for null/undefined', () => {
    expect(safeErrorSummary(null)).toBeUndefined()
    expect(safeErrorSummary(undefined)).toBeUndefined()
  })

  it('never leaks stack traces or nested request internals', () => {
    const error = { message: 'failed', stack: 'at internal (secret.ts:1:1)', request: { headers: { authorization: 'Bearer secret' } } }
    const summary = safeErrorSummary(error)
    expect(JSON.stringify(summary)).not.toContain('secret')
  })
})

describe('logUploadDiagnostic', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('logs nothing in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const spy = vi.fn()
    vi.stubGlobal('console', { ...console, log: spy })
    logUploadDiagnostic('profile-photo', 'UPLOAD_STORAGE_START', {})
    expect(spy).not.toHaveBeenCalled()
  })

  it('logs in development, tagged with the flow and stage', () => {
    vi.stubEnv('NODE_ENV', 'development')
    const spy = vi.fn()
    vi.stubGlobal('console', { ...console, log: spy })
    logUploadDiagnostic('smart-upload', 'UPLOAD_STORAGE_START', { path: 'x' })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0]).toBe('[upload:smart-upload:UPLOAD_STORAGE_START]')
  })
})

describe('initialUploadDebugState', () => {
  it('starts every stage pending, never leaks the full filename', () => {
    const state = initialUploadDebugState({ name: '2026 Passport - Jane Doe.jpg', type: 'image/jpeg' })
    expect(state.fileReceived).toBe(true)
    expect(state.extension).toBe('.jpg')
    expect(JSON.stringify(state)).not.toContain('Jane Doe')
    expect(state.validation).toBe('pending')
    expect(state.storageUpload).toBe('pending')
    expect(state.databaseRecord).toBe('pending')
    expect(state.renderUrl).toBe('pending')
  })

  it('reports "(empty)" for a blank type', () => {
    expect(initialUploadDebugState({ name: 'a.heic', type: '' }).reportedMime).toBe('(empty)')
  })
})
