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

// Launch Pricing (capability-based relaunch): 'organize'/'manage'/
// 'automate' are the new public tiers. 'investor'/'portfolio'/
// 'portfolio_pro' are kept as LEGACY plan ids — existing subscribers on
// these keep billing and resolving exactly as before (Section: Legacy
// Subscribers). They are simply no longer offered to new customers (not
// in PUBLIC_PLAN_ORDER, not in PurchasablePlanId below) — nothing about
// their stored plan id, Stripe price, or entitlements changes.
//
// 'owner' remains INTERNAL-ONLY (see the PLANS entry below and
// lib/billing/entitlements.ts) — never purchasable, never shown on
// /pricing, no Stripe product exists for it. It's a PlanId (not a
// separate parallel type) specifically so every existing consumer of
// PlanId — resolveEffectivePlan, maxPropertiesFor, canCreateProperty,
// entitlementsFor, useSubscription — handles it automatically, with no
// new code paths to keep in sync. See supabase/milestone-9-subscriptions.sql
// for how a row actually gets plan = 'owner' (never via any client write).
export type PlanId = 'free' | 'organize' | 'manage' | 'automate' | 'investor' | 'portfolio' | 'portfolio_pro' | 'owner'

export const PLAN_IDS: PlanId[] = ['free', 'organize', 'manage', 'automate', 'investor', 'portfolio', 'portfolio_pro', 'owner']

// The plans shown as PURCHASABLE cards on /pricing, in display order.
// Deliberately excludes 'owner' (see above) AND the legacy ids (Section:
// Legacy Subscribers — "New customers should no longer be offered those
// legacy plans publicly") AND 'automate' (Coming Soon — not purchasable
// at launch; rendered separately, see COMING_SOON_PLAN_ORDER below).
// Single source of truth (app/pricing/page.tsx imports this rather than
// keeping its own copy) so the two can't drift.
export const PUBLIC_PLAN_ORDER: PlanId[] = ['free', 'organize', 'manage']

// Rendered on /pricing as a disabled "Coming Soon" card — same PLANS
// definition as everything else (no second catalog), just never
// iterated into PUBLIC_PLAN_ORDER's purchasable loop and never part of
// PurchasablePlanId, which is what makes "Automate cannot be purchased"
// true by construction rather than merely a UI choice.
export const COMING_SOON_PLAN_ORDER: PlanId[] = ['automate']

// Only 'organize'/'manage' are purchasable through Checkout at launch —
// Free has no price, 'automate' has no Stripe price yet (Coming Soon),
// legacy ids are no longer offered to new customers (existing legacy
// subscribers never go through OUR Checkout route to keep their plan —
// Stripe renews their existing subscription on its own; see
// lib/billing/stripe.ts's planForPriceId for how their webhook events
// still resolve correctly), and 16+ is a "Let's Talk" contact flow with
// no Stripe object at all.
export type PurchasablePlanId = 'organize' | 'manage'

export type PlanDefinition = {
  id: PlanId
  name: string
  /** Dollars/month. Meaningless (0) when comingSoon is true — the pricing page reads comingSoon first and never renders a $0.00 price for Automate. */
  priceMonthly: number
  maxProperties: number
  tagline: string
  mostPopular?: boolean
  /** True only for 'automate' at launch — rendered as a disabled "Coming Soon" card, never a real price/CTA. */
  comingSoon?: boolean
}

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: 'free',
    name: 'Free',
    priceMonthly: 0,
    maxProperties: 1,
    tagline: 'Try PropRoster.',
  },
  organize: {
    id: 'organize',
    name: 'Organize',
    priceMonthly: 9.99,
    maxProperties: 5,
    tagline: 'Everything about your properties, organized.',
  },
  manage: {
    id: 'manage',
    name: 'Manage',
    priceMonthly: 19.99,
    maxProperties: 15,
    tagline: 'Manage your rentals and let PropRoster do more of the work.',
    mostPopular: true,
  },
  // Not purchasable (excluded from PurchasablePlanId/PUBLIC_PLAN_ORDER).
  // priceMonthly is a placeholder — never read for checkout since this
  // plan can't be assigned to a real subscription yet; only
  // PLANS.automate.name/tagline/comingSoon/maxProperties are ever
  // rendered (the /pricing "Coming Soon" card's feature list — see
  // PLAN_FEATURE_HIGHLIGHTS.automate below). maxProperties matches
  // Manage's 15 deliberately: the intended future pricing philosophy is
  // that a customer upgrades from Manage to Automate for automation
  // capabilities, never for more property slots — Automate is not, and
  // must not become, "Manage but with a bigger number."
  automate: {
    id: 'automate',
    name: 'Automate',
    priceMonthly: 39.99,
    maxProperties: 15,
    tagline: 'Automation and coordination for growing portfolios.',
    comingSoon: true,
  },
  // LEGACY — no longer sold (absent from PUBLIC_PLAN_ORDER/
  // PurchasablePlanId), but still a fully real PlanId: existing
  // subscribers' stored plan/Stripe price/limits are UNCHANGED (Section:
  // Legacy Subscribers — "DO NOT migrate existing subscribers... DO NOT
  // change their billing"). Still shown correctly on their own
  // /account/billing page via PLANS[plan], same as any other plan.
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

