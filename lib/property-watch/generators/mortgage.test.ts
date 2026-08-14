import { describe, expect, it } from 'vitest'
import { deriveMortgageWatchDraft, type MortgageLike } from './mortgage'
import type { PropertyLike } from './lease'

const NOW = new Date('2026-08-14T12:00:00')
const at = (daysFromNow: number) => {
  const d = new Date(NOW)
  d.setDate(d.getDate() + daysFromNow)
  return d.toISOString().slice(0, 10)
}

const property: PropertyLike = { id: 'prop-1', owner_id: 'owner-1', address: '9 Lender Ln' }

function mortgage(overrides: Partial<MortgageLike> = {}): MortgageLike {
  return { id: 'mortgage-1', property_id: 'prop-1', owner_id: 'owner-1', lender: 'First Bank', maturity_date: at(45), ...overrides }
}

describe('deriveMortgageWatchDraft', () => {
  it('produces a maturity item inside the warning window', () => {
    const draft = deriveMortgageWatchDraft(mortgage({ maturity_date: at(45) }), property, NOW)
    expect(draft?.category).toBe('Mortgage')
    expect(draft?.priority).toBe('Normal')
  })

  it('never recommends refinancing', () => {
    const draft = deriveMortgageWatchDraft(mortgage({ maturity_date: at(10) }), property, NOW)!
    expect(draft.description.toLowerCase()).not.toContain('refinanc')
  })

  it('produces nothing without a maturity date', () => {
    expect(deriveMortgageWatchDraft(mortgage({ maturity_date: null }), property, NOW)).toBeNull()
  })

  it('produces nothing outside the warning window', () => {
    expect(deriveMortgageWatchDraft(mortgage({ maturity_date: at(400) }), property, NOW)).toBeNull()
  })
})
