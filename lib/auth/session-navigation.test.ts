import { describe, expect, it } from 'vitest'
import { shouldResetWorkspace } from './session-navigation'
describe('workspace across authentication events', () => {
  it('preserves navigation on same-user resume and token refresh', () => {
    expect(shouldResetWorkspace('owner-a', 'owner-a')).toBe(false)
  })
  it('resets on sign-out or account change', () => {
    expect(shouldResetWorkspace('owner-a', null)).toBe(true)
    expect(shouldResetWorkspace('owner-a', 'owner-b')).toBe(true)
    expect(shouldResetWorkspace(null, 'owner-a')).toBe(true)
  })
})