// 16+ properties is a "Let's Talk" contact flow, not a Stripe tier —
// there is no PlanId, no price, and no Checkout Session for this.
// Keeping it out of the PLANS map (rather than inventing a fake plan id)
// is what makes "do NOT create an automatic Stripe tier for 16+" true
// by construction: there's no plan identifier a checkout route could
// ever be asked to resolve for it. "16+" (not ">15") is the approved
// customer-facing wording — one more than Manage's 15-property ceiling
// (lib/billing/plans.ts PLANS.manage.maxProperties), the actual
// self-serve ceiling as of Launch Pricing.
export const CONTACT_TIER = {
  label: '16+ Properties',
  tagline: 'Let’s Talk.',
} as const

// Milestone 10 (production-hardening pass): Tenant Connect pricing-page
// copy only — NOT the entitlement itself (see lib/billing/entitlements.ts's
// `tenantConnect` boolean for what's actually enforced, at both the UI
// and — as of this pass — the database layer).
//
// Every plan reads "Coming soon" here, even where
// entitlementsFor(plan).tenantConnect is already `true` internally. That
// internal flag exists so the owner-side foundation (invite a tenant,
// create conversations, exchange messages) can be built and tested now
// — but there is no tenant-facing UI yet (no way for a real tenant to
// sign in and see/use a communication portal), so advertising it as a
// live, included feature on the public pricing page would be false.
// Flip these strings to "included"/omit only once a real tenant
// experience ships — do not do it based on the internal flag alone.
// Free/Organize have no entry here at all — they never mention Tenant
// Connect (Launch Pricing: "Tenant Connect must remain accurately
// labeled Coming Soon where appropriate" — Organize's own entitlement
// list never mentions it either, so omitting it entirely there is more
// accurate than a "coming soon" note for a plan that won't get it).
export const TENANT_CONNECT_PRICING_NOTE: Partial<Record<PlanId, string>> = {
  manage: 'Tenant Connect — Coming soon',
  automate: 'Tenant Connect — Coming soon',
  investor: 'Tenant Connect — Coming soon',
  portfolio: 'Tenant Connect — Coming soon',
  portfolio_pro: 'Tenant Connect — Coming soon',
}

/**
 * Ordered upgrade path used for boundary messaging (Section 8/6). `null`
 * means "no next paid tier — show Let's Talk instead." `owner` is
 * included only so this stays a total function over PlanId — an owner
 * account never hits canCreateProperty's false branch (maxProperties is
 * Infinity), so the upgrade-prompt UI that reads this for a real user
 * never runs for an owner account in the first place.
 *
 * Legacy ids (investor/portfolio/portfolio_pro) intentionally resolve to
 * null here, NOT to organize/manage: our Checkout route always creates a
 * brand-new Stripe subscription (`mode: 'subscription'`), so routing a
 * legacy subscriber's "Upgrade" button through it would start a SECOND,
 * separate subscription alongside their existing one rather than
 * changing their current plan — a real double-billing risk. Legacy
 * subscribers who want to change plans should use "Manage Subscription"
 * (the Stripe Customer Portal, /account/billing) instead, which handles
 * proration/switching correctly; wiring an in-app legacy-to-new upgrade
 * path is intentionally left for a future pass (see the completion
 * report's "decision required" list).
 */
export const NEXT_PLAN: Record<PlanId, PurchasablePlanId | null> = {
  free: 'organize',
  organize: 'manage',
  manage: null,
  automate: null,
  investor: null,
  portfolio: null,
  portfolio_pro: null,
  owner: null,
}

// Launch Pricing: public /pricing display copy only — mirrors, never
// substitutes for, lib/billing/entitlements.ts's real enforcement.
// Capability-first, deliberately never leads with a property count
// ("the primary reason to upgrade should be capabilities, NOT simply the
// number of properties"). Only plans actually rendered on /pricing
// (PUBLIC_PLAN_ORDER + COMING_SOON_PLAN_ORDER) need an entry.
export const PLAN_FEATURE_HIGHLIGHTS: Partial<Record<PlanId, string[]>> = {
  free: ['1 property', 'Property profile & documents', 'Global Search'],
  organize: [
    'Up to 5 properties',
    'Documents, PropCrew & Global Search',
    'Investment Tools',
    'Tenant & Lease Management',
  ],
  manage: [
    'Everything in Organize',
    'Up to 15 properties',
    'Smart Upload & Portfolio Import (AI)',
    'Rent Ledger & PropWatch',
    '50 AI document analyses / month',
  ],
  automate: ['Up to 15 properties', 'Automation and coordination for growing portfolios', 'Details coming soon'],
}

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === 'string' && (PLAN_IDS as string[]).includes(value)
}
