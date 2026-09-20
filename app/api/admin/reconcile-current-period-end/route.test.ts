import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Route-level coverage for the current_period_end reconciliation tool —
// proves: platform-admin gating (not billing plan), Stripe-as-authority,
// a scoped single-column write, and safe handling of a missing Stripe
// subscription.

const getUser = vi.fn()
const adminRowMaybeSingle = vi.fn()
const candidatesSelect = vi.fn()
const updateEq = vi.fn().mockResolvedValue({ error: null })
const update = vi.fn((_payload: Record<string, unknown>) => ({ eq: updateEq }))
const subscriptionsRetrieve = vi.fn()

vi.mock('../../../../lib/supabase-server', () => ({
  createRequestClient: vi.fn(() => ({
    auth: { getUser },
    from: (table: string) => {
      if (table === 'platform_admins') {
        return { select: () => ({ eq: () => ({ maybeSingle: adminRowMaybeSingle }) }) }
      }
      throw new Error(`unexpected table on request client: ${table}`)
    },
  })),
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === 'user_subscriptions') {
        return {
          select: () => ({ not: () => ({ is: candidatesSelect }) }),
          update,
        }
      }
      throw new Error(`unexpected table on admin client: ${table}`)
    },
  })),
}))

vi.mock('../../../../lib/billing/stripe', () => ({
  isStripeConfigured: () => true,
  getStripeClient: () => ({ subscriptions: { retrieve: subscriptionsRetrieve } }),
  toSubscriptionLike: (sub: { items: { data: { price: { id: string }; current_period_end?: number | null }[] } }) => ({
    current_period_end: sub.items.data[0]?.current_period_end ?? null,
  }),
}))

function makeRequest(token: string | null) {
  return new NextRequest('https://example.com/api/admin/reconcile-current-period-end', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  update.mockImplementation(() => ({ eq: updateEq }))
  updateEq.mockResolvedValue({ error: null })
  getUser.mockResolvedValue({ data: { user: { id: 'admin-1', email: 'admin@example.com' } }, error: null })
  adminRowMaybeSingle.mockResolvedValue({ data: { owner_id: 'admin-1' } })
  candidatesSelect.mockResolvedValue({
    data: [{ owner_id: 'owner-a', stripe_subscription_id: 'sub_a' }],
  })
  subscriptionsRetrieve.mockResolvedValue({ items: { data: [{ price: { id: 'price_organize' }, current_period_end: 1750000000 }] } })
})

describe('POST /api/admin/reconcile-current-period-end — authorization', () => {
  it('401s an unauthenticated request', async () => {
    const { POST } = await import('./route')
    const res = await POST(makeRequest(null))
    expect(res.status).toBe(401)
    expect(subscriptionsRetrieve).not.toHaveBeenCalled()
  })

  it('403s a non-admin caller without ever calling Stripe or reading candidate rows', async () => {
    adminRowMaybeSingle.mockResolvedValue({ data: null })
    const { POST } = await import('./route')
    const res = await POST(makeRequest('token'))
    expect(res.status).toBe(403)
    expect(candidatesSelect).not.toHaveBeenCalled()
    expect(subscriptionsRetrieve).not.toHaveBeenCalled()
  })

  it('a designated platform admin can trigger reconciliation', async () => {
    const { POST } = await import('./route')
    const res = await POST(makeRequest('token'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toMatchObject({ total: 1, updated: 1, notFound: 0, errored: 0 })
  })
})

describe('POST /api/admin/reconcile-current-period-end — scoped, Stripe-authoritative write', () => {
  it('reads the live value from Stripe and writes ONLY current_period_end, scoped to the owner_id', async () => {
    const { POST } = await import('./route')
    await POST(makeRequest('token'))
    expect(subscriptionsRetrieve).toHaveBeenCalledWith('sub_a')
    expect(update).toHaveBeenCalledWith({ current_period_end: new Date(1750000000 * 1000).toISOString() })
    expect(updateEq).toHaveBeenCalledWith('owner_id', 'owner-a')
  })

  it('never touches plan/status/price/customer — the update payload has exactly one key', async () => {
    const { POST } = await import('./route')
    await POST(makeRequest('token'))
    const payload = update.mock.calls[0][0]
    expect(Object.keys(payload)).toEqual(['current_period_end'])
  })

  it('handles a deleted/missing Stripe subscription safely — no write, reported as not found', async () => {
    const stripeError = Object.assign(new Error('No such subscription'), { code: 'resource_missing' })
    // Simulate Stripe.errors.StripeInvalidRequestError's shape closely enough for the route's instanceof check.
    const Stripe = (await import('stripe')).default
    Object.setPrototypeOf(stripeError, Stripe.errors.StripeInvalidRequestError.prototype)
    subscriptionsRetrieve.mockRejectedValue(stripeError)

    const { POST } = await import('./route')
    const res = await POST(makeRequest('token'))
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body).toMatchObject({ total: 1, updated: 0, notFound: 1, errored: 0 })
    expect(update).not.toHaveBeenCalled()
  })

  it('only reconciles candidates with a null current_period_end and a real subscription id (smallest blast radius)', async () => {
    const { POST } = await import('./route')
    await POST(makeRequest('token'))
    expect(candidatesSelect).toHaveBeenCalledTimes(1)
  })
})
