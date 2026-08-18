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

// Note on the internal 'owner' plan: it needs no special-casing anywhere
// in this file. resolveEffectivePlan already returns 'owner' generically
// once it's a real key in PLANS with an entitled status ('active'); this
// function then reads PLANS.owner.maxProperties (Infinity), and
// canCreateProperty below is trivially always true against Infinity — so
// "unlimited properties" and "no upgrade prompts" both fall out of the
// existing generic logic rather than a new code path.
export function maxPropertiesFor(plan: PlanId): number {
  return PLANS[plan].maxProperties
}

export function canCreateProperty(plan: PlanId, currentPropertyCount: number): boolean {
  return currentPropertyCount < maxPropertiesFor(plan)
}

// Milestone 10: Tenant Connect launch intent. Unlike the other stub
// fields below (tenantPortal, etc. — deliberately unmeasured/false for
// every plan because no real limit exists yet), tenantConnect IS a
// real, currently-enforced value per plan: Manage and above get it
// today, Free/Organize do not, and Owner (internal, unlimited) always
// does. Legacy Investor is the deliberate exception — the long-term
// intent is an optional paid add-on, but since no Stripe add-on product
// exists yet and nothing may be sold that isn't live, legacy Investor
// stays `false` here exactly like Free until that billing path is
// built (unchanged from before Launch Pricing). This map is the ONLY
// place that distinction is made; entitlementsFor below just reads it,
// same as every other field in this file.
const TENANT_CONNECT_ENABLED: Record<PlanId, boolean> = {
  free: false,
  organize: false,
  manage: true,
  automate: true,
  investor: false,
  portfolio: true,
  portfolio_pro: true,
  owner: true,
}

// Launch Pricing (capability-based relaunch): the real, currently-
// enforced capability set for each plan. Free/Organize get none of
// these — Organize is documents/organization/tracking, not AI ingestion
// or recurring-operations tooling. Manage gets all of them, with a
// metered monthly AI allowance (Section: AI Enforcement).
//
// Legacy paid subscribers (investor/portfolio/portfolio_pro) get the
// SAME full capability set as Manage, with an UNLIMITED AI allowance
// (monthlyAIAnalyses: null) — a deliberate, conservative choice per the
// launch spec ("Choose conservative backward-compatible AI entitlements
// for legacy subscribers rather than accidentally blocking them during
// launch"). Before this launch, EVERY signed-in user on ANY plan had
// unlimited AI analysis calls (see the billing audit, Section 11) — a
// legacy paying subscriber suddenly hitting a new 50/month cap they were
// never told about, on launch day, would be a broken-feeling regression
// for someone already paying. The new 50/month allowance applies only to
// the NEW 'manage' plan, which is being marketed with that number from
// day one. This same reasoning is extended uniformly to the other new
// capability flags (canUseSmartUpload/canUseSmartImport/
// canUseDocumentIntelligence/canUseRentLedger/canUsePropWatch) — none of
// these were ever gated before Launch Pricing, so a legacy subscriber
// loses nothing they already had access to.
export type ManageCapabilities = {
  /** `null` = unlimited (no allowance check performed). A real number is enforced server-side in the analyze route — never just hidden client-side (Section: AI Enforcement). */
  monthlyAIAnalyses: number | null
  canUseSmartUpload: boolean
  canUseSmartImport: boolean
  canUseDocumentIntelligence: boolean
  canUseRentLedger: boolean
  canUsePropWatch: boolean
}

const NO_MANAGE_CAPABILITIES: ManageCapabilities = {
  monthlyAIAnalyses: 0,
  canUseSmartUpload: false,
  canUseSmartImport: false,
  canUseDocumentIntelligence: false,
  canUseRentLedger: false,
  canUsePropWatch: false,
}
const MANAGE_TIER_CAPABILITIES: ManageCapabilities = {
  monthlyAIAnalyses: 50,
  canUseSmartUpload: true,
  canUseSmartImport: true,
  canUseDocumentIntelligence: true,
  canUseRentLedger: true,
  canUsePropWatch: true,
}
/** Full capability set, unlimited AI — legacy paid plans and the internal owner plan (see the module doc comment above for why). */
const UNLIMITED_CAPABILITIES: ManageCapabilities = {
  monthlyAIAnalyses: null,
  canUseSmartUpload: true,
  canUseSmartImport: true,
  canUseDocumentIntelligence: true,
  canUseRentLedger: true,
  canUsePropWatch: true,
}

const CAPABILITIES_BY_PLAN: Record<PlanId, ManageCapabilities> = {
  free: NO_MANAGE_CAPABILITIES,
  organize: NO_MANAGE_CAPABILITIES,
  manage: MANAGE_TIER_CAPABILITIES,
  // Not purchasable yet — if ever internally assigned, at least
  // Manage-equivalent rather than under-provisioning a "premium" tier.
  automate: MANAGE_TIER_CAPABILITIES,
  investor: UNLIMITED_CAPABILITIES,
  portfolio: UNLIMITED_CAPABILITIES,
  portfolio_pro: UNLIMITED_CAPABILITIES,
  owner: UNLIMITED_CAPABILITIES,
}

// Central hook point for future entitlements (Section 4/18). Each of the
// still-unmeasured fields below (tenantPortal, portfolioAnalytics,
// advancedReports, teamMembers, prioritySupport) returns a safe "not
// available" default until a real limit is measured and enforced — none
// of these are checked anywhere yet. Adding real enforcement later means
// changing this module and the places that read it, never scattering a
// new check through components.
export type Entitlements = ManageCapabilities & {
  maxProperties: number
  tenantPortal: boolean
  portfolioAnalytics: boolean
  advancedReports: boolean
  teamMembers: number | null
  prioritySupport: boolean
  /** Milestone 10: gates the owner-side Tenant Connect UI. See TENANT_CONNECT_ENABLED above for the per-plan launch intent. */
  tenantConnect: boolean
}

export function entitlementsFor(plan: PlanId): Entitlements {
  return {
    maxProperties: maxPropertiesFor(plan),
    ...CAPABILITIES_BY_PLAN[plan],
    tenantPortal: false,
    portfolioAnalytics: false,
    advancedReports: false,
    teamMembers: null,
    prioritySupport: false,
    tenantConnect: TENANT_CONNECT_ENABLED[plan],
  }
}

/**
 * Whether `used` successful AI analyses this calendar month still leaves
 * room under `limit` (Section: AI Enforcement). `limit === null` always
 * means unlimited — never blocks. Pure and unit-testable in isolation
 * from the count query itself (see app/api/document-intelligence/analyze/
 * route.ts for how `used` is actually counted, from ai_usage_events).
 */
export function aiAllowanceRemaining(limit: number | null, used: number): boolean {
  if (limit === null) return true
  return used < limit
}
