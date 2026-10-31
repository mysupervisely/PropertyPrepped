import { describe, expect, it, vi } from 'vitest'
import { authFormError, runAuthSubmission } from './form-submission'

describe('authentication form validation', () => {
  it('provides feedback for missing or malformed email and short password', () => {
    expect(authFormError(' ')).toBe('Enter your email address.')
    for (const email of ['invalid', 'a b@example.com', 'a@@example.com']) {
      expect(authFormError(email)).toBe('Enter a valid email address.')
    }
    expect(authFormError('user@example.com', '12345')).toContain('at least 6')
  })
  it('accepts surrounding email whitespace without trimming passwords', () => {
    expect(authFormError(' user+test@example.com ', ' abcde')).toBeNull()
    expect(authFormError('user@example.com')).toBeNull()
    expect(authFormError('user@example.com', '')).toContain('at least 6')
  })
})

describe('authentication request lifecycle', () => {
  it('blocks a second request until the first completes', async () => {
    const lock = { current: false }
    const busy = vi.fn()
    const error = vi.fn()
    let finish!: () => void
    const first = runAuthSubmission(lock, busy, () => new Promise<void>((resolve) => { finish = resolve }), error)
    const duplicate = vi.fn(async () => {})
    await runAuthSubmission(lock, busy, duplicate, error)
    expect(duplicate).not.toHaveBeenCalled()
    expect(busy.mock.calls).toEqual([[true]])
    finish()
    await first
    expect(lock.current).toBe(false)
    expect(busy.mock.calls).toEqual([[true], [false]])
    expect(error).not.toHaveBeenCalled()
  })
  it('reports an unexpected rejection, clears busy, and permits a retry', async () => {
    const lock = { current: false }
    const busy = vi.fn()
    const error = vi.fn()
    const failure = new Error('Network request failed')
    await runAuthSubmission(lock, busy, async () => { throw failure }, error)
    expect(error).toHaveBeenCalledWith(failure)
    expect(lock.current).toBe(false)
    expect(busy.mock.calls).toEqual([[true], [false]])
    const retry = vi.fn(async () => {})
    await runAuthSubmission(lock, busy, retry, error)
    expect(retry).toHaveBeenCalledOnce()
  })
})
