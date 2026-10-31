import { describe, expect, it, vi } from 'vitest'
import { bindDialogFocus } from './dialog-focus'

function fixture() {
  const listeners = new Map<string, (event: any) => void>()
  const document = { activeElement: null as any,
    addEventListener: (key: string, handler: any) => listeners.set(key, handler),
    removeEventListener: (key: string) => listeners.delete(key) }
  const element = (options = {}) => {
    const item = { tabIndex: 0, isConnected: true, matches: () => false, closest: () => null,
      getClientRects: () => [1], focus: vi.fn(() => { document.activeElement = item }), ...options }
    return item
  }
  const opener = element()
  const title = element({ tabIndex: -1 })
  const first = element()
  const last = element()
  let items = [title, first, last]
  document.activeElement = opener
  const dialog = { ownerDocument: document, querySelectorAll: () => items,
    contains: (target: any) => items.includes(target) }
  const cleanup = bindDialogFocus(dialog as unknown as HTMLElement, title as unknown as HTMLElement)
  const tab = (shiftKey = false) => {
    const event = { key: 'Tab', shiftKey, preventDefault: vi.fn() }
    listeners.get('keydown')?.(event)
    return event
  }
  return { document, title, first, last, opener, listeners, cleanup, tab,
    setItems: (value: any[]) => { items = value }, element }
}

describe('auth dialog keyboard focus', () => {
  it('opens on the title rather than an input and restores the opener on close', () => {
    const f = fixture()
    expect(f.document.activeElement).toBe(f.title)
    f.cleanup()
    expect(f.document.activeElement).toBe(f.opener)
    expect(f.listeners.size).toBe(0)
  })
  it('wraps forward and backward without trapping ordinary control-to-control tabbing', () => {
    const f = fixture()
    f.tab(); expect(f.document.activeElement).toBe(f.first)
    expect(f.tab().preventDefault).not.toHaveBeenCalled()
    f.document.activeElement = f.last
    expect(f.tab().preventDefault).toHaveBeenCalled()
    expect(f.document.activeElement).toBe(f.first)
    f.tab(true); expect(f.document.activeElement).toBe(f.last)
    f.cleanup()
  })
  it('rechecks controls after mode changes and skips disabled, hidden, and non-tab controls', () => {
    const f = fixture()
    f.setItems([f.element({ matches: () => true }), f.element({ closest: () => ({}) }),
      f.element({ getClientRects: () => [] }), f.title, f.last])
    f.tab(); expect(f.document.activeElement).toBe(f.last)
    f.cleanup()
  })
  it('keeps focus on the title if no controls are available', () => {
    const f = fixture(); f.setItems([f.title])
    expect(f.tab().preventDefault).toHaveBeenCalled()
    expect(f.document.activeElement).toBe(f.title)
    f.cleanup()
  })
  it('redirects outside focus and does not restore a removed trigger', () => {
    const f = fixture()
    f.document.activeElement = f.opener
    f.listeners.get('focusin')?.({ target: f.opener })
    expect(f.document.activeElement).toBe(f.title)
    f.opener.isConnected = false
    f.cleanup()
    expect(f.opener.focus).not.toHaveBeenCalled()
  })
})
