import { describe, expect, it, vi, afterEach } from 'vitest'
import { fileExtension, safeFileSummary, logPhotoUploadDiagnostic } from './diagnostics'

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

  it('reports size and File-vs-Blob correctly', () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'a.jpg', { type: 'image/jpeg' })
    const summary = safeFileSummary(file)
    expect(summary.size).toBe(3)
    expect(summary.isFile).toBe(true)
    const blob = new Blob([new Uint8Array([1, 2])], { type: 'image/jpeg' })
    expect(safeFileSummary(blob).isFile).toBe(false)
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
