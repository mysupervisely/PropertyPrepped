import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const { effect, native, platform } = vi.hoisted(() => ({ effect: vi.fn(), native: vi.fn(), platform: vi.fn() }))
vi.mock('react', () => ({ useEffect: effect }))
vi.mock('../../lib/mobile/platform', () => ({ isNativeShell: native, nativePlatform: platform }))
import { IOSBackSwipe } from './IOSBackSwipe'
let listeners: Record<string, (event: any) => void>
let back: ReturnType<typeof vi.fn>
let query: ReturnType<typeof vi.fn>
class Target { closest() { return null } }
const point = (x: number, y = 100) => ({ clientX: x, clientY: y })
beforeEach(() => {
  vi.clearAllMocks()
  native.mockReturnValue(true); platform.mockReturnValue('ios')
  listeners = {}; back = vi.fn(); query = vi.fn().mockReturnValue(null)
  vi.stubGlobal('Element', Target)
  vi.stubGlobal('document', { querySelector: query, addEventListener: (name: string, fn: any) => { listeners[name] = fn }, removeEventListener: (name: string) => { delete listeners[name] } })
  vi.stubGlobal('window', { history: { length: 2, back } })
  vi.spyOn(performance, 'now').mockReturnValueOnce(100).mockReturnValue(400)
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
function mount() { IOSBackSwipe(); return effect.mock.calls[0][0]() }
function swipe() {
  listeners.touchstart({ touches: [point(10)], target: new Target() })
  listeners.touchend({ changedTouches: [point(120)] })
}
it('uses history once and removes all listeners on unmount', () => {
  const cleanup = mount(); swipe(); expect(back).toHaveBeenCalledTimes(1)
  cleanup(); expect(Object.keys(listeners)).toHaveLength(0)
})
it('does not register in browsers or Android shells', () => {
  native.mockReturnValue(false); mount(); expect(Object.keys(listeners)).toHaveLength(0)
  native.mockReturnValue(true); platform.mockReturnValue('android'); mount(); expect(Object.keys(listeners)).toHaveLength(0)
})
it('leaves open dialogs, vertical scrolling and multi-touch alone', () => {
  mount(); query.mockReturnValue({}); swipe(); expect(back).not.toHaveBeenCalled()
  query.mockReturnValue(null)
  listeners.touchstart({ touches: [point(10)], target: new Target() })
  listeners.touchmove({ touches: [point(40, 200)] })
  listeners.touchend({ changedTouches: [point(120)] }); expect(back).not.toHaveBeenCalled()
  listeners.touchstart({ touches: [point(10)], target: new Target() })
  listeners.touchmove({ touches: [point(40), point(60)] })
  listeners.touchend({ changedTouches: [point(120)] }); expect(back).not.toHaveBeenCalled()
})
