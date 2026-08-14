import { describe, expect, it, vi } from 'vitest'
import { handleAdminAnalyticsRequest, type AdminAnalyticsDeps } from './analytics-request'
import type { AiUsageDailyRow, FeatureAdoptionRow, OverviewRow, PortfolioUsageRow, SubscriptionCountRow } from './types'

function baseOverview(): OverviewRow {
  return { totalUsers: 100, newUsersThisMonth: 10, activeUsers30d: 40 }
}
function baseSubscriptions(): SubscriptionCountRow[] {
  return [
    { plan: 'free', status: 'active', accountCount: 60 },
    { plan: 'investor', status: 'active', accountCount: 20 },
    { plan: 'portfolio', status: 'canceled', accountCount: 5 },
  ]
}
function basePortfolioUsage(): PortfolioUsageRow {
  return {
    totalProperties: 250,
    ownersWithProperties: 80,
    avgPropertiesPerOwner: 3.125,
    medianPropertiesPerOwner: 2,
    distribution: { onePropertyCount: 30, twoToFourCount: 30, fiveToNineCount: 15, tenToTwentyCount: 4, twentyOnePlusCount: 1 },
  }
}
function baseFeatureAdoption(): FeatureAdoptionRow {
  return {
    investmentToolsUsers: 12,
    investmentAnalysesCount: 40,
    documentIntelligenceUsers: 8,
    documentAnalysesCount: 22,
    tenantConnectOwnerCount: 3,
    tenantConnectActiveRelationships: 5,
  }
}

