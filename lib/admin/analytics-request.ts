// PropRoster Milestone 11 (Privacy-First Admin Analytics): the testable
// core of GET /api/admin/analytics, expressed as plain async functions
// (the same "ports and adapters" seam used by
// lib/document-intelligence/analyze-request.ts) so authorization and
// assembly behavior can be unit tested without a database.
//
// Privacy boundary (see the completion report for the full review): every
// dependency below is expected to be backed by either (a) a SECURITY
// DEFINER aggregate RPC that itself re-checks admin status and returns
// only counts/sums/averages, or (b) the RLS-scoped admin_audit_events
// insert policy. Nothing in this file, or anything it calls, ever reads a
// raw properties/document_analyses/leases/tenant_property_access row —
// see lib/admin/types.ts for the exact shape every dependency returns.

import { estimateCostUsd } from './pricing'
import { summarizeSubscriptionCounts } from './subscription-metrics'
import type {
  AdminAnalyticsResponse,
  AiUsageDailyRow,
  AiUsageSummaryRow,
  FeatureAdoptionRow,
  OverviewRow,
  PortfolioUsageRow,
  SubscriptionCountRow,
} from './types'

export type AdminAnalyticsDeps = {
  /** Resolves via the is_admin() RPC — never a client-supplied flag. */
  isAdmin: () => Promise<boolean>
  fetchOverview: () => Promise<OverviewRow>
  fetchSubscriptionCounts: () => Promise<SubscriptionCountRow[]>
  fetchPortfolioUsage: () => Promise<PortfolioUsageRow>
  fetchFeatureAdoption: () => Promise<FeatureAdoptionRow>
  fetchAiUsageSummary: () => Promise<AiUsageSummaryRow>
  /** Days of daily AI usage to fetch — the caller decides the window. */
  fetchAiUsageDaily: (days: number) => Promise<AiUsageDailyRow[]>
  /** Records a VIEW_ADMIN_ANALYTICS audit row. Called only on a successful, authorized view. */
  logAudit: () => Promise<void>
}

export type AdminAnalyticsResult = { status: number; body: Record<string, unknown> }

// Fetches slightly more than a calendar month of daily rows (31 days is
// always enough to reach the 1st of the current month, regardless of
// today's date) so "this month" cost can be computed from the same daily
// rows shown on the chart, without a second RPC round trip.
const DAILY_USAGE_FETCH_DAYS = 31

function isSameMonthAsToday(dateIso: string, today: Date): boolean {
  const d = new Date(dateIso)
  return d.getUTCFullYear() === today.getUTCFullYear() && d.getUTCMonth() === today.getUTCMonth()
}

export async function handleAdminAnalyticsRequest(deps: AdminAnalyticsDeps, now: Date = new Date()): Promise<AdminAnalyticsResult> {
  const admin = await deps.isAdmin()
  if (!admin) {
    // Safe, generic access-denied response — never confirms/denies
    // whether the caller is a recognized user, an admin table even
    // exists, or any other detail an attacker could use to enumerate.
    return { status: 403, body: { error: 'Not authorized.' } }
  }

  const [overview, subscriptionRows, portfolioUsage, featureAdoption, aiUsageSummary, aiUsageDaily] = await Promise.all([
    deps.fetchOverview(),
    deps.fetchSubscriptionCounts(),
    deps.fetchPortfolioUsage(),
    deps.fetchFeatureAdoption(),
    deps.fetchAiUsageSummary(),
    deps.fetchAiUsageDaily(DAILY_USAGE_FETCH_DAYS),
  ])

  const subscriptions = summarizeSubscriptionCounts(subscriptionRows)

  const dailyWithCost = aiUsageDaily.map((row) => ({
    ...row,
    estimatedCostUsd: estimateCostUsd(row.model, row.inputTokens, row.outputTokens),
  }))

  // Month-to-date cost: sum only the rows that fall in the current
  // calendar month, using the same daily rows the chart renders — a
  // model with no pricing entry contributes `null` and is excluded from
  // the sum (never silently treated as $0).
  let estimatedCostThisMonthUsd: number | null = null
  for (const row of dailyWithCost) {
    if (!isSameMonthAsToday(row.date, now)) continue
    if (row.estimatedCostUsd === null) continue
    estimatedCostThisMonthUsd = (estimatedCostThisMonthUsd ?? 0) + row.estimatedCostUsd
  }

  const avgPropertiesPerRegisteredUser = overview.totalUsers > 0 ? portfolioUsage.totalProperties / overview.totalUsers : 0

  const body: AdminAnalyticsResponse = {
    overview,
    subscriptions,
    portfolioUsage: { ...portfolioUsage, avgPropertiesPerRegisteredUser },
    featureAdoption,
    aiUsage: {
      ...aiUsageSummary,
      daily: dailyWithCost,
      estimatedCostThisMonthUsd,
    },
  }

  // Audit only a genuinely successful, authorized view — a 403 above is
  // never logged as "an admin viewed analytics" because it wasn't one.
  await deps.logAudit()

  return { status: 200, body: body as unknown as Record<string, unknown> }
}
