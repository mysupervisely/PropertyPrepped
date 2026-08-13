// PropPrepped Milestone 9: plan catalog and marketing copy.
//
// This is the single place plan pricing/positioning/limits are defined for
// display purposes. Components (pricing page, billing page, upgrade
// prompts) import from here — never hardcode a price, a limit, or plan
// copy inline. lib/billing/entitlements.ts is the module that actually
// resolves what a given account is entitled to; this file just describes
// the catalog those entitlements are drawn from.
//
// Enforcement note: maxProperties below MUST match
// supabase/milestone-9-subscriptions.sql's plan_limits table — that table
// is the actual security boundary (see enforce_property_limit()), this
// file is what the UI displays. Keep them in sync; a mismatch here only
// produces a confusing UI (e.g. "3 of 4" when the DB would actually allow
// a 5th), never a security gap, since the DB never trusts this file.

export type PlanId = 'free' | 'investor' | 'portfolio' | 'portfolio_pro'

export const PLAN_IDS: PlanId[] = ['free', 'investor', 'portfolio', 'portfolio_pro']

export type PurchasablePlanId = 'investor' | 'portfolio' | 'portfolio_pro'

export type PlanDefinition = {
  id: PlanId
  name: string
  /** Dollars/month, or null for Free (0) is still a number — null is reserved for "not sold via Checkout" (unused here; see the 21+ tier below, which isn't a PlanId at all). */
  priceMonthly: number
  maxProperties: number
  tagline: string
  mostPopular?: boolean
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: 'free',
    name: 'Free',
    priceMonthly: 0,
    maxProperties: 1,
    tagline: 'Organize your first property.',
  },
  investor: {
    id: 'investor',
    name: 'Investor',
    priceMonthly: 14.99,
    maxProperties: 4,
    tagline: 'Build your portfolio.',
  },
  portfolio: {
    id: 'portfolio',
    name: 'Portfolio',
    priceMonthly: 29.99,
    maxProperties: 9,
    tagline: 'Run your growing portfolio.',
    mostPopular: true,
  },
  portfolio_pro: {
    id: 'portfolio_pro',
    name: 'Portfolio Pro',
    priceMonthly: 49.99,
    maxProperties: 20,
    tagline: 'Scale your operation.',
  },
}

// The paid plans are marketed as "Early Access Pricing" — copy only, no
// automatic future price increases or grandfathering logic (Section:
// Marketing Positioning). This flag is read by the pricing page to render
// that label; it has no effect on billing.
export const EARLY_ACCESS_PRICING = true

// 21+ properties is a "Let's Talk" contact flow, not a Stripe tier — there
// is no PlanId, no price, and no Checkout Session for this. Keeping it out
// of the PLANS map (rather than inventing a fake plan id) is what makes
// "do NOT create an automatic Stripe tier for 21+" true by construction:
// there's no plan identifier a checkout route could ever be asked to
// resolve for it.
export const CONTACT_TIER = {
  label: '21+ Properties',
  tagline: 'Let’s Talk.',
} as const

/** Ordered upgrade path used for boundary messaging (Section 8/6). `null` means "no next paid tier — show Let's Talk instead." */
export const NEXT_PLAN: Record<PlanId, PurchasablePlanId | null> = {
  free: 'investor',
  investor: 'portfolio',
  portfolio: 'portfolio_pro',
  portfolio_pro: null,
}

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === 'string' && (PLAN_IDS as string[]).includes(value)
}
