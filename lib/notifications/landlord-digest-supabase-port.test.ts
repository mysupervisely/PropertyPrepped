import { describe, expect, it, vi } from 'vitest'
import { createLandlordDigestSupabasePort } from './landlord-digest-supabase-port'

// A minimal fake that mimics just enough of the chainable Supabase
// query-builder surface this port actually calls (.from().select().eq()
// [.maybeSingle()], and .update().eq()), recording every call so tests
// can assert the exact owner_id filter was applied — no real Supabase
// client or network involved.
function makeFakeAdmin() {
  const calls: { table: string; select?: string; eq?: [string, unknown]; update?: unknown }[] = []
  const tableData: Record<string, unknown[]> = {}

  function builder(table: string) {
    const call: { table: string; select?: string; eq?: [string, unknown]; update?: unknown } = { table }
    calls.push(call)
    const chain = {
      select(columns: string) {
        call.select = columns
        return chain
      },
      update(values: unknown) {
        call.update = values
        return chain
      },
      eq(column: string, value: unknown) {
        call.eq = [column, value]
        return chain
      },
      maybeSingle: async () => ({ data: (tableData[table] || [])[0] ?? null, error: null }),
      then(resolve: (result: { data: unknown[]; error: null }) => void) {
        resolve({ data: tableData[table] || [], error: null })
      },
    }
    return chain
  }

  const admin = {
    from: vi.fn((table: string) => builder(table)),
    auth: {
      admin: {
        getUserById: vi.fn(async (): Promise<{ data: { user: { email: string } | null }; error: { message: string } | null }> => ({ data: { user: { email: 'owner@example.com' } }, error: null })),
      },
    },
  }

  return { admin, calls, tableData }
}

const OWNER_ID = 'owner-123'

describe('createLandlordDigestSupabasePort — owner isolation contract', () => {
  it('listOwnerPreferences reads the whole preferences table with no owner filter (by design — it IS the owner list)', async () => {
    const { admin, calls } = makeFakeAdmin()
    const port = createLandlordDigestSupabasePort(admin as never)
    await port.listOwnerPreferences()
    const call = calls.find((c) => c.table === 'notification_preferences')
    expect(call?.eq).toBeUndefined()
  })

  it('getSubscriptionRow filters by owner_id', async () => {
    const { admin, calls } = makeFakeAdmin()
    const port = createLandlordDigestSupabasePort(admin as never)
    await port.getSubscriptionRow(OWNER_ID)
    expect(calls.find((c) => c.table === 'user_subscriptions')?.eq).toEqual(['owner_id', OWNER_ID])
  })

  it('every portfolio table query filters by owner_id — properties, leases, insurance, mortgages, maintenance, rent payments, systems, tenant requests', async () => {
    const { admin, calls } = makeFakeAdmin()
    const port = createLandlordDigestSupabasePort(admin as never)
    await port.getPortfolioRows(OWNER_ID)
    const expectedTables = ['properties', 'leases', 'insurance_policies', 'mortgages', 'maintenance_records', 'rent_payments', 'property_systems', 'tenant_requests']
    for (const table of expectedTables) {
      const call = calls.find((c) => c.table === table)
      expect(call, `expected a query against ${table}`).toBeTruthy()
      expect(call?.eq, `expected ${table} to be filtered by owner_id`).toEqual(['owner_id', OWNER_ID])
    }
  })

  it('markDigestSent updates only the target owner\'s row (owner_id filter present on the update)', async () => {
    const { admin, calls } = makeFakeAdmin()
    const port = createLandlordDigestSupabasePort(admin as never)
    const ok = await port.markDigestSent(OWNER_ID, '2026-09-15T13:00:00.000Z')
    expect(ok).toBe(true)
    const call = calls.find((c) => c.table === 'notification_preferences' && c.update)
    expect(call?.eq).toEqual(['owner_id', OWNER_ID])
    expect(call?.update).toMatchObject({ last_weekly_digest_sent_at: '2026-09-15T13:00:00.000Z' })
  })

  it('getOwnerEmail uses the Admin API (auth.admin.getUserById), never a duplicated email column, and returns null on any error', async () => {
    const { admin } = makeFakeAdmin()
    const port = createLandlordDigestSupabasePort(admin as never)
    const email = await port.getOwnerEmail(OWNER_ID)
    expect(email).toBe('owner@example.com')
    expect(admin.auth.admin.getUserById).toHaveBeenCalledWith(OWNER_ID)

    admin.auth.admin.getUserById = vi.fn(async () => ({ data: { user: null }, error: { message: 'not found' } }))
    const missing = await port.getOwnerEmail(OWNER_ID)
    expect(missing).toBeNull()
  })
})
