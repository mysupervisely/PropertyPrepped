// PropRoster — Property Intelligence V1, Phase B (Phase B.1 note below):
// source resolution.
//
// Bridges real (already RLS-fetched) row shapes into calculate.ts's
// PropertyPerformanceInput. Like every other function in this module,
// this is a PURE function — it takes rows a caller already loaded, it
// never calls Supabase itself — exactly the convention
// lib/tax-center/aggregate.ts's computePropertyTaxSummary() already uses.
// This is the only file in lib/property-intelligence/ that knows about
// "which table a number comes from"; calculate.ts never does.
//
// Phase B.1: calculate.ts now derives whether a tax year is "complete"
// (isYearComplete) from `year` vs. `now` itself, so this file only needs
// to pass the year and the resolved totals through — it does not decide
// annual-vs-YTD periods itself.
//
// Phase C.2: buildPropertyPerformanceInput() still builds exactly ONE
// year's input, same as before — app/page.tsx calls it once per
// candidate year (current + a bounded lookback of prior years) and hands
// the resulting list to calculate.ts's selectPriorYearPerformance(),
// which is the one that decides which year (if any) qualifies. This file
// gained only one new pass-through: properties.financing_status, run
// through normalizeFinancingStatus() so an unexpected/blank value can
// never reach the engine unnormalized.

import { selectCurrentLease, type LeaseWithId } from '../leases/status'
import { computePropertyTaxSummary } from '../tax-center/aggregate'
import type { CustomTaxItemInput, MaintenanceRecordInput, TaxRecordInput, TransactionInput } from '../tax-center/types'
import { normalizeFinancingStatus, type MortgageInput, type PropertyPerformanceInput } from './types'

export type PropertyRow = {
  id: string
  address: string
  city: string
  property_type: string
  /** properties.estimated_value */
  estimated_value: number
  /** properties.monthly_rent — the stale fallback, only used when no active lease exists. */
  monthly_rent: number
  /** properties.mortgage_balance — the flat fallback, only used when no mortgage row exists. */
  mortgage_balance: number
  /** properties.financing_status (Phase C.2) — passed through normalizeFinancingStatus, so any value outside the known set (or null/undefined) safely becomes 'Unknown' rather than reaching the engine unnormalized. */
  financing_status?: string | null
}

/** Only the fields lease-status derivation and rent resolution actually need — a caller's real LeaseRecord row satisfies this without reshaping. */
export type LeaseRow = LeaseWithId & { monthly_rent: number }

/** Only the fields debt-service/balance resolution actually need — a caller's real MortgageRecord row satisfies this without reshaping. */
export type MortgageRow = { current_balance: number; monthly_payment: number }

export type BuildPropertyPerformanceInputParams = {
  property: PropertyRow
  /** Every lease row for this property (current + historical) — selectCurrentLease (lib/leases/status.ts) picks the current one; this function never re-implements that logic. */
  leases: LeaseRow[]
  /**
   * The mortgage row this app already treats as current for this
   * property, or null/undefined when none exists. This app's own existing
   * convention when more than one mortgage row exists (a real, supported
   * case) is "most recently added" — app/page.tsx already queries
   * mortgages `.order('created_at', { ascending: false })` and reads
   * `selectedMortgages[0]`. This function does not re-sort or pick among
   * rows itself; pass the one that convention already selects.
   */
  currentMortgage: MortgageRow | null | undefined
  /**
   * This property's financial_transactions for the tax year being
   * evaluated. Matches computePropertyTaxSummary's own expected input
   * exactly (a set already filtered to the year; property_id filtering
   * happens inside that function either way, so passing every property's
   * transactions for the year — app/tax-center/page.tsx's own convention
   * — works too).
   */
  yearTransactions: TransactionInput[]
  yearMaintenanceRecords: MaintenanceRecordInput[]
  taxRecord: TaxRecordInput | null
  yearCustomItems?: CustomTaxItemInput[]
  /** The tax year this snapshot covers. Defaults to `now`'s calendar year — pass explicitly to build a snapshot for a different year (e.g. a landlord reviewing last year's performance). */
  year?: string
  now?: Date
}

export function buildPropertyPerformanceInput(params: BuildPropertyPerformanceInputParams): PropertyPerformanceInput {
  const {
    property, leases, currentMortgage,
    yearTransactions, yearMaintenanceRecords, taxRecord, yearCustomItems = [],
    now = new Date(),
  } = params
  const year = params.year ?? String(now.getFullYear())

  const currentLease = selectCurrentLease(leases, now)

  const summary = computePropertyTaxSummary(
    { id: property.id, address: property.address, city: property.city, property_type: property.property_type },
    yearTransactions,
    yearMaintenanceRecords,
    taxRecord,
    yearCustomItems,
  )

  const mortgage: MortgageInput | null = currentMortgage
    ? { currentBalance: currentMortgage.current_balance, monthlyPayment: currentMortgage.monthly_payment }
    : null

  return {
    propertyId: property.id,
    estimatedValue: property.estimated_value,
    propertyMonthlyRentFallback: property.monthly_rent,
    propertyMortgageBalanceFallback: property.mortgage_balance,
    activeLease: currentLease ? { id: currentLease.id, monthlyRent: currentLease.monthly_rent } : null,
    mortgage,
    financingStatus: normalizeFinancingStatus(property.financing_status),
    taxYearSummary: {
      year,
      grossIncome: summary.grossIncome,
      operatingExpenses: summary.operatingExpenses,
      transactionCount: summary.transactionCount,
      hasManualRecord: summary.hasManualRecord,
    },
  }
}
