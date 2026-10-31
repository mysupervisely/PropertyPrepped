import { describe, expect, it } from 'vitest'
import { bindAuthViewport } from './visual-viewport'

function fixture() {
  const viewport = Object.assign(new EventTarget(), { height: 780, offsetTop: 0 })
  const values = new Map<string, string>()
  const style = {
    setProperty: (key: string, value: string) => { values.set(key, value) },
    removeProperty: (key: string) => { const value = values.get(key) || ''; values.delete(key); return value },
  }
  return { viewport, values, style }
}

describe('auth overlay visual viewport binding', () => {
  it('tracks keyboard resize and visual viewport scrolling', () => {
    const { viewport, values, style } = fixture()
    const cleanup = bindAuthViewport(viewport, style)
    expect(values.get('--auth-viewport-height')).toBe('780px')
    viewport.height = 360
    viewport.offsetTop = 80
    viewport.dispatchEvent(new Event('resize'))
    expect(values.get('--auth-viewport-height')).toBe('360px')
    expect(values.get('--auth-viewport-top')).toBe('80px')
    viewport.offsetTop = 110
    viewport.dispatchEvent(new Event('scroll'))
    expect(values.get('--auth-viewport-top')).toBe('110px')
    cleanup()
  })

  it('clears stale dimensions and unsubscribes when the modal closes', () => {
    const { viewport, values, style } = fixture()
    const cleanup = bindAuthViewport(viewport, style)
    cleanup()
    viewport.height = 300
    viewport.dispatchEvent(new Event('resize'))
    expect(values.size).toBe(0)
  })

  it('keeps the last valid size during transient zero-height events and clamps overscroll', () => {
    const { viewport, values, style } = fixture()
    const cleanup = bindAuthViewport(viewport, style)
    viewport.height = 0
    viewport.dispatchEvent(new Event('resize'))
    expect(values.get('--auth-viewport-height')).toBe('780px')
    viewport.height = 400
    viewport.offsetTop = -10
    viewport.dispatchEvent(new Event('scroll'))
    expect(values.get('--auth-viewport-top')).toBe('0px')
    cleanup()
  })

  it('uses CSS fallback when the API is unavailable', () => {
    const { values, style } = fixture()
    bindAuthViewport(null, style)()
    expect(values.size).toBe(0)
  })
})
