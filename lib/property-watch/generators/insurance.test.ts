import { describe, expect, it } from 'vitest'
import { deriveInsuranceWatchDraft, type InsurancePolicyLike } from './insurance'
import type { PropertyLike } from './lease'

const NOW = new Date('2026-08-14T12:00:00')
const at = (daysFromNow: number) => {
  const d = new Date(NOW)
  d.setDate(d.getDate() + daysFromNow)
  return d.toISOString().slice(0, 10)
}

const property: PropertyLike = { id: 'prop-1', owner_id: 'owner-1', address: '123 Main St' }

function policy(overrides: Partial<InsurancePolicyLike> = {}): InsurancePolicyLike {
  return { id: 'policy-1', property_id: 'prop-1', owner_id: 'owner-1', carrier: 'Acme Insurance', annual_premium: 2840, expiration_date: at(42), created_at: '2026-01-01T00:00:00Z', ...overrides }
}

describe('deriveInsuranceWatchDraft', () => {
  it('produces an expiration warning inside the 90-day window', () => {
    const draft = deriveInsuranceWatchDraft([policy({ expiration_date: at(42) })], property, NOW)
    expect(draft?.category).toBe('Insurance')
    expect(draft?.priority).toBe('Normal') // 42 days -> Normal band
    expect(draft?.action_type).toBe('Review Policy')
  })

  it('nothing is produced outside the 90-day window', () => {
    expect(deriveInsuranceWatchDraft([policy({ expiration_date: at(150) })], property, NOW)).toBeNull()
  })

  it('nothing is produced when there is no policy on file', () => {
    expect(deriveInsuranceWatchDraft([], property, NOW)).toBeNull()
  })

  it('deterministically calculates a premium increase when a prior policy exists', () => {
    const current = policy({ id: 'policy-2', annual_premium: 3620, created_at: '2026-06-01T00:00:00Z', expiration_date: at(42) })
    const previous = policy({ id: 'policy-1', annual_premium: 2840, created_at: '2025-06-01T00:00:00Z' })
    const draft = deriveInsuranceWatchDraft([previous, current], property, NOW)!
    const change = draft.metadata.premiumChange as { previousAmount: number; currentAmount: number; increaseAmount: number; increasePercent: number }
    expect(change.previousAmount).toBe(2840)
    expect(change.currentAmount).toBe(3620)
    expect(change.increaseAmount).toBe(780)
    expect(change.increasePercent).toBeCloseTo(27.46, 1)
    expect(draft.description).toContain('2,840')
    expect(draft.description).toContain('3,620')
  })

  it('does NOT compare premiums when a prior policy is missing — never a fabricated comparison', () => {
    const draft = deriveInsuranceWatchDraft([policy({ expiration_date: at(42) })], property, NOW)!
    expect(draft.metadata.premiumChange).toBeNull()
    expect(draft.description).not.toContain('increased')
  })

  it('uses the most recently added row as "current" regardless of array order', () => {
    const older = policy({ id: 'older', created_at: '2024-01-01T00:00:00Z', annual_premium: 2000, expiration_date: at(500) })
    const newer = policy({ id: 'newer', created_at: '2026-01-01T00:00:00Z', annual_premium: 2500, expiration_date: at(20) })
    const draft = deriveInsuranceWatchDraft([older, newer], property, NOW)! // older listed first
    expect(draft.source_id).toBe('newer')
  })
})
