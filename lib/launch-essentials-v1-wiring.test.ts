import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Launch Essentials V1 — same no-jsdom, source-read wiring-test
// convention as every other milestone-scale wiring test in this repo
// (see lib/analytics-wiring.test.ts's own header). Covers: the Forgot
// Password / reset-password flow, session-expiration messaging, the
// safe-error-message helper's real call sites, the Privacy/Terms legal
// surfaces and their navigation, the GA4 production-only guard, and a
// regression guard confirming this milestone did not add analytics
// events or weaken the Tax Center's existing disclaimer.

const ROOT = join(__dirname, '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const landingSource = readFile('components/LandingPage.tsx')
const resetPasswordSource = readFile('app/reset-password/page.tsx')
const useAuthUserSource = readFile('lib/useAuthUser.ts')
const pageSource = readFile('app/page.tsx')
const authNavMenuSource = readFile('components/AuthNavMenu.tsx')
const tenantSource = readFile('app/tenant/page.tsx')
const privacySource = readFile('app/privacy/page.tsx')
const termsSource = readFile('app/terms/page.tsx')
const legalFooterSource = readFile('components/LegalFooter.tsx')
const pricingSource = readFile('app/pricing/page.tsx')
const googleAnalyticsSource = readFile('components/GoogleAnalytics.tsx')
const analyticsSource = readFile('lib/analytics.ts')
const taxCenterSource = readFile('app/tax-center/page.tsx')
const signInRequiredCardSource = readFile('components/SignInRequiredCard.tsx')

describe('Forgot Password entry point (LandingPage.tsx)', () => {
  it('a "Forgot password?" action exists, visible only in signin mode, switching to the reset panel', () => {
    expect(landingSource).toContain("authMode === 'signin' && (")
    expect(landingSource).toContain("<button type=\"button\" className=\"forgotPasswordLink\" onClick={() => switchMode('reset')}>Forgot password?</button>")
  })

  it('does not add a second auth vendor or a separate login form — reuses the existing supabase client', () => {
    const resetFnStart = landingSource.indexOf('async function submitReset()')
    const resetFnEnd = landingSource.indexOf('\n  }\n', resetFnStart)
    const body = landingSource.slice(resetFnStart, resetFnEnd)
    expect(body).toContain('supabase.auth.resetPasswordForEmail(')
  })
})

describe('Password reset request (LandingPage.tsx submitReset)', () => {
  it('uses the real, current Supabase Auth API — resetPasswordForEmail with a redirectTo', () => {
    expect(landingSource).toContain('supabase.auth.resetPasswordForEmail(email.trim(), {')
    expect(landingSource).toContain('redirectTo: `${window.location.origin}/reset-password`,')
  })

  it('never hardcodes a production URL — redirectTo is derived from the browser\'s own origin', () => {
    expect(landingSource).not.toMatch(/redirectTo:\s*['"]https?:\/\/(?!\$\{)/i)
    expect(landingSource).not.toContain('proproster.com/reset-password')
  })

  it('shows the same neutral, non-enumerating confirmation regardless of whether the account exists', () => {
    expect(landingSource).toContain("If an account exists for that email, you'll receive password reset instructions shortly.")
  })

  it('never reveals account existence through forbidden enumeration language', () => {
    const forbidden = [/account not found/i, /email does not exist/i, /no user registered/i, /no account (with|for) that email/i]
    for (const pattern of forbidden) expect(landingSource).not.toMatch(pattern)
  })

  it('routes a genuine request failure through the safe-error helper, never the raw resetError.message directly', () => {
    const fnStart = landingSource.indexOf('async function submitReset()')
    const fnEnd = landingSource.indexOf('\n  }\n', fnStart)
    const body = landingSource.slice(fnStart, fnEnd)
    expect(body).toContain('setError(toSafeErrorMessage(resetError, resetError.message))')
    expect(body).not.toMatch(/setError\(resetError\.message\)/)
  })
})

describe('New password screen (app/reset-password/page.tsx)', () => {
  it('uses the standard Supabase Auth updateUser API to set the new password', () => {
    expect(resetPasswordSource).toContain('supabase.auth.updateUser({ password })')
  })

  it('waits for a PASSWORD_RECOVERY session before showing the new-password form', () => {
    expect(resetPasswordSource).toContain("event === 'PASSWORD_RECOVERY'")
    expect(resetPasswordSource).toContain("setRecoveryState('ready')")
  })

  it('has a distinct invalid/expired-link failure state with a clear next action, not a dead end', () => {
    expect(resetPasswordSource).toContain("recoveryState === 'invalid'")
    expect(resetPasswordSource).toContain('Reset link invalid or expired')
    expect(resetPasswordSource).toContain('href="/"')
  })

  it('validates password length and confirmation match before calling updateUser', () => {
    const fnStart = resetPasswordSource.indexOf('async function submitNewPassword()')
    const fnEnd = resetPasswordSource.indexOf('\n  }\n', fnStart)
    const body = resetPasswordSource.slice(fnStart, fnEnd)
    expect(body).toContain('password.length < 6')
    expect(body).toContain('password !== confirmPassword')
    const updateUserIndex = body.indexOf('supabase.auth.updateUser')
    const lengthCheckIndex = body.indexOf('password.length < 6')
    expect(updateUserIndex).toBeGreaterThan(lengthCheckIndex)
  })

  it('does not invent unusually restrictive password rules — same 6-character minimum as signup elsewhere', () => {
    expect(landingSource).toContain('password.length < 6')
    expect(resetPasswordSource).toContain('password.length < 6')
  })

  it('routes an updateUser failure through the safe-error helper, never a raw message', () => {
    const fnStart = resetPasswordSource.indexOf('async function submitNewPassword()')
    const fnEnd = resetPasswordSource.indexOf('\n  }\n', fnStart)
    const body = resetPasswordSource.slice(fnStart, fnEnd)
    expect(body).toContain('toSafeErrorMessage(updateError, updateError.message)')
  })

  it('shows a clear success confirmation and a way back into the app', () => {
    expect(resetPasswordSource).toContain('Password updated')
    expect(resetPasswordSource).toContain('Go to sign in')
  })

  it('never logs the password value or sends it to analytics', () => {
    expect(resetPasswordSource).not.toMatch(/console\.(log|error|warn)\([^)]*password/i)
    expect(resetPasswordSource).not.toContain('trackEvent')
    expect(resetPasswordSource).not.toContain("from '../../lib/analytics'")
  })
})

describe('Session expiration — distinguishing an expired session from an explicit Log out', () => {
  it('both real Log out call sites mark explicit intent before calling supabase.auth.signOut()', () => {
    const authNavIndex = authNavMenuSource.indexOf('markExplicitSignOut()')
    const authNavSignOutIndex = authNavMenuSource.indexOf('supabase?.auth.signOut()')
    expect(authNavIndex).toBeGreaterThan(-1)
    expect(authNavIndex).toBeLessThan(authNavSignOutIndex)

    const tenantIndex = tenantSource.indexOf('markExplicitSignOut()')
    const tenantSignOutIndex = tenantSource.indexOf('supabase?.auth.signOut()')
    expect(tenantIndex).toBeGreaterThan(-1)
    expect(tenantIndex).toBeLessThan(tenantSignOutIndex)
  })

  it('lib/useAuthUser.ts only flags sessionExpired when a real prior session existed and the sign-out was not explicit', () => {
    expect(useAuthUserSource).toContain("event === 'SIGNED_OUT' && hadUserRef.current && !consumeExplicitSignOutFlag()")
  })

  it('app/page.tsx mirrors the same detection in its own inline auth bootstrap (documented duplication, not a second implementation)', () => {
    expect(pageSource).toContain("event === 'SIGNED_OUT' && hadUserRef.current && !consumeExplicitSignOutFlag()")
    expect(pageSource).toContain('<LandingPage sessionExpired={sessionExpired} />')
  })

  it('LandingPage shows a clear, specific message and a Sign In action when sessionExpired is true — never generic or silent', () => {
    expect(landingSource).toContain('Your session has expired. Please sign in again.')
    expect(landingSource).toContain('setAuthOpen(true)')
  })

  it('the shared SignInRequiredCard shows the same expired-session copy for read-only pages (Tax Center, Documents, Rent Ledger)', () => {
    expect(signInRequiredCardSource).toContain('Your session has expired. Please sign in again.')
    expect(taxCenterSource).toContain('<SignInRequiredCard what="Tax Center" sessionExpired={sessionExpired} />')
  })

  it('a network failure is never labeled as a session expiration (distinct message + distinct category in the shared helper)', () => {
    const helperSource = readFile('lib/user-facing-errors.ts')
    const sessionBranch = helperSource.slice(helperSource.indexOf('SESSION_EXPIRED_MESSAGE\n  }'), helperSource.indexOf('SESSION_EXPIRED_MESSAGE\n  }') + 200)
    expect(sessionBranch).not.toMatch(/network/i)
  })
})

describe('Privacy Policy and Terms of Service surfaces', () => {
  it('both routes exist with a visible, non-hidden "Draft — Attorney Review Required" marker rendered in the page (not just a code comment)', () => {
    expect(privacySource).toContain('<div className="legalReviewBanner">')
    expect(privacySource).toContain('Draft — Attorney Review Required.')
    expect(termsSource).toContain('<div className="legalReviewBanner">')
    expect(termsSource).toContain('Draft — Attorney Review Required.')
  })

  it('does not claim compliance certifications the product does not have (mentioning them only to explicitly disclaim is fine)', () => {
    const claims = [/is SOC\s*2 (certified|compliant)/i, /is HIPAA compliant/i, /is GDPR compliant/i, /is CCPA compliant/i]
    for (const pattern of claims) expect(privacySource).not.toMatch(pattern)
    // The one place these words appear is this explicit disclaimer.
    expect(privacySource).toContain('we do not claim compliance with any specific security certification or regulatory framework')
  })

  it('Terms does not include an actual arbitration/venue/governing-law/indemnification clause — only its own explanation of why none is included', () => {
    const clauses = [/agree to arbitrate/i, /binding arbitration/i, /shall be governed by the laws of/i, /exclusive venue/i, /you agree to indemnify/i, /waive (your |the )?right to (participate in|bring) a class/i]
    for (const pattern of clauses) expect(termsSource).not.toMatch(pattern)
    // The one place these words appear is this explicit "not included" disclaimer.
    expect(termsSource).toContain('no specific liability cap, indemnification obligation, arbitration clause, or governing-law/venue provision is included in this draft, since none has been decided.')
  })

  it('both legal pages are reachable without redesigning the header — reuse AuthHeader/pricing-style public header', () => {
    expect(privacySource).toContain("from '../../components/AuthHeader'")
    expect(termsSource).toContain("from '../../components/AuthHeader'")
  })
})

describe('Legal navigation (Phase 18)', () => {
  it('the shared LegalFooter links to both Privacy and Terms', () => {
    expect(legalFooterSource).toContain('href="/privacy"')
    expect(legalFooterSource).toContain('href="/terms"')
  })

  it('is wired into the landing page and the pricing page (public surfaces), without a mandatory signup checkbox', () => {
    expect(landingSource).toContain('<LegalFooter />')
    expect(pricingSource).toContain('<LegalFooter />')
    expect(landingSource).not.toMatch(/type="checkbox"[^>]*(terms|privacy)/i)
  })
})

describe('Tax/legal disclaimer consistency (Phase 17) — Tax Center\'s existing disclaimer is preserved, not weakened', () => {
  it('still states PropRoster does not provide tax, legal, or accounting advice', () => {
    expect(taxCenterSource).toContain('PropRoster organizes information entered into your account and does not provide tax, legal, or accounting advice.')
  })

  it('Privacy and Terms use the same positioning, never claiming individualized advice', () => {
    expect(privacySource).toContain('does not provide tax, legal, or accounting advice')
    expect(termsSource).toContain('does not provide individualized legal, tax, accounting, or investment advice')
  })
})

describe('GA4 environment guard (Phase 21)', () => {
  it('gates both the tag scripts and the per-route pageview call behind a production-only build check', () => {
    expect(googleAnalyticsSource).toContain("const isProductionBuild = process.env.NODE_ENV === 'production'")
    expect(googleAnalyticsSource).toContain('if (!isProductionBuild) return null')
    expect(googleAnalyticsSource).toContain('if (!isProductionBuild || typeof window === \'undefined\' || typeof window.gtag !== \'function\') return')
  })

  it('reuses the same signal lib/analytics.ts already relies on, rather than inventing new environment detection', () => {
    expect(analyticsSource).toContain("process.env.NODE_ENV === 'production'")
  })
})

describe('Upload debug panel no longer ships raw error text to production users', () => {
  it('both call sites (dashboard document upload, profile photo upload) are gated to non-production builds', () => {
    expect(pageSource).toContain("process.env.NODE_ENV !== 'production' && documentUploadDebug.length > 0")
    const profileSource = readFile('app/profile/page.tsx')
    expect(profileSource).toContain("process.env.NODE_ENV !== 'production' && photoDebug")
  })
})

describe('Analytics regression (Phase 20/26) — this milestone did not add analytics events or PII', () => {
  it('the analytics event union still has exactly the 8 events PR #78 shipped, no more', () => {
    const unionStart = analyticsSource.indexOf('export type AnalyticsEventName =')
    const unionEnd = analyticsSource.indexOf('\n\n', unionStart)
    const union = analyticsSource.slice(unionStart, unionEnd)
    const events = union.match(/'[a-z_]+'/g) || []
    expect(events).toHaveLength(8)
    expect(events.map((e) => e.replace(/'/g, ''))).toEqual([
      'sign_up_completed', 'login_completed', 'first_property_created', 'property_created',
      'document_uploaded', 'expense_created', 'tax_center_viewed', 'global_search_used',
    ])
  })

  it('every AnalyticsEventParams entry is still typed never — no call site can smuggle a payload through', () => {
    const paramsStart = analyticsSource.indexOf('type AnalyticsEventParams')
    const paramsEnd = analyticsSource.indexOf('}', paramsStart)
    const block = analyticsSource.slice(paramsStart, paramsEnd)
    expect(block).not.toMatch(/:\s*(?!never)[A-Za-z]/)
  })
})
