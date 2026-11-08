import { expect, it } from 'vitest'
import { isBackSwipe } from './edge-swipe'
const start = { x: 10, y: 150, time: 100 }
it('accepts a deliberate edge swipe back', () => {
  expect(isBackSwipe(start, { x: 110, y: 158, time: 450 })).toBe(true)
})
it('leaves vertical scrolling, taps, gallery drags and slow drags alone', () => {
  expect(isBackSwipe(start, { x: 110, y: 220, time: 450 })).toBe(false)
  expect(isBackSwipe(start, { x: 25, y: 152, time: 300 })).toBe(false)
  expect(isBackSwipe({ ...start, x: 100 }, { x: 230, y: 158, time: 450 })).toBe(false)
  expect(isBackSwipe(start, { x: 110, y: 158, time: 1300 })).toBe(false)
  expect(isBackSwipe(start, { x: 110, y: 158, time: 110 })).toBe(false)
  expect(isBackSwipe(start, { x: 0, y: 158, time: 450 })).toBe(false)
})
