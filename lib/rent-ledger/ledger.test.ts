import { describe, expect, it } from 'vitest'
import { buildRentLedgerRows, summarizeRentLedgerRows, buildRentDateItems, buildVacancyItems, buildSystemWarrantyDateItems } from './ledger'

const AUG_2026 = { year: 2026, month: 8 }
const NOW = new Date('2026-08-15T12:00:00')
const labelById = new Map([
  ['prop-1', '5531 Turtle Crossing Loop'],
  ['prop-2', '5558 Pats Point'],
  ['prop-3', '12109 Rustic River Way'], // owner-occupied, never a rent row
])
const properties = [
  { id: 'prop-1', property_type: 'Rental Property' },
  { id: 'prop-2', property_type: 'Rental Property' },
  { id: 'prop-3', property_type: 'Primary Residence' },
]

describe('buildRentLedgerRows', () => {
  it('builds one row per applicable rental-property lease, sorted by due date then property', () => {
    const leases = [
      { id: 'lease-2', property_id: 'prop-2', tenant_name: 'John Doe', monthly_rent: 2350, rent_due_day: 5, start_date: '2026-01-01', end_date: '2026-12-31' },
      { id: 'lease-1', property_id: 'prop-1', tenant_name: 'Jane Doe', monthly_rent: 2400, rent_due_day: 1, start_date: '2026-01-01', end_date: '2026-12-31' },
    ]
    const rows = buildRentLedgerRows(properties, leases, [], AUG_2026, labelById, NOW)
    expect(rows.map((r) => r.leaseId)).toEqual(['lease-1', 'lease-2']) // Aug 1 before Aug 5
    expect(rows[0]).toMatchObject({ propertyLabel: '5531 Turtle Crossing Loop', tenantName: 'Jane Doe', dueDate: '2026-08-01', expectedAmount: 2400, status: 'Overdue' })
  })

  it('never generates a row for a non-Rental-Property, even with a lease row on file', () => {
    const leases = [{ id: 'lease-3', property_id: 'prop-3', tenant_name: 'Someone', monthly_rent: 1000, rent_due_day: 1, start_date: '2026-01-01', end_date: '2026-12-31' }]
    expect(buildRentLedgerRows(properties, leases, [], AUG_2026, labelById, NOW)).toHaveLength(0)
  })

  it('sums multiple payments in the period into totalPaid and derives Paid when they cover the full amount', () => {
    const leases = [{ id: 'lease-1', property_id: 'prop-1', tenant_name: 'Jane Doe', monthly_rent: 2400, rent_due_day: 1, start_date: '2026-01-01', end_date: '2026-12-31' }]
    const payments = [
      { lease_id: 'lease-1', rent_period: '2026-08-01', amount: 1200 },
      { lease_id: 'lease-1', rent_period: '2026-08-01', amount: 1200 },
      { lease_id: 'lease-1', rent_period: '2026-07-01', amount: 2400 }, // a different month's payment must not count toward August
    ]
    const rows = buildRentLedgerRows(properties, leases, payments, AUG_2026, labelById, NOW)
    expect(rows[0]).toMatchObject({ totalPaid: 2400, remaining: 0, status: 'Paid' })
  })

  it('excludes a lease whose term does not cover the selected period (turnover safety)', () => {
    const leases = [{ id: 'lease-old', property_id: 'prop-1', tenant_name: 'Prior Tenant', monthly_rent: 2000, rent_due_day: 1, start_date: '2025-01-01', end_date: '2026-06-30' }]
    expect(buildRentLedgerRows(properties, leases, [], AUG_2026, labelById, NOW)).toHaveLength(0)
  })
})

