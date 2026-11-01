import type { TransactionInput, PropertyTaxSummary } from '../tax-center/types'
import { isIncomeCategory, isOperatingExpenseCategory } from '../tax-center/categories'
import { TAX_CATEGORIES } from '../tax-center/manual-entry'
import { isOperatingExpenseLikeGroup } from '../tax-center/custom-items'

export type PropertyYearTimeline = {
  year: number
  month: number
  progress: number
  points: { progress: number; income: number; costs: number }[]
  hasData: boolean
  hasUndatedTotals: boolean
}

// Dated ledger activity only. Annual overrides/interest/custom tax items have
// no month, so they remain in recorded net but are never spread across months.
export function propertyYearTimeline(propertyId: string, transactions: TransactionInput[], summary: PropertyTaxSummary, now: Date = new Date()): PropertyYearTimeline {
  const year = now.getFullYear(), month = now.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const progress = (month + now.getDate() / daysInMonth) / 12
  const today = `${year}-${String(month + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const months = Array.from({ length: month + 1 }, () => ({ income: 0, costs: 0 }))
  let hasData = false
  for (const row of transactions) {
    if (row.property_id !== propertyId || !/^\d{4}-\d{2}-\d{2}$/.test(row.transaction_date) || !row.transaction_date.startsWith(`${year}-`) || row.transaction_date > today) continue
    const parsed = new Date(`${row.transaction_date}T12:00:00Z`)
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== row.transaction_date) continue
    const index = Number(row.transaction_date.slice(5, 7)) - 1, amount = Number(row.amount)
    if (!Number.isFinite(amount) || amount < 0 || !months[index]) continue
    if (row.transaction_type === 'Income' && isIncomeCategory(row.category)) { months[index].income += amount; hasData = true }
    else if (row.transaction_type === 'Expense' && isOperatingExpenseCategory(row.category)) { months[index].costs += amount; hasData = true }
  }
  let income = 0, costs = 0
  const points = [{ progress: 0, income: 0, costs: 0 }, ...months.map((totals, index) => {
    income += totals.income; costs += totals.costs
    return { progress: index === month ? progress : (index + 1) / 12, income, costs }
  })]
  const hasUndatedTotals = TAX_CATEGORIES.some(category => (category.group === 'income' || isOperatingExpenseLikeGroup(category.group) || category.key === 'mortgageInterest') && summary.categoryBreakdown[category.key].source === 'manual') || summary.customItems.some(item => isOperatingExpenseLikeGroup(item.group))
  return { year, month, progress, points, hasData, hasUndatedTotals }
}
