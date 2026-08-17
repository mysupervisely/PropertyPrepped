import { describe, expect, it } from 'vitest'
import { deriveTimeline, MAJOR_EXPENSE_THRESHOLD, type TimelineSourceData } from './derive-timeline'

function baseData(overrides: Partial<TimelineSourceData> = {}): TimelineSourceData {
  return {
    property: { id: 'prop1', address: '1 Main St', purchase_date: null },
    leases: [], mortgages: [], insurancePolicies: [], maintenanceRecords: [], financialTransactions: [], systems: [], contacts: [],
    ...overrides,
  }
}

describe('deriveTimeline', () => {
  it('returns an empty array when there is no real data — never fabricates events', () => {
    expect(deriveTimeline(baseData())).toEqual([])
  })

  it('derives a property-acquired event only when purchase_date is set', () => {
    const withDate = deriveTimeline(baseData({ property: { id: 'p1', address: '1 Main St', purchase_date: '2020-05-01' } }))
    expect(withDate).toHaveLength(1)
    expect(withDate[0]).toMatchObject({ type: 'property-acquired', date: '2020-05-01', sourceTable: 'properties', sourceId: 'p1' })

    const withoutDate = deriveTimeline(baseData({ property: { id: 'p1', address: '1 Main St', purchase_date: null } }))
    expect(withoutDate).toEqual([])
  })

  it('derives lease-started always, lease-ended only when the end date has passed', () => {
    const future = '2099-01-01'
    const past = '2020-01-01'
    const events = deriveTimeline(baseData({
      leases: [{ id: 'l1', tenant_name: 'A', start_date: '2019-01-01', end_date: future }, { id: 'l2', tenant_name: 'B', start_date: '2018-01-01', end_date: past }],
    }))
    expect(events.find((e) => e.type === 'lease-started' && e.sourceId === 'l1')).toBeTruthy()
    expect(events.find((e) => e.type === 'lease-ended' && e.sourceId === 'l1')).toBeUndefined()
    expect(events.find((e) => e.type === 'lease-started' && e.sourceId === 'l2')).toBeTruthy()
    expect(events.find((e) => e.type === 'lease-ended' && e.sourceId === 'l2')).toBeTruthy()
  })

  it('derives insurance-effective and insurance-expired (only when past) independently', () => {
    const events = deriveTimeline(baseData({
      insurancePolicies: [{ id: 'i1', carrier: 'Acme', effective_date: '2024-01-01', expiration_date: '2099-01-01' }],
    }))
    expect(events.find((e) => e.type === 'insurance-effective')).toBeTruthy()
    expect(events.find((e) => e.type === 'insurance-expired')).toBeUndefined()
  })

  it('derives one maintenance event per maintenance record, carrying description/vendor/cost', () => {
    const events = deriveTimeline(baseData({
      maintenanceRecords: [{ id: 'm1', service_date: '2026-08-12', description: 'HVAC repaired', vendor: 'ABC Air', cost: 487, financial_transaction_id: null }],
    }))
    expect(events).toEqual([{ id: 'maintenance_records:m1:maintenance', date: '2026-08-12', type: 'maintenance', title: 'HVAC repaired', detail: 'ABC Air', amount: 487, sourceTable: 'maintenance_records', sourceId: 'm1' }])
  })

  it('derives system-installed and system-serviced, resolving the linked PropCrew contact name', () => {
    const events = deriveTimeline(baseData({
      systems: [{ id: 's1', system_type: 'HVAC', name: 'Upstairs unit', install_date: '2020-06-01', last_service_date: '2026-08-12', propcrew_contact_id: 'c1' }],
      contacts: [{ id: 'c1', name: 'Mike', business_name: 'ABC Air' }],
    }))
    const installed = events.find((e) => e.type === 'system-installed')!
    expect(installed.detail).toBe('Upstairs unit · ABC Air')
    const serviced = events.find((e) => e.type === 'system-serviced')!
    expect(serviced.detail).toBe('ABC Air')
  })

  it('falls back to contact name when the PropCrew contact has no business name', () => {
    const events = deriveTimeline(baseData({
      systems: [{ id: 's1', system_type: 'Roof', name: null, install_date: null, last_service_date: '2026-01-01', propcrew_contact_id: 'c1' }],
      contacts: [{ id: 'c1', name: 'Jane Doe', business_name: null }],
    }))
    expect(events[0].detail).toBe('Jane Doe')
  })

  it('derives a major-expense event for a large, unlinked expense transaction', () => {
    const events = deriveTimeline(baseData({
      financialTransactions: [{ id: 't1', transaction_date: '2026-03-01', transaction_type: 'Expense', description: 'New roof', vendor: 'Roofers Inc', amount: MAJOR_EXPENSE_THRESHOLD }],
    }))
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('major-expense')
  })

  it('never derives a major-expense event below the threshold', () => {
    const events = deriveTimeline(baseData({
      financialTransactions: [{ id: 't1', transaction_date: '2026-03-01', transaction_type: 'Expense', description: 'Small repair', vendor: null, amount: MAJOR_EXPENSE_THRESHOLD - 1 }],
    }))
    expect(events).toEqual([])
  })

  it('never derives a major-expense event for Income transactions', () => {
    const events = deriveTimeline(baseData({
      financialTransactions: [{ id: 't1', transaction_date: '2026-03-01', transaction_type: 'Income', description: 'Rent', vendor: null, amount: 5000 }],
    }))
    expect(events).toEqual([])
  })

  it('never double-counts a large expense that is already represented by a linked maintenance record', () => {
    const events = deriveTimeline(baseData({
      maintenanceRecords: [{ id: 'm1', service_date: '2026-03-01', description: 'New roof', vendor: 'Roofers Inc', cost: 5000, financial_transaction_id: 't1' }],
      financialTransactions: [{ id: 't1', transaction_date: '2026-03-01', transaction_type: 'Expense', description: 'New roof', vendor: 'Roofers Inc', amount: 5000 }],
    }))
    expect(events).toHaveLength(1)
    expect(events[0].type).toBe('maintenance')
  })

  it('sorts events newest first', () => {
    const events = deriveTimeline(baseData({
      maintenanceRecords: [
        { id: 'm1', service_date: '2020-01-01', description: 'Old', vendor: null, cost: 100, financial_transaction_id: null },
        { id: 'm2', service_date: '2026-01-01', description: 'New', vendor: null, cost: 100, financial_transaction_id: null },
      ],
    }))
    expect(events.map((e) => e.sourceId)).toEqual(['m2', 'm1'])
  })

  it('never mutates the input arrays', () => {
    const maintenanceRecords = [{ id: 'm1', service_date: '2020-01-01', description: 'Old', vendor: null, cost: 100, financial_transaction_id: null }]
    const original = [...maintenanceRecords]
    deriveTimeline(baseData({ maintenanceRecords }))
    expect(maintenanceRecords).toEqual(original)
  })
})
