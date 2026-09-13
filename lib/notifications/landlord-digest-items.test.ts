import { describe, expect, it } from 'vitest'
import {
  buildOwnerAttentionItems, groupDigestItems, digestItemLink, digestDashboardLink,
  DIGEST_ITEM_LIMIT, type OwnerDigestSourceData,
} from './landlord-digest-items'

const now = new Date('2026-09-16T12:00:00Z')

function baseData(overrides: Partial<OwnerDigestSourceData> = {}): OwnerDigestSourceData {
  return {
    properties: [{ id: 'p1', property_type: 'Rental Property' }],
    leases: [],
    insurancePolicies: [],
    mortgages: [],
    maintenanceRecords: [],
    rentPayments: [],
    propertySystems: [],
    tenantRequests: [],
    propertyLabelById: new Map([['p1', '123 Main Street']]),
    canUsePropWatch: true,
    ...overrides,
  }
}

describe('buildOwnerAttentionItems reuses the exact canonical Dashboard builders', () => {
  it('an empty portfolio produces an empty list', () => {
    expect(buildOwnerAttentionItems(baseData(), now)).toEqual([])
  })

  it('a lease expiring soon surfaces via the same lib/dashboard/attention.ts builder the Dashboard uses', () => {
    // canUsePropWatch: false isolates this to ONLY buildLeaseDateItems —
    // with it true, this same lease (a valid rent_due_day + no rent
    // recorded this period) would ALSO produce its own genuine Rent
    // item via buildRentDateItems, which is exactly correct canonical
    // behavior (see the "gated on canUsePropWatch" test below) but not
    // what this particular test is isolating.
    const data = baseData({
      canUsePropWatch: false,
      leases: [{ id: 'l1', property_id: 'p1', tenant_name: 'Alex Rivera', monthly_rent: 2000, rent_due_day: 1, start_date: '2025-01-01', end_date: '2026-09-20' }],
    })
    const items = buildOwnerAttentionItems(data, now)
    expect(items).toHaveLength(1)
    expect(items[0].type).toBe('Lease')
    expect(items[0].propertyLabel).toBe('123 Main Street')
    expect(items[0].nav).toEqual({ tab: 'Rent', rentSubTab: 'Lease' })
  })

  it('an insurance policy with no expiration on file is correctly excluded (never treated as expired) — same rule as buildInsuranceDateItems', () => {
    const data = baseData({ insurancePolicies: [{ id: 'i1', property_id: 'p1', carrier: 'Acme', expiration_date: null }] })
    expect(buildOwnerAttentionItems(data, now)).toEqual([])
  })

  it('a new tenant request surfaces via buildTenantRequestDateItems, ungated by canUsePropWatch', () => {
    const data = baseData({
      canUsePropWatch: false,
      tenantRequests: [{ id: 't1', property_id: 'p1', title: 'Leaky faucet', status: 'New', created_at: now.toISOString() }],
    })
    const items = buildOwnerAttentionItems(data, now)
    expect(items).toHaveLength(1)
    expect(items[0].type).toBe('TenantRequest')
  })

  it('rent status and system warranty items are gated on canUsePropWatch, exactly like app/page.tsx\'s own Dashboard composition', () => {
    const withoutPropWatch = baseData({
      canUsePropWatch: false,
      leases: [{ id: 'l1', property_id: 'p1', tenant_name: 'Alex Rivera', monthly_rent: 2000, rent_due_day: 1, start_date: '2020-01-01', end_date: '2030-01-01' }],
      propertySystems: [{ id: 's1', property_id: 'p1', system_type: 'HVAC', name: 'Furnace', warranty_expiration: '2026-09-10' }],
    })
    expect(buildOwnerAttentionItems(withoutPropWatch, now)).toEqual([])

    const withPropWatch = { ...withoutPropWatch, canUsePropWatch: true }
    const items = buildOwnerAttentionItems(withPropWatch, now)
    expect(items.some((i) => i.type === 'System')).toBe(true)
  })

  it('caps at DIGEST_ITEM_LIMIT, most urgent first — same shape as Dashboard\'s own NEEDS_ATTENTION_LIMIT cap', () => {
    const manyLeases = Array.from({ length: DIGEST_ITEM_LIMIT + 5 }, (_, i) => ({
      id: `l${i}`, property_id: 'p1', tenant_name: `Tenant ${i}`, monthly_rent: 1000,
      rent_due_day: 1, start_date: '2025-01-01', end_date: '2026-09-20',
    }))
    const items = buildOwnerAttentionItems(baseData({ leases: manyLeases }), now)
    expect(items).toHaveLength(DIGEST_ITEM_LIMIT)
    for (let i = 1; i < items.length; i++) expect(items[i].daysUntil).toBeGreaterThanOrEqual(items[i - 1].daysUntil)
  })

  it('only Expired/Urgent items are included — an "Upcoming" (8-30 days out) item is excluded, matching splitAttentionAndUpcoming', () => {
    const data = baseData({
      canUsePropWatch: false, // isolates this to the Lease item alone — see the test above for why
      leases: [{ id: 'l1', property_id: 'p1', tenant_name: 'Alex', monthly_rent: 2000, rent_due_day: 1, start_date: '2025-01-01', end_date: '2026-10-10' }], // 24 days out
    })
    expect(buildOwnerAttentionItems(data, now)).toEqual([])
  })
})

