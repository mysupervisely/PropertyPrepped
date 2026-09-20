import { describe, expect, it, vi } from 'vitest'
import { buildSubscriptionRow, normalizeSubscriptionEventObject, processStripeEvent, type RawSubscriptionEventObject, type StripeSubscriptionLike, type WebhookDeps } from './webhook-handlers'

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

// The RAW shape a customer.subscription.* webhook event actually delivers
// at the installed Stripe API version — current_period_end lives ONLY on
// the item, never as a flat field. This is what event.data.object really
// looks like on the wire; fakeSubscription() above (flat current_period_end)
// is the ALREADY-NORMALIZED shape used elsewhere (deps.fetchSubscription's
// return value), never the raw webhook payload.
function fakeRawSubscriptionEvent(overrides: Partial<RawSubscriptionEventObject> = {}): RawSubscriptionEventObject {
  return {
    id: 'sub_1',
    customer: 'cus_1',
    status: 'active',
    cancel_at_period_end: false,
    items: { data: [{ price: { id: 'price_investor' }, current_period_end: 1750000000 }] },
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
      { id: 'evt_1', type: 'customer.subscription.updated', data: { object: fakeRawSubscriptionEvent() } },
      deps,
    )
    expect(result.handled).toBe(true)
    expect(deps.upsertSubscription).toHaveBeenCalledTimes(1)
  })

  it('skips a duplicate event without touching the database further', async () => {
    const deps = baseDeps({ claimEvent: vi.fn().mockResolvedValue(false) })
    const result = await processStripeEvent(
      { id: 'evt_1', type: 'customer.subscription.updated', data: { object: fakeRawSubscriptionEvent() } },
      deps,
    )
    expect(result.handled).toBe(false)
    expect(result.reason).toMatch(/duplicate/)
    expect(deps.upsertSubscription).not.toHaveBeenCalled()
    expect(deps.findOwnerIdByCustomerId).not.toHaveBeenCalled()
  })

  it('claims the event exactly once even when processing does real work', async () => {
    const deps = baseDeps()
    await processStripeEvent({ id: 'evt_1', type: 'customer.subscription.updated', data: { object: fakeRawSubscriptionEvent() } }, deps)
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
      const result = await processStripeEvent({ id: `evt_${type}`, type, data: { object: fakeRawSubscriptionEvent() } }, deps)
      expect(result.handled).toBe(true)
      expect(deps.findOwnerIdByCustomerId).toHaveBeenCalledWith('cus_1')
      expect(deps.upsertSubscription).toHaveBeenCalledTimes(1)
    }
  })

  it('does nothing if no PropPrepped account is mapped to the Stripe customer yet', async () => {
    const deps = baseDeps({ findOwnerIdByCustomerId: vi.fn().mockResolvedValue(null) })
    const result = await processStripeEvent(
      { id: 'evt_4', type: 'customer.subscription.updated', data: { object: fakeRawSubscriptionEvent() } },
      deps,
    )
    expect(result.handled).toBe(false)
    expect(deps.upsertSubscription).not.toHaveBeenCalled()
  })

  it('a cancellation (subscription.deleted, status canceled) still upserts — the row is updated to reflect cancellation, never deleted', async () => {
    const deps = baseDeps()
    await processStripeEvent(
      { id: 'evt_5', type: 'customer.subscription.deleted', data: { object: fakeRawSubscriptionEvent({ status: 'canceled' }) } },
      deps,
    )
    expect(deps.upsertSubscription).toHaveBeenCalledWith(expect.objectContaining({ status: 'canceled' }))
  })

  it('BUG FIX REGRESSION: reads current_period_end from the item, not a (nonexistent) flat field on the raw payload — the exact production symptom (Active status + correct invoices, but "—" for renewal date)', async () => {
    const deps = baseDeps()
    await processStripeEvent(
      { id: 'evt_regression', type: 'customer.subscription.updated', data: { object: fakeRawSubscriptionEvent({ items: { data: [{ price: { id: 'price_investor' }, current_period_end: 1800000000 }] } }) } },
      deps,
    )
    expect(deps.upsertSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ current_period_end: new Date(1800000000 * 1000).toISOString() }),
    )
  })

  it('never derives current_period_end from a flat field even if one were somehow present on the raw payload — items is the only source of truth', async () => {
    const deps = baseDeps()
    const rawWithStrayFlatField = { ...fakeRawSubscriptionEvent(), current_period_end: 999 } as unknown as RawSubscriptionEventObject
    await processStripeEvent(
      { id: 'evt_regression_2', type: 'customer.subscription.updated', data: { object: rawWithStrayFlatField } },
      deps,
    )
    expect(deps.upsertSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ current_period_end: new Date(1750000000 * 1000).toISOString() }),
    )
  })

  it('resolves to null (not a crash) when the item genuinely has no current_period_end', async () => {
    const deps = baseDeps()
    await processStripeEvent(
      { id: 'evt_6b', type: 'customer.subscription.updated', data: { object: fakeRawSubscriptionEvent({ items: { data: [{ price: { id: 'price_investor' } }] } }) } },
      deps,
    )
    expect(deps.upsertSubscription).toHaveBeenCalledWith(expect.objectContaining({ current_period_end: null }))
  })
})

describe('normalizeSubscriptionEventObject', () => {
  it('extracts current_period_end from items.data[0], never from a flat field', () => {
    const result = normalizeSubscriptionEventObject(fakeRawSubscriptionEvent())
    expect(result.current_period_end).toBe(1750000000)
  })

  it('preserves id/customer/status/cancel_at_period_end verbatim', () => {
    const result = normalizeSubscriptionEventObject(fakeRawSubscriptionEvent({ status: 'past_due', cancel_at_period_end: true }))
    expect(result).toMatchObject({ id: 'sub_1', customer: 'cus_1', status: 'past_due', cancel_at_period_end: true })
  })

  it('maps items down to the price-id-only shape buildSubscriptionRow expects', () => {
    const result = normalizeSubscriptionEventObject(fakeRawSubscriptionEvent())
    expect(result.items).toEqual({ data: [{ price: { id: 'price_investor' } }] })
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
