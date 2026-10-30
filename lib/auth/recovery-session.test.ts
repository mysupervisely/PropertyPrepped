import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { watchRecoverySession } from './recovery-session'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('password recovery session checks', () => {
  it('accepts a session supplied by the auth client', async () => {
    const state = vi.fn()
    const cleanup = watchRecoverySession(async () => ({ data: { session: {} } }), () => () => {}, state)
    await vi.advanceTimersByTimeAsync(12000)
    expect(state.mock.calls).toEqual([['ready']])
    cleanup()
  })

  it('allows a recovery event to arrive during the missing-session grace period', async () => {
    const state = vi.fn()
    let recovered!: () => void
    const cleanup = watchRecoverySession(async () => ({ data: { session: null } }), (callback) => {
      recovered = callback
      return () => {}
    }, state)
    await vi.advanceTimersByTimeAsync(1000)
    expect(state).not.toHaveBeenCalled()
    recovered()
    await vi.advanceTimersByTimeAsync(12000)
    expect(state.mock.calls).toEqual([['ready']])
    cleanup()
  })

  it('marks a confirmed missing session invalid after the grace period', async () => {
    const state = vi.fn()
    const cleanup = watchRecoverySession(async () => ({ data: { session: null } }), () => () => {}, state)
    await vi.advanceTimersByTimeAsync(2500)
    expect(state.mock.calls).toEqual([['invalid']])
    cleanup()
  })

  it.each(['returned', 'thrown'])('reports a %s transport failure as unavailable, never invalid', async (kind) => {
    const state = vi.fn()
    const cleanup = watchRecoverySession(async () => {
      if (kind === 'thrown') throw new Error('offline')
      return { data: { session: null }, error: new Error('offline') }
    }, () => () => {}, state)
    await vi.advanceTimersByTimeAsync(12000)
    expect(state.mock.calls).toEqual([['unavailable']])
    cleanup()
  })

  it('bounds a stalled check and ignores its late response after cleanup', async () => {
    const state = vi.fn()
    let resolve!: (result: { data: { session: unknown } }) => void
    const unsubscribe = vi.fn()
    const cleanup = watchRecoverySession(() => new Promise((done) => { resolve = done }), () => unsubscribe, state)
    await vi.advanceTimersByTimeAsync(10000)
    expect(state.mock.calls).toEqual([['unavailable']])
    cleanup()
    resolve({ data: { session: {} } })
    await vi.advanceTimersByTimeAsync(0)
    expect(state.mock.calls).toEqual([['unavailable']])
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('does not let a late failed check overwrite a recovery event', async () => {
    const state = vi.fn()
    let reject!: (error: Error) => void
    let recovered!: () => void
    const cleanup = watchRecoverySession(() => new Promise((_, fail) => { reject = fail }), (callback) => {
      recovered = callback
      return () => {}
    }, state)
    await vi.advanceTimersByTimeAsync(0)
    recovered()
    reject(new Error('late network failure'))
    await vi.advanceTimersByTimeAsync(12000)
    expect(state.mock.calls).toEqual([['ready']])
    cleanup()
  })
})
