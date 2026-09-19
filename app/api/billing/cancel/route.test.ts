import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Route-level coverage for the one property this route must guarantee
// (Section SECURITY: "never accept an arbitrary Stripe customer ID from
// the browser and operate on it without server-side ownership
// verification"): the Stripe subscription id it acts on comes ONLY from
// the caller's own RLS-scoped row — never from the request body, even
// when the body tries to smuggle one in.

const getUser = vi.fn()
const ownSelectMaybeSingle = vi.fn()
const stripeSubscriptionsUpdate = vi.fn()
const adminUpsert = vi.fn()

vi.mock('../../../../lib/supabase-server', () => ({
  createRequestClient: vi.fn(() => ({
    auth: { getUser },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: ownSelectMaybeSingle }) }) }),
  })),
  createAdminClient: vi.fn(() => ({
    from: () => ({ upsert: adminUpsert }),
  })),
}))

vi.mock('../../../../lib/billing/stripe', () => ({
  isStripeConfigured: () => true,
  getStripeClient: () => ({ subscriptions: { update: stripeSubscriptionsUpdate } }),
  toSubscriptionLike: (sub: unknown) => sub,
  planForPriceId: () => 'organize',
}))

function makeRequest(token: string | null, body?: unknown) {
  return new NextRequest('https://example.com/api/billing/cancel', {
    method: 'POST',
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'owner-1', email: 'owner@example.com' } }, error: null })
  ownSelectMaybeSingle.mockResolvedValue({
    data: {
      plan: 'organize',
      stripe_customer_id: 'cus_real_owner',
      stripe_subscription_id: 'sub_real_owner',
      status: 'active',
      current_period_end: '2026-01-01T00:00:00.000Z',
      cancel_at_period_end: false,
    },
  })
  stripeSubscriptionsUpdate.mockResolvedValue({
    id: 'sub_real_owner',
    customer: 'cus_real_owner',
    status: 'active',
    cancel_at_period_end: true,
    current_period_end: 1750000000,
    items: { data: [{ price: { id: 'price_organize' } }] },
  })
  adminUpsert.mockResolvedValue({ data: null, error: null })
})

describe('POST /api/billing/cancel — security', () => {
  it('401s an unauthenticated request', async () => {
    const { POST } = await import('./route')
    const res = await POST(makeRequest(null))
    expect(res.status).toBe(401)
    expect(stripeSubscriptionsUpdate).not.toHaveBeenCalled()
  })

  it('ignores a client-supplied subscription/customer id in the request body — always uses the caller\'s own row', async () => {
    const { POST } = await import('./route')
    const res = await POST(makeRequest('token', { stripe_subscription_id: 'sub_someone_elses', stripe_customer_id: 'cus_someone_elses' }))
    expect(res.status).toBe(200)
    expect(stripeSubscriptionsUpdate).toHaveBeenCalledWith('sub_real_owner', { cancel_at_period_end: true })
  })

  it('schedules cancellation at period end, never immediately', async () => {
    const { POST } = await import('./route')
    await POST(makeRequest('token'))
    expect(stripeSubscriptionsUpdate).toHaveBeenCalledWith('sub_real_owner', { cancel_at_period_end: true })
  })

  it('404s when the caller has no subscription of their own on file', async () => {
    ownSelectMaybeSingle.mockResolvedValue({ data: null })
    const { POST } = await import('./route')
    const res = await POST(makeRequest('token'))
    expect(res.status).toBe(404)
    expect(stripeSubscriptionsUpdate).not.toHaveBeenCalled()
  })
})
