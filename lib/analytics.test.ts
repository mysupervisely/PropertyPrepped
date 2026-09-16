import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { trackEvent } from './analytics'

// Production Readiness & Product Analytics V1 — testing OUR integration
// with GA4, never GA's own external service (per this milestone's own
// "Analytics Testing" rules). Same vi.stubGlobal/vi.stubEnv convention
// already used elsewhere in this repo (lib/property-photos/diagnostics
// .test.ts) for environment-dependent code with no jsdom in this repo.

function stubWindowWithGtag() {
  const gtag = vi.fn()
  vi.stubGlobal('window', { gtag })
  return gtag
}

beforeEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('trackEvent — fires correctly when analytics is available', () => {
  it('calls window.gtag with "event" and the exact event name in production', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const gtag = stubWindowWithGtag()
    trackEvent('sign_up_completed')
    expect(gtag).toHaveBeenCalledTimes(1)
    expect(gtag).toHaveBeenCalledWith('event', 'sign_up_completed', {})
  })

  it('passes through every event name used by the activation funnel, unchanged', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const gtag = stubWindowWithGtag()
    const names = [
      'sign_up_completed', 'login_completed', 'first_property_created', 'property_created',
      'document_uploaded', 'expense_created', 'tax_center_viewed', 'global_search_used',
    ] as const
    for (const name of names) trackEvent(name)
    expect(gtag.mock.calls.map((call) => call[1])).toEqual(names)
  })
})

describe('trackEvent — safe no-ops', () => {
  it('does not throw and does not call gtag outside a production build (e.g. local `next dev`)', () => {
    vi.stubEnv('NODE_ENV', 'development')
    const gtag = stubWindowWithGtag()
    expect(() => trackEvent('login_completed')).not.toThrow()
    expect(gtag).not.toHaveBeenCalled()
  })

  it('does not throw and does not call gtag when window.gtag is not a function (ad-blocked / not yet loaded)', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubGlobal('window', {})
    expect(() => trackEvent('login_completed')).not.toThrow()
  })

  it('does not throw during SSR/build, where window is undefined', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubGlobal('window', undefined)
    expect(() => trackEvent('login_completed')).not.toThrow()
  })

  it('never throws even if gtag itself throws — analytics must never break the app', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubGlobal('window', { gtag: () => { throw new Error('blocked by extension') } })
    expect(() => trackEvent('login_completed')).not.toThrow()
  })
})

describe('trackEvent — never carries PII, addresses, or search queries', () => {
  it('every call in this file passes no params, or only the empty object gtag receives by default — there is no way to pass a free-text string as a property', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const gtag = stubWindowWithGtag()
    trackEvent('global_search_used')
    trackEvent('document_uploaded')
    trackEvent('property_created')
    for (const call of gtag.mock.calls) {
      const params = call[2]
      expect(params).toEqual({})
    }
  })
})
