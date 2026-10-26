import { describe, expect, it } from 'vitest'
import {
  buildTenantDirectory, summarizeTenantDirectory, filterTenantDirectory, directoryPropertyLabel,
} from './directory'
import type { TenantPropertyAccess } from './types'

const PROPERTIES = [
  { id: 'prop-1', address: '123 Harbor Lane', city: 'Tampa' },
  { id: 'prop-2', address: '842 Palm Avenue', city: 'St. Petersburg' },
  { id: 'prop-3', address: '57 Cedar Court', city: 'Clearwater' },
]

function access(partial: Partial<TenantPropertyAccess>): TenantPropertyAccess {
  return {
    id: 'access-1', property_id: 'prop-1', owner_id: 'owner-1', tenant_user_id: null,
    tenant_email: 'jordan@example.test', lease_id: 'lease-1', status: 'Invited',
    invited_at: '2026-01-01', accepted_at: null, revoked_at: null, created_at: '2026-01-01',
    ...partial,
  }
}

describe('directoryPropertyLabel', () => {
  it('joins address and city when both are present', () => {
    expect(directoryPropertyLabel({ id: 'p', address: '123 Harbor Lane', city: 'Tampa' })).toBe('123 Harbor Lane, Tampa')
  })

  it('falls back to the bare address when city is empty', () => {
    expect(directoryPropertyLabel({ id: 'p', address: '123 Harbor Lane', city: '' })).toBe('123 Harbor Lane')
  })
})

describe('buildTenantDirectory', () => {
  const leases = [
    { id: 'lease-1', property_id: 'prop-1', tenant_name: 'Jordan Reyes', tenant_email: 'jordan@example.test', start_date: '2025-01-01', end_date: '2027-01-01' },
    { id: 'lease-2', property_id: 'prop-2', tenant_name: 'Sam Whitfield', tenant_email: 'sam@example.test', start_date: '2025-01-01', end_date: '2027-01-01' },
    // Expired — prop-3 has no current lease and must not appear.
    { id: 'lease-3', property_id: 'prop-3', tenant_name: 'Old Tenant', tenant_email: null, start_date: '2020-01-01', end_date: '2021-01-01' },
  ]

  it('produces one row per property with a current lease, skipping properties with no current lease', () => {
    const rows = buildTenantDirectory(PROPERTIES, leases, [], [])
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.propertyId).sort()).toEqual(['prop-1', 'prop-2'])
  })

  it('joins the current lease to its own Tenant Connect access row by lease_id, not by email or property alone', () => {
    const accessRows = [access({ id: 'a1', property_id: 'prop-1', lease_id: 'lease-1', status: 'Active' })]
    const rows = buildTenantDirectory(PROPERTIES, leases, accessRows, [])
    const row = rows.find((r) => r.propertyId === 'prop-1')!
    expect(row.statusLabel).toBe('Connected')
    expect(row.access?.id).toBe('a1')
    const other = rows.find((r) => r.propertyId === 'prop-2')!
    expect(other.statusLabel).toBe('Not connected')
    expect(other.access).toBeNull()
  })

  it('a current lease with no access row at all is "Not connected", not an error', () => {
    const rows = buildTenantDirectory(PROPERTIES, leases, [], [])
    expect(rows.every((r) => r.statusLabel === 'Not connected' && r.access === null)).toBe(true)
  })

  it('counts only this tenant\'s own non-Resolved tenant_requests, never another tenant\'s', () => {
    const accessRows = [access({ id: 'a1', property_id: 'prop-1', lease_id: 'lease-1', status: 'Active' })]
    const requests = [
      { tenant_access_id: 'a1', status: 'New' as const },
      { tenant_access_id: 'a1', status: 'Resolved' as const },
      { tenant_access_id: 'some-other-access', status: 'New' as const },
    ]
    const rows = buildTenantDirectory(PROPERTIES, leases, accessRows, requests)
    expect(rows.find((r) => r.propertyId === 'prop-1')!.openRequestCount).toBe(1)
  })
})

describe('summarizeTenantDirectory', () => {
  it('never invents a count outside the rows it was given', () => {
    const rows = buildTenantDirectory(
      PROPERTIES,
      [
        { id: 'lease-1', property_id: 'prop-1', tenant_name: 'Jordan Reyes', tenant_email: 'jordan@example.test', start_date: '2025-01-01', end_date: '2027-01-01' },
        { id: 'lease-2', property_id: 'prop-2', tenant_name: 'Sam Whitfield', tenant_email: 'sam@example.test', start_date: '2025-01-01', end_date: '2027-01-01' },
      ],
      [
        access({ id: 'a1', property_id: 'prop-1', lease_id: 'lease-1', status: 'Active' }),
        access({ id: 'a2', property_id: 'prop-2', lease_id: 'lease-2', status: 'Invited' }),
      ],
      [],
    )
    expect(summarizeTenantDirectory(rows)).toEqual({ connected: 1, pending: 1, notConnected: 0, total: 2 })
  })
})

describe('filterTenantDirectory', () => {
  const rows = buildTenantDirectory(
    PROPERTIES,
    [
      { id: 'lease-1', property_id: 'prop-1', tenant_name: 'Jordan Reyes', tenant_email: 'jordan@example.test', start_date: '2025-01-01', end_date: '2027-01-01' },
      { id: 'lease-2', property_id: 'prop-2', tenant_name: 'Sam Whitfield', tenant_email: 'sam@example.test', start_date: '2025-01-01', end_date: '2027-01-01' },
    ],
    [],
    [],
  )

  it('an empty query returns every row', () => {
    expect(filterTenantDirectory(rows, '')).toHaveLength(2)
  })

  it('matches by tenant name, case-insensitively', () => {
    expect(filterTenantDirectory(rows, 'jordan')).toHaveLength(1)
  })

  it('matches by tenant email', () => {
    expect(filterTenantDirectory(rows, 'sam@example.test')).toHaveLength(1)
  })

  it('matches by property label', () => {
    expect(filterTenantDirectory(rows, 'Palm Avenue')).toHaveLength(1)
  })

  it('a query matching nothing returns an empty list, not every row', () => {
    expect(filterTenantDirectory(rows, 'nonexistent')).toHaveLength(0)
  })
})
