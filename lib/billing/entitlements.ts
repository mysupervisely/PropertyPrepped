// PropPrepped Milestone 9: centralized entitlement resolution.
//
// This is the ONLY place that should know what a plan grants. Components
// must call into here (or read plans.ts for display copy) — never write
// `if (plan === 'investor')` or hardcode a property count inline. The
// actual security boundary is the database trigger in
// supabase/milestone-9-subscriptions.sql (a client can't be trusted to
// call this honestly); this module exists so the UI's read of "what am I
// allowed to do" and the DB's enforcement of it are driven by the same
// concepts, and so a future feature (monthlyAIAnalyses, tenantPortal, etc.)
// has one obvious place to be added.

import { PLANS, type PlanId } from './plans'

// Stripe subscription statuses that currently grant paid entitlements.
// Reasoning per status (Section 13):
//   active            — normal paid state. Entitled.
//   trialing          — not used yet (Section 18: no free trials), but if
//                        ever encountered, treated as entitled — Stripe
//                        itself considers the subscription "in good
//                        standing" during a trial.
//   past_due          — Stripe is actively retrying a failed card. Still
//                        entitled: this is a grace period, not a
//                        cancellation, and yanking access on the first
//                        missed payment would be a bad, surprising
//                        experience for a real card-expiry hiccup.
//   unpaid            — Stripe has exhausted its retry schedule without
//                        collecting payment. NOT entitled — falls back to
//                        Free. Existing property data is never touched
//                        (Section 5/13) even though new-property creation
//                        now follows Free's limit.
//   canceled          — subscription ended (self-service cancel or after
//                        `unpaid` gave up). NOT entitled — Free.
//   incomplete        — the very first payment on a new subscription
//                        hasn't succeeded yet. NOT entitled — there was
//                        never a successful payment to grant access for.
//   incomplete_expired— the first-payment window expired without success.
//                        NOT entitled — same reasoning as incomplete.
//   paused            — subscription is deliberately paused (e.g. via the
//                        Customer Portal's pause feature, if enabled).
//                        NOT entitled while paused, but — like every other
//                        non-entitled status — this only affects whether
//                        a NEW property can be created, never existing data.
export const ENTITLED_STATUSES = new Set(['active', 'trialing', 'past_due'])

export type SubscriptionRow = {
  plan: string | null
  status: string | null
} | null | undefined

/**
 * Resolves the effective plan for entitlement purposes. Never trusts a
 * bare `plan` column without also checking `status` — a canceled Investor
 * subscription must resolve to Free, not Investor, even though the `plan`
 * column may still read "investor" until the row is next synced.
 */
export function resolveEffectivePlan(sub: SubscriptionRow): PlanId {
  if (!sub || !sub.plan || !sub.status) return 'free'
  if (sub.plan === 'free') return 'free'
  if (!ENTITLED_STATUSES.has(sub.status)) return 'free'
  if (sub.plan in PLANS) return sub.plan as PlanId
  return 'free'
}

export function maxPropertiesFor(plan: PlanId): number {
  return PLANS[plan].maxProperties
}

export function canCreateProperty(plan: PlanId, currentPropertyCount: number): boolean {
  return currentPropertyCount < maxPropertiesFor(plan)
}

// Central hook point for future entitlements (Section 4/18). Each key
// returns a safe "not available" default until a real limit is measured
// and enforced — none of these are checked anywhere yet. Adding real
// enforcement later means changing this module and the places that read
// it, never scattering a new check through components.
export type Entitlements = {
  maxProperties: number
  /** Deliberately unmeasured (Section 4/18: do not guess AI usage allowances). `null` = no limit defined/enforced yet, not "unlimited." */
  monthlyAIAnalyses: number | null
  tenantPortal: boolean
  portfolioAnalytics: boolean
  advancedReports: boolean
  teamMembers: number | null
  prioritySupport: boolean
}

export function entitlementsFor(plan: PlanId): Entitlements {
  return {
    maxProperties: maxPropertiesFor(plan),
    monthlyAIAnalyses: null,
    tenantPortal: false,
    portfolioAnalytics: false,
    advancedReports: false,
    teamMembers: null,
    prioritySupport: false,
  }
}
