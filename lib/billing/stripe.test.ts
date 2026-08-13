import { describe, expect, it } from 'vitest'
import { isPurchasablePlanId, isStripeConfigured, planForPriceId, resolvePriceId } from './stripe'

const ENV = {
  STRIPE_SECRET_KEY: 'sk_test_123',
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
  it('accepts exactly the three purchasable plan identifiers', () => {
    expect(isPurchasablePlanId('investor')).toBe(true)
    expect(isPurchasablePlanId('portfolio')).toBe(true)
    expect(isPurchasablePlanId('portfolio_pro')).toBe(true)
  })

  it('rejects "free" — it is not purchasable through Checkout', () => {
    expect(isPurchasablePlanId('free')).toBe(false)
  })

  it('rejects an arbitrary Stripe Price id submitted where a plan identifier is expected', () => {
    expect(isPurchasablePlanId('price_1AbCdEfGhIjKlMnO')).toBe(false)
  })

  it('rejects garbage/malicious input without throwing', () => {
    expect(isPurchasablePlanId(null)).toBe(false)
    expect(isPurchasablePlanId(undefined)).toBe(false)
    expect(isPurchasablePlanId(123)).toBe(false)
    expect(isPurchasablePlanId({ plan: 'portfolio_pro' })).toBe(false)
    expect(isPurchasablePlanId('portfolio_pro; DROP TABLE user_subscriptions;')).toBe(false)
  })
})

describe('resolvePriceId — server-side plan → Price id mapping', () => {
  it('resolves each purchasable plan to its configured env var', () => {
    expect(resolvePriceId('investor', ENV)).toBe('price_investor')
    expect(resolvePriceId('portfolio', ENV)).toBe('price_portfolio')
    expect(resolvePriceId('portfolio_pro', ENV)).toBe('price_portfolio_pro')
  })

  it('returns null (not a guessed default) when the env var is unset', () => {
    expect(resolvePriceId('investor', {})).toBeNull()
  })
})

describe('planForPriceId — webhook-side Price id → plan mapping', () => {
  it('resolves each configured price id back to its plan', () => {
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
})
