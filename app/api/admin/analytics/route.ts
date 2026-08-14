// PropRoster Milestone 11: the one route that serves internal admin
// analytics. Privacy-critical — read the completion report before
// touching this file.
//
// - Runs server-side only (Node runtime); never exposes anything about
//   who is or isn't an admin beyond a generic 403.
// - Admin status is resolved via the is_admin() SECURITY DEFINER RPC —
//   never a client-supplied flag, never an email-domain check, never the
//   'owner' billing plan (see supabase/milestone-11-admin-analytics.sql).
// - Every Supabase call in this file uses the caller's own access token
//   (see lib/supabase-server.ts) — no service-role key. Every RPC this
//   route calls is itself SECURITY DEFINER and re-checks admin status
//   internally, so even if this route's own check were somehow bypassed,
//   every downstream call still refuses a non-admin caller.
// - Business logic (assembly, MRR math, cost estimation) lives in
//   lib/admin/analytics-request.ts so it can be unit tested without a
//   live database; this file is the thin adapter wiring real Supabase
//   calls to that logic — same pattern as
//   app/api/document-intelligence/analyze/route.ts.

import { NextRequest, NextResponse } from 'next/server'
import { createRequestClient } from '../../../../lib/supabase-server'
import { handleAdminAnalyticsRequest } from '../../../../lib/admin/analytics-request'
import type {
  AiUsageDailyRow,
  FeatureAdoptionRow,
  OverviewRow,
  PortfolioUsageRow,
  SubscriptionCountRow,
} from '../../../../lib/admin/types'

export const runtime = 'nodejs'

function getBearerToken(header: string | null): string | null {
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match ? match[1] : null
}

export async function GET(req: NextRequest) {
  try {
    const token = getBearerToken(req.headers.get('authorization'))
    if (!token) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })

    const supabase = createRequestClient(token)
    if (!supabase) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 })

    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData?.user) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
    }
    const adminUserId = userData.user.id

    const result = await handleAdminAnalyticsRequest({
      isAdmin: async () => {
        const { data, error } = await supabase.rpc('is_admin')
        if (error) return false
        return Boolean(data)
      },
      fetchOverview: async (): Promise<OverviewRow> => {
        const { data, error } = await supabase.rpc('admin_overview_metrics').single()
        if (error || !data) return { totalUsers: 0, newUsersThisMonth: 0, activeUsers30d: 0 }
        const row = data as { total_users: number; new_users_this_month: number; active_users_30d: number }
        return { totalUsers: row.total_users, newUsersThisMonth: row.new_users_this_month, activeUsers30d: row.active_users_30d }
      },
      fetchSubscriptionCounts: async (): Promise<SubscriptionCountRow[]> => {
        const { data, error } = await supabase.rpc('admin_subscription_metrics')
        if (error || !data) return []
        return (data as { plan: string; status: string | null; account_count: number }[]).map((r) => ({
          plan: r.plan,
          status: r.status,
          accountCount: r.account_count,
        }))
      },
      fetchPortfolioUsage: async (): Promise<PortfolioUsageRow> => {
        const { data, error } = await supabase.rpc('admin_portfolio_usage_metrics').single()
        if (error || !data) {
          return {
            totalProperties: 0,
            ownersWithProperties: 0,
            avgPropertiesPerOwner: 0,
            medianPropertiesPerOwner: 0,
            distribution: { onePropertyCount: 0, twoToFourCount: 0, fiveToNineCount: 0, tenToTwentyCount: 0, twentyOnePlusCount: 0 },
          }
        }
        const row = data as {
          total_properties: number
          owners_with_properties: number
          avg_properties_per_owner: number
          median_properties_per_owner: number
          bucket_1: number
          bucket_2_4: number
          bucket_5_9: number
          bucket_10_20: number
          bucket_21_plus: number
        }
        return {
          totalProperties: row.total_properties,
          ownersWithProperties: row.owners_with_properties,
          avgPropertiesPerOwner: row.avg_properties_per_owner,
          medianPropertiesPerOwner: row.median_properties_per_owner,
          distribution: {
            onePropertyCount: row.bucket_1,
            twoToFourCount: row.bucket_2_4,
            fiveToNineCount: row.bucket_5_9,
            tenToTwentyCount: row.bucket_10_20,
            twentyOnePlusCount: row.bucket_21_plus,
          },
        }
      },
      fetchFeatureAdoption: async (): Promise<FeatureAdoptionRow> => {
        const { data, error } = await supabase.rpc('admin_feature_adoption_metrics').single()
        if (error || !data) {
          return {
            investmentToolsUsers: 0,
            investmentAnalysesCount: 0,
            documentIntelligenceUsers: 0,
            documentAnalysesCount: 0,
            tenantConnectOwnerCount: 0,
            tenantConnectActiveRelationships: 0,
          }
        }
        const row = data as {
          investment_tools_users: number
          investment_analyses_count: number
          document_intelligence_users: number
          document_analyses_count: number
          tenant_connect_owner_count: number
          tenant_connect_active_relationships: number
        }
        return {
          investmentToolsUsers: row.investment_tools_users,
          investmentAnalysesCount: row.investment_analyses_count,
          documentIntelligenceUsers: row.document_intelligence_users,
          documentAnalysesCount: row.document_analyses_count,
          tenantConnectOwnerCount: row.tenant_connect_owner_count,
          tenantConnectActiveRelationships: row.tenant_connect_active_relationships,
        }
      },
      fetchAiUsageSummary: async () => {
        const { data, error } = await supabase.rpc('admin_ai_usage_summary').single()
        if (error || !data) return { analysesThisMonth: 0, inputTokensThisMonth: 0, outputTokensThisMonth: 0, activeAiUsersThisMonth: 0 }
        const row = data as {
          analyses_this_month: number
          input_tokens_this_month: number
          output_tokens_this_month: number
          active_ai_users_this_month: number
        }
        return {
          analysesThisMonth: row.analyses_this_month,
          inputTokensThisMonth: row.input_tokens_this_month,
          outputTokensThisMonth: row.output_tokens_this_month,
          activeAiUsersThisMonth: row.active_ai_users_this_month,
        }
      },
      fetchAiUsageDaily: async (days: number): Promise<AiUsageDailyRow[]> => {
        const { data, error } = await supabase.rpc('admin_ai_usage_daily', { p_days: days })
        if (error || !data) return []
        return (data as { usage_date: string; model: string; analyses_count: number; input_tokens: number; output_tokens: number }[]).map(
          (r) => ({ date: r.usage_date, model: r.model, analysesCount: r.analyses_count, inputTokens: r.input_tokens, outputTokens: r.output_tokens }),
        )
      },
      logAudit: async () => {
        await supabase.from('admin_audit_events').insert({
          admin_user_id: adminUserId,
          action: 'VIEW_ADMIN_ANALYTICS',
          target_user_id: null,
          metadata: {},
        })
      },
    })

    return NextResponse.json(result.body, { status: result.status })
  } catch (err) {
    console.error('admin analytics error', err)
    return NextResponse.json({ error: 'Something went wrong loading admin analytics.' }, { status: 500 })
  }
}
