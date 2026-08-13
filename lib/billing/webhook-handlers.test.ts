import { describe, expect, it, vi } from 'vitest'
import { buildSubscriptionRow, processStripeEvent, type StripeSubscriptionLike, type WebhookDeps } from './webhook-handlers'

const ENV = {
  STRIPE_INVESTOR_PRICE_ID: 'price_investor',
  STRIPE_PORTFOLIO_PRICE_ID: 'price_portfolio',
  STRIPE_PORTFOLIO_PRO_PRICE_ID: 'price_portfolio_pro',
}

function fakeSubscription(overrides: Partial<StripeSubscriptionLike> = {}): StripeSubscriptionLike {
  return {
    id: 'sub_1',
    customer: 'cus_1',
    status: 'active',
    cancel_at_period_end: false,
    current_period_end: 1750000000,
    items: { data: [{ price: { id: 'price_investor' } }] },
    ...overrides,
  }
}

function baseDeps(overrides: Partial<WebhookDeps> = {}): WebhookDeps {
  return {
    claimEvent: vi.fn().mockResolvedValue(true),
    findOwnerIdByCustomerId: vi.fn().mockResolvedValue('owner-1'),
    upsertSubscription: vi.fn().mockResolvedValue(undefined),
    fetchSubscription: vi.fn().mockResolvedValue(fakeSubscription()),
    ...overrides,
  }
}

describe('buildSubscriptionRow', () => {
  it('maps a Stripe subscription to the exact row shape, including plan resolved from price id', () => {
    const row = buildSubscriptionRow({
      ownerId: 'owner-1',
      customerId: 'cus_1',
      subscription: fakeSubscription({ items: { data: [{ price: { id: 'price_portfolio' } }] } }),
      env: ENV,
    })
    expect(row).toEqual({
      owner_id: 'owner-1',
      stripe_customer_id: 'cus_1',
      stripe_subscription_id: 'sub_1',
      stripe_price_id: 'price_portfolio',
      plan: 'portfolio',
      status: 'active',
      current_period_end: new Date(1750000000 * 1000).toISOString(),
      cancel_at_period_end: false,
    })
  })

  it('resolves an unrecognized price id to free rather than guessing', () => {
    const row = buildSubscriptionRow({
      ownerId: 'owner-1',
      customerId: 'cus_1',
      subscription: fakeSubscription({ items: { data: [{ price: { id: 'price_unknown' } }] } }),
      env: ENV,
    })
    expect(row.plan).toBe('free')
  })

  it('handles a subscription with no current_period_end', () => {
    const row = buildSubscriptionRow({ ownerId: 'owner-1', customerId: 'cus_1', subscription: fakeSubscription({ current_period_end: null }), env: ENV })
    expect(row.current_period_end).toBeNull()
  })

  it('preserves every Stripe status verbatim (they match our DB check constraint values)', () => {
    for (const status of ['active', 'trialing', 'past_due', 'unpaid', 'canceled', 'incomplete', 'incomplete_expired', 'paused']) {
      const row = buildSubscriptionRow({ ownerId: 'o', customerId: 'c', subscription: fakeSubscription({ status }), env: ENV })
      expect(row.status).toBe(status)
    }
  })
})

describe('processStripeEvent — idempotency', () => {
  it('processes a new event', async () => {
    const deps = baseDeps()
    const result = await processStripeEvent(
      { id: 'evt_1', type: 'customer.subscription.updated', data: { object: fakeSubscription() } },
      deps,
    )
    expect(result.handled).toBe(true)
    expect(deps.upsertSubscription).toHaveBeenCalledTimes(1)
  })

  it('skips a duplicate event without touching the database further', async () => {
    const deps = baseDeps({ claimEvent: vi.fn().mockResolvedValue(false) })
    const result = await processStripeEvent(
      { id: 'evt_1', type: 'customer.subscription.updated', data: { object: fakeSubscription() } },
      deps,
    )
    expect(result.handled).toBe(false)
    expect(result.reason).toMatch(/duplicate/)
    expect(deps.upsertSubscription).not.toHaveBeenCalled()
    expect(deps.findOwnerIdByCustomerId).not.toHaveBeenCalled()
  })

  it('claims the event exactly once even when processing does real work', async () => {
    const deps = baseDeps()
    await processStripeEvent({ id: 'evt_1', type: 'customer.subscription.updated', data: { object: fakeSubscription() } }, deps)
    expect(deps.claimEvent).toHaveBeenCalledTimes(1)
    expect(deps.claimEvent).toHaveBeenCalledWith('evt_1')
  })
})

