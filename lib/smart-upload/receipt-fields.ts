// PropRoster — Smart Upload Foundation: the receipt review screen's field
// mapping (Part 10/11). Pulls the same applyFields keys
// components/DocumentIntelligencePanel.tsx's "Add Financial Expense" /
// "Create Maintenance Record" actions already use — no new extraction
// concept, just a testable, reusable read of the same data Smart Upload
// and the existing per-property Documents tab both get from the same
// analysis row.

import type { ApplyFields } from '../document-intelligence/schemas'
import { MAINTENANCE_CATEGORIES } from '../property-categories'

export type ReceiptFields = {
  vendor: string | null
  date: string | null
  /** Plain digit string, e.g. "184.72" — same normalization DocumentIntelligencePanel.tsx already applies before display. */
  amount: string | null
  description: string | null
  /** AI's own free-text category guess (e.g. "HVAC", "Supplies") — a SUGGESTION for the category picker, never assumed to exactly match FINANCIAL_CATEGORIES/MAINTENANCE_CATEGORIES. */
  suggestedCategory: string | null
}

function normalizeAmount(value: string | null): string | null {
  if (!value) return null
  const cleaned = value.replace(/[^0-9.]/g, '')
  return cleaned || null
}

export function extractReceiptFields(applyFields: Pick<ApplyFields, 'vendor' | 'date' | 'amount' | 'cost' | 'description' | 'category'>): ReceiptFields {
  return {
    vendor: applyFields.vendor?.trim() || null,
    date: applyFields.date?.trim() || null,
    amount: normalizeAmount(applyFields.amount || applyFields.cost),
    description: applyFields.description?.trim() || null,
    suggestedCategory: applyFields.category?.trim() || null,
  }
}

/** Part 19: "missing vendor/date/amount" — what the review screen must let the user fill in manually rather than block on. */
export function missingReceiptFields(fields: ReceiptFields): ('vendor' | 'date' | 'amount')[] {
  const missing: ('vendor' | 'date' | 'amount')[] = []
  if (!fields.vendor) missing.push('vendor')
  if (!fields.date) missing.push('date')
  if (!fields.amount || Number(fields.amount) <= 0) missing.push('amount')
  return missing
}

/**
 * Part 13: "if the item is clearly an HVAC/plumbing/repair/service
 * invoice" — a plain keyword check against the AI's suggested category
 * AND description, matched against the same vocabulary
 * MAINTENANCE_CATEGORIES already uses. This only decides whether to
 * SHOW the maintenance/PropCrew/system association options, pre-checked
 * — it never forces their creation (Part 13: "do not force automatic
 * creation... if confidence is low"), and the user can always toggle it
 * either way regardless of what this guesses.
 */
export function looksLikeServiceInvoice(fields: Pick<ReceiptFields, 'suggestedCategory' | 'description'>): boolean {
  const haystack = `${fields.suggestedCategory || ''} ${fields.description || ''}`.toLowerCase()
  const serviceWords = [...MAINTENANCE_CATEGORIES.filter((c) => c !== 'Other'), 'service', 'repair', 'contractor', 'technician', 'maintenance']
  return serviceWords.some((word) => haystack.includes(word.toLowerCase()))
}
