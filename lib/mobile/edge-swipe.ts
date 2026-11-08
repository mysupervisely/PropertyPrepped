export type SwipePoint = { x: number; y: number; time: number }

// A deliberate rightward swipe from the left edge, not scrolling,
// tapping, pinching, or dragging across a gallery/slider.
export function isBackSwipe(start: SwipePoint, end: SwipePoint): boolean {
  const dx = end.x - start.x
  const dy = Math.abs(end.y - start.y)
  const duration = end.time - start.time
  return start.x >= 0 && start.x <= 24 && dx >= 72 && dy <= 36 && dx > dy * 2 && duration >= 50 && duration <= 10000
}
