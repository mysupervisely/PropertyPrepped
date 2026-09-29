import { describe, expect, it, vi } from 'vitest'

const isNativePlatform = vi.fn()
const getPlatform = vi.fn()

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: (...args: unknown[]) => isNativePlatform(...args),
    getPlatform: (...args: unknown[]) => getPlatform(...args),
  },
}))

describe('isNativeShell', () => {
  it('delegates directly to Capacitor.isNativePlatform() — true inside the native shell', async () => {
    isNativePlatform.mockReturnValue(true)
    const { isNativeShell } = await import('./platform')
    expect(isNativeShell()).toBe(true)
  })

  it('delegates directly to Capacitor.isNativePlatform() — false in an ordinary browser', async () => {
    isNativePlatform.mockReturnValue(false)
    const { isNativeShell } = await import('./platform')
    expect(isNativeShell()).toBe(false)
  })
})

describe('nativePlatform', () => {
  it('delegates to Capacitor.getPlatform()', async () => {
    getPlatform.mockReturnValue('ios')
    const { nativePlatform } = await import('./platform')
    expect(nativePlatform()).toBe('ios')
  })
})
