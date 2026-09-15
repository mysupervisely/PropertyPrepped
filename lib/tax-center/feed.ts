// PropRoster — Tax Center: usability/workflow-completion pass.
//
// Pure functions only — no Supabase, no React — same convention as the
// rest of lib/tax-center/. This module owns exactly what the redesigned
// Tax Center page needs beyond V3's existing aggregate.ts/readiness.ts/
// custom-items.ts (all untouched): a clean, source-labeled activity
// feed, the four-number year summary (Income/Expenses/Net/Receipts),
// and simple client-side filtering. It never recomputes a tax total —
// aggregate.ts remains the one place Income/Operating Expenses/Net
// Operating Result/etc. are computed for Property Detail, Portfolio
// Summary, and the CSV export.
//
// SOURCE LABELING (Section 4 of this milestone's own spec — "only use
// source labels supported by the actual architecture you audited"):
// every financial_transactions row Tax Center reads is either created
// directly — the Financials "Add transaction" flow, the new Tax Center
// "+ Add Expense" flow, or a confirmed Smart Upload import — or created
// AS A SIDE EFFECT of recording a canonical event elsewhere. A
// rent_payments row can optionally link the ONE financial_transactions
// row it created (rent_payments.financial_transaction_id — see
// app/rent-ledger/page.tsx's own header comment: "Recording a payment
// MAY also create exactly one linked financial_transactions Income/Rent
// row"). A maintenance_records row can do the same
// (maintenance_records.financial_transaction_id, already read
// elsewhere in lib/tax-center/types.ts). This module never invents a
// THIRD source — a transaction is "From Rent Ledger" or "From
// Maintenance" only when one of those real, existing link columns
// actually points at it; everything else is "Manually added." Purely
// presentational: it never changes what a transaction IS, only how its
// origin is labeled.

import type { TransactionInput } from './types'

export type TaxCenterTransactionSource = 'rent-ledger' | 'maintenance' | 'manual'

export const SOURCE_LABELS: Record<TaxCenterTransactionSource, string> = {
  'rent-ledger': 'From Rent Ledger',
  maintenance: 'From Maintenance',
  manual: 'Manually added',
}

export type RentPaymentLinkInput = { financial_transaction_id: string | null }
export type MaintenanceLinkInput = { financial_transaction_id: string | null }

/** Whichever real, existing link column (see this file's own header) points at this transaction id — 'manual' when neither does. */
export function resolveTransactionSource(
  transactionId: string,
  rentPayments: RentPaymentLinkInput[],
  maintenanceRecords: MaintenanceLinkInput[],
): TaxCenterTransactionSource {
  if (rentPayments.some((p) => p.financial_transaction_id === transactionId)) return 'rent-ledger'
  if (maintenanceRecords.some((m) => m.financial_transaction_id === transactionId)) return 'maintenance'
  return 'manual'
}

/** TransactionInput plus the two fields (vendor/description) the feed needs to show but aggregate.ts's own callers never did — a local, additive shape, not a change to the shared TransactionInput every other Tax Center module already relies on. */
export type TaxCenterFeedTransactionInput = TransactionInput & { vendor: string | null; description: string }

export type TaxCenterFeedItem = {
  id: string
  /** The transaction's own description if it has one, else its category — never blank, so a feed row is never left with nothing to show. */
  description: string
  amount: number
  type: 'Income' | 'Expense'
  propertyId: string
  propertyLabel: string
  date: string
  category: string
  vendor: string | null
  source: TaxCenterTransactionSource
  hasReceipt: boolean
}

/** Newest first — the same ordering convention every other activity feed in this app already uses. */
export function buildTaxCenterFeed(
  transactions: TaxCenterFeedTransactionInput[],
  propertyLabelById: ReadonlyMap<string, string>,
  rentPayments: RentPaymentLinkInput[],
  maintenanceRecords: MaintenanceLinkInput[],
): TaxCenterFeedItem[] {
  return transactions
    .map((t) => ({
      id: t.id,
      description: t.description.trim() || t.category,
      amount: Number(t.amount),
      type: t.transaction_type,
      propertyId: t.property_id,
      propertyLabel: propertyLabelById.get(t.property_id) || 'Unknown property',
      date: t.transaction_date,
      category: t.category,
      vendor: t.vendor,
      source: resolveTransactionSource(t.id, rentPayments, maintenanceRecords),
      hasReceipt: t.document_id !== null,
    }))
    .sort((a, b) => b.date.localeCompare(a.date))
}

export type TaxCenterYearSummary = {
  income: number
  expenses: number
  net: number
  receiptCount: number
}

/** The four numbers a landlord should see first — Income/Expenses/Net/Receipts — computed straight from the (already year-filtered) feed, never a second aggregation of financial_transactions. */
export function computeTaxCenterYearSummary(feed: TaxCenterFeedItem[]): TaxCenterYearSummary {
  const income = feed.filter((f) => f.type === 'Income').reduce((sum, f) => sum + f.amount, 0)
  const expenses = feed.filter((f) => f.type === 'Expense').reduce((sum, f) => sum + f.amount, 0)
  return { income, expenses, net: income - expenses, receiptCount: feed.filter((f) => f.hasReceipt).length }
}

export type TaxCenterFeedFilters = {
  propertyId?: string
  type?: 'Income' | 'Expense'
  category?: string
  receiptStatus?: 'attached' | 'missing'
}

/** Every filter is optional and additive (AND, not OR) — an empty filters object returns the feed unchanged. */
export function filterTaxCenterFeed(feed: TaxCenterFeedItem[], filters: TaxCenterFeedFilters): TaxCenterFeedItem[] {
  return feed.filter((item) => {
    if (filters.propertyId && item.propertyId !== filters.propertyId) return false
    if (filters.type && item.type !== filters.type) return false
    if (filters.category && item.category !== filters.category) return false
    if (filters.receiptStatus === 'attached' && !item.hasReceipt) return false
    if (filters.receiptStatus === 'missing' && item.hasReceipt) return false
    return true
  })
}
