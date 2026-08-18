import { describe, expect, it } from 'vitest'
import {
  searchProperties, searchDocuments, searchContacts, searchSystems, searchMaintenance,
  searchFinancials, searchNotes, searchLeases, searchMortgages, searchInsurance, searchRentPayments,
  type PropertyRef,
} from './build-results'

const properties: PropertyRef[] = [
  { id: 'p1', address: '5531 Turtle Crossing Loop', city: 'Winter Park, FL' },
  { id: 'p2', address: '12109 Rustic River Way', city: 'Tampa, FL' },
]
const propertyById = new Map(properties.map((p) => [p.id, p]))

describe('searchProperties', () => {
  const rows = [
    { id: 'p1', address: '5531 Turtle Crossing Loop', city: 'Winter Park, FL', property_type: 'Rental Property' },
    { id: 'p2', address: '12109 Rustic River Way', city: 'Tampa, FL', property_type: 'Primary Residence' },
  ]

  it('matches on address', () => {
    const results = searchProperties(rows, ['turtle', 'crossing'])
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe('p1')
    expect(results[0].href).toBe('/?openProperty=p1')
  })

  it('matches on city', () => {
    expect(searchProperties(rows, ['tampa'])).toHaveLength(1)
  })

  it('excludes rows where not every word matches', () => {
    expect(searchProperties(rows, ['turtle', 'tampa'])).toHaveLength(0)
  })
})

describe('searchDocuments', () => {
  const rows = [
    { id: 'd1', property_id: 'p1', name: 'Roof Replacement Invoice.pdf', category: 'Maintenance', document_type: 'Contractor Invoice / Receipt' },
    { id: 'd2', property_id: null, name: 'unassigned-scan.pdf', category: 'Other', document_type: null },
  ]

  it('labels the property address as the subtitle when assigned', () => {
    const results = searchDocuments(rows, ['roof'], propertyById)
    expect(results[0].subtitle).toBe('5531 Turtle Crossing Loop')
    expect(results[0].href).toBe('/?openProperty=p1&openTab=Documents&openDocsSubTab=Documents')
  })

  it('labels an unassigned document "Unassigned" and routes to /smart-import', () => {
    const results = searchDocuments(rows, ['unassigned'], propertyById)
    expect(results[0].subtitle).toBe('Unassigned')
    expect(results[0].href).toBe('/smart-import')
  })

  it('matches on document type', () => {
    expect(searchDocuments(rows, ['contractor', 'invoice'], propertyById)).toHaveLength(1)
  })
})

describe('searchContacts', () => {
  const rows = [
    { id: 'c1', name: 'Mike Alvarez', business_name: 'ABC Air Conditioning', role: 'HVAC', phone: '5551234567', email: 'mike@abcair.com' },
  ]

  it('prefers the business name as the title, with the person name as subtitle', () => {
    const results = searchContacts(rows, ['abc', 'air'], new Map([['c1', 3]]))
    expect(results[0].title).toBe('ABC Air Conditioning')
    expect(results[0].subtitle).toBe('Mike Alvarez')
    expect(results[0].detail).toBe('HVAC · 3 properties')
    expect(results[0].href).toBe('/propcrew')
  })

  it('matches on the person name alone', () => {
    expect(searchContacts(rows, ['mike', 'alvarez'], new Map())).toHaveLength(1)
  })

  it('falls back to 1 property when no link count is known', () => {
    const results = searchContacts(rows, ['mike'], new Map())
    expect(results[0].detail).toBe('HVAC · 1 property')
  })

  it('never searches or previews a private notes field (not part of the row shape at all)', () => {
    // ContactRow has no notes/experience_note field — a type-level
    // guarantee that this function can't accidentally search or preview it.
    const results = searchContacts(rows, ['mike'], new Map())
    expect(Object.keys(results[0])).not.toContain('notes')
  })
})

describe('searchSystems', () => {
  const rows = [
    { id: 's1', property_id: 'p2', system_type: 'Water Heater', name: null, manufacturer: 'Rheem', model: 'XE50', serial_number: null },
  ]

  it('matches on system type and shows manufacturer/model as detail', () => {
    const results = searchSystems(rows, ['water', 'heater'], propertyById)
    expect(results[0].title).toBe('Water Heater')
    expect(results[0].subtitle).toBe('12109 Rustic River Way')
    expect(results[0].detail).toBe('Rheem XE50')
    expect(results[0].href).toBe('/?openProperty=p2&openTab=Property&openPropSubTab=Systems')
  })

  it('matches on manufacturer', () => {
    expect(searchSystems(rows, ['rheem'], propertyById)).toHaveLength(1)
  })
})

