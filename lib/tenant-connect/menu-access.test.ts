import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { hasPersonalTenantAccess } from './menu-access'

function clientWith(rows: Record<string, string>[]) {
  return { from: () => {
    const filters: Record<string, string> = {}
    const query = {
      select: () => query,
      eq: (key: string, value: string) => { filters[key] = value; return query },
      limit: async () => ({ data: rows.filter(row => Object.entries(filters).every(([key, value]) => row[key] === value)).slice(0, 1) }),
    }
    return query
  } } as unknown as SupabaseClient
}

describe('Personal tenant menu access', () => {
  it('does not treat invitations sent by a landlord as their own tenant access', async () => {
    const client = clientWith([{ id: 'invite', landlord_id: 'owner', tenant_email: 'renter@example.com', status: 'Invited' }])
    expect(await hasPersonalTenantAccess(client, { id: 'owner', email: 'owner@example.com' })).toBe(false)
  })
  it('shows the tenant destination for a pending invite matching the account email', async () => {
    const client = clientWith([{ id: 'invite', tenant_email: 'renter@example.com', status: 'Invited' }])
    expect(await hasPersonalTenantAccess(client, { id: 'renter', email: ' Renter@Example.com ' })).toBe(true)
  })
  it('recognizes active access by user id without requiring an email', async () => {
    const client = clientWith([{ id: 'access', tenant_user_id: 'renter', status: 'Active' }])
    expect(await hasPersonalTenantAccess(client, { id: 'renter' })).toBe(true)
  })
  it('excludes revoked access and another tenant', async () => {
    const client = clientWith([{ tenant_user_id: 'renter', status: 'Revoked' }, { tenant_user_id: 'other', status: 'Active' }])
    expect(await hasPersonalTenantAccess(client, { id: 'renter' })).toBe(false)
  })
})