function baseDeps(overrides: Partial<AdminAnalyticsDeps> = {}): AdminAnalyticsDeps {
  return {
    isAdmin: vi.fn().mockResolvedValue(true),
    fetchOverview: vi.fn().mockResolvedValue(baseOverview()),
    fetchSubscriptionCounts: vi.fn().mockResolvedValue(baseSubscriptions()),
    fetchPortfolioUsage: vi.fn().mockResolvedValue(basePortfolioUsage()),
    fetchFeatureAdoption: vi.fn().mockResolvedValue(baseFeatureAdoption()),
    fetchAiUsageSummary: vi.fn().mockResolvedValue({ analysesThisMonth: 5, inputTokensThisMonth: 1000, outputTokensThisMonth: 500, activeAiUsersThisMonth: 2 }),
    fetchAiUsageDaily: vi.fn().mockResolvedValue([] as AiUsageDailyRow[]),
    logAudit: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('handleAdminAnalyticsRequest — authorization', () => {
  it('returns 403 and a generic message for a non-admin caller', async () => {
    const deps = baseDeps({ isAdmin: vi.fn().mockResolvedValue(false) })
    const result = await handleAdminAnalyticsRequest(deps)
    expect(result.status).toBe(403)
    expect(result.body).toEqual({ error: 'Not authorized.' })
  })

  it('never calls any aggregate fetch function when the caller is not an admin', async () => {
    const deps = baseDeps({ isAdmin: vi.fn().mockResolvedValue(false) })
    await handleAdminAnalyticsRequest(deps)
    expect(deps.fetchOverview).not.toHaveBeenCalled()
    expect(deps.fetchSubscriptionCounts).not.toHaveBeenCalled()
    expect(deps.fetchPortfolioUsage).not.toHaveBeenCalled()
    expect(deps.fetchFeatureAdoption).not.toHaveBeenCalled()
    expect(deps.fetchAiUsageSummary).not.toHaveBeenCalled()
    expect(deps.fetchAiUsageDaily).not.toHaveBeenCalled()
  })

  it('never logs an audit event for a denied (non-admin) access attempt', async () => {
    const deps = baseDeps({ isAdmin: vi.fn().mockResolvedValue(false) })
    await handleAdminAnalyticsRequest(deps)
    expect(deps.logAudit).not.toHaveBeenCalled()
  })

  it('returns 200 and logs exactly one audit event for a genuine admin view', async () => {
    const deps = baseDeps()
    const result = await handleAdminAnalyticsRequest(deps)
    expect(result.status).toBe(200)
    expect(deps.logAudit).toHaveBeenCalledTimes(1)
  })
})

describe('handleAdminAnalyticsRequest — privacy: response shape contains only aggregate fields', () => {
  it('the assembled response contains no raw customer-portfolio field or content marker', async () => {
    // Deliberately specific substrings that would ONLY appear if a raw
    // row (or its column names) leaked through — not generic words like
    // "document" or "tenant" that also legitimately appear inside safe
    // aggregate field names such as documentAnalysesCount or
    // tenantConnectOwnerCount.
    const deps = baseDeps()
    const result = await handleAdminAnalyticsRequest(deps)
    const serialized = JSON.stringify(result.body).toLowerCase()
    for (const forbidden of [
      'address',
      'tenant_email',
      'tenant_name',
      'tenantemail',
      'tenantname',
      'structured_data',
      'structureddata',
      'source_snippet',
      'sourcesnippet',
      'storage_path',
      'storagepath',
      'mime_type',
      'sender_user_id',
      'financial_transaction',
    ]) {
      expect(serialized.includes(forbidden), `response unexpectedly contains "${forbidden}"`).toBe(false)
    }
  })

  it('the response has exactly the five documented top-level sections, nothing else', async () => {
    const deps = baseDeps()
    const result = await handleAdminAnalyticsRequest(deps)
    expect(Object.keys(result.body).sort()).toEqual(['aiUsage', 'featureAdoption', 'overview', 'portfolioUsage', 'subscriptions'].sort())
  })
})

describe('handleAdminAnalyticsRequest — MRR / subscription assembly', () => {
  it('embeds the subscription-metrics summarizer output verbatim', async () => {
    const deps = baseDeps()
    const result = await handleAdminAnalyticsRequest(deps)
    const body = result.body as any
    expect(body.subscriptions.countsByPlan).toEqual({ free: 60, investor: 20, portfolio: 5 })
    expect(body.subscriptions.canceledSubscriptions).toBe(5)
  })
})

describe('handleAdminAnalyticsRequest — portfolio usage', () => {
  it('computes avgPropertiesPerRegisteredUser from totalProperties / overview.totalUsers', async () => {
    const deps = baseDeps()
    const result = await handleAdminAnalyticsRequest(deps)
    const body = result.body as any
    expect(body.portfolioUsage.avgPropertiesPerRegisteredUser).toBeCloseTo(250 / 100, 6)
  })

  it('does not divide by zero when there are no registered users', async () => {
    const deps = baseDeps({ fetchOverview: vi.fn().mockResolvedValue({ totalUsers: 0, newUsersThisMonth: 0, activeUsers30d: 0 }) })
    const result = await handleAdminAnalyticsRequest(deps)
    const body = result.body as any
    expect(body.portfolioUsage.avgPropertiesPerRegisteredUser).toBe(0)
  })
})

describe('handleAdminAnalyticsRequest — AI usage cost estimation', () => {
  it('attaches an estimated cost to every daily row using a known model', async () => {
    const daily: AiUsageDailyRow[] = [{ date: '2026-08-01', model: 'claude-sonnet-5', analysesCount: 2, inputTokens: 1_000_000, outputTokens: 1_000_000 }]
    const deps = baseDeps({ fetchAiUsageDaily: vi.fn().mockResolvedValue(daily) })
    const result = await handleAdminAnalyticsRequest(deps, new Date('2026-08-14T00:00:00Z'))
    const body = result.body as any
    expect(body.aiUsage.daily[0].estimatedCostUsd).toBeCloseTo(3.0 + 15.0, 6)
  })

  it('leaves estimatedCostUsd null for an unrecognized model, never a guessed number', async () => {
    const daily: AiUsageDailyRow[] = [{ date: '2026-08-01', model: 'some-future-model', analysesCount: 1, inputTokens: 100, outputTokens: 100 }]
    const deps = baseDeps({ fetchAiUsageDaily: vi.fn().mockResolvedValue(daily) })
    const result = await handleAdminAnalyticsRequest(deps, new Date('2026-08-14T00:00:00Z'))
    const body = result.body as any
    expect(body.aiUsage.daily[0].estimatedCostUsd).toBeNull()
  })

  it('sums estimatedCostThisMonthUsd only over rows in the current calendar month', async () => {
    const daily: AiUsageDailyRow[] = [
      { date: '2026-08-05', model: 'claude-sonnet-5', analysesCount: 1, inputTokens: 1_000_000, outputTokens: 0 }, // this month: $3
      { date: '2026-07-31', model: 'claude-sonnet-5', analysesCount: 1, inputTokens: 1_000_000, outputTokens: 0 }, // last month: excluded
    ]
    const deps = baseDeps({ fetchAiUsageDaily: vi.fn().mockResolvedValue(daily) })
    const result = await handleAdminAnalyticsRequest(deps, new Date('2026-08-14T00:00:00Z'))
    const body = result.body as any
    expect(body.aiUsage.estimatedCostThisMonthUsd).toBeCloseTo(3.0, 6)
  })

  it('reports null for estimatedCostThisMonthUsd when there is no this-month usage at all', async () => {
    const deps = baseDeps({ fetchAiUsageDaily: vi.fn().mockResolvedValue([]) })
    const result = await handleAdminAnalyticsRequest(deps, new Date('2026-08-14T00:00:00Z'))
    const body = result.body as any
    expect(body.aiUsage.estimatedCostThisMonthUsd).toBeNull()
  })

  it('requests a fetch window wide enough to always cover day 1 of the current month', async () => {
    const deps = baseDeps()
    await handleAdminAnalyticsRequest(deps)
    expect(deps.fetchAiUsageDaily).toHaveBeenCalledWith(31)
  })
})
