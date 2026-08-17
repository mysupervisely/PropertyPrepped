import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StreetViewImageProvider } from './street-view'
import type { PropertyImageLocation } from '../types'

const location: PropertyImageLocation = { formattedAddress: '123 Main St, Miami, FL 33101', latitude: null, longitude: null }
const geoLocation: PropertyImageLocation = { formattedAddress: '123 Main St, Miami, FL 33101', latitude: 25.77, longitude: -80.19 }

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: () => Promise.resolve(body) } as Response
}

describe('StreetViewImageProvider', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('checkAvailability', () => {
    it('returns available:true with the panoId when Google reports OK', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'OK', pano_id: 'abc123' }))
      const provider = new StreetViewImageProvider('test-key')
      const result = await provider.checkAvailability(location)
      expect(result).toEqual({ available: true, panoId: 'abc123' })
    })

    it('returns available:false, reason:no_imagery on ZERO_RESULTS', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'ZERO_RESULTS' }))
      const provider = new StreetViewImageProvider('test-key')
      expect(await provider.checkAvailability(location)).toEqual({ available: false, reason: 'no_imagery' })
    })

    it('returns available:false, reason:no_imagery on NOT_FOUND', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'NOT_FOUND' }))
      const provider = new StreetViewImageProvider('test-key')
      expect(await provider.checkAvailability(location)).toEqual({ available: false, reason: 'no_imagery' })
    })

    it('returns provider_error on a Google-side error status (e.g. REQUEST_DENIED — bad/missing key)', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'REQUEST_DENIED' }))
      const provider = new StreetViewImageProvider('bad-key')
      expect(await provider.checkAvailability(location)).toEqual({ available: false, reason: 'provider_error' })
    })

    it('returns provider_error on a malformed address the API rejects (INVALID_REQUEST)', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'INVALID_REQUEST' }))
      const provider = new StreetViewImageProvider('test-key')
      const malformed: PropertyImageLocation = { formattedAddress: '###not-an-address###', latitude: null, longitude: null }
      expect(await provider.checkAvailability(malformed)).toEqual({ available: false, reason: 'provider_error' })
    })

    it('returns provider_error on an HTTP-level metadata API error', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({}, false, 500))
      const provider = new StreetViewImageProvider('test-key')
      expect(await provider.checkAvailability(location)).toEqual({ available: false, reason: 'provider_error' })
    })

    it('returns provider_error on a network failure / timeout (fetch rejects)', async () => {
      fetchMock.mockRejectedValueOnce(new Error('network timeout'))
      const provider = new StreetViewImageProvider('test-key')
      expect(await provider.checkAvailability(location)).toEqual({ available: false, reason: 'provider_error' })
    })

    it('never logs or leaks the API key on error', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      fetchMock.mockRejectedValueOnce(new Error('boom'))
      const provider = new StreetViewImageProvider('super-secret-key')
      await provider.checkAvailability(location)
      const loggedText = errorSpy.mock.calls.flat().join(' ')
      expect(loggedText).not.toContain('super-secret-key')
      errorSpy.mockRestore()
    })

    it('uses "lat,lng" as the location param when coordinates are available (Part 11)', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'OK', pano_id: 'geo1' }))
      const provider = new StreetViewImageProvider('test-key')
      await provider.checkAvailability(geoLocation)
      const calledUrl = new URL(fetchMock.mock.calls[0][0] as string)
      expect(calledUrl.searchParams.get('location')).toBe('25.77,-80.19')
    })

    it('falls back to the formatted address when no coordinates are available', async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ status: 'OK', pano_id: 'addr1' }))
      const provider = new StreetViewImageProvider('test-key')
      await provider.checkAvailability(location)
      const calledUrl = new URL(fetchMock.mock.calls[0][0] as string)
      expect(calledUrl.searchParams.get('location')).toBe('123 Main St, Miami, FL 33101')
    })
  })

  describe('fetchImageBytes', () => {
    function imageResponse(bytes: Uint8Array, ok = true, status = 200) {
      return {
        ok, status,
        headers: { get: (name: string) => (name === 'content-type' ? 'image/jpeg' : null) },
        arrayBuffer: () => Promise.resolve(bytes.buffer),
      } as unknown as Response
    }

    it('returns image bytes + contentType + attribution text on success', async () => {
      const bytes = new Uint8Array([1, 2, 3, 4])
      fetchMock.mockResolvedValueOnce(imageResponse(bytes))
      const provider = new StreetViewImageProvider('test-key')
      const result = await provider.fetchImageBytes(location, 'abc123')
      expect(result).toEqual({ ok: true, contentType: 'image/jpeg', bytes, attributionText: 'Street View imagery © Google' })
    })

    it('uses pano=<panoId> rather than re-resolving location, when a panoId is supplied', async () => {
      fetchMock.mockResolvedValueOnce(imageResponse(new Uint8Array([1])))
      const provider = new StreetViewImageProvider('test-key')
      await provider.fetchImageBytes(location, 'the-pano-id')
      const calledUrl = new URL(fetchMock.mock.calls[0][0] as string)
      expect(calledUrl.searchParams.get('pano')).toBe('the-pano-id')
      expect(calledUrl.searchParams.has('location')).toBe(false)
    })

    it('falls back to location when no panoId is supplied', async () => {
      fetchMock.mockResolvedValueOnce(imageResponse(new Uint8Array([1])))
      const provider = new StreetViewImageProvider('test-key')
      await provider.fetchImageBytes(location, null)
      const calledUrl = new URL(fetchMock.mock.calls[0][0] as string)
      expect(calledUrl.searchParams.get('location')).toBe('123 Main St, Miami, FL 33101')
    })

    it('returns provider_error on a Static Image API HTTP error (e.g. quota exceeded)', async () => {
      fetchMock.mockResolvedValueOnce(imageResponse(new Uint8Array(), false, 403))
      const provider = new StreetViewImageProvider('test-key')
      expect(await provider.fetchImageBytes(location, 'abc123')).toEqual({ ok: false, reason: 'provider_error' })
    })

    it('returns provider_error on a network failure', async () => {
      fetchMock.mockRejectedValueOnce(new Error('network down'))
      const provider = new StreetViewImageProvider('test-key')
      expect(await provider.fetchImageBytes(location, 'abc123')).toEqual({ ok: false, reason: 'provider_error' })
    })

    it('never includes the API key in the URL sent to the caller-visible result', async () => {
      const bytes = new Uint8Array([9])
      fetchMock.mockResolvedValueOnce(imageResponse(bytes))
      const provider = new StreetViewImageProvider('super-secret-key')
      const result = await provider.fetchImageBytes(location, 'abc123')
      expect(JSON.stringify(result)).not.toContain('super-secret-key')
    })
  })
})
