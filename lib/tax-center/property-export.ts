import { computePropertyTaxSummary, computePortfolioTaxSummary } from './aggregate'
import { buildTaxCenterCsv } from './csv-export'
import type { PropertyInput, TransactionInput, MaintenanceRecordInput, TaxRecordInput, CustomTaxItemInput } from './types'

export function buildPropertyTaxExport(input: {
  property: PropertyInput; year: string; transactions: TransactionInput[];
  maintenanceRecords: MaintenanceRecordInput[];
  taxRecords: (TaxRecordInput & { property_id: string; tax_year: number })[];
  customItems: CustomTaxItemInput[];
}): string {
  const { property, year } = input
  if (!/^\d{4}$/.test(year)) throw new Error('Choose a valid tax year.')
  const summary = computePropertyTaxSummary(property,
    input.transactions.filter(row => row.property_id === property.id && row.transaction_date.startsWith(`${year}-`)),
    input.maintenanceRecords.filter(row => row.property_id === property.id && row.service_date.startsWith(`${year}-`)),
    input.taxRecords.find(row => row.property_id === property.id && String(row.tax_year) === year) ?? null,
    input.customItems.filter(row => row.propertyId === property.id && String(row.taxYear) === year))
  // Preserve text rather than allowing spreadsheet formula execution in text cells.
  const safe = (text: string | null) => text !== null && /^[\s]*[=+@-]/.test(text) ? `'${text}` : text
  const exportSummary = { ...summary, address: safe(summary.address)!, city: safe(summary.city)!, notes: safe(summary.notes), customItems: summary.customItems.map(row => ({ ...row, description: safe(row.description)!, notes: safe(row.notes) })) }
  return buildTaxCenterCsv(year, computePortfolioTaxSummary(year, [exportSummary]), [exportSummary]).replace('Portfolio Summary', 'Selected Property Summary')
}
