'use client'

// PropRoster — Property + Attention Usability V1, Part 3-B/D: swipe-to-
// reveal-Clear plus a quiet trailing accessible fallback, shared by
// every dismissible Needs Your Attention row — date-driven attention
// items, vacancy items, AND (as of the Round 3 follow-up) open-
// maintenance-list items too; see app/page.tsx's own attentionRows
// comment and lib/dashboard/attention-dismissal.ts's header for why the
// original open-maintenance exclusion was corrected.
//
// This component owns ONLY the gesture/reveal mechanics — it never
// decides WHAT gets cleared or how that's persisted; `onClear` is the
// caller's own handler (app/page.tsx's clearAttentionItem()), which is
// the one place that actually writes to attention_dismissals. Tap/
// click still calls the caller's own `onOpen` (the existing goToNav
// deep-link) — this component changes interaction, never navigation.
//
// SWIPE SEMANTICS: a horizontal drag (materially more X movement than Y)
// reveals a fixed-width "Clear" panel behind the row by translating the
// row left; releasing past half the reveal width snaps fully open,
// otherwise it snaps back closed. A real vertical scroll is never
// intercepted: the gesture's axis is only classified once movement
// exceeds a small deadzone, and a vertical classification never calls
// preventDefault, so the page scrolls exactly as it would with no
// swipe handling here at all. A drag (once classified horizontal)
// suppresses the click that would otherwise fire on touchend, so
// swiping never also navigates.
//
// REAL-IPHONE REGRESSION FOLLOW-UP: once open-maintenance rows were
// ALSO wrapped in this component (Round 3), a real-device report showed
// the whole Dashboard clipped a few px on the left again — the exact
// fingerprint this repo has hit before from the document being nudged
// into a brief horizontal rubber-band scroll (see app/globals.css's
// `html, body` comment). Bisecting the diff against the last real-
// device-verified commit showed the ONLY Dashboard-affecting change was
// this wrapping — so open-maintenance rows (often several per property,
// e.g. three separate AC-related requests) were, for the first time,
// running this component's touch-interception logic during ordinary
// scrolling, on rows a user is statistically likely to scroll past/
// through. Reproducing the OLD classification (`|dx| > |dy|`, 6px
// deadzone) against a realistic diagonal thumb-scroll path (early
// frames drift slightly more horizontal than vertical before settling
// into a clear vertical trajectory — completely normal human touch
// behavior) showed it FALSELY classifies that as a horizontal swipe,
// calling preventDefault() and hijacking the touch that should have
// been a plain page scroll. That's a real, verifiable defect
// independent of any single browser engine's rubber-band quirks, and
// exactly the kind of increased exposure that would newly surface now
// that open-maintenance rows carry this logic too. Fixed by requiring a
// clearly DOMINANT horizontal component (not a bare majority) before
// ever locking the gesture to 'x' — see classifyGestureAxis()
// (lib/dashboard/attention-swipe-gesture.ts, pulled out there so this
// decision is independently testable with real dx/dy values — see its
// own test file for the exact reproduction and fix verification). A
// genuine horizontal swipe still classifies correctly; only the
// ambiguous, mostly-vertical case changes.

import { useRef, useState, type ReactNode, type TouchEvent } from 'react'
import { classifyGestureAxis, clampRevealOffset, shouldSnapOpen } from '../lib/dashboard/attention-swipe-gesture'

const REVEAL_WIDTH = 84 // px — matches .dismissibleAttentionReveal's own width in globals.css
const DRAG_DEADZONE = 8 // px of movement before a gesture is classified as horizontal vs vertical
// A bare `|dx| > |dy|` locked the gesture to horizontal on ordinary,
// slightly-diagonal vertical scrolling (see this file's header comment
// for the empirical reproduction) — requiring dx to clearly DOMINATE dy
// filters that out while still recognizing a real horizontal swipe.
const HORIZONTAL_DOMINANCE_RATIO = 1.5

type GestureState = { startX: number; startY: number; axis: 'x' | 'y' | null; startOffset: number }

