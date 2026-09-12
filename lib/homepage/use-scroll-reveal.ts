'use client'

// PropRoster — Dynamic Homepage V1.
//
// A single, restrained IntersectionObserver-based "has this scrolled
// into view yet" primitive, reused by every homepage scene instead of
// one-off animation/scroll-listener code per section. This hook makes
// exactly one decision — a boolean — and never touches styles or
// animation itself; each caller's own CSS class (e.g. .sceneReveal /
// .sceneReveal--visible) owns the actual transition, so the visual
// language (duration/easing/distance) stays centralized in CSS, not
// scattered across component code — the "restrained reusable motion
// system" the milestone brief asks for, rather than animation hacks.
//
// Design choices, each deliberate:
// - Reveals ONCE and disconnects. A product story should not replay
//   itself every time a visitor scrolls back up past a section.
// - `prefers-reduced-motion: reduce` short-circuits to `visible: true`
//   immediately, before ever creating an observer. Motion is additive
//   polish only — nothing on this page is ever gated behind it being
//   enabled, satisfying "the entire page must remain understandable
//   without animation."
// - No IntersectionObserver support (very old browsers) also
//   short-circuits to `visible: true` — a missing browser capability
//   must never hide real content.
// - No scroll listeners, no rAF loops, no dependency — just the
//   platform's own IntersectionObserver, which is exactly what the
//   brief asks for ("lightweight techniques... avoid a heavy animation
//   dependency unless there is a compelling technical reason").

import { useEffect, useRef, useState } from 'react'

export type ScrollRevealOptions = {
  /** How much of the element must be visible before it's considered "revealed." Default 0.2 (20%). */
  threshold?: number
  /** Passed straight through to IntersectionObserver — default trims 10% off the bottom of the viewport so a reveal fires a little before the element is fully on-screen, not right at the last pixel. */
  rootMargin?: string
}

export function useScrollReveal<T extends HTMLElement>(options?: ScrollRevealOptions) {
  const ref = useRef<T | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true)
      return
    }

    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true)
            observer.disconnect()
          }
        }
      },
      { threshold: options?.threshold ?? 0.2, rootMargin: options?.rootMargin ?? '0px 0px -10% 0px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
    // Intentionally empty deps — this observes the DOM node the ref is
    // attached to once, for the lifetime of the component; options are
    // read once at mount (callers pass stable literals, never state).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { ref, visible }
}
