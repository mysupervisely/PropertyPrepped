import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// PropRoster — Mobile Authentication & Layout Reliability V1.
//
// See docs/mobile-auth-layout-reliability-v1.md for the full root-cause
// writeup for both bugs this milestone fixes. Source-read regression
// guards, matching this repo's established no-jsdom convention (see
// lib/maintenance/status-update-ux-wiring.test.ts, the direct
// precedent for "state-machine gating logic embedded in the single
// giant app/page.tsx component, verified by reading its exact source
// rather than mounting it"). The one genuinely pure, directly
// unit-testable piece of the auth fix (the friendly message) is
// covered separately in lib/dashboard/portfolio-load-status.test.ts.

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const pageSource = readFile('app/page.tsx')
const cssSource = readFile('app/globals.css')

describe('Auth bootstrap — a session-validation failure is never treated as a confirmed sign-out', () => {
  it('getUser()\'s error is no longer discarded — it is read and acted on', () => {
    const idx = pageSource.indexOf('async function bootstrapAuth')
    const body = pageSource.slice(idx, pageSource.indexOf('void bootstrapAuth()'))
    expect(body).toContain('const { data, error: getUserError } = await client.auth.getUser()')
  })

  it('a real user is set immediately when getUser() succeeds — the common, fast path is unchanged', () => {
    const idx = pageSource.indexOf('async function bootstrapAuth')
    const body = pageSource.slice(idx, pageSource.indexOf('void bootstrapAuth()'))
    expect(body).toContain('if (data.user) {\n        setUser(data.user)\n        setAuthReady(true)\n        return\n      }')
  })

  it('a real getUser() error (not "no session at all") gets exactly ONE refreshSession() recovery attempt — a genuine Supabase refresh-token exchange, never a local bypass of validation', () => {
    const idx = pageSource.indexOf('async function bootstrapAuth')
    const body = pageSource.slice(idx, pageSource.indexOf('void bootstrapAuth()'))
    expect(body).toContain('if (getUserError && !isAuthSessionMissingError(getUserError)) {')
    expect(body).toContain('const { data: refreshed } = await client.auth.refreshSession()')
    expect(body).toContain('setUser(refreshed.user ?? null)')
    // Exactly one refreshSession() call in the whole bootstrap — never a loop.
    expect(body.match(/refreshSession\(/g)?.length).toBe(1)
  })

  it('uses the real @supabase/supabase-js isAuthSessionMissingError() type guard — never a fragile hand-rolled string/name check — to skip the wasted refresh call for a genuinely-never-signed-in visitor', () => {
    expect(pageSource).toContain("import { isAuthSessionMissingError, type User } from '@supabase/supabase-js'")
    expect(pageSource).not.toMatch(/getUserError\.name\s*[!=]==/)
  })

  it('a race with an unmounted/superseded effect is guarded (cancelled flag) — no setState-after-unmount, no stale recovery overwriting a newer result', () => {
    const effectStart = pageSource.indexOf('let cancelled = false')
    const fnStart = pageSource.indexOf('async function bootstrapAuth')
    expect(effectStart).toBeGreaterThan(-1)
    expect(effectStart).toBeLessThan(fnStart) // declared once, before bootstrapAuth, in the enclosing effect
    const body = pageSource.slice(fnStart, pageSource.indexOf('void bootstrapAuth()'))
    expect(body).toContain('if (cancelled) return')
    expect(pageSource).toContain('return () => { cancelled = true; listener.subscription.unsubscribe() }')
  })

  it('onAuthStateChange (the auth library\'s OWN state machine) is left completely untouched — this fix never second-guesses a genuine SIGNED_OUT event the library itself decided on, which would weaken auth, not strengthen it', () => {
    expect(pageSource).toContain('const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {\n      setUser(session?.user ?? null)\n      setSelectedId(null)\n    })')
  })
})

describe('Portfolio load-status tracking — distinguishes "never loaded" from "loaded, genuinely empty" from "reload failed on top of good data"', () => {
  it('hasLoadedPortfolio/portfolioLoadFailed/autoRetriedRef are declared', () => {
    expect(pageSource).toContain('const [hasLoadedPortfolio, setHasLoadedPortfolio] = useState(false)')
    expect(pageSource).toContain('const [portfolioLoadFailed, setPortfolioLoadFailed] = useState(false)')
    expect(pageSource).toContain('const autoRetriedRef = useRef(false)')
  })

  it('a new sign-in/sign-out resets all three — never inherits stale load-status from a previous user on a shared device', () => {
    const idx = pageSource.indexOf('setHasLoadedPortfolio(false)')
    const body = pageSource.slice(idx, idx + 200)
    expect(body).toContain('setHasLoadedPortfolio(false)')
    expect(body).toContain('setPortfolioLoadFailed(false)')
    expect(body).toContain('autoRetriedRef.current = false')
  })

  it('loadPortfolio() sets hasLoadedPortfolio=true ONLY after every collection has actually been populated (the real success path), never optimistically', () => {
    const fnStart = pageSource.indexOf('async function loadPortfolio()')
    const successIdx = pageSource.indexOf('setHasLoadedPortfolio(true)', fnStart)
    const rentPaymentsIdx = pageSource.indexOf("setRentPayments((rentPaymentRows || []) as RentPaymentRecord[])", fnStart)
    expect(successIdx).toBeGreaterThan(rentPaymentsIdx) // after the last real data setter, not before
    expect(pageSource.slice(successIdx, successIdx + 100)).toContain('setPortfolioLoadFailed(false)')
  })
})

describe('A first-load query failure never renders a false "0 properties" dashboard (the reported bug)', () => {
  it('on firstError, the raw Postgres/PostgREST error is still logged for diagnostics, but the USER-FACING text is always the friendly message — never the raw string (never "JWT issued at future" as the headline)', () => {
    const idx = pageSource.indexOf('if (firstError) {')
    const body = pageSource.slice(idx, idx + 1400)
    expect(body).toContain("logPhotoUploadDiagnostic('PHOTO_RELOAD_ERROR', { stage: 'query', error: safeErrorSummary(firstError) })")
    expect(body).toContain('setError(friendlyPortfolioLoadMessage())')
    expect(body).not.toContain('setError(firstError.message)')
  })

  it('firstError sets portfolioLoadFailed=true, never touches the actual data arrays (properties/documents/etc. are simply never overwritten) — the distinguishing signal from a genuinely-empty successful load', () => {
    const idx = pageSource.indexOf('if (firstError) {')
    const body = pageSource.slice(idx, idx + 1400)
    expect(body).toContain('setPortfolioLoadFailed(true)')
    expect(body).not.toMatch(/setProperties\(/)
  })

  it('the dashboard render gates on hasLoadedPortfolio, not merely on properties.length — a failed FIRST load shows a dedicated recovery screen instead of the normal (misleading) empty-portfolio UI', () => {
    expect(pageSource).toContain('if (!hasLoadedPortfolio && portfolioLoadFailed) {')
    const idx = pageSource.indexOf('if (!hasLoadedPortfolio && portfolioLoadFailed) {')
    const body = pageSource.slice(idx, idx + 700)
    expect(body).toContain("Couldn&apos;t load your portfolio")
    expect(body).toContain('{friendlyPortfolioLoadMessage()}')
    expect(body).toContain('Try again')
  })

  it('a genuine first-time loading state (not yet succeeded, not yet failed) gets its OWN distinct screen too — never the same misleading zero-state flash while the very first fetch is still in flight', () => {
    expect(pageSource).toContain('if (!hasLoadedPortfolio && busy) {')
    const idx = pageSource.indexOf('if (!hasLoadedPortfolio && busy) {')
    const body = pageSource.slice(idx, idx + 300)
    expect(body).toContain('Loading your portfolio')
  })

  it('both new gates are placed AFTER the signed-out check and BEFORE the property-workspace view, so they only ever apply to a genuinely authenticated session, and never once a load has succeeded even once', () => {
    const signedOutIdx = pageSource.indexOf('if (!user) {\n    return <LandingPage />\n  }')
    const loadingGateIdx = pageSource.indexOf('if (!hasLoadedPortfolio && busy) {')
    const failedGateIdx = pageSource.indexOf('if (!hasLoadedPortfolio && portfolioLoadFailed) {')
    const selectedGateIdx = pageSource.indexOf('if (selected) {')
    expect(signedOutIdx).toBeGreaterThan(-1)
    expect(signedOutIdx).toBeLessThan(loadingGateIdx)
    expect(loadingGateIdx).toBeLessThan(failedGateIdx)
    expect(failedGateIdx).toBeLessThan(selectedGateIdx)
  })

  it('a LATER reload failure (after at least one success this session) is NOT caught by either new gate — the existing, correct behavior of leaving last-good data on screen with just the {error} banner is preserved', () => {
    // Both gates require !hasLoadedPortfolio; once true (after any
    // success), they are permanently bypassed for the rest of the
    // session, exactly matching "stale-but-real data is fine, a false
    // empty dashboard is not."
    expect(pageSource).toContain('if (!hasLoadedPortfolio && busy) {')
    expect(pageSource).toContain('if (!hasLoadedPortfolio && portfolioLoadFailed) {')
  })
})

describe('Bounded retry — exactly one automatic retry, never a loop or a storm', () => {
  it('an automatic retry is scheduled ONLY when this session has never yet loaded AND has not already used its one retry', () => {
    const idx = pageSource.indexOf('if (!hasLoadedPortfolio && !autoRetriedRef.current) {')
    expect(idx).toBeGreaterThan(-1)
    const body = pageSource.slice(idx, idx + 200)
    expect(body).toContain('autoRetriedRef.current = true')
    expect(body).toContain('window.setTimeout(() => { void loadPortfolio() }, 2000)')
  })

  it('the retry flag is set to true BEFORE scheduling the timeout, so a second failure (even before the timer fires) can never schedule a second automatic retry', () => {
    const idx = pageSource.indexOf('autoRetriedRef.current = true')
    const timeoutIdx = pageSource.indexOf('window.setTimeout(() => { void loadPortfolio() }, 2000)')
    expect(idx).toBeLessThan(timeoutIdx)
  })

  it('the manual "Try again" button on the recovery screen calls loadPortfolio() directly and is disabled while busy — no way to stack overlapping manual retries', () => {
    const idx = pageSource.indexOf('if (!hasLoadedPortfolio && portfolioLoadFailed) {')
    const body = pageSource.slice(idx, idx + 700)
    expect(body).toContain('disabled={busy}')
    expect(body).toContain('onClick={() => void loadPortfolio()}')
  })
})

describe('No regression to existing behavior', () => {
  it('a genuinely successful load with zero real properties is never redirected to the recovery/landing screens — both new gates key on hasLoadedPortfolio/portfolioLoadFailed/busy only, never on properties.length', () => {
    const loadingGateIdx = pageSource.indexOf('if (!hasLoadedPortfolio && busy) {')
    const failedGateIdx = pageSource.indexOf('if (!hasLoadedPortfolio && portfolioLoadFailed) {')
    expect(pageSource.slice(loadingGateIdx, loadingGateIdx + 40)).not.toContain('properties.length')
    expect(pageSource.slice(failedGateIdx, failedGateIdx + 40)).not.toContain('properties.length')
  })

  it('loadPortfolio()\'s existing tenant_requests/maintenance_intake_sessions "never block the rest of the workspace" defensive exclusion from firstError is untouched', () => {
    expect(pageSource).toContain("const firstError = propertyError || docError || photoError || transactionError || leaseError || mortgageError || insuranceError || maintenanceError || contactError || requestError || systemError || noteError || ownershipError || rentPaymentError || taxRecordError || taxCustomItemError")
  })

  it('no RLS/schema/service-role usage was introduced anywhere in this milestone\'s auth fix', () => {
    const idx = pageSource.indexOf('async function bootstrapAuth')
    const body = pageSource.slice(idx, pageSource.indexOf('async function loadPortfolio()'))
    expect(body).not.toMatch(/service_role|SUPABASE_SERVICE_ROLE|supabaseAdmin/)
  })
})

describe('Mobile layout — header horizontal-overflow fix (measured, not guessed — see docs/mobile-auth-layout-reliability-v1.md)', () => {
  it('the .topbar wrap breakpoint now covers the full 320-480px mobile range (previously only 320-380px, missing exactly the 390-393px widths where overflow was measured)', () => {
    const idx = cssSource.indexOf('Mobile Authentication & Layout Reliability V1 — root cause of the')
    expect(idx).toBeGreaterThan(-1)
    // The rule this comment documents is the nearest preceding
    // "@media (max-width: 480px) {" — this file has many separate
    // 480px blocks scattered throughout (an established, pre-existing
    // pattern), so the marker comment is what actually identifies
    // THIS one, not the breakpoint value alone.
    const mediaIdx = cssSource.lastIndexOf('@media (max-width: 480px) {', idx)
    expect(mediaIdx).toBeGreaterThan(-1)
    expect(idx - mediaIdx).toBeLessThan(200) // the comment sits immediately inside this specific block
    const body = cssSource.slice(idx, idx + 1600)
    expect(body).toContain('.topbar { flex-wrap: wrap; row-gap: 10px; }')
    expect(body).toContain('.topbarBrandGroup { flex: 1 1 auto; min-width: 0; }')
  })

  it('the old, too-narrow 380px breakpoint for this exact rule no longer exists (confirms this is a widened threshold, not a duplicated/additive rule)', () => {
    expect(cssSource).not.toContain('@media (max-width: 380px) {\n  /* The new hamburger button')
  })

  it('the existing 430px shrink treatment for the Smart Upload/search buttons is untouched — this fix is additive (wrap the row when it still does not fit), not a replacement for the existing shrink behavior', () => {
    expect(cssSource).toContain('@media (max-width: 430px) {\n  .smartUploadButton { padding: 10px 12px; font-size: 12.5px; gap: 5px; }\n  .topbarActions { gap: 7px; }\n  .headerSearchButton { width: 36px; height: 36px; font-size: 14px; }\n}')
  })

  it('no global overflow-x:hidden was added anywhere as a substitute fix — the milestone\'s own "do not globally hide overflow" instruction', () => {
    expect(cssSource).not.toMatch(/^(html|body)\s*\{[^}]*overflow-x:\s*hidden/m)
  })

  it('the Smart Upload button label text itself is unchanged ("+ Smart Upload," never shortened, per its own existing comment) — the fix is layout (wrap), not a copy change', () => {
    expect(readFile('components/SmartUploadButton.tsx')).toContain('<span>Smart Upload</span>')
  })
})

describe('Mobile layout — remaining left-edge clipping fix (real-iPhone follow-up: greeting heading + PropWatch heading)', () => {
  it('.sectionHead\'s first child (the eyebrow+heading wrapper — PropWatch, My Properties, etc.) gets min-width: 0, closing the same "flex item refuses to shrink below its content" gap already fixed for .topbar', () => {
    expect(cssSource).toContain('.sectionHead > div:first-child { min-width: 0; }')
  })

  it('.sectionHead gets a flex-wrap safety net at <=480px — the same proven pattern as .topbar — so a row that still does not fit wraps to two lines instead of overflowing', () => {
    const idx = cssSource.indexOf('.sectionHead > div:first-child { min-width: 0; }')
    const body = cssSource.slice(idx, idx + 400)
    expect(body).toMatch(/@media \(max-width: 480px\) \{\s*\.sectionHead \{ flex-wrap: wrap; \}\s*\}/)
  })

  it('.portfolioSnapshotHead (the working comparison point) is untouched — this fix only changes .sectionHead, never the header pattern that already worked correctly', () => {
    expect(cssSource).toContain('.portfolioSnapshotHead { display: flex; align-items: center; justify-content: space-between; gap: 12px; }')
  })

  it('.welcomeIntro h1 no longer overrides letter-spacing — falls back to the base h1 rule\'s smaller, em-relative value already used safely elsewhere (Profile, Smart Import, Pricing, Search, the marketing landing page)', () => {
    expect(cssSource).toContain('.welcomeIntro h1 { font-size: clamp(24px, 3vw, 32px); }')
    expect(cssSource).not.toMatch(/\.welcomeIntro h1 \{[^}]*letter-spacing/)
  })

  it('the base h1 rule (the fallback .welcomeIntro h1 now uses) is untouched — this is a targeted removal of one override, not a change to shared typography', () => {
    expect(cssSource).toContain('h1 { font-size: clamp(34px, 5vw, 55px); line-height: 1.15; margin: 0; letter-spacing: -0.02em; }')
  })

  it('the welcome subtitle (<p>, the sibling real-device testing did NOT report as clipped) is untouched — this fix is scoped to the one element that was actually reported', () => {
    expect(cssSource).toContain(".welcomeIntro > p:last-child { font-size: 15px; margin-top: 4px; }")
  })

  it('no global overflow-x:hidden and no compensating negative/arbitrary padding were added as a substitute for the structural fix', () => {
    expect(cssSource).not.toMatch(/^(html|body)\s*\{[^}]*overflow-x:\s*hidden/m)
    const idx = cssSource.indexOf('.sectionHead > div:first-child { min-width: 0; }')
    const body = cssSource.slice(Math.max(0, idx - 50), idx + 500)
    expect(body).not.toMatch(/margin-left:\s*-|padding-left:\s*\d{2,}px/)
  })
})
