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

// A pie of gross recorded money activity: inflows and distinct cost categories.
// Net is displayed separately and never included as another overlapping slice.
export function propertyMoneyActivity(summary: PropertyTaxSummary, financingStatus?: string | null) {
  const breakdown = propertyExpenseBreakdown(summary, financingStatus)
  if (!breakdown) return null
  const incomeSlices: ExpenseSlice[] = [
    { key: 'rent', label: 'Rent income', amount: summary.categoryBreakdown.rentalIncome.effective, color: '#1d2320' },
    { key: 'otherIncome', label: 'Other income', amount: summary.categoryBreakdown.otherIncome.effective, color: '#68716c' },
  ]
  if (incomeSlices.some(slice => !Number.isFinite(slice.amount) || slice.amount < 0)) return null
  const activityTotal = breakdown.income + breakdown.expenses
  if (!Number.isFinite(activityTotal)) return null
  return { ...breakdown, activityTotal, activitySlices: [...incomeSlices.filter(slice => slice.amount > 0), ...breakdown.slices] }
}

/** Filled SVG wedge, starting at twelve o'clock. A single full slice uses a circle. */
export function filledPieWedge(start: number, fraction: number): string {
  const point = (turn: number) => [60 + 52 * Math.cos(turn * 2 * Math.PI - Math.PI / 2), 60 + 52 * Math.sin(turn * 2 * Math.PI - Math.PI / 2)]
  const [sx, sy] = point(start), [ex, ey] = point(start + fraction)
  return `M 60 60 L ${sx} ${sy} A 52 52 0 ${fraction > 0.5 ? 1 : 0} 1 ${ex} ${ey} Z`
}
