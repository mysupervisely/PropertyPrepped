// PropRoster Milestone 11 (Privacy-First Admin Analytics): shared types for
// the admin analytics aggregate RPCs and the assembled API response.
// Every field here is an aggregate (a count, a sum, an average, a boolean
// presence flag) or minimum account metadata (Section 5 of the completion
// report) — never a property address, document, tenant name/email,
// financial transaction description, or any other customer-portfolio
// value. See app/api/admin/analytics/route.ts and
// lib/admin/analytics-request.ts for where these are assembled.

export type OverviewRow = {
  totalUsers: number
  newUsersThisMonth: number
  activeUsers30d: number
}

export type SubscriptionCountRow = {
  plan: string
  status: string | null
  accountCount: number
}

export type PortfolioUsageRow = {
  totalProperties: number
  ownersWithProperties: number
  avgPropertiesPerOwner: number
  medianPropertiesPerOwner: number
  distribution: {
    onePropertyCount: number
    twoToFourCount: number
    fiveToNineCount: number
    tenToTwentyCount: number
    twentyOnePlusCount: number
  }
}

export type FeatureAdoptionRow = {
  investmentToolsUsers: number
  investmentAnalysesCount: number
  documentIntelligenceUsers: number
  documentAnalysesCount: number
  tenantConnectOwnerCount: number
  tenantConnectActiveRelationships: number
}

export type AiUsageSummaryRow = {
  analysesThisMonth: number
  inputTokensThisMonth: number
  outputTokensThisMonth: number
  activeAiUsersThisMonth: number
}

export type AiUsageDailyRow = {
  date: string
  model: string
  analysesCount: number
  inputTokens: number
  outputTokens: number
}

/** Minimum account metadata only (Section 5) — never portfolio content. */
export type AdminUserAccountRow = {
  userId: string
  email: string | null
  signupDate: string
  lastSignInAt: string | null
  plan: string
  status: string | null
  hasStripeCustomer: boolean
  propertyCount: number
}

export type SubscriptionMetrics = {
  countsByPlan: Record<string, number>
  countsByStatus: Record<string, number>
  activePaidSubscriptions: number
  canceledSubscriptions: number
  pastDueSubscriptions: number
  mrrUsd: number
}

export type AdminAnalyticsResponse = {
  overview: OverviewRow
  subscriptions: SubscriptionMetrics
  portfolioUsage: PortfolioUsageRow & { avgPropertiesPerRegisteredUser: number }
  featureAdoption: FeatureAdoptionRow
  aiUsage: AiUsageSummaryRow & {
    daily: (AiUsageDailyRow & { estimatedCostUsd: number | null })[]
    estimatedCostThisMonthUsd: number | null
  }
}
