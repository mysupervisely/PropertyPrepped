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

// 'owner' is an INTERNAL-ONLY plan (see the PLANS entry below and
// lib/billing/entitlements.ts) — never purchasable, never shown on
// /pricing, no Stripe product exists for it. It's a PlanId (not a
// separate parallel type) specifically so every existing consumer of
// PlanId — resolveEffectivePlan, maxPropertiesFor, canCreateProperty,
// entitlementsFor, useSubscription — handles it automatically, with no
// new code paths to keep in sync. See supabase/milestone-9-subscriptions.sql
// for how a row actually gets plan = 'owner' (never via any client write).
export type PlanId = 'free' | 'investor' | 'portfolio' | 'portfolio_pro' | 'owner'

export const PLAN_IDS: PlanId[] = ['free', 'investor', 'portfolio', 'portfolio_pro', 'owner']

// The plans shown as cards on /pricing, in display order. Deliberately
// excludes 'owner' — this is what makes "Owner is never displayed as a
// public pricing option" true by construction: /pricing renders exactly
// this list and nothing else, so an internal plan simply isn't iterable
// from the public page. Single source of truth (app/pricing/page.tsx
// imports this rather than keeping its own copy) so the two can't drift.
export const PUBLIC_PLAN_ORDER: PlanId[] = ['free', 'investor', 'portfolio', 'portfolio_pro']

// Deliberately excludes 'owner' — this is the type Checkout/webhook code
// uses to decide what a client may request or what a Stripe price maps
// to, so 'owner' being absent here is what makes "no Stripe product, no
// purchase path for owner" true by construction, not just by convention.
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
    priceMonthly: 19.99,
    maxProperties: 4,
    tagline: 'Build your portfolio.',
  },
  portfolio: {
    id: 'portfolio',
    name: 'Portfolio',
    priceMonthly: 39.99,
    maxProperties: 9,
    tagline: 'Run your growing portfolio.',
    mostPopular: true,
  },
  portfolio_pro: {
    id: 'portfolio_pro',
    name: 'Portfolio Pro',
    priceMonthly: 59.99,
    maxProperties: 20,
    tagline: 'Scale your operation.',
  },
  // INTERNAL ONLY. Not part of PUBLIC_PLAN_ORDER (below), never shown on
  // /pricing, never a Checkout target (excluded from
  // PurchasablePlanId above). priceMonthly is 0 because it is never
  // billed — not a marketing "free" price. maxProperties is Infinity so
  // every existing consumer (canCreateProperty, the billing page's
  // usage display, the upgrade-prompt gate) treats it as unlimited with
  // no special-casing; the database enforces the same thing via a large
  // sentinel in plan_limits, not literal infinity (SQL has no such
  // concept) — see supabase/milestone-9-subscriptions.sql.
  owner: {
    id: 'owner',
    name: 'PropRoster Owner',
    priceMonthly: 0,
    maxProperties: Number.POSITIVE_INFINITY,
    tagline: 'Internal owner account — unlimited access.',
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

// Milestone 10 (production-hardening pass): Tenant Connect pricing-page
// copy only — NOT the entitlement itself (see lib/billing/entitlements.ts's
// `tenantConnect` boolean for what's actually enforced, at both the UI
// and — as of this pass — the database layer).
//
// Every plan reads "Coming soon" here, even Portfolio/Portfolio Pro,
// where entitlementsFor(plan).tenantConnect is already `true` internally.
// That internal flag exists so the owner-side foundation (invite a
// tenant, create conversations, exchange messages) can be built and
// tested now — but there is no tenant-facing UI yet (no way for a real
// tenant to sign in and see/use a communication portal), so advertising
// it as a live, included feature on the public pricing page would be
// false. Flip these strings to "included"/omit only once a real tenant
// experience ships — do not do it based on the internal flag alone.
// Free has no entry here at all — Free never mentions Tenant Connect.
export const TENANT_CONNECT_PRICING_NOTE: Partial<Record<PlanId, string>> = {
  investor: 'Tenant Connect — Coming soon',
  portfolio: 'Tenant Connect — Coming soon',
  portfolio_pro: 'Tenant Connect — Coming soon',
}

/**
 * Ordered upgrade path used for boundary messaging (Section 8/6). `null`
 * means "no next paid tier — show Let's Talk instead." `owner` is included
 * only so this stays a total function over PlanId — an owner account
 * never hits canCreateProperty's false branch (maxProperties is
 * Infinity), so the upgrade-prompt UI that reads this for a real user
 * never runs for an owner account in the first place.
 */
export const NEXT_PLAN: Record<PlanId, PurchasablePlanId | null> = {
  free: 'investor',
  investor: 'portfolio',
  portfolio: 'portfolio_pro',
  portfolio_pro: null,
  owner: null,
}

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === 'string' && (PLAN_IDS as string[]).includes(value)
}