describe('searchMaintenance', () => {
  const rows = [{ id: 'm1', property_id: 'p1', description: 'Roof repair after storm', category: 'Repair', vendor: 'ABC Roofing' }]

  it('matches on description and routes to the Property/Maintenance tab', () => {
    const results = searchMaintenance(rows, ['roof', 'repair'], propertyById)
    expect(results[0].href).toBe('/?openProperty=p1&openTab=Property&openPropSubTab=Maintenance')
  })
})

describe('searchFinancials', () => {
  const rows = [{ id: 't1', property_id: 'p1', description: 'August rent', category: 'Rent', vendor: null }]

  it('matches on description and routes to the Financials tab', () => {
    const results = searchFinancials(rows, ['august'], propertyById)
    expect(results[0].href).toBe('/?openProperty=p1&openTab=Financials')
  })
})

describe('searchNotes', () => {
  it('truncates a long note body for the title', () => {
    const longBody = 'x'.repeat(100)
    const results = searchNotes([{ id: 'n1', property_id: 'p1', body: longBody }], ['x'], propertyById)
    expect(results[0].title.endsWith('…')).toBe(true)
    expect(results[0].title.length).toBeLessThan(longBody.length)
  })

  it('does not truncate a short note', () => {
    const results = searchNotes([{ id: 'n1', property_id: 'p1', body: 'Gate code is 1832.' }], ['gate'], propertyById)
    expect(results[0].title).toBe('Gate code is 1832.')
  })
})

describe('searchLeases / searchMortgages / searchInsurance', () => {
  it('lease matches on tenant name and routes to the Lease sub-tab', () => {
    const results = searchLeases([{ id: 'l1', property_id: 'p1', tenant_name: 'Sean Urban', tenant_email: null }], ['sean'], propertyById)
    expect(results[0].href).toBe('/?openProperty=p1&openTab=Property&openPropSubTab=Lease')
  })

  it('lease matches on tenant_phone (Milestone 17)', () => {
    const results = searchLeases([{ id: 'l1', property_id: 'p1', tenant_name: 'Sean Urban', tenant_email: null, tenant_phone: '555-0134' }], ['0134'], propertyById)
    expect(results).toHaveLength(1)
  })

  it('lease with no tenant_phone on file never matches a phone-shaped query', () => {
    const results = searchLeases([{ id: 'l1', property_id: 'p1', tenant_name: 'Sean Urban', tenant_email: null }], ['0134'], propertyById)
    expect(results).toHaveLength(0)
  })

  it('mortgage matches on lender and routes to the Mortgage sub-tab', () => {
    const results = searchMortgages([{ id: 'm1', property_id: 'p1', lender: 'Wells Fargo', loan_number: null }], ['wells'], propertyById)
    expect(results[0].href).toBe('/?openProperty=p1&openTab=Property&openPropSubTab=Mortgage')
  })

  it('rent payment matches on reference_number and routes to the Financials tab (Milestone 18)', () => {
    const results = searchRentPayments([{ id: 'pay1', property_id: 'p1', reference_number: 'ZELLE-4471', amount: 2400, date_received: '2026-08-01' }], ['4471'], propertyById)
    expect(results).toHaveLength(1)
    expect(results[0].href).toBe('/?openProperty=p1&openTab=Financials')
  })

  it('rent payment never matches on amount or date (not searchable fields)', () => {
    const results = searchRentPayments([{ id: 'pay1', property_id: 'p1', reference_number: 'ZELLE-4471', amount: 2400, date_received: '2026-08-01' }], ['2400'], propertyById)
    expect(results).toHaveLength(0)
  })

  it('insurance matches on carrier and routes to the Insurance sub-tab', () => {
    const results = searchInsurance([{ id: 'i1', property_id: 'p1', carrier: 'State Farm', policy_number: null }], ['state', 'farm'], propertyById)
    expect(results[0].href).toBe('/?openProperty=p1&openTab=Property&openPropSubTab=Insurance')
  })
})
