import { describe, expect, it, vi } from 'vitest'
import { isCallerPlatformAdmin } from './platform-admin'

function fakeSupabase(row: { owner_id: string } | null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: row })
  const eq = vi.fn(() => ({ maybeSingle }))
  const select = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ select }))
  return { client: { from } as never, from, select, eq, maybeSingle }
}

describe('isCallerPlatformAdmin', () => {
  it('returns true when the caller has a platform_admins row', async () => {
    const { client, from, eq } = fakeSupabase({ owner_id: 'owner-1' })
    const result = await isCallerPlatformAdmin(client, 'owner-1')
    expect(result).toBe(true)
    expect(from).toHaveBeenCalledWith('platform_admins')
    expect(eq).toHaveBeenCalledWith('owner_id', 'owner-1')
  })

  it('returns false when the caller has no platform_admins row', async () => {
    const { client } = fakeSupabase(null)
    const result = await isCallerPlatformAdmin(client, 'owner-1')
    expect(result).toBe(false)
  })

  it('always scopes the query to the id passed in — never a hard-coded account', async () => {
    const { client, eq } = fakeSupabase(null)
    await isCallerPlatformAdmin(client, 'some-other-owner-id')
    expect(eq).toHaveBeenCalledWith('owner_id', 'some-other-owner-id')
  })
})
