// PropRoster — Property Intelligence V1, Phase D: Portfolio Snapshot V1.
//
// Phase C answered "how is THIS property doing?" one property at a time
// (computePropertyPerformance). Phase D answers the Dashboard's own
// question — "how is my PORTFOLIO doing?" — by aggregating the exact
// same canonical per-property outputs. This file contains ZERO financial
// formulas of its own: every number it produces is a plain sum of
// Metric.value fields that lib/property-intelligence/calculate.ts already
// computed and vetted. If a number here is ever wrong, the bug is in
// calculate.ts, not here — this module only adds.
//
// The one genuinely new concept Phase D introduces is COVERAGE: a
// portfolio aggregate can legitimately be built from a subset of the
// landlord's properties when some lack the underlying data (Phase A's
// "missing must never render as $0" rule, extended to a portfolio of N
// properties where not every property necessarily has every metric).
// Deliberately reuses the existing Metric shape (value/status/source/
// period/notes) rather than inventing a parallel status system —
// PortfolioMetric is a Metric, plus one small `coverage` field. A caller
// derives "complete"/"partial"/"unavailable" directly from
// coverage.included vs coverage.total:
//   included === 0           -> unavailable (status is already 'unavailable', value null)
//   0 < included < total     -> partial (status is 'available' — the sum IS trustworthy for the properties it covers)
//   included === total       -> complete
// No fourth status, no second enum — see PortfolioMetric's own doc comment.

import type { Metric, MetricPeriod, PropertyPerformance } from './types'

export type PortfolioCoverage = {
  /** How many of the portfolio's properties actually contributed an `available` value to this aggregate. */
  included: number
  /** Total properties this aggregate was computed over (the landlord's own canonical, already-scoped property collection — see computePortfolioPerformance's own doc comment). */
  total: number
}

/**
 * A portfolio-level aggregate. Structurally still a `Metric` (so every
 * existing metricMoney/metricCompactMoney/metricPercent presentation
 * helper works on it completely unchanged — no new formatting code
 * needed for Phase D) plus `coverage`, which is the only genuinely new
 * piece of information a portfolio aggregate carries that a single
 * property's Metric does not need.
 */
export type PortfolioMetric = Metric & { coverage: PortfolioCoverage }

export type PortfolioPerformance = {
  /** The landlord's own canonical property count — always `properties.length` from whatever collection was passed in, never independently recomputed. */
  propertyCount: number
  /** Sum of each included property's `estimatedValue`. Point-in-time, like the property-level metric it aggregates. */
  portfolioValue: PortfolioMetric
  /** Sum of each included property's `contractMonthlyRent` — current KNOWN contractual rent, never derived from YTD income or divided from an annual figure. */
  monthlyRent: PortfolioMetric
  /**
   * Sum of each included property's `noiYtd`, for the SAME current tax
   * year across every property (callers must pass `PropertyPerformance`
   * objects all computed for that one year — this module does not, and
   * cannot, verify that on its own; see the doc comment on the `period`
   * parameter below). Never annualized, never substituted with contract
   * rent, never a prior year's figure.
   */
  noiYtd: PortfolioMetric
}

/**
 * Sums whichever properties' metric is `available`, skipping (never
 * zeroing) every `unavailable` one — a property with unknown data
 * contributes nothing to the sum AND is excluded from `coverage.included`,
 * so it can never be silently counted as a known zero (Phase A's rule,
 * applied at the portfolio level). `incomplete` is treated the same as
 * `unavailable` here (excluded, never summed as 0) — in practice this
 * never actually matters for the three Phase D metrics: resolveNoiYtd
 * requires BOTH its inputs to be strictly 'available' before it will
 * itself return 'available' (see calculate.ts), and resolveEstimatedValue/
 * resolveContractMonthlyRent never return 'incomplete' at all — but this
 * function stays correct even if a future metric can return 'incomplete'.
 */
function sumAvailable(metrics: Metric[], period: MetricPeriod): PortfolioMetric {
  const total = metrics.length
  const availableValues = metrics.filter((m): m is Metric & { value: number } => m.status === 'available' && m.value !== null)
  const included = availableValues.length
  const coverage: PortfolioCoverage = { included, total }
  if (included === 0) {
    return { value: null, status: 'unavailable', source: 'derived', period: 'n/a', coverage }
  }
  const sum = availableValues.reduce((s, m) => s + m.value, 0)
  return { value: sum, status: 'available', source: 'derived', period, coverage }
}

/**
 * Aggregates canonical per-property performance into one portfolio-level
 * snapshot. Takes already-computed `PropertyPerformance` results — one
 * per property, ALL for the same current tax year (the caller builds
 * each one via the exact same buildPropertyPerformanceInput() +
 * computePropertyPerformance() pipeline the individual Property Snapshot
 * already uses, just once per property in the landlord's own scoped
 * collection instead of only the one currently open) — never raw
 * property rows or transactions. This keeps Phase D from ever becoming a
 * second calculation system: if `properties` here is empty, or every
 * property's underlying metric is unavailable, every aggregate is
 * correctly `unavailable`, never a fabricated $0.
 *
 * `propertyCount` is always `properties.length` — the caller is
 * responsible for that array already reflecting the landlord's real,
 * authorization-scoped property collection (RLS + tenant/user scoping
 * happens well before this pure function ever sees the data, exactly as
 * it does for computePropertyPerformance itself).
 */
export function computePortfolioPerformance(properties: PropertyPerformance[]): PortfolioPerformance {
  return {
    propertyCount: properties.length,
    portfolioValue: sumAvailable(properties.map((p) => p.estimatedValue), 'point_in_time'),
    monthlyRent: sumAvailable(properties.map((p) => p.contractMonthlyRent), 'monthly_contract'),
    noiYtd: sumAvailable(properties.map((p) => p.noiYtd), 'ytd_actual'),
  }
}
