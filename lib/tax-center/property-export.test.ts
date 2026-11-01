import { it, expect } from 'vitest'
import { buildPropertyTaxExport } from './property-export'
import { emptyManualFields, emptyMileageFields } from './manual-entry'
import type { TransactionInput } from './types'
const property = { id: 'a', address: 'Example Property A', city: 'Test', property_type: 'Rental Property' }
const row = (id: string, property_id: string, date: string, amount: number): TransactionInput => ({ id, property_id, transaction_date: date, transaction_type: 'Expense', category: 'Repairs', amount, document_id: null })
it('exports one property and one year even if passed portfolio-wide records', () => {
  const csv = buildPropertyTaxExport({ property, year: '2026', transactions: [row('1', 'a', '2026-01-01', 123), row('2', 'b', '2026-01-01', 9999), row('3', 'a', '2025-01-01', 8888)], maintenanceRecords: [], taxRecords: [], customItems: [] })
  expect(csv).toContain('Example Property A')
  expect(csv).toContain('123.00')
  expect(csv).not.toContain('9999.00')
  expect(csv).not.toContain('8888.00')
  expect(csv).toContain('Selected Property Summary')
  expect(csv).toContain('"Properties included","1"')
})
it('preserves manual overrides and isolates custom items by property and year', () => {
  const record = { ...emptyManualFields(), ...emptyMileageFields(), property_id: 'a', tax_year: 2026, repairs: 500, notes: null, document_id: null }
  const custom = (id: string, propertyId: string, taxYear: number, description: string) => ({ id, propertyId, taxYear, description, amount: 77, group: 'operatingExpense' as const, notes: null, documentId: null })
  const csv = buildPropertyTaxExport({ property, year: '2026', transactions: [row('1', 'a', '2026-01-01', 123)], maintenanceRecords: [], taxRecords: [record, { ...record, property_id: 'b', repairs: 9999 }], customItems: [custom('1', 'a', 2026, 'Selected custom item'), custom('2', 'b', 2026, 'Other property item'), custom('3', 'a', 2025, 'Prior year item')] })
  expect(csv).toContain('577.00')
  expect(csv).toContain('Selected custom item')
  expect(csv).not.toContain('Other property item')
  expect(csv).not.toContain('Prior year item')
})
it('rejects invalid years and protects spreadsheet text fields', () => {
  const input = { property: { ...property, address: '=1+1' }, year: '2026', transactions: [], maintenanceRecords: [], taxRecords: [], customItems: [] }
  expect(buildPropertyTaxExport(input)).toContain("'=1+1")
  expect(() => buildPropertyTaxExport({ ...input, year: 'all' })).toThrow('Choose a valid tax year')
})
