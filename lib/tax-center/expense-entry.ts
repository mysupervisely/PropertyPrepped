import { parseTaxAmount } from './amount-input'
import { OPERATING_EXPENSE_CATEGORIES, CAPITAL_EXPENSE_CATEGORIES } from './categories'
export const PROPERTY_EXPENSE_CATEGORIES = [...OPERATING_EXPENSE_CATEGORIES, ...CAPITAL_EXPENSE_CATEGORIES]
export function emptyPropertyExpense(year?: string) {
  const now = new Date()
  const date = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
  return { category: 'Taxes', amount: '', date:year && year !== String(now.getFullYear()) ? '' : date, note: '' }
}
export function propertyExpensePayload(draft: ReturnType<typeof emptyPropertyExpense>, propertyId: string, ownerId: string, documentId: string | null) {
  const amount = parseTaxAmount(draft.amount)
  if (amount === null || !Number.isFinite(amount) || amount <= 0) throw new Error('Enter an amount greater than zero.')
  if (!PROPERTY_EXPENSE_CATEGORIES.includes(draft.category as typeof PROPERTY_EXPENSE_CATEGORIES[number])) throw new Error('Choose an expense category.')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date) || !Number.isFinite(Date.parse(`${draft.date}T12:00:00`))) throw new Error('Choose a date.')
  return { owner_id: ownerId, property_id: propertyId, transaction_date: draft.date, transaction_type: 'Expense' as const,
    category: draft.category, amount, description: draft.note.trim() || draft.category, vendor: null, document_id: documentId, is_recurring: false }
}
