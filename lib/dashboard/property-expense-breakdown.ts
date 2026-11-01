import type { PropertyTaxSummary } from '../tax-center/types'
import { propertyRecordedNet } from './property-net'

const GROUPS = [
  { key: 'taxes', label: 'Property taxes', fields: ['propertyTaxes'], color: '#8f1717' },
  { key: 'interest', label: 'Mortgage interest', fields: ['mortgageInterest'], color: '#ba2525' },
  { key: 'insurance', label: 'Insurance', fields: ['insurance'], color: '#d64b4b' },
  { key: 'maintenance', label: 'Repairs & maintenance', fields: ['repairs', 'maintenance'], color: '#ef8888' },
  { key: 'hoa', label: 'HOA fees', fields: ['hoa'], color: '#f6b7b7' },
]
export type ExpenseSlice = { key: string; label: string; amount: number; color: string }

// The resolved Tax Center total already handles category overrides and custom
// operating costs. Mortgage payments and capital costs are never added again.
export function propertyExpenseBreakdown(summary: PropertyTaxSummary, financingStatus?: string | null) {
  const recordedNet = propertyRecordedNet(summary, financingStatus)
  if (!recordedNet) return null
  const slices: ExpenseSlice[] = GROUPS.map(group => ({ key: group.key, label: group.label, color: group.color, amount: group.fields.reduce((sum, key) => sum + summary.categoryBreakdown[key].effective, 0) }))
  if (slices.some(slice => !Number.isFinite(slice.amount) || slice.amount < 0)) return null
  const groupedTotal = slices.reduce((sum, slice) => sum + slice.amount, 0)
  const remainder = recordedNet.expenses - groupedTotal
  if (remainder < -0.000001) return null
  if (remainder > 0.000001) slices.push({ key: 'other', label: 'Other operating costs', amount: remainder, color: '#554343' })
  return { ...recordedNet, slices: slices.filter(slice => slice.amount > 0) }
}