describe('processStripeEvent — checkout.session.completed', () => {
  it('resolves the owner from client_reference_id and upserts using the fetched subscription', async () => {
    const deps = baseDeps()
    const result = await processStripeEvent(
      {
        id: 'evt_2',
        type: 'checkout.session.completed',
        data: { object: { customer: 'cus_new', subscription: 'sub_new', client_reference_id: 'owner-42' } },
      },
      deps,
    )
    expect(result.handled).toBe(true)
    expect(deps.fetchSubscription).toHaveBeenCalledWith('sub_new')
    expect(deps.upsertSubscription).toHaveBeenCalledWith(expect.objectContaining({ owner_id: 'owner-42', stripe_customer_id: 'cus_new' }))
    // Never trusts findOwnerIdByCustomerId for this event — client_reference_id was set server-side at Checkout creation time.
    expect(deps.findOwnerIdByCustomerId).not.toHaveBeenCalled()
  })

  it('does nothing if client_reference_id is missing (never guesses which account it belongs to)', async () => {
    const deps = baseDeps()
    const result = await processStripeEvent(
      { id: 'evt_3', type: 'checkout.session.completed', data: { object: { customer: 'cus_1', subscription: 'sub_1', client_reference_id: null } } },
      deps,
    )
    expect(result.handled).toBe(false)
    expect(deps.upsertSubscription).not.toHaveBeenCalled()
  })
})

describe('processStripeEvent — customer.subscription.* ', () => {
  it('created/updated/deleted all resolve owner by stripe_customer_id and upsert', async () => {
    for (const type of ['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'] as const) {
      const deps = baseDeps()
      const result = await processStripeEvent({ id: `evt_${type}`, type, data: { object: fakeSubscription() } }, deps)
      expect(result.handled).toBe(true)
      expect(deps.findOwnerIdByCustomerId).toHaveBeenCalledWith('cus_1')
      expect(deps.upsertSubscription).toHaveBeenCalledTimes(1)
    }
  })

  it('does nothing if no PropPrepped account is mapped to the Stripe customer yet', async () => {
    const deps = baseDeps({ findOwnerIdByCustomerId: vi.fn().mockResolvedValue(null) })
    const result = await processStripeEvent(
      { id: 'evt_4', type: 'customer.subscription.updated', data: { object: fakeSubscription() } },
      deps,
    )
    expect(result.handled).toBe(false)
    expect(deps.upsertSubscription).not.toHaveBeenCalled()
  })

  it('a cancellation (subscription.deleted, status canceled) still upserts — the row is updated to reflect cancellation, never deleted', async () => {
    const deps = baseDeps()
    await processStripeEvent(
      { id: 'evt_5', type: 'customer.subscription.deleted', data: { object: fakeSubscription({ status: 'canceled' }) } },
      deps,
    )
    expect(deps.upsertSubscription).toHaveBeenCalledWith(expect.objectContaining({ status: 'canceled' }))
  })
})

describe('processStripeEvent — invoice.paid / invoice.payment_failed', () => {
  it('re-syncs subscription state by fetching the subscription referenced on the invoice', async () => {
    const deps = baseDeps()
    const result = await processStripeEvent(
      { id: 'evt_6', type: 'invoice.payment_failed', data: { object: { customer: 'cus_1', subscription: 'sub_1' } } },
      deps,
    )
    expect(result.handled).toBe(true)
    expect(deps.fetchSubscription).toHaveBeenCalledWith('sub_1')
    expect(deps.upsertSubscription).toHaveBeenCalledTimes(1)
  })

  it('does nothing for an invoice with no subscription (e.g. a one-off invoice)', async () => {
    const deps = baseDeps()
    const result = await processStripeEvent(
      { id: 'evt_7', type: 'invoice.paid', data: { object: { customer: 'cus_1', subscription: null } } },
      deps,
    )
    expect(result.handled).toBe(false)
    expect(deps.upsertSubscription).not.toHaveBeenCalled()
  })
})

describe('processStripeEvent — unhandled event types', () => {
  it('is a safe no-op for event types we do not act on', async () => {
    const deps = baseDeps()
    const result = await processStripeEvent({ id: 'evt_8', type: 'payment_intent.succeeded', data: { object: {} } }, deps)
    expect(result.handled).toBe(false)
    expect(deps.upsertSubscription).not.toHaveBeenCalled()
  })
})
