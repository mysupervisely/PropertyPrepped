// PropRoster — Tax Center V3: Custom Tax Items.
//
// The "+ Add Other Tax Item" escape hatch — a landlord/property/tax-year
// specific manual record for anything the fixed TAX_CATEGORIES list
// (lib/tax-center/manual-entry.ts) doesn't have a field for. Backed by
// the new property_tax_custom_items table (supabase/milestone-23-tax-
// center-v3.sql) — a proper child table, not a JSON blob and not more
// speculative fixed columns, since the whole point of this feature is
// that its shape (how many items, what they're called) is genuinely
// dynamic per property/year.
//
// Every custom item is, by construction, a manual entry — there is no
// tracked equivalent to override, so unlike TAX_CATEGORIES there is no
// computeCategoryValue()/source ambiguity here at all. The UI/CSV/print
// layers always label a custom item's source as "Manual" — a constant,
// not a stored column (see the migration's own top comment for why).
//
// Double-counting: a custom item is its own explicit row, summed exactly
// once into whichever bucket its OWN category_group belongs to — it
// never reads, modifies, or overrides any fixed TAX_CATEGORIES value.
// CUSTOM_ITEM_OPERATING_EXPENSE_GROUPS below mirrors
// manual-entry.ts's OPERATING_EXPENSE_LIKE_GROUPS exactly (plus 'other',
// which behaves the same way a fixed "Other operating expenses" category
// already does) so the same rule — "financing/capital never count
// toward operating expenses or Net Result" — applies identically to
// custom items and fixed categories alike.

import { OPERATING_EXPENSE_LIKE_GROUPS, type TaxCategoryGroup } from './manual-entry'

export type CustomTaxItemGroup = TaxCategoryGroup | 'other'

export const CUSTOM_ITEM_GROUP_LABELS: Record<CustomTaxItemGroup, string> = {
  income: 'Income',
  operatingExpense: 'Operating Expense',
  professional: 'Professional / Administrative',
  travel: 'Travel',
  meals: 'Meals',
  financing: 'Financing',
  capital: 'Capital / Depreciable',
  other: 'Other',
}

// Per this milestone's spec, a custom item's allowed groups are
// Operating Expense / Professional & Administrative / Travel / Meals /
// Financing / Capital / Depreciable / Other — deliberately NOT 'income'
// (a custom item is always an EXPENSE-shaped record; rental income has
// its own fixed categories and mixing an arbitrary "income" custom item
// in here would risk exactly the kind of ambiguous, unreviewable total
// this milestone's "avoid double counting" section warns against).
export const CUSTOM_ITEM_GROUPS: CustomTaxItemGroup[] = ['operatingExpense', 'professional', 'travel', 'meals', 'financing', 'capital', 'other']

export type CustomTaxItem = {
  id: string
  propertyId: string
  taxYear: number
  description: string
  amount: number
  group: CustomTaxItemGroup
  notes: string | null
  documentId: string | null
}

// Same rule as manual-entry.ts's OPERATING_EXPENSE_LIKE_GROUPS, plus
// 'other' — an uncategorized custom expense still counts toward
// operating expenses/Net Result (matching the existing fixed "Other
// operating expenses" category's own treatment), while 'financing' and
// 'capital' custom items are excluded from both, exactly like the fixed
// mortgageInterest/capitalImprovements categories — so a custom capital
// or financing item can never be misread as an immediately deductible
// operating expense.
const OPERATING_EXPENSE_LIKE_GROUP_SET = new Set<CustomTaxItemGroup>([...OPERATING_EXPENSE_LIKE_GROUPS, 'other'])

export function isOperatingExpenseLikeGroup(group: CustomTaxItemGroup): boolean {
  return OPERATING_EXPENSE_LIKE_GROUP_SET.has(group)
}

export function customItemsForProperty(items: CustomTaxItem[], propertyId: string, taxYear: string | number): CustomTaxItem[] {
  return items.filter((i) => i.propertyId === propertyId && String(i.taxYear) === String(taxYear))
}

export function customItemsForGroup(items: CustomTaxItem[], group: CustomTaxItemGroup): CustomTaxItem[] {
  return items.filter((i) => i.group === group)
}

export function sumCustomItems(items: CustomTaxItem[]): number {
  return items.reduce((sum, i) => sum + Number(i.amount), 0)
}

/** The portion of a property/year's custom items that count toward operating expenses (and therefore Net Result) — see isOperatingExpenseLikeGroup above. */
export function operatingExpenseCustomItemsTotal(items: CustomTaxItem[]): number {
  return sumCustomItems(items.filter((i) => isOperatingExpenseLikeGroup(i.group)))
}

/** Custom items tagged Capital / Depreciable — never part of operating expenses/Net Result, shown/exported separately, same as capitalImprovements. */
export function capitalCustomItemsTotal(items: CustomTaxItem[]): number {
  return sumCustomItems(items.filter((i) => i.group === 'capital'))
}

/** Custom items tagged Financing — never part of operating expenses/Net Result, and never folded into mortgageInterest specifically (that stays a fixed-category-only figure). Shown/exported separately, e.g. alongside financingOtherTotal in aggregate.ts. */
export function financingCustomItemsTotal(items: CustomTaxItem[]): number {
  return sumCustomItems(items.filter((i) => i.group === 'financing'))
}

// -- Property panel group subtotals (components/property-profile/
// PropertyTaxPanel.tsx) -----------------------------------------------
//
// The property Tax panel shows one collapsible section per
// TaxCategoryGroup (income/operatingExpense/professional/travel/meals/
// financing/capital — it has no "other" section of its own; a custom
// item tagged "Other" is presented inside the "Other Tax Items" list,
// but its DOLLAR AMOUNT must still land in the same place Tax Center's
// real aggregate.ts puts it — folded into operatingExpenses via
// isOperatingExpenseLikeGroup — so the panel's own "Property & Operating
// Expenses" header is attributed the same "other"-tagged items too.
// Without this, the panel could show a smaller group subtotal than what
// Tax Center ultimately uses, which is exactly the bug this function
// exists to prevent.

/**
 * Which of a property/year's custom items count toward ONE collapsible
 * group's own displayed subtotal in the property panel. 'income' always
 * returns [] — a custom item is always expense-shaped (see
 * CUSTOM_ITEM_GROUPS), so there is nothing to attribute to Income.
 * 'operatingExpense' additionally picks up every 'other'-tagged item,
 * mirroring isOperatingExpenseLikeGroup's own treatment of "other"
 * exactly. Every other group (professional/travel/meals/financing/
 * capital) matches its own tag 1:1 — no group ever draws from more than
 * one source, so no item can be attributed to two groups at once.
 */
export function customItemsForPanelGroup(items: CustomTaxItem[], group: TaxCategoryGroup): CustomTaxItem[] {
  if (group === 'income') return []
  if (group === 'operatingExpense') return items.filter((i) => i.group === 'operatingExpense' || i.group === 'other')
  return items.filter((i) => i.group === group)
}