export function DismissibleAttentionRow({
  onOpen, onClear, clearLabel, children,
}: {
  /** The row's existing primary action (the current goToNav deep-link) — fires on a genuine tap, never on a swipe or while the reveal panel is open. */
  onOpen: () => void
  /** Persists the dismissal (app/page.tsx's clearAttentionItem) — called by both the swipe reveal's Clear button and the quiet trailing accessible control. */
  onClear: () => void
  /** aria-label for the accessible trailing control, e.g. "Clear: Rent overdue at 123 Main Street" — specific enough to be useful read out of context. */
  clearLabel: string
  children: ReactNode
}) {
  const [offset, setOffset] = useState(0) // 0 = closed; negative = revealed (row shifted left by |offset|px)
  const gesture = useRef<GestureState | null>(null)
  const draggedRef = useRef(false) // true once a real horizontal drag happened this touch — suppresses the click that follows touchend

  function handleTouchStart(e: TouchEvent) {
    const t = e.touches[0]
    gesture.current = { startX: t.clientX, startY: t.clientY, axis: null, startOffset: offset }
    draggedRef.current = false
  }

  function handleTouchMove(e: TouchEvent) {
    const g = gesture.current
    if (!g) return
    const t = e.touches[0]
    const dx = t.clientX - g.startX
    const dy = t.clientY - g.startY
    if (g.axis === null) {
      const axis = classifyGestureAxis(dx, dy, DRAG_DEADZONE, HORIZONTAL_DOMINANCE_RATIO)
      if (axis === null) return // still within the deadzone — not enough movement to decide yet
      g.axis = axis
    }
    if (g.axis === 'y') return // a real vertical scroll — never intercepted, never preventDefault
    e.preventDefault()
    draggedRef.current = true
    setOffset(clampRevealOffset(g.startOffset + dx, REVEAL_WIDTH))
  }

  function handleTouchEnd() {
    const g = gesture.current
    gesture.current = null
    if (!g || g.axis !== 'x') return
    setOffset((current) => (shouldSnapOpen(current, REVEAL_WIDTH) ? -REVEAL_WIDTH : 0))
  }

  function handleRowClick() {
    if (draggedRef.current) { draggedRef.current = false; return } // this click is the tail end of a drag, not a tap
    if (offset !== 0) { setOffset(0); return } // a tap while the reveal panel is open just closes it
    onOpen()
  }

  return (
    <div className="dismissibleAttentionRow">
      <div className="dismissibleAttentionReveal" aria-hidden={offset === 0}>
        <button type="button" className="dismissibleAttentionClear" onClick={() => { setOffset(0); onClear() }} tabIndex={offset === 0 ? -1 : 0}>
          Clear
        </button>
      </div>
      <div
        className="dismissibleAttentionForeground"
        // Omit the transform declaration entirely at rest (offset === 0)
        // rather than always setting `translateX(0px)` — a non-'none'
        // transform, even an identity one, promotes the element to its
        // own compositing layer in most engines. With every dismissible
        // row (now including every open-maintenance row) doing this
        // unconditionally, a typical Dashboard could hold a dozen+ such
        // layers at rest for no visual benefit. Only actually revealed/
        // mid-drag rows (offset !== 0) need the transform.
        style={offset !== 0 ? { transform: `translateX(${offset}px)` } : undefined}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <button type="button" className="dashboardItemRow dismissibleAttentionMain" onClick={handleRowClick}>
          {children}
        </button>
        {/* Desktop/keyboard/no-swipe fallback (Part 3-D) — a quiet
            trailing control, not a second prominent button: same Clear
            handler as the swipe panel, natively focusable/keyboard-
            activatable (a real <button>, no custom key handling
            needed). A sibling of the row button, not nested inside it —
            a <button> cannot validly contain another <button>. */}
        <button type="button" className="dismissibleAttentionKebab" aria-label={clearLabel} onClick={(e) => { e.stopPropagation(); onClear() }}>
          &#8942;
        </button>
      </div>
    </div>
  )
}
