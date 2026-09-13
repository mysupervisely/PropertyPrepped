import { describe, expect, it } from 'vitest'
import { getCurrentDigestPeriodStart, isDigestDue } from './digest-period'

describe('getCurrentDigestPeriodStart', () => {
  it('resolves to the most recent Monday 13:00 UTC when now is later in the same week', () => {
    // Wednesday 2026-09-16 10:00 UTC -> Monday 2026-09-14 13:00 UTC
    const now = new Date('2026-09-16T10:00:00Z')
    expect(getCurrentDigestPeriodStart(now).toISOString()).toBe('2026-09-14T13:00:00.000Z')
  })

  it('resolves to TODAY 13:00 UTC when now is Monday at/after 13:00 UTC', () => {
    const now = new Date('2026-09-14T14:30:00Z')
    expect(getCurrentDigestPeriodStart(now).toISOString()).toBe('2026-09-14T13:00:00.000Z')
  })

  it('resolves to the PREVIOUS Monday 13:00 UTC when now is Monday but before 13:00 UTC', () => {
    const now = new Date('2026-09-14T09:00:00Z')
    expect(getCurrentDigestPeriodStart(now).toISOString()).toBe('2026-09-07T13:00:00.000Z')
  })

  it('handles a Sunday correctly (6 days into the period)', () => {
    const now = new Date('2026-09-20T23:59:00Z')
    expect(getCurrentDigestPeriodStart(now).toISOString()).toBe('2026-09-14T13:00:00.000Z')
  })
})

describe('isDigestDue', () => {
  const now = new Date('2026-09-16T10:00:00Z') // current period starts 2026-09-14T13:00:00Z

  it('is due when never sent before', () => {
    expect(isDigestDue(null, now)).toBe(true)
  })

  it('is due when the last send was before the current period started', () => {
    expect(isDigestDue('2026-09-07T13:00:00Z', now)).toBe(true) // last week's period
  })

  it('is NOT due when the last send was already within the current period', () => {
    expect(isDigestDue('2026-09-14T13:00:01Z', now)).toBe(false)
    expect(isDigestDue('2026-09-15T09:00:00Z', now)).toBe(false)
  })

  it('is NOT due when the last send was exactly at the period boundary', () => {
    expect(isDigestDue('2026-09-14T13:00:00.000Z', now)).toBe(false)
  })

  it('treats an unparseable timestamp as never sent, never as "already sent"', () => {
    expect(isDigestDue('not-a-real-date', now)).toBe(true)
  })
})
