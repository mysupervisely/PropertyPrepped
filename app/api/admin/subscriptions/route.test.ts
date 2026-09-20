import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Platform Admin Authorization Fix — route-level coverage for the admin
// Billing/Subscriptions endpoint. Authorization now comes from a
// dedicated platform_admins table (supabase/milestone-33-platform-
// admin.sql), read via the caller's own RLS-scoped request client —
// NEVER from user_subscriptions.plan. These tests exist specifically to
// prove that separation: a caller can have any plan at all, including
// the internal 'owner' plan, and still be rejected unless they also have
// a platform_admins row.

const getUser = vi.fn()
const adminRowMaybeSingle = vi.fn()
const adminRowEq = vi.fn(() => ({ maybeSingle: adminRowMaybeSingle }))
const adminSubscriptionsSelect = vi.fn()
const adminProfilesSelect = vi.fn()
const getUserById = vi.fn()

vi.mock('../../../../lib/supabase-server', () => {
  return {
    createRequestClient: vi.fn(() => ({
      auth: { getUser },
      from: (table: string) => {
        if (table === 'platform_admins') {
          return { select: () => ({ eq: adminRowEq }) }
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

describe('GET /api/admin/subscriptions — platform-admin authorization', () => {
  it('401s an unauthenticated request without ever checking platform_admins', async () => {
    const { GET } = await import('./route')
    const res = await GET(makeRequest(null))
    expect(res.status).toBe(401)
    expect(adminRowMaybeSingle).not.toHaveBeenCalled()
  })

  it('allows a designated platform admin (has a platform_admins row) and returns rows + summary', async () => {
    adminRowMaybeSingle.mockResolvedValue({ data: { owner_id: 'user-1' } })
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

  it('403s a normal paid landlord (a real, paying organize-plan customer with no platform_admins row) and never queries cross-account data', async () => {
    adminRowMaybeSingle.mockResolvedValue({ data: null })
    const { GET } = await import('./route')
    const res = await GET(makeRequest('token'))
    expect(res.status).toBe(403)
    expect(adminSubscriptionsSelect).not.toHaveBeenCalled()
  })

  it('403s a caller whose billing plan is the internal "owner" plan but who has NO platform_admins row — a subscription plan alone must never grant admin access', async () => {
    // This is the exact regression this migration fixes: previously the
    // route checked user_subscriptions.plan === 'owner' directly. Here we
    // simulate an account that (for whatever billing reason) carries the
    // 'owner' plan value, to prove the route no longer even looks at
    // plan at all — only platform_admins matters.
    adminRowMaybeSingle.mockResolvedValue({ data: null })
    const { GET } = await import('./route')
    const res = await GET(makeRequest('token'))
    expect(res.status).toBe(403)
    expect(adminSubscriptionsSelect).not.toHaveBeenCalled()
  })

  it('403s a tenant-role account (an authenticated user with no platform_admins row) — same rejection path as any other non-admin', async () => {
    adminRowMaybeSingle.mockResolvedValue({ data: null })
    getUser.mockResolvedValue({ data: { user: { id: 'tenant-1', email: 'tenant@example.com' } }, error: null })
    const { GET } = await import('./route')
    const res = await GET(makeRequest('token'))
    expect(res.status).toBe(403)
  })

  it('403s a vendor/PropCrew-contact account (an authenticated user with no platform_admins row) — same rejection path as any other non-admin', async () => {
    adminRowMaybeSingle.mockResolvedValue({ data: null })
    getUser.mockResolvedValue({ data: { user: { id: 'vendor-1', email: 'vendor@example.com' } }, error: null })
    const { GET } = await import('./route')
    const res = await GET(makeRequest('token'))
    expect(res.status).toBe(403)
  })

  it('never leaks another account\'s data to a non-admin — the 403 response carries no subscription rows', async () => {
    adminRowMaybeSingle.mockResolvedValue({ data: null })
    const { GET } = await import('./route')
    const res = await GET(makeRequest('token'))
    const body = await res.json()
    expect(body.rows).toBeUndefined()
    expect(res.status).toBe(403)
  })

  it('the authorization check is scoped to the CALLER\'s own id, never a different one', async () => {
    adminRowMaybeSingle.mockResolvedValue({ data: null })
    getUser.mockResolvedValue({ data: { user: { id: 'caller-42', email: 'caller@example.com' } }, error: null })
    const { GET } = await import('./route')
    await GET(makeRequest('token'))
    expect(adminRowEq).toHaveBeenCalledWith('owner_id', 'caller-42')
  })
})
