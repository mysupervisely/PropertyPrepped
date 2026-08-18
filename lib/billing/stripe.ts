// PropPrepped Milestone 9: server-only Stripe client + plan↔price mapping.
//
// Never imported from a 'use client' component. STRIPE_SECRET_KEY is read
// only here, only on the server, and never sent to the browser.

import Stripe from 'stripe'
import type { PlanId, PurchasablePlanId } from './plans'

let cachedClient: Stripe | null = null

export function isStripeConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.STRIPE_SECRET_KEY)
}

/**
 * Returns a Stripe client, or throws if STRIPE_SECRET_KEY isn't set. Every
 * caller must check isStripeConfigured() first and return the "Billing is
 * not configured yet." response instead of letting this throw reach the
 * client as a raw error (Section 2).
 */
export function getStripeClient(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error('Billing is not configured yet.')
  }
  if (!cachedClient) {
    cachedClient = new Stripe(process.env.STRIPE_SECRET_KEY)
  }
  return cachedClient
}

// Launch Pricing: only 'organize'/'manage' are purchasable through
// Checkout for NEW customers — Free has no price, 'automate' has no
// Stripe price yet (Coming Soon), the legacy plans are no longer offered
// (see PRICE_ENV_VAR_LEGACY below for why their env vars stay wired
// regardless), and 16+ is a "Let's Talk" contact flow with no Stripe
// object at all (Section 6/15: do NOT create an automatic Stripe tier
// for 16+).
const PRICE_ENV_VAR: Record<PurchasablePlanId, string> = {
  organize: 'STRIPE_ORGANIZE_PRICE_ID',
  manage: 'STRIPE_MANAGE_PRICE_ID',
}

// LEGACY — kept intact and unchanged (Section: Legacy Subscribers: "DO
// NOT remove recognition of their existing Stripe Price IDs"). Never
// used by the checkout route (new customers can't select these plan
// ids — isPurchasablePlanId below rejects them), ONLY by
// planForPriceId() so an existing subscriber's webhook events
// (renewals, portal-driven changes) keep resolving to the correct
// legacy plan forever, exactly as before this launch-pricing change.
const PRICE_ENV_VAR_LEGACY: Record<'investor' | 'portfolio' | 'portfolio_pro', string> = {
  investor: 'STRIPE_INVESTOR_PRICE_ID',
  portfolio: 'STRIPE_PORTFOLIO_PRICE_ID',
  portfolio_pro: 'STRIPE_PORTFOLIO_PRO_PRICE_ID',
}

export function isPurchasablePlanId(value: unknown): value is PurchasablePlanId {
  return value === 'organize' || value === 'manage'
}

/**
 * Resolves a purchasable plan identifier to its server-configured Stripe
 * Price id. The browser only ever sends the plan identifier
 * ("investor"/"portfolio"/"portfolio_pro") — never a Price id — so a
 * malicious client can never submit an arbitrary Stripe Price id; this
 * function is the only bridge between the two, and it only ever reads
 * from server environment variables.
 */
export function resolvePriceId(plan: PurchasablePlanId, env: Record<string, string | undefined> = process.env): string | null {
  return env[PRICE_ENV_VAR[plan]] || null
}

/**
 * Maps a Stripe Price id back to our plan identifier — used by the
 * webhook to translate a subscription's price into a plan without
 * trusting anything the client ever said. An unrecognized price id (e.g.
 * a stale/renamed price, or a manual Stripe Dashboard subscription not
 * created through our Checkout flow) safely resolves to 'free' rather
 * than guessing.
 *
 * Checks NEW launch-pricing price ids first, then LEGACY price ids —
 * both recognized unconditionally, forever. This is what makes "an old
 * valid Stripe Price never resolves to Free" true: an existing Investor/
 * Portfolio/Portfolio Pro subscriber's every future webhook event
 * (renewal, portal-driven update, cancellation) still maps their price
 * id to their real legacy plan, exactly as it did before this launch
 * pricing change — nothing here depends on whether that plan is
 * currently purchasable.
 */
export function planForPriceId(priceId: string | null | undefined, env: Record<string, string | undefined> = process.env): PlanId {
  if (!priceId) return 'free'
  if (priceId === env[PRICE_ENV_VAR.organize]) return 'organize'
  if (priceId === env[PRICE_ENV_VAR.manage]) return 'manage'
  if (priceId === env[PRICE_ENV_VAR_LEGACY.investor]) return 'investor'
  if (priceId === env[PRICE_ENV_VAR_LEGACY.portfolio]) return 'portfolio'
  if (priceId === env[PRICE_ENV_VAR_LEGACY.portfolio_pro]) return 'portfolio_pro'
  return 'free'
}
