// PropRoster Milestone 11: Property Watch — Property Tax & HOA monitoring
// (Sections 6 & 8).
//
// Deliberate design choice: this milestone does NOT add a dedicated
// property_tax or hoa table. PropRoster already records both as expense
// categories ('Taxes' / 'HOA') in the existing financial_transactions
// ledger (Section 21: "the existing ledger remains authoritative for
// expenses" — every property page already lets an owner log a tax or HOA
// payment there today). Reusing that history means year-over-year
// comparisons work immediately for any property with two years of
// transactions, with zero new data entry required. A due date, assessed
// value, or appeal deadline — none of which the ledger stores — can still
// reach Property Watch via a manual reminder (generators/manual.ts) or a
// document-intelligence extraction once that field is added; seeing
// generators/document-intelligence.ts for why Property Tax/HOA documents
// aren't wired into that path yet.
//
// Both generators only ever fire on an INCREASE, never a decrease — a
// lower tax bill or lower HOA dues isn't something an owner needs Property
// Watch to flag. Priority is a small deterministic function of the
// percentage increase (Section 15: no arbitrary/AI-decided severity).

import { EVENT_KEYS } from '../identity'
import type { PropertyWatchDraft, WatchActionType, WatchCategory, WatchPriority } from '../types'
import type { PropertyLike } from './lease'

export type LedgerTransactionLike = {
  property_id: string
  transaction_date: string
  transaction_type: 'Income' | 'Expense'
  category: string
  amount: number
}

export type LedgerIncrease = {
  previousYear: number
  previousAmount: number
  currentYear: number
  currentAmount: number
  increaseAmount: number
  increasePercent: number
}

function yearOf(dateIso: string): number {
  return Number(dateIso.slice(0, 4))
}

function sumByYear(transactions: LedgerTransactionLike[], propertyId: string, category: string): Map<number, number> {
  const totals = new Map<number, number>()
  for (const tx of transactions) {
    if (tx.property_id !== propertyId || tx.category !== category || tx.transaction_type !== 'Expense') continue
    const year = yearOf(tx.transaction_date)
    totals.set(year, (totals.get(year) ?? 0) + Number(tx.amount))
  }
  return totals
}

function increasePriority(increasePercent: number): WatchPriority {
  if (increasePercent >= 20) return 'High'
  if (increasePercent >= 10) return 'Normal'
  return 'Low'
}

function detectIncrease(transactions: LedgerTransactionLike[], propertyId: string, category: string): LedgerIncrease | null {
  const totals = sumByYear(transactions, propertyId, category)
  const years = [...totals.keys()].sort((a, b) => b - a)
  if (years.length < 2) return null // Section 6: "no comparison when prior [year] missing" — same rule as insurance's prior-policy check
  const [currentYear, previousYear] = years
  const currentAmount = totals.get(currentYear)!
  const previousAmount = totals.get(previousYear)!
  if (previousAmount <= 0 || currentAmount <= previousAmount) return null
  const increaseAmount = currentAmount - previousAmount
  return { previousYear, previousAmount, currentYear, currentAmount, increaseAmount, increasePercent: (increaseAmount / previousAmount) * 100 }
}

function buildLedgerDraft(
  increase: LedgerIncrease,
  property: PropertyLike,
  eventKey: string,
  category: WatchCategory,
  title: string,
  descriptionVerb: string,
  actionType: WatchActionType,
  carefulNote: string
): PropertyWatchDraft {
  return {
    owner_id: property.owner_id,
    property_id: property.id,
    source_type: 'ledger',
    // No single source row exists for a year-over-year comparison — the
    // property itself is the stable identity so this dedupes to one item
    // per property per year (identity.ts, point 5).
    source_id: property.id,
    event_key: eventKey,
    category,
    title,
    description: `${property.address} — ${descriptionVerb} increased from $${Math.round(increase.previousAmount).toLocaleString()} in ${increase.previousYear} to $${Math.round(increase.currentAmount).toLocaleString()} in ${increase.currentYear} (+${increase.increasePercent.toFixed(1)}%).${carefulNote ? ` ${carefulNote}` : ''}`,
    event_date: null,
    warning_date: null,
    priority: increasePriority(increase.increasePercent),
    status: 'Needs Attention',
    action_type: actionType,
    metadata: { ...increase },
  }
}

export function deriveTaxWatchDraft(transactions: LedgerTransactionLike[], property: PropertyLike): PropertyWatchDraft | null {
  const increase = detectIncrease(transactions, property.id, 'Taxes')
  if (!increase) return null
  // Section 6: careful language — never "your assessment is wrong."
  return buildLedgerDraft(
    increase,
    property,
    EVENT_KEYS.taxIncrease(increase.currentYear),
    'Property Tax',
    'Property Tax Increase',
    'property tax',
    'Review Assessment',
    'Your assessment may be worth reviewing.'
  )
}

export function deriveHoaWatchDraft(transactions: LedgerTransactionLike[], property: PropertyLike): PropertyWatchDraft | null {
  const increase = detectIncrease(transactions, property.id, 'HOA')
  if (!increase) return null
  return buildLedgerDraft(
    increase,
    property,
    EVENT_KEYS.hoaIncrease(increase.currentYear),
    'HOA',
    'HOA Dues Increase',
    'HOA dues',
    'Review',
    ''
  )
}
