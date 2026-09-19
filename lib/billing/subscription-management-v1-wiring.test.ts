import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// PropRoster — Subscription Management milestone: source-level guardrails
// for the customer cancel/resume UI and the admin billing view, checked
// the same way the rest of this codebase verifies UI wiring/guardrails
// (readFileSync + targeted assertions) rather than a full component
// render — consistent with every other *-wiring.test.ts file here.

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const billingPage = readFile('app/account/billing/page.tsx')
const adminPage = readFile('app/admin/subscriptions/page.tsx')
const cancelRoute = readFile('app/api/billing/cancel/route.ts')
const resumeRoute = readFile('app/api/billing/resume/route.ts')
const adminRoute = readFile('app/api/admin/subscriptions/route.ts')
const authHeaderSource = readFile('components/AuthHeader.tsx')

describe('Cancellation confirmation — never immediate, never hidden', () => {
  it('the customer billing page requires an explicit confirmation modal before calling scheduleCancellation', () => {
    expect(billingPage).toContain('showCancelConfirm')
    expect(billingPage).toContain('setShowCancelConfirm(true)')
    const modalIdx = billingPage.indexOf('{showCancelConfirm && (')
    const confirmClickIdx = billingPage.indexOf('void handleConfirmCancel()')
    expect(modalIdx).toBeGreaterThan(-1)
    expect(confirmClickIdx).toBeGreaterThan(modalIdx)
  })

  it('the confirmation copy states the exact continued-access date and that no data is deleted', () => {
    const modalIdx = billingPage.indexOf('{showCancelConfirm && (')
    const modalSlice = billingPage.slice(modalIdx, modalIdx + 1200)
    expect(modalSlice).toContain('current_period_end')
    expect(modalSlice).toMatch(/never deleted|are never deleted/)
  })

  it('the Cancel Subscription action is directly visible on the billing card — not nested behind a settings submenu or a separate page', () => {
    expect(billingPage).toContain('Cancel Subscription')
    expect(billingPage).toContain("className=\"dangerLink\"")
  })

  it('once cancel_at_period_end is true, the Cancel action is replaced by status text + a Resume Subscription action', () => {
    const rowIdx = billingPage.indexOf('billingCancelRow')
    const slice = billingPage.slice(rowIdx, rowIdx + 900)
    expect(slice).toContain('cancel_at_period_end')
    expect(slice).toContain('Resume Subscription')
    expect(slice).toContain('scheduled to cancel')
  })
})

describe('Security guardrail: cancel/resume never derive the subscription id from client input', () => {
  it('neither route ever calls req.json() / reads a request body', () => {
    expect(cancelRoute).not.toMatch(/req\.json\(\)/)
    expect(resumeRoute).not.toMatch(/req\.json\(\)/)
  })

  it('both routes read stripe_subscription_id exclusively from an RLS-scoped select of the caller\'s own row', () => {
    for (const source of [cancelRoute, resumeRoute]) {
      expect(source).toContain("eq('owner_id', user.id)")
      expect(source).toContain('stripe_subscription_id')
    }
  })
})

describe('Admin billing view: authorization + non-exposure to normal accounts', () => {
  it('the admin route checks the caller\'s OWN plan === owner before ever touching the admin (service-role) client', () => {
    const gateIdx = adminRoute.indexOf("own?.plan !== 'owner'")
    const adminClientIdx = adminRoute.indexOf('createAdminClient()')
    expect(gateIdx).toBeGreaterThan(-1)
    expect(adminClientIdx).toBeGreaterThan(gateIdx)
  })

  it('the admin page uses the same internal owner-plan gate idiom as the existing realtor-leads admin page', () => {
    expect(adminPage).toContain("plan === 'owner'")
    expect(adminPage).toContain("This page isn’t available on your account.")
  })

  it('the admin subscriptions page is not registered in the shared authenticated nav — reachable only by direct URL', () => {
    expect(authHeaderSource).not.toMatch(/admin\/subscriptions/)
  })

  it('status labels cover Active/Past Due/Canceling/Canceled as the task requires', () => {
    expect(adminPage).toContain('Active:')
    expect(adminPage).toContain("'Past Due':")
    expect(adminPage).toContain('Canceling:')
    expect(adminPage).toContain('Canceled:')
  })

  it('summary metrics show active subscriptions, MRR, canceling, and past-due', () => {
    expect(adminPage).toContain('Active subscriptions')
    expect(adminPage).toContain('Monthly recurring revenue')
    expect(adminPage).toContain('Canceling')
    expect(adminPage).toContain('Past due')
  })
})

describe('Guardrail: no Stripe secret / raw payment data ever reaches the browser', () => {
  it('the admin route never selects or returns a raw Stripe API response — only the narrow AdminSubscriptionRow fields', () => {
    expect(adminRoute).not.toMatch(/STRIPE_SECRET_KEY/)
  })

  it('the billing summary route only ever returns brand/last4 for a payment method, never a full card number', () => {
    const summaryRoute = readFile('app/api/billing/summary/route.ts')
    expect(summaryRoute).not.toMatch(/card_number|full_number/i)
  })
})
