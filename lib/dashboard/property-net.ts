import { TAX_CATEGORIES } from '../tax-center/manual-entry'
import { isOperatingExpenseLikeGroup } from '../tax-center/custom-items'
import type { PropertyTaxSummary } from '../tax-center/types'

export type PropertyNet = { income: number; expenses: number; net: number; interestMissing: boolean }

// Reuse Tax Center's category overrides and linked-maintenance handling.
// This is a recorded YEAR total, not monthly cash flow or a tax result.
export function propertyRecordedNet(summary: PropertyTaxSummary, financingStatus?: string | null): PropertyNet | null {
  const categories = TAX_CATEGORIES.filter(category => category.group === 'income' || isOperatingExpenseLikeGroup(category.group) || category.key === 'mortgageInterest').map(category => summary.categoryBreakdown[category.key])
  const hasOperatingData = categories.some(value => value.source !== 'none') || summary.customItems.some(item => isOperatingExpenseLikeGroup(item.group))
  if (!hasOperatingData) return null
  const { grossIncome: income, operatingExpenses, mortgageInterest } = summary
  if (![income, operatingExpenses, mortgageInterest].every(value => Number.isFinite(value) && value >= 0)) return null
  const expenses = operatingExpenses + mortgageInterest
  const net = income - expenses
  if (!Number.isFinite(expenses) || !Number.isFinite(net)) return null
  return { income, expenses, net, interestMissing: summary.categoryBreakdown.mortgageInterest.manual === null && !['Paid Off', 'No Mortgage'].includes(financingStatus ?? '') }
}
