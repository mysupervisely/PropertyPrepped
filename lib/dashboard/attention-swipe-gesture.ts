// PropRoster — components/DismissibleAttentionRow.tsx's swipe-gesture
// decision logic, pulled out into pure functions so it's directly
// testable with real dx/dy values (no DOM/React/jsdom needed) — this
// repo has no browser-based test harness, so a decision this important
// needs to be extractable and pure rather than only verifiable by
// reading source strings.
//
// REAL-IPHONE REGRESSION (Round 3 follow-up): once open-maintenance
// rows were also wrapped in DismissibleAttentionRow, a real-device
// report showed the whole Dashboard clipping a few px on the left again
// — see DismissibleAttentionRow.tsx's own header comment for the full
// investigation. The confirmed, verifiable defect: the previous
// classifyGestureAxis-equivalent logic (`Math.abs(dx) > Math.abs(dy)`,
// a bare majority) locks a gesture to horizontal on completely ordinary
// diagonal thumb-scrolls (real human touch input routinely has dx
// slightly exceed dy in the first few frames before settling into a
// clearly vertical trajectory), which calls preventDefault() and
// hijacks what should have been a plain page scroll. This module's
// functions are what actually fixes it — see this file's own tests for
// the exact reproduction.

/**
 * Decides which axis a drag belongs to, given cumulative movement from
 * the gesture's start. Returns null while movement is still within the
 * deadzone (not yet enough to decide either way) — callers should keep
 * calling this on each subsequent move until it returns non-null, then
 * lock in that axis for the rest of the gesture (this function itself
 * is stateless and pure; state-holding is the caller's job).
 *
 * Requires dx to clearly DOMINATE dy (not just exceed it) before
 * classifying as horizontal — this is the actual fix for the real-
 * iPhone regression above. A bare `adx > ady` was proven (see this
 * file's tests) to misclassify realistic, mostly-vertical scroll
 * gestures as horizontal swipes.
 */
export function classifyGestureAxis(dx: number, dy: number, deadzone: number, dominanceRatio: number): 'x' | 'y' | null {
  const adx = Math.abs(dx)
  const ady = Math.abs(dy)
  if (adx < deadzone && ady < deadzone) return null
  return adx > ady * dominanceRatio ? 'x' : 'y'
}

/** Clamps a reveal-panel offset to the valid range: 0 (closed) to -revealWidth (fully open) — never further in either direction. */
export function clampRevealOffset(value: number, revealWidth: number): number {
  return Math.min(0, Math.max(-revealWidth, value))
}

/** Whether a released drag should snap fully open (reveal the Clear panel) rather than snap back closed — past the halfway point of the reveal width. */
export function shouldSnapOpen(offsetAtRelease: number, revealWidth: number): boolean {
  return offsetAtRelease <= -(revealWidth / 2)
}
