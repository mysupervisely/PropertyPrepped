import { describe, expect, it, vi } from 'vitest'
import { cancelSubscription, resumeSubscription, type OwnSubscriptionRow, type SubscriptionActionDeps } from './subscription-actions'
import type { StripeSubscriptionLike } from './webhook-handlers'

function ownRow(overrides: Partial<NonNullable<OwnSubscriptionRow>> = {}): OwnSubscriptionRow {
  return {
    plan: 'organize',
    stripe_customer_id: 'cus_1',
    stripe_subscription_id: 'sub_1',
    status: 'active',
    current_period_end: '2026-01-01T00:00:00.000Z',
    cancel_at_period_end: false,
    ...overrides,
  }
}

function fakeUpdatedSubscription(overrides: Partial<StripeSubscriptionLike> = {}): StripeSubscriptionLike {
  return {
    id: 'sub_1',
    customer: 'cus_1',
    status: 'active',
    cancel_at_period_end: true,
    current_period_end: 1750000000,
    items: { data: [{ price: { id: 'price_organize' } }] },
    ...overrides,
  }
}

function baseDeps(overrides: Partial<SubscriptionActionDeps> = {}): SubscriptionActionDeps {
  return {
    getOwnSubscription: vi.fn().mockResolvedValue(ownRow()),
    updateCancelAtPeriodEnd: vi.fn().mockResolvedValue(fakeUpdatedSubscription()),
    upsertSubscription: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('cancelSubscription — schedule cancellation', () => {
  it('calls Stripe with cancel_at_period_end: true and upserts the resulting row', async () => {
    const deps = baseDeps()
    const result = await cancelSubscription('owner-1', deps)
    expect(deps.updateCancelAtPeriodEnd).toHaveBeenCalledWith('sub_1', true)
    expect(deps.upsertSubscription).toHaveBeenCalledTimes(1)
    expect(result).toEqual({ ok: true, row: expect.objectContaining({ owner_id: 'owner-1', cancel_at_period_end: true }) })
  })

  it('derives the subscription id ONLY from getOwnSubscription — never from anything else', async () => {
    const getOwnSubscription = vi.fn().mockResolvedValue(ownRow({ stripe_subscription_id: 'sub_the_real_one' }))
    const deps = baseDeps({ getOwnSubscription })
    await cancelSubscription('owner-1', deps)
    expect(deps.updateCancelAtPeriodEnd).toHaveBeenCalledWith('sub_the_real_one', true)
  })

  it('404s when the caller has no subscription on file', async () => {
    const deps = baseDeps({ getOwnSubscription: vi.fn().mockResolvedValue(null) })
    const result = await cancelSubscription('owner-1', deps)
    expect(result).toEqual({ ok: false, error: expect.any(String), status: 404 })
    expect(deps.updateCancelAtPeriodEnd).not.toHaveBeenCalled()
  })

  it('rejects canceling an already-canceled subscription without calling Stripe', async () => {
    const deps = baseDeps({ getOwnSubscription: vi.fn().mockResolvedValue(ownRow({ status: 'canceled' })) })
    const result = await cancelSubscription('owner-1', deps)
    expect(result.ok).toBe(false)
    expect(deps.updateCancelAtPeriodEnd).not.toHaveBeenCalled()
  })

  it('is idempotent — a subscription already scheduled to cancel is a safe no-op (no duplicate Stripe call or write)', async () => {
    const deps = baseDeps({ getOwnSubscription: vi.fn().mockResolvedValue(ownRow({ cancel_at_period_end: true })) })
    const result = await cancelSubscription('owner-1', deps)
    expect(result.ok).toBe(true)
    expect(deps.updateCancelAtPeriodEnd).not.toHaveBeenCalled()
    expect(deps.upsertSubscription).not.toHaveBeenCalled()
  })
})

describe('resumeSubscription', () => {
  it('calls Stripe with cancel_at_period_end: false when a cancellation is scheduled and period has not expired', async () => {
    const deps = baseDeps({ getOwnSubscription: vi.fn().mockResolvedValue(ownRow({ cancel_at_period_end: true })) })
    const result = await resumeSubscription('owner-1', deps)
    expect(deps.updateCancelAtPeriodEnd).toHaveBeenCalledWith('sub_1', false)
    expect(deps.upsertSubscription).toHaveBeenCalledTimes(1)
    expect(result.ok).toBe(true)
  })

  it('rejects resuming when no cancellation is scheduled', async () => {
    const deps = baseDeps({ getOwnSubscription: vi.fn().mockResolvedValue(ownRow({ cancel_at_period_end: false })) })
    const result = await resumeSubscription('owner-1', deps)
    expect(result).toEqual({ ok: false, error: expect.any(String), status: 400 })
    expect(deps.updateCancelAtPeriodEnd).not.toHaveBeenCalled()
  })

  it('rejects resuming a subscription whose paid period has already fully ended (status canceled)', async () => {
    const deps = baseDeps({ getOwnSubscription: vi.fn().mockResolvedValue(ownRow({ status: 'canceled', cancel_at_period_end: true })) })
    const result = await resumeSubscription('owner-1', deps)
    expect(result.ok).toBe(false)
    expect(deps.updateCancelAtPeriodEnd).not.toHaveBeenCalled()
  })

  it('404s when the caller has no subscription on file', async () => {
    const deps = baseDeps({ getOwnSubscription: vi.fn().mockResolvedValue(null) })
    const result = await resumeSubscription('owner-1', deps)
    expect(result).toEqual({ ok: false, error: expect.any(String), status: 404 })
  })

  it('restores the renewal date/status from the upserted row (continued access reflected immediately, not just via webhook)', async () => {
    const deps = baseDeps({
      getOwnSubscription: vi.fn().mockResolvedValue(ownRow({ cancel_at_period_end: true })),
      updateCancelAtPeriodEnd: vi.fn().mockResolvedValue(fakeUpdatedSubscription({ cancel_at_period_end: false, current_period_end: 1800000000 })),
    })
    const result = await resumeSubscription('owner-1', deps)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.row.cancel_at_period_end).toBe(false)
      expect(result.row.current_period_end).toBe(new Date(1800000000 * 1000).toISOString())
    }
  })
})
