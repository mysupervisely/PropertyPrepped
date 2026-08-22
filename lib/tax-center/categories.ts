// PropRoster — Tax Center V1.
//
// Tax Center reuses lib/property-categories.ts's FINANCIAL_CATEGORIES
// exactly — no new expense category vocabulary is introduced. This file
// only classifies those SAME categories into the groupings Tax Center's
// aggregation/readiness logic needs, and provides an optional, purely
// informational Schedule E line mapping.
//
// Why these three groups (Section: "Important Separations"):
//   - INCOME: taxable rental income categories.
//   - OPERATING_EXPENSE: ordinary, currently-deductible-style operating
//     expenses (the same set app/page.tsx's own existing NOI calculation
//     already excludes 'Mortgage' and 'CapEx' from — see the
//     `noiExpenses` line in that file's Financials tab; Tax Center
//     mirrors that exact, already-established treatment rather than
//     inventing a new one).
//   - CAPITAL: 'CapEx' — capital improvements are never summed into
//     operating expenses and are never presented as immediately
//     deductible; they're shown separately with a depreciation note.
//   - 'Mortgage' is deliberately in neither group. A mortgage payment
//     transaction in this schema is a single lump sum — PropRoster has
//     no principal/interest split and no amortization schedule anywhere
//     (supabase/schema.sql's `mortgages` table stores balances/rate/
//     payment, not a year-by-year interest figure). Presenting any part
//     of it as deductible interest would be exactly the kind of
//     estimate Section "Data Integrity" forbids, so 'Mortgage' amounts
//     are shown separately, labeled, and never summed into income or
//     either expense group.
export const INCOME_CATEGORIES = ['Rent', 'Other Income'] as const

export const OPERATING_EXPENSE_CATEGORIES = [
  'Taxes', 'Insurance', 'Repairs', 'Maintenance', 'HOA', 'Utilities',
  'Management', 'Legal & Professional', 'Supplies', 'Other',
] as const

export const CAPITAL_EXPENSE_CATEGORIES = ['CapEx'] as const

export const NON_OPERATING_CATEGORIES = ['Mortgage'] as const

export type IncomeCategory = (typeof INCOME_CATEGORIES)[number]
export type OperatingExpenseCategory = (typeof OPERATING_EXPENSE_CATEGORIES)[number]

export function isIncomeCategory(category: string): boolean {
  return (INCOME_CATEGORIES as readonly string[]).includes(category)
}

export function isOperatingExpenseCategory(category: string): boolean {
  return (OPERATING_EXPENSE_CATEGORIES as readonly string[]).includes(category)
}

export function isCapitalExpenseCategory(category: string): boolean {
  return (CAPITAL_EXPENSE_CATEGORIES as readonly string[]).includes(category)
}

export function isNonOperatingCategory(category: string): boolean {
  return (NON_OPERATING_CATEGORIES as readonly string[]).includes(category)
}

// Purely informational — never claimed to be, or used to generate,
// an actual IRS Schedule E. Referencing a public form's well-known line
// numbers so a landlord can more easily hand categorized totals to a
// CPA; several PropRoster categories legitimately have no dedicated
// Schedule E line (HOA fees, for instance) and are honestly mapped to
// its catch-all "Other" line rather than invented a line for. Kept in
// its own exported table (not baked into aggregation logic) so it stays
// transparent and reviewable, per this milestone's own spec.
export const SCHEDULE_E_REFERENCE: Record<OperatingExpenseCategory, string> = {
  'Taxes': 'Schedule E, Line 16 (Taxes)',
  'Insurance': 'Schedule E, Line 9 (Insurance)',
  'Repairs': 'Schedule E, Line 14 (Repairs)',
  'Maintenance': 'Schedule E, Line 7 (Cleaning and maintenance)',
  'HOA': 'Schedule E, Line 19 (Other)',
  'Utilities': 'Schedule E, Line 17 (Utilities)',
  'Management': 'Schedule E, Line 11 (Management fees)',
  'Legal & Professional': 'Schedule E, Line 10 (Legal and other professional fees)',
  'Supplies': 'Schedule E, Line 15 (Supplies)',
  'Other': 'Schedule E, Line 19 (Other)',
}

export const SCHEDULE_E_CAPEX_NOTE = 'Not an expense line on Schedule E — capital improvements are typically depreciated over time (see IRS Form 4562), not deducted in the year paid. Review with your tax professional.'

export const SCHEDULE_E_MORTGAGE_NOTE = 'Schedule E, Line 12 covers mortgage INTEREST only — PropRoster does not calculate or track interest paid separately from principal, so mortgage amounts are shown here for reference only, not as a deductible total. Loan principal is never deductible. Check your lender\'s Form 1098 for the interest portion.'
