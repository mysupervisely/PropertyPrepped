import { describe, expect, it } from 'vitest'
import { adminStatusLabel, buildAdminSubscriptionRow, summarizeAdminSubscriptions, type AdminSubscriptionRow, type RawSubscriptionRow } from './admin-subscriptions'

describe('adminStatusLabel', () => {
  it('labels every Stripe status correctly (Section: ENTITLEMENTS)', () => {
    expect(adminStatusLabel('active', false)).toBe('Active')
    expect(adminStatusLabel('trialing', false)).toBe('Trial')
    expect(adminStatusLabel('past_due', false)).toBe('Past Due')
    expect(adminStatusLabel('unpaid', false)).toBe('Unpaid')
    expect(adminStatusLabel('canceled', false)).toBe('Canceled')
    expect(adminStatusLabel('incomplete', false)).toBe('Incomplete')
    expect(adminStatusLabel('incomplete_expired', false)).toBe('Incomplete')
    expect(adminStatusLabel('paused', false)).toBe('Paused')
    expect(adminStatusLabel(null, false)).toBe('Free')
  })

  it('labels an active-but-scheduled-to-cancel subscription as Canceling, not Active', () => {
    expect(adminStatusLabel('active', true)).toBe('Canceling')
    expect(adminStatusLabel('trialing', true)).toBe('Canceling')
  })

  it('a past_due subscription is never mislabeled as Canceling even if cancel_at_period_end is also true', () => {
    expect(adminStatusLabel('past_due', true)).toBe('Past Due')
  })
})

describe('buildAdminSubscriptionRow', () => {
  const raw: RawSubscriptionRow = {
    owner_id: 'owner-1',
    plan: 'manage',
    status: 'active',
    stripe_customer_id: 'cus_1',
    stripe_subscription_id: 'sub_1',
    created_at: '2025-01-01T00:00:00.000Z',
    current_period_end: '2026-01-01T00:00:00.000Z',
    cancel_at_period_end: false,
  }

  it('joins subscription + profile + email + last payment into one admin row', () => {
    const row = buildAdminSubscriptionRow(raw, { id: 'owner-1', first_name: 'Taylor', last_name: 'Morgan', display_name: null }, 'taylor@example.com', '2025-12-01T00:00:00.000Z')
    expect(row).toEqual({
      ownerId: 'owner-1',
      email: 'taylor@example.com',
      displayName: 'Taylor Morgan',
      plan: 'manage',
      status: 'active',
      statusLabel: 'Active',
      priceMonthly: 19.99,
      stripeCustomerId: 'cus_1',
      stripeSubscriptionId: 'sub_1',
      createdAt: '2025-01-01T00:00:00.000Z',
      currentPeriodEnd: '2026-01-01T00:00:00.000Z',
      cancelAtPeriodEnd: false,
      lastSuccessfulPaymentAt: '2025-12-01T00:00:00.000Z',
    })
  })

  it('defaults lastSuccessfulPaymentAt to null when not supplied, never throws', () => {
    const row = buildAdminSubscriptionRow(raw, undefined, null)
    expect(row.lastSuccessfulPaymentAt).toBeNull()
  })

  it('prefers display_name over first/last when both are present', () => {
    const row = buildAdminSubscriptionRow(raw, { id: 'owner-1', first_name: 'Taylor', last_name: 'Morgan', display_name: 'T. Morgan' }, null)
    expect(row.displayName).toBe('T. Morgan')
  })

  it('falls back to null name when no profile exists (never throws)', () => {
    const row = buildAdminSubscriptionRow(raw, undefined, null)
    expect(row.displayName).toBeNull()
    expect(row.email).toBeNull()
  })

  it('an unrecognized/null plan value safely resolves to free rather than throwing or guessing', () => {
    const row = buildAdminSubscriptionRow({ ...raw, plan: 'not-a-real-plan' }, undefined, null)
    expect(row.plan).toBe('free')
    expect(row.priceMonthly).toBe(0)
  })
})

describe('summarizeAdminSubscriptions', () => {
  function row(overrides: Partial<AdminSubscriptionRow>): AdminSubscriptionRow {
    return {
      ownerId: 'o',
      email: null,
      displayName: null,
      plan: 'organize',
      status: 'active',
      statusLabel: 'Active',
      priceMonthly: 9.99,
      stripeCustomerId: 'cus',
      stripeSubscriptionId: 'sub',
      createdAt: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      lastSuccessfulPaymentAt: null,
      ...overrides,
    }
  }

  it('counts active subscriptions and sums MRR across entitled paid plans', () => {
    const rows = [
      row({ plan: 'organize', status: 'active', priceMonthly: 9.99 }),
      row({ plan: 'manage', status: 'active', priceMonthly: 19.99 }),
      row({ plan: 'organize', status: 'trialing', priceMonthly: 9.99 }),
    ]
    const summary = summarizeAdminSubscriptions(rows)
    expect(summary.activeSubscriptions).toBe(3)
    expect(summary.monthlyRecurringRevenue).toBeCloseTo(39.97)
  })

  it('excludes free and owner rows from every metric', () => {
    const rows = [row({ plan: 'free', status: null }), row({ plan: 'owner', status: 'active', priceMonthly: 0 })]
    const summary = summarizeAdminSubscriptions(rows)
    expect(summary).toEqual({ activeSubscriptions: 0, monthlyRecurringRevenue: 0, cancelingSubscriptions: 0, pastDueSubscriptions: 0 })
  })

  it('counts a canceling subscription as BOTH active (still entitled) and canceling', () => {
    const rows = [row({ plan: 'manage', status: 'active', cancelAtPeriodEnd: true, priceMonthly: 19.99 })]
    const summary = summarizeAdminSubscriptions(rows)
    expect(summary.activeSubscriptions).toBe(1)
    expect(summary.cancelingSubscriptions).toBe(1)
    expect(summary.monthlyRecurringRevenue).toBeCloseTo(19.99)
  })

  it('counts past-due as its own metric, and — matching entitlements.ts\'s grace-period reasoning — still counts it as active/MRR', () => {
    const rows = [row({ plan: 'organize', status: 'past_due', priceMonthly: 9.99 })]
    const summary = summarizeAdminSubscriptions(rows)
    expect(summary.pastDueSubscriptions).toBe(1)
    expect(summary.activeSubscriptions).toBe(1)
    expect(summary.monthlyRecurringRevenue).toBeCloseTo(9.99)
  })

  it('a fully canceled subscription counts toward nothing', () => {
    const rows = [row({ plan: 'manage', status: 'canceled', priceMonthly: 19.99 })]
    const summary = summarizeAdminSubscriptions(rows)
    expect(summary).toEqual({ activeSubscriptions: 0, monthlyRecurringRevenue: 0, cancelingSubscriptions: 0, pastDueSubscriptions: 0 })
  })
})
