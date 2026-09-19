import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Subscription Management milestone — the admin Billing/Subscriptions
// route is the one genuinely new cross-account data path in this
// milestone, so it gets a real route-level test (unlike the other billing
// routes, which stay thin wrappers around already-unit-tested lib
// functions). Mocks supabase-server and lib/billing/stripe so this never
// touches a real Supabase/Stripe project.

const getUser = vi.fn()
const ownSelectMaybeSingle = vi.fn()
const adminSubscriptionsSelect = vi.fn()
const adminProfilesSelect = vi.fn()
const getUserById = vi.fn()

vi.mock('../../../../lib/supabase-server', () => {
  return {
    createRequestClient: vi.fn(() => ({
      auth: { getUser },
      from: (table: string) => {
        if (table === 'user_subscriptions') {
          return { select: () => ({ eq: () => ({ maybeSingle: ownSelectMaybeSingle }) }) }
        }
        throw new Error(`unexpected table on request client: ${table}`)
      },
    })),
    createAdminClient: vi.fn(() => ({
      auth: { admin: { getUserById } },
      from: (table: string) => {
        if (table === 'user_subscriptions') {
          return { select: () => ({ order: adminSubscriptionsSelect }) }
        }
        if (table === 'user_profiles') {
          return { select: () => ({ in: adminProfilesSelect }) }
        }
        throw new Error(`unexpected table on admin client: ${table}`)
      },
    })),
  }
})

vi.mock('../../../../lib/billing/stripe', () => ({
  isStripeConfigured: () => false,
  getStripeClient: vi.fn(),
}))

function makeRequest(token: string | null) {
  return new NextRequest('https://example.com/api/admin/subscriptions', {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'user-1', email: 'user@example.com' } }, error: null })
  adminProfilesSelect.mockResolvedValue({ data: [] })
  getUserById.mockResolvedValue({ data: { user: { email: 'someone@example.com' } }, error: null })
})

describe('GET /api/admin/subscriptions — authorization', () => {
  it('401s an unauthenticated request without ever reading a subscription row', async () => {
    const { GET } = await import('./route')
    const res = await GET(makeRequest(null))
    expect(res.status).toBe(401)
    expect(ownSelectMaybeSingle).not.toHaveBeenCalled()
  })

  it('403s a signed-in caller whose own plan is not owner, and never queries the cross-account admin data', async () => {
    ownSelectMaybeSingle.mockResolvedValue({ data: { plan: 'manage' } })
    const { GET } = await import('./route')
    const res = await GET(makeRequest('token'))
    expect(res.status).toBe(403)
    expect(adminSubscriptionsSelect).not.toHaveBeenCalled()
  })

  it('403s a caller with no subscription row at all (defaults to non-owner, never treats "no row" as owner)', async () => {
    ownSelectMaybeSingle.mockResolvedValue({ data: null })
    const { GET } = await import('./route')
    const res = await GET(makeRequest('token'))
    expect(res.status).toBe(403)
  })

  it('returns subscriber rows + summary for a caller whose own plan is owner', async () => {
    ownSelectMaybeSingle.mockResolvedValue({ data: { plan: 'owner' } })
    adminSubscriptionsSelect.mockResolvedValue({
      data: [
        {
          owner_id: 'owner-a',
          plan: 'organize',
          status: 'active',
          stripe_customer_id: 'cus_a',
          stripe_subscription_id: 'sub_a',
          created_at: '2025-01-01T00:00:00.000Z',
          current_period_end: '2026-01-01T00:00:00.000Z',
          cancel_at_period_end: false,
        },
      ],
      error: null,
    })
    const { GET } = await import('./route')
    const res = await GET(makeRequest('token'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.rows).toHaveLength(1)
    expect(body.rows[0]).toMatchObject({ ownerId: 'owner-a', plan: 'organize', statusLabel: 'Active' })
    expect(body.summary).toMatchObject({ activeSubscriptions: 1 })
  })

  it('never leaks another account\'s data to a non-owner — the 403 response carries no subscription rows', async () => {
    ownSelectMaybeSingle.mockResolvedValue({ data: { plan: 'free' } })
    const { GET } = await import('./route')
    const res = await GET(makeRequest('token'))
    const body = await res.json()
    expect(body.rows).toBeUndefined()
    expect(res.status).toBe(403)
  })
})
