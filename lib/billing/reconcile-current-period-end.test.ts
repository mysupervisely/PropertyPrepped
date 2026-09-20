import { describe, expect, it, vi } from 'vitest'
import { reconcileCurrentPeriodEnd, type ReconcileDeps, type ReconciliationCandidate } from './reconcile-current-period-end'

function candidate(overrides: Partial<ReconciliationCandidate> = {}): ReconciliationCandidate {
  return { ownerId: 'owner-1', stripeSubscriptionId: 'sub_1', ...overrides }
}

function baseDeps(overrides: Partial<ReconcileDeps> = {}): ReconcileDeps {
  return {
    listCandidates: vi.fn().mockResolvedValue([candidate()]),
    fetchLiveCurrentPeriodEnd: vi.fn().mockResolvedValue({ found: true, currentPeriodEnd: 1750000000 }),
    updateCurrentPeriodEnd: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('reconcileCurrentPeriodEnd', () => {
  it('fetches the live value from Stripe and writes it, scoped to the owner', async () => {
    const deps = baseDeps()
    const summary = await reconcileCurrentPeriodEnd(deps)
    expect(deps.fetchLiveCurrentPeriodEnd).toHaveBeenCalledWith('sub_1')
    expect(deps.updateCurrentPeriodEnd).toHaveBeenCalledWith('owner-1', new Date(1750000000 * 1000).toISOString())
    expect(summary).toMatchObject({ total: 1, updated: 1, notFound: 0, errored: 0 })
  })

  it('never invents a date — a subscription genuinely lacking current_period_end is written as null, never fabricated', async () => {
    const deps = baseDeps({ fetchLiveCurrentPeriodEnd: vi.fn().mockResolvedValue({ found: true, currentPeriodEnd: null }) })
    await reconcileCurrentPeriodEnd(deps)
    expect(deps.updateCurrentPeriodEnd).toHaveBeenCalledWith('owner-1', null)
  })

  it('handles a deleted/missing Stripe subscription safely — reports it, never writes, never throws', async () => {
    const deps = baseDeps({ fetchLiveCurrentPeriodEnd: vi.fn().mockResolvedValue({ found: false }) })
    const summary = await reconcileCurrentPeriodEnd(deps)
    expect(deps.updateCurrentPeriodEnd).not.toHaveBeenCalled()
    expect(summary).toMatchObject({ total: 1, updated: 0, notFound: 1, errored: 0 })
    expect(summary.results[0].outcome).toBe('stripe_subscription_not_found')
  })

  it('one row erroring does not abort the rest of the batch', async () => {
    const deps = baseDeps({
      listCandidates: vi.fn().mockResolvedValue([candidate({ ownerId: 'owner-a', stripeSubscriptionId: 'sub_a' }), candidate({ ownerId: 'owner-b', stripeSubscriptionId: 'sub_b' })]),
      fetchLiveCurrentPeriodEnd: vi.fn()
        .mockRejectedValueOnce(new Error('Stripe API error'))
        .mockResolvedValueOnce({ found: true, currentPeriodEnd: 1750000000 }),
    })
    const summary = await reconcileCurrentPeriodEnd(deps)
    expect(summary.total).toBe(2)
    expect(summary.errored).toBe(1)
    expect(summary.updated).toBe(1)
    expect(deps.updateCurrentPeriodEnd).toHaveBeenCalledTimes(1)
    expect(deps.updateCurrentPeriodEnd).toHaveBeenCalledWith('owner-b', expect.any(String))
  })

  it('is idempotent — running it twice with the same live Stripe state produces the same result both times', async () => {
    const deps = baseDeps()
    const first = await reconcileCurrentPeriodEnd(deps)
    const second = await reconcileCurrentPeriodEnd(deps)
    expect(first.results[0].currentPeriodEnd).toBe(second.results[0].currentPeriodEnd)
    expect(deps.updateCurrentPeriodEnd).toHaveBeenCalledTimes(2)
    expect(deps.updateCurrentPeriodEnd).toHaveBeenNthCalledWith(1, 'owner-1', first.results[0].currentPeriodEnd)
    expect(deps.updateCurrentPeriodEnd).toHaveBeenNthCalledWith(2, 'owner-1', second.results[0].currentPeriodEnd)
  })

  it('reconciles multiple candidates independently, each scoped to its own owner_id (tenant isolation)', async () => {
    const deps = baseDeps({
      listCandidates: vi.fn().mockResolvedValue([
        candidate({ ownerId: 'owner-a', stripeSubscriptionId: 'sub_a' }),
        candidate({ ownerId: 'owner-b', stripeSubscriptionId: 'sub_b' }),
      ]),
      fetchLiveCurrentPeriodEnd: vi.fn((id: string) => Promise.resolve({ found: true, currentPeriodEnd: id === 'sub_a' ? 1000 : 2000 })),
    })
    await reconcileCurrentPeriodEnd(deps)
    expect(deps.updateCurrentPeriodEnd).toHaveBeenCalledWith('owner-a', new Date(1000 * 1000).toISOString())
    expect(deps.updateCurrentPeriodEnd).toHaveBeenCalledWith('owner-b', new Date(2000 * 1000).toISOString())
  })

  it('does nothing when there are no candidates', async () => {
    const deps = baseDeps({ listCandidates: vi.fn().mockResolvedValue([]) })
    const summary = await reconcileCurrentPeriodEnd(deps)
    expect(summary).toEqual({ total: 0, updated: 0, notFound: 0, errored: 0, results: [] })
    expect(deps.fetchLiveCurrentPeriodEnd).not.toHaveBeenCalled()
    expect(deps.updateCurrentPeriodEnd).not.toHaveBeenCalled()
  })
})
