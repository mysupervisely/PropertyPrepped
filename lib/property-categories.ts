// PropRoster — shared category vocabularies. Previously each lived only
// as an inline literal inside app/page.tsx (module-level `docCategories`/
// `financialCategories` consts, and an inline maintenance-category
// `<option>` list) — pulled out here, unchanged, so Smart Upload
// (components/SmartUpload/*, a separate component tree that also needs
// to write into property_documents/financial_transactions/
// maintenance_records) can reuse the EXACT same category vocabulary
// instead of a second, drifting copy. app/page.tsx now imports these
// instead of declaring its own — no behavior change, just one source of
// truth. ('All' is dropped from the documents list here — that value
// only ever made sense as a UI filter option, never as a real
// property_documents.category value to save.)

export const DOCUMENT_CATEGORIES = ['Closing', 'Mortgage', 'Insurance', 'Lease', 'Tax', 'Inspection', 'Receipts', 'Warranties', 'Other'] as const

export const FINANCIAL_CATEGORIES = ['Rent', 'Other Income', 'Mortgage', 'Taxes', 'Insurance', 'HOA', 'Utilities', 'Repairs', 'Maintenance', 'CapEx', 'Management', 'Legal & Professional', 'Supplies', 'Other'] as const

export const MAINTENANCE_CATEGORIES = ['Repair', 'Preventative', 'Inspection', 'Renovation', 'Landscaping', 'HVAC', 'Plumbing', 'Electrical', 'Other'] as const

// Milestone 18: Rent Ledger — how a payment arrived, recordkeeping only.
// PropRoster never processes any of these itself (no ACH, no Stripe, no
// bank linking); mirrors supabase/milestone-18-rent-ledger-propwatch.sql's
// rent_payments_payment_method_check exactly.
export const RENT_PAYMENT_METHODS = ['ACH / Bank Transfer', 'Check', 'Cash', 'Zelle', 'Venmo', 'Cash App', 'Other'] as const
