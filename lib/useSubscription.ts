'use client'

// PropPrepped Milestone 9: shared subscription/plan lookup, used by every
// route that needs to know the signed-in user's current plan (main
// workspace, property evaluator, pricing page, account/billing page).
// Reads only the caller's own row (RLS already enforces this; the .eq is
// defense-in-depth clarity, same pattern as the rest of the app).
//
// This is a DISPLAY/UX convenience only — it lets the UI show accurate
// plan info and pre-empt an obviously-blocked action with a friendlier
// prompt. It is never the security boundary: that's the database trigger
// in supabase/milestone-9-subscriptions.sql, which re-validates
// independently of anything this hook returns.

import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { resolveEffectivePlan, type SubscriptionRow } from './billing/entitlements'
import type { PlanId } from './billing/plans'

export type SubscriptionDetails = {
  plan: PlanId
  status: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
} | null

export type SubscriptionState = {
  plan: PlanId
  details: SubscriptionDetails
  loading: boolean
  refresh: () => Promise<void>
}

export function useSubscription(user: User | null): SubscriptionState {
  const [details, setDetails] = useState<SubscriptionDetails>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    if (!supabase || !user) {
      setDetails(null)
      setLoading(false)
      return
    }
    setLoading(true)
    const { data } = await supabase
      .from('user_subscriptions')
      .select('plan,status,current_period_end,cancel_at_period_end')
      .eq('owner_id', user.id)
      .maybeSingle()
    setDetails((data as SubscriptionDetails) || null)
    setLoading(false)
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const plan = resolveEffectivePlan(details as SubscriptionRow)
  return { plan, details, loading, refresh: load }
}