describe('summarizeRentLedgerRows', () => {
  it('aggregates expected/collected/outstanding and lease counts', () => {
    const rows = [
      { leaseId: 'l1', propertyId: 'p1', propertyLabel: 'A', tenantName: 'T1', dueDate: '2026-08-01', expectedAmount: 2400, totalPaid: 2400, remaining: 0, status: 'Paid' as const },
      { leaseId: 'l2', propertyId: 'p2', propertyLabel: 'B', tenantName: 'T2', dueDate: '2026-08-05', expectedAmount: 2350, totalPaid: 1500, remaining: 850, status: 'Overdue' as const },
    ]
    expect(summarizeRentLedgerRows(rows)).toEqual({ expected: 4750, collected: 3900, outstanding: 850, paidCount: 1, needsAttentionCount: 1, totalCount: 2 })
  })
})

describe('buildRentDateItems (PropWatch rent signals)', () => {
  it('includes Overdue rent as an Expired-severity item and excludes Paid/Upcoming leases', () => {
    const leases = [
      { id: 'lease-1', property_id: 'prop-1', tenant_name: 'Jane Doe', monthly_rent: 2400, rent_due_day: 1, start_date: '2026-01-01', end_date: '2026-12-31' }, // overdue relative to NOW
      { id: 'lease-2', property_id: 'prop-2', tenant_name: 'John Doe', monthly_rent: 2350, rent_due_day: 20, start_date: '2026-01-01', end_date: '2026-12-31' }, // upcoming, nothing paid
    ]
    const items = buildRentDateItems(leases, properties, [], AUG_2026, labelById, NOW)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ type: 'Rent', label: 'Rent overdue', propertyId: 'prop-1', urgency: 'Expired', nav: { tab: 'Financials' } })
  })

  it('a partial payment with a remaining balance still surfaces (Urgent) with the outstanding amount in the description', () => {
    const leases = [{ id: 'lease-1', property_id: 'prop-1', tenant_name: 'Jane Doe', monthly_rent: 2400, rent_due_day: 25, start_date: '2026-01-01', end_date: '2026-12-31' }]
    const payments = [{ lease_id: 'lease-1', rent_period: '2026-08-01', amount: 1200 }]
    const items = buildRentDateItems(leases, properties, payments, AUG_2026, labelById, NOW)
    expect(items[0]).toMatchObject({ label: 'Rent partially paid', urgency: 'Urgent' })
    expect(items[0].description).toContain('Jane Doe')
    expect(items[0].description).toContain('1,200') // the remaining balance ($2,400 - $1,200), not the paid amount
  })
})

describe('buildVacancyItems', () => {
  it('flags a Rental Property with no current lease as Vacant, informational only', () => {
    const items = buildVacancyItems(properties, [], labelById)
    expect(items.map((i) => i.propertyId).sort()).toEqual(['prop-1', 'prop-2'])
  })
  it('never flags a non-Rental-Property as vacant even with zero leases', () => {
    const items = buildVacancyItems(properties, [], labelById)
    expect(items.find((i) => i.propertyId === 'prop-3')).toBeUndefined()
  })
  it('does not flag an occupied rental property', () => {
    const leases = [{ id: 'lease-1', property_id: 'prop-1', tenant_name: 'Jane Doe', monthly_rent: 2400, rent_due_day: 1, start_date: '2026-01-01', end_date: '2026-12-31' }]
    const items = buildVacancyItems(properties, leases, labelById)
    expect(items.map((i) => i.propertyId)).toEqual(['prop-2'])
  })
})

describe('buildSystemWarrantyDateItems', () => {
  it('classifies an expiring warranty using the shared thresholds and skips systems with no warranty on file', () => {
    const systems = [
      { id: 'sys-1', property_id: 'prop-1', system_type: 'HVAC', name: null, warranty_expiration: '2026-08-18' }, // 3 days out from NOW -> Urgent
      { id: 'sys-2', property_id: 'prop-1', system_type: 'Roof', name: null, warranty_expiration: null },
    ]
    const items = buildSystemWarrantyDateItems(systems, labelById, NOW)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ type: 'System', label: 'Warranty expiring soon', urgency: 'Urgent', nav: { tab: 'Property', propSubTab: 'Systems' } })
  })
})
