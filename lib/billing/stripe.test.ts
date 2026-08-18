import { describe, expect, it } from 'vitest'
import { isPurchasablePlanId, isStripeConfigured, planForPriceId, resolvePriceId } from './stripe'

const ENV = {
  STRIPE_SECRET_KEY: 'sk_test_123',
  // Launch Pricing: new + legacy price ids configured side by side —
  // exactly the "keep existing legacy Stripe environment-variable
  // mappings intact" launch requirement.
  STRIPE_ORGANIZE_PRICE_ID: 'price_organize',
  STRIPE_MANAGE_PRICE_ID: 'price_manage',
  STRIPE_INVESTOR_PRICE_ID: 'price_investor',
  STRIPE_PORTFOLIO_PRICE_ID: 'price_portfolio',
  STRIPE_PORTFOLIO_PRO_PRICE_ID: 'price_portfolio_pro',
}

describe('isStripeConfigured — missing Stripe configuration must not crash the app', () => {
  it('is false when STRIPE_SECRET_KEY is unset', () => {
    expect(isStripeConfigured({})).toBe(false)
  })

  it('is true when STRIPE_SECRET_KEY is set', () => {
    expect(isStripeConfigured({ STRIPE_SECRET_KEY: 'sk_test_123' })).toBe(true)
  })
})

describe('isPurchasablePlanId — the browser may only ever name a plan, never a Stripe Price id', () => {
  it('accepts exactly the two launch-purchasable plan identifiers', () => {
    expect(isPurchasablePlanId('organize')).toBe(true)
    expect(isPurchasablePlanId('manage')).toBe(true)
  })

  it('rejects "free" — it is not purchasable through Checkout', () => {
    expect(isPurchasablePlanId('free')).toBe(false)
  })

  it('rejects "automate" — Coming Soon, not purchasable at launch', () => {
    expect(isPurchasablePlanId('automate')).toBe(false)
  })

  it('rejects legacy plan ids — no longer offered to new customers, even though existing subscribers keep them', () => {
    expect(isPurchasablePlanId('investor')).toBe(false)
    expect(isPurchasablePlanId('portfolio')).toBe(false)
    expect(isPurchasablePlanId('portfolio_pro')).toBe(false)
  })

  it('rejects "owner" — the internal plan has no Stripe product and can never be Checkout\'s target', () => {
    expect(isPurchasablePlanId('owner')).toBe(false)
  })

  it('rejects an arbitrary Stripe Price id submitted where a plan identifier is expected', () => {
    expect(isPurchasablePlanId('price_1AbCdEfGhIjKlMnO')).toBe(false)
  })

  it('rejects garbage/malicious input without throwing', () => {
    expect(isPurchasablePlanId(null)).toBe(false)
    expect(isPurchasablePlanId(undefined)).toBe(false)
    expect(isPurchasablePlanId(123)).toBe(false)
    expect(isPurchasablePlanId({ plan: 'manage' })).toBe(false)
    expect(isPurchasablePlanId('manage; DROP TABLE user_subscriptions;')).toBe(false)
  })
})

describe('resolvePriceId — server-side plan → Price id mapping', () => {
  it('resolves each purchasable plan to its configured env var', () => {
    expect(resolvePriceId('organize', ENV)).toBe('price_organize')
    expect(resolvePriceId('manage', ENV)).toBe('price_manage')
  })

  it('returns null (not a guessed default) when the env var is unset', () => {
    expect(resolvePriceId('organize', {})).toBeNull()
  })
})

describe('planForPriceId — webhook-side Price id → plan mapping', () => {
  it('resolves each new launch-pricing price id to its plan', () => {
    expect(planForPriceId('price_organize', ENV)).toBe('organize')
    expect(planForPriceId('price_manage', ENV)).toBe('manage')
  })

  it('CRITICAL: still resolves every legacy price id to its legacy plan — an old valid Stripe Price must never resolve to Free', () => {
    expect(planForPriceId('price_investor', ENV)).toBe('investor')
    expect(planForPriceId('price_portfolio', ENV)).toBe('portfolio')
    expect(planForPriceId('price_portfolio_pro', ENV)).toBe('portfolio_pro')
  })

  it('resolves null/undefined to free', () => {
    expect(planForPriceId(null, ENV)).toBe('free')
    expect(planForPriceId(undefined, ENV)).toBe('free')
  })

  it('resolves an unrecognized price id to free rather than guessing a paid plan', () => {
    expect(planForPriceId('price_some_other_product', ENV)).toBe('free')
  })

  it('still resolves legacy price ids correctly even when the NEW env vars are unset (a deployment that has not yet added Organize/Manage prices)', () => {
    const legacyOnlyEnv = { ...ENV, STRIPE_ORGANIZE_PRICE_ID: undefined, STRIPE_MANAGE_PRICE_ID: undefined }
    expect(planForPriceId('price_portfolio', legacyOnlyEnv)).toBe('portfolio')
  })
})
