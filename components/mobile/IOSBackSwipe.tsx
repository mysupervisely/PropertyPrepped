'use client'

import { useEffect } from 'react'
import { isNativeShell, nativePlatform } from '../../lib/mobile/platform'
import { isBackSwipe, type SwipePoint } from '../../lib/mobile/edge-swipe'

// Web-delivered interactive fallback for the current TestFlight shell.
// Remove together with any future native WKWebView gesture enablement.
export function IOSBackSwipe() {
  useEffect(() => {
    if (!isNativeShell() || nativePlatform() !== 'ios') return
    let start: SwipePoint | null = null
    let surface: HTMLElement | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    let settling = false
    const blocked = () => Boolean(document.querySelector('[aria-modal="true"], dialog[open], .overlay'))
    const clearVisual = () => {
      surface?.classList.remove('iosBackSwipeMoving', 'iosBackSwipeSettling')
      surface?.style.removeProperty('--ios-back-offset')
      document.body.classList.remove('iosBackSwipeActive')
      surface = null
      settling = false
    }
    const reset = () => {
      clearTimeout(timer)
      start = null
      if (!surface) return
      surface.classList.add('iosBackSwipeSettling')
      surface.style.setProperty('--ios-back-offset', '0px')
      settling = true
      timer = setTimeout(clearVisual, 180)
    }
    const begin = (event: TouchEvent) => {
      if (settling) return
      if (event.touches.length !== 1) { reset(); return }
      start = null
      if (event.touches.length !== 1 || blocked() || window.history.length <= 1) return
      const target = event.target
      if (target instanceof Element && target.closest('input, textarea, select, button, a, [contenteditable="true"], [role="slider"]')) return
      const touch = event.touches[0]
      if (touch.clientX <= 24) {
        start = { x: touch.clientX, y: touch.clientY, time: performance.now() }
        surface = document.querySelector('main')
      }
    }
    const move = (event: TouchEvent) => {
      if (!start) return
      if (event.touches.length !== 1 || blocked()) { reset(); return }
      const touch = event.touches[0]
      if (Math.abs(touch.clientY - start.y) > 36) { reset(); return }
      const dx = Math.max(0, Math.min(window.innerWidth, touch.clientX - start.x))
      if (surface && dx > 8) {
        surface.classList.add('iosBackSwipeMoving')
        surface.style.setProperty('--ios-back-offset', `${dx}px`)
        document.body.classList.add('iosBackSwipeActive')
      } else if (surface) surface.style.setProperty('--ios-back-offset', '0px')
    }
    const end = (event: TouchEvent) => {
      const origin = start
      start = null
      if (!origin) return
      if (event.changedTouches.length !== 1 || blocked() || window.history.length <= 1) { reset(); return }
      const touch = event.changedTouches[0]
      if (!isBackSwipe(origin, { x: touch.clientX, y: touch.clientY, time: performance.now() })) { reset(); return }
      settling = true
      surface?.classList.add('iosBackSwipeMoving', 'iosBackSwipeSettling')
      surface?.style.setProperty('--ios-back-offset', `${window.innerWidth}px`)
      timer = setTimeout(() => {
        // Keep existing popstate navigation and unsaved-condition checks.
        window.history.back()
        timer = setTimeout(clearVisual, 40)
      }, 180)
    }
    document.addEventListener('touchstart', begin, { passive: true })
    document.addEventListener('touchmove', move, { passive: true })
    document.addEventListener('touchend', end, { passive: true })
    document.addEventListener('touchcancel', reset, { passive: true })
    return () => {
      clearTimeout(timer)
      clearVisual()
      document.removeEventListener('touchstart', begin)
      document.removeEventListener('touchmove', move)
      document.removeEventListener('touchend', end)
      document.removeEventListener('touchcancel', reset)
    }
  }, [])
  return null
}
