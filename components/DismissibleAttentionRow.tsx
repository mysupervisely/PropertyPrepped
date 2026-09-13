'use client'

// PropRoster — Property + Attention Usability V1, Part 3-B/D: swipe-to-
// reveal-Clear plus a quiet trailing accessible fallback, shared by
// every dismissible Needs Your Attention row (date-driven attention
// items and vacancy items — NOT open-maintenance-list items, which
// aren't dismissible in this pass; see app/page.tsx's own comment at
// the call site for why).
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

import { useRef, useState, type ReactNode, type TouchEvent } from 'react'

const REVEAL_WIDTH = 84 // px — matches .dismissibleAttentionReveal's own width in globals.css
const DRAG_DEADZONE = 6 // px of movement before a gesture is classified as horizontal vs vertical
const OPEN_SNAP_THRESHOLD = REVEAL_WIDTH / 2

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
      if (Math.abs(dx) < DRAG_DEADZONE && Math.abs(dy) < DRAG_DEADZONE) return
      g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
    }
    if (g.axis === 'y') return // a real vertical scroll — never intercepted, never preventDefault
    e.preventDefault()
    draggedRef.current = true
    setOffset(Math.min(0, Math.max(-REVEAL_WIDTH, g.startOffset + dx)))
  }

  function handleTouchEnd() {
    const g = gesture.current
    gesture.current = null
    if (!g || g.axis !== 'x') return
    setOffset((current) => (current <= -OPEN_SNAP_THRESHOLD ? -REVEAL_WIDTH : 0))
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
        style={{ transform: `translateX(${offset}px)` }}
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
