import { describe, expect, it } from 'vitest'
import { buildCheckoutSyncSchedule, isCheckoutSyncConfirmed, shouldContinueCheckoutSync, CHECKOUT_SYNC_DELAYS_MS } from './checkout-sync'

describe('buildCheckoutSyncSchedule', () => {
  it('builds one step per delay, in order, with correct indices', () => {
    const schedule = buildCheckoutSyncSchedule([1000, 2000, 3000])
    expect(schedule).toEqual([
      { index: 0, delayMs: 1000, isLastAttempt: false },
      { index: 1, delayMs: 2000, isLastAttempt: false },
      { index: 2, delayMs: 3000, isLastAttempt: true },
    ])
  })

  it('defaults to CHECKOUT_SYNC_DELAYS_MS, a short bounded sequence (not unbounded/infinite)', () => {
    const schedule = buildCheckoutSyncSchedule()
    expect(schedule.length).toBe(CHECKOUT_SYNC_DELAYS_MS.length)
    expect(schedule.length).toBeGreaterThan(0)
    expect(schedule.length).toBeLessThanOrEqual(10) // sanity bound — this must never be "keep trying forever"
    expect(schedule[schedule.length - 1].isLastAttempt).toBe(true)
    // Bounded total wait stays well under a minute — a real UX bound, not a token gesture.
    const totalMs = schedule.reduce((sum, s) => sum + s.delayMs, 0)
    expect(totalMs).toBeLessThan(60_000)
  })

  it('a single-entry schedule is both first and last', () => {
    const schedule = buildCheckoutSyncSchedule([500])
    expect(schedule).toEqual([{ index: 0, delayMs: 500, isLastAttempt: true }])
  })
})

describe('isCheckoutSyncConfirmed', () => {
  it('is false only for "free" — the exact stale value this loop exists to wait out', () => {
    expect(isCheckoutSyncConfirmed('free')).toBe(false)
  })

  it('is true for every purchasable/legacy/internal plan id — a real DB row confirms regardless of which plan it is', () => {
    for (const plan of ['organize', 'manage', 'automate', 'investor', 'portfolio', 'portfolio_pro', 'owner']) {
      expect(isCheckoutSyncConfirmed(plan)).toBe(true)
    }
  })
})

describe('shouldContinueCheckoutSync — the core stop/continue decision behind Issue 5\'s fix', () => {
  const schedule = buildCheckoutSyncSchedule([2000, 3000, 4000])

  it('never runs on a normal visit — checkoutState absent', () => {
    expect(shouldContinueCheckoutSync({ checkoutState: null, plan: 'free', attemptsFired: 0, schedule })).toBe(false)
  })

  it('never runs when checkoutState is "cancelled"', () => {
    expect(shouldContinueCheckoutSync({ checkoutState: 'cancelled', plan: 'free', attemptsFired: 0, schedule })).toBe(false)
  })

  it('runs on ?checkout=success while still on Free and attempts remain', () => {
    expect(shouldContinueCheckoutSync({ checkoutState: 'success', plan: 'free', attemptsFired: 0, schedule })).toBe(true)
    expect(shouldContinueCheckoutSync({ checkoutState: 'success', plan: 'free', attemptsFired: 2, schedule })).toBe(true)
  })

  it('STOPS the instant the paid plan is confirmed, even on the very first check — this is the actual regression fix: no more racing/overwriting once the truth is known', () => {
    expect(shouldContinueCheckoutSync({ checkoutState: 'success', plan: 'organize', attemptsFired: 0, schedule })).toBe(false)
    expect(shouldContinueCheckoutSync({ checkoutState: 'success', plan: 'manage', attemptsFired: 1, schedule })).toBe(false)
  })

  it('is BOUNDED: stops once every scheduled attempt has fired, even if still on Free — this is what prevents an infinite polling loop', () => {
    expect(shouldContinueCheckoutSync({ checkoutState: 'success', plan: 'free', attemptsFired: schedule.length, schedule })).toBe(false)
    expect(shouldContinueCheckoutSync({ checkoutState: 'success', plan: 'free', attemptsFired: schedule.length + 5, schedule })).toBe(false)
  })

  it('defaults to the real bounded schedule when none is passed', () => {
    expect(shouldContinueCheckoutSync({ checkoutState: 'success', plan: 'free', attemptsFired: 0 })).toBe(true)
    expect(shouldContinueCheckoutSync({ checkoutState: 'success', plan: 'free', attemptsFired: CHECKOUT_SYNC_DELAYS_MS.length })).toBe(false)
  })
})
