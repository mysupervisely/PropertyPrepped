import { describe, expect, it } from 'vitest'
import { classifyGestureAxis, clampRevealOffset, shouldSnapOpen } from './attention-swipe-gesture'

// Round 3 real-iPhone regression: the Dashboard clipped a few px on the
// left again once open-maintenance rows were also wrapped in
// DismissibleAttentionRow. See that component's own header comment and
// this module's header for the full investigation — these tests lock
// in the actual, verified fix (and prove the OLD logic really was
// broken, not just theoretically suspect).

const DEADZONE = 8
const RATIO = 1.5
const REVEAL_WIDTH = 84

// The bare-majority comparison this repo used before the fix — kept
// here ONLY so the "was broken" tests can demonstrate the regression
// against the OLD behavior, not to reintroduce it anywhere real.
function oldClassify(dx: number, dy: number): 'x' | 'y' | null {
  const adx = Math.abs(dx)
  const ady = Math.abs(dy)
  if (adx < 6 && ady < 6) return null
  return adx > ady ? 'x' : 'y'
}

describe('classifyGestureAxis — the real-iPhone regression fix', () => {
  it('a realistic diagonal thumb-scroll (dx slightly ahead of dy — completely normal human touch input) is now correctly read as vertical — this exact shape was misclassified by the old bare-majority logic', () => {
    // Same shape proven via a real Chromium touch-event reproduction
    // during this investigation: dx modestly exceeds dy, but not
    // decisively — the old logic locked this to horizontal; the fix
    // requires dx to clearly dominate before doing that.
    const dx = 10
    const dy = 7
    expect(oldClassify(dx, dy)).toBe('x') // proves the regression was real
    expect(classifyGestureAxis(dx, dy, DEADZONE, RATIO)).toBe('y') // proves the fix
  })

  it('very early, ambiguous movement (both axes still under the deadzone) stays undecided rather than snap-classifying — never locks to \'x\' just because dx happens to be marginally ahead of dy at this instant', () => {
    expect(classifyGestureAxis(7, 5, DEADZONE, RATIO)).toBeNull()
  })

  it('a clearly vertical scroll is read as vertical under both old and new logic (never regressed)', () => {
    expect(classifyGestureAxis(3, 20, DEADZONE, RATIO)).toBe('y')
  })

  it('a genuine horizontal swipe is still correctly read as horizontal — the fix does not break real swipe-to-reveal', () => {
    expect(classifyGestureAxis(30, 4, DEADZONE, RATIO)).toBe('x')
    expect(classifyGestureAxis(56, 3, DEADZONE, RATIO)).toBe('x')
  })

  it('returns null (undecided) while movement is within the deadzone on both axes, so a barely-touched gesture never commits to either direction prematurely', () => {
    expect(classifyGestureAxis(2, 3, DEADZONE, RATIO)).toBeNull()
    expect(classifyGestureAxis(7, 7, DEADZONE, RATIO)).toBeNull()
  })

  it('a movement past the deadzone on only one axis is decided even if the other axis is still tiny', () => {
    expect(classifyGestureAxis(2, 20, DEADZONE, RATIO)).toBe('y')
    expect(classifyGestureAxis(40, 2, DEADZONE, RATIO)).toBe('x')
  })

  it('the dominance ratio boundary: dx must EXCEED dy * ratio, not merely equal it, to classify as horizontal', () => {
    // dx exactly at the ratio boundary (12 = 8 * 1.5) is NOT dominant enough — reads as vertical.
    expect(classifyGestureAxis(12, 8, DEADZONE, RATIO)).toBe('y')
    // One unit past the boundary IS dominant — reads as horizontal.
    expect(classifyGestureAxis(13, 8, DEADZONE, RATIO)).toBe('x')
  })

  it('handles negative dx/dy (drag moving left/up) identically to positive — only magnitude matters', () => {
    expect(classifyGestureAxis(-10, -7, DEADZONE, RATIO)).toBe('y')
    expect(classifyGestureAxis(-40, -2, DEADZONE, RATIO)).toBe('x')
  })
})

describe('clampRevealOffset', () => {
  it('never exceeds 0 (fully closed) even for a positive/rightward drag', () => {
    expect(clampRevealOffset(20, REVEAL_WIDTH)).toBe(0)
  })

  it('never exceeds -revealWidth (fully open) even for a drag far past it', () => {
    expect(clampRevealOffset(-500, REVEAL_WIDTH)).toBe(-REVEAL_WIDTH)
  })

  it('passes through an in-range value unchanged', () => {
    expect(clampRevealOffset(-40, REVEAL_WIDTH)).toBe(-40)
  })
})

describe('shouldSnapOpen', () => {
  it('snaps open once released past half the reveal width', () => {
    expect(shouldSnapOpen(-43, REVEAL_WIDTH)).toBe(true)
    expect(shouldSnapOpen(-84, REVEAL_WIDTH)).toBe(true)
  })

  it('snaps closed when released before the halfway point', () => {
    expect(shouldSnapOpen(-41, REVEAL_WIDTH)).toBe(false)
    expect(shouldSnapOpen(0, REVEAL_WIDTH)).toBe(false)
  })

  it('the halfway point itself snaps open (>=, matching the component\'s own <= comparison)', () => {
    expect(shouldSnapOpen(-42, REVEAL_WIDTH)).toBe(true)
  })
})