describe('groupDigestItems', () => {
  it('groups by category in the fixed Rent/Leases/Maintenance/Property order, omitting empty groups', () => {
    const data = baseData({
      canUsePropWatch: false, // isolates this to Lease + TenantRequest only — see the buildOwnerAttentionItems tests above for why a lease with a rent_due_day also produces its own genuine Rent item when this is true
      leases: [{ id: 'l1', property_id: 'p1', tenant_name: 'Alex', monthly_rent: 2000, rent_due_day: 1, start_date: '2025-01-01', end_date: '2026-09-20' }],
      tenantRequests: [{ id: 't1', property_id: 'p1', title: 'Leaky faucet', status: 'New', created_at: now.toISOString() }],
    })
    const items = buildOwnerAttentionItems(data, now)
    const groups = groupDigestItems(items)
    expect(groups.map((g) => g.name)).toEqual(['Leases', 'Maintenance'])
    expect(groups.find((g) => g.name === 'Leases')?.items).toHaveLength(1)
    expect(groups.find((g) => g.name === 'Maintenance')?.items).toHaveLength(1)
  })

  it('an empty item list produces no groups at all', () => {
    expect(groupDigestItems([])).toEqual([])
  })

  it('Insurance/Mortgage/System all fold into the single "Property" group', () => {
    const data = baseData({
      insurancePolicies: [{ id: 'i1', property_id: 'p1', carrier: 'Acme', expiration_date: '2026-09-18' }],
      mortgages: [{ id: 'm1', property_id: 'p1', lender: 'Bank', maturity_date: '2026-09-18' }],
    })
    const groups = groupDigestItems(buildOwnerAttentionItems(data, now))
    expect(groups).toHaveLength(1)
    expect(groups[0].name).toBe('Property')
    expect(groups[0].items).toHaveLength(2)
  })
})

describe('digestItemLink / digestDashboardLink reuse the app\'s existing deep-link mechanism', () => {
  it('builds the same ?openProperty=/?openTab=/?openRentSubTab= shape app/page.tsx\'s own effect already parses', () => {
    const link = digestItemLink('https://proproster.com', 'p1', { tab: 'Rent', rentSubTab: 'Lease' })
    expect(link).toBe('https://proproster.com/?openProperty=p1&openTab=Rent&openRentSubTab=Lease')
  })

  it('omits sub-tab params that are not set', () => {
    const link = digestItemLink('https://proproster.com', 'p1', { tab: 'Maintenance' })
    expect(link).toBe('https://proproster.com/?openProperty=p1&openTab=Maintenance')
  })

  it('strips a trailing slash from origin before appending', () => {
    expect(digestItemLink('https://proproster.com/', 'p1', { tab: 'Details', propSubTab: 'Insurance' })).toBe('https://proproster.com/?openProperty=p1&openTab=Details&openPropSubTab=Insurance')
  })

  it('digestDashboardLink points at the bare origin', () => {
    expect(digestDashboardLink('https://proproster.com')).toBe('https://proproster.com/')
  })
})
