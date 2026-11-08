'use client'

import { useEffect } from 'react'
import { isNativeShell, nativePlatform } from '../../lib/mobile/platform'
import { isBackSwipe, type SwipePoint } from '../../lib/mobile/edge-swipe'

// The current TestFlight shell has WKWebView's native gesture disabled.
// This web-delivered fallback works in that existing shell. If native
// gestures are enabled in a future shell, remove this fallback together
// with that change so one swipe can never navigate twice.
export function IOSBackSwipe() {
  useEffect(() => {
    if (!isNativeShell() || nativePlatform() !== 'ios') return
    let start: SwipePoint | null = null
    const blocked = () => Boolean(document.querySelector('[aria-modal="true"], dialog[open], .overlay'))
    const cancel = () => { start = null }
    const begin = (event: TouchEvent) => {
      start = null
      if (event.touches.length !== 1 || blocked()) return
      const target = event.target
      if (target instanceof Element && target.closest('input, textarea, select, button, a, [contenteditable="true"], [role="slider"]')) return
      const touch = event.touches[0]
      if (touch.clientX <= 24) start = { x: touch.clientX, y: touch.clientY, time: performance.now() }
    }
    const move = (event: TouchEvent) => {
      if (!start || event.touches.length !== 1) { cancel(); return }
      if (Math.abs(event.touches[0].clientY - start.y) > 36) cancel()
    }
    const end = (event: TouchEvent) => {
      const origin = start
      cancel()
      if (!origin || event.changedTouches.length !== 1 || blocked() || window.history.length <= 1) return
      const touch = event.changedTouches[0]
      if (isBackSwipe(origin, { x: touch.clientX, y: touch.clientY, time: performance.now() })) window.history.back()
    }
    document.addEventListener('touchstart', begin, { passive: true })
    document.addEventListener('touchmove', move, { passive: true })
    document.addEventListener('touchend', end, { passive: true })
    document.addEventListener('touchcancel', cancel, { passive: true })
    return () => {
      document.removeEventListener('touchstart', begin)
      document.removeEventListener('touchmove', move)
      document.removeEventListener('touchend', end)
      document.removeEventListener('touchcancel', cancel)
    }
  }, [])
  return null
}
