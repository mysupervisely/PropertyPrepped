'use client'

// PropRoster: signed-out landing/sign-in experience.
//
// Public Landing Page Polish & Privacy Fix — replaces Dynamic Homepage
// V1/Desktop Homepage V4's four-scene "Organize/Coordinate/Automate/
// Understand" sequence and its plain hero preview. Two real problems
// prompted this: (1) the hero's HeroProductPreview rendered a real,
// identifiable, founder-owned property address to every signed-out
// visitor — a privacy issue, not a copy nit (deliberately not repeated
// here even as a historical reference — see this milestone's completion
// report and lib/dashboard/public-landing-page-polish-v1-wiring.test.ts's
// own regression guard for the specifics) — and (2) the "Understand"
// scene's desktop-only sticky/crossfade wrapper reserved a large, fixed
// amount of scroll space that renders as a long dead blank gap once
// scrolled past, which is what the founder saw as "the boxes aren't
// aligned and the page doesn't flow." Confirmed by inspecting computed
// styles through a real incremental scroll (not just a one-shot full-page
// screenshot,
// which misses IntersectionObserver-driven reveals entirely and made the
// bug look even worse than it is).
//
// New structure, composition-first rather than box-first (every idea no
// longer gets its own bordered card): Hero (copy + a framed product
// preview, fictional data only) -> Story (editorial, no card) -> Product
// showcase (one large real-UI mockup) -> Capabilities (a clean icon
// grid) -> Tenant Connect (a distinct step-flow section, explicit about
// what's live today vs. what's planned) -> Tax Center (a dedicated
// callout, was previously absent from this page entirely) -> Pricing,
// Privacy note, Final CTA, Footer (all UNCHANGED from the previous
// version — not part of this milestone's scope, and already correct).
//
// Brand is preserved, not replaced: same forest-green/sage/charcoal
// palette, same Wordmark, same .landingSignInCard auth modal (byte-for-
// byte unchanged below), same pricing data source, same auth functions.
//
// Real Supabase auth only. No mock data anywhere in the auth flow. Every
// property example on this page (hero preview, product showcase) uses
// clearly fictional addresses that were never derived from a real
// PropRoster account — see lib/dashboard/public-landing-privacy-v1-wiring.test.ts
// for the regression guard against the specific real address this
// milestone removed, and against reintroducing any other real,
// identifiable personal or property data on this page.
//
// Auth itself is UNCHANGED: same supabase.auth.signInWithPassword/signUp/
// resetPasswordForEmail/updateUser calls, same submitAuth/submitReset/
// switchMode functions, same IntendedRole choice, same Forgot Password
// flow from Launch Essentials V1. Only the marketing content above the
// pricing section changed.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../lib/supabase'
import { Wordmark } from './Wordmark'
import { PLANS, PUBLIC_PLAN_ORDER, PLAN_FEATURE_HIGHLIGHTS, EARLY_ACCESS_PRICING } from '../lib/billing/plans'
import { postSignupRedirectPath, INTENDED_ROLE_STORAGE_KEY, type IntendedRole } from '../lib/tenant-connect/onboarding'
import { useScrollReveal } from '../lib/homepage/use-scroll-reveal'
import { trackEvent } from '../lib/analytics'
import { toSafeErrorMessage } from '../lib/user-facing-errors'
import { LegalFooter } from './LegalFooter'

function HouseIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M4 11.5L12 4l8 7.5" stroke="#204b3b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 10v9a1 1 0 001 1h10a1 1 0 001-1v-9" stroke="#204b3b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M10 20v-5h4v5" stroke="#204b3b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconBadge({ children }: { children: React.ReactNode }) {
  return <span className="landingIconBadge">{children}</span>
}

function ShieldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
      <path d="M10 2l6.5 2.4v4.6c0 4.2-2.7 7.9-6.5 9-3.8-1.1-6.5-4.8-6.5-9V4.4L10 2z" stroke="#204b3b" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M7.2 10.1l1.9 1.9 3.7-3.9" stroke="#204b3b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function EvaluatorIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
      <rect x="3.5" y="2.5" width="13" height="15" rx="1.6" stroke="#204b3b" strokeWidth="1.5" />
      <path d="M6.5 6h7M6.5 9h3M6.5 12h4.5" stroke="#204b3b" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="13" cy="13.3" r="2.6" fill="#f7faf8" stroke="#204b3b" strokeWidth="1.5" />
      <path d="M14.9 15.2l1.4 1.4" stroke="#204b3b" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function MailIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
      <rect x="2.5" y="4.5" width="15" height="11" rx="1.6" stroke="#8a938d" strokeWidth="1.4" />
      <path d="M3.2 5.4L10 10.6l6.8-5.2" stroke="#8a938d" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
      <rect x="4" y="9" width="12" height="8.5" rx="1.6" stroke="#8a938d" strokeWidth="1.4" />
      <path d="M6.3 9V6.3a3.7 3.7 0 017.4 0V9" stroke="#8a938d" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function EyeIcon({ off }: { off: boolean }) {
  return off ? (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
      <path d="M2.5 2.5l15 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M9.3 4.6c.23-.02.46-.03.7-.03 4 0 7.3 2.7 8.5 5.4-.5 1.1-1.3 2.3-2.4 3.3M5.6 6.1C4 7.2 2.8 8.7 1.5 10c1.2 2.7 4.5 5.4 8.5 5.4 1 0 2-.16 2.9-.46" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.9 9.4a2.1 2.1 0 002.9 2.9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
      <path d="M1.5 10c1.2-2.7 4.5-5.4 8.5-5.4S17.3 7.3 18.5 10c-1.2 2.7-4.5 5.4-8.5 5.4S2.7 12.7 1.5 10z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="10" cy="10" r="2.6" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

// ===========================================================================
// Capability-grid icon set — same restrained, hand-authored, stroke-based
// convention as components/icons/NavIcons.tsx (no icon library dependency;
// currentColor swapped via CSS, never inline fill colors). Six shapes,
// one per capability card below.
// ===========================================================================
function WorkspaceIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
      <rect x="2.5" y="4" width="15" height="13" rx="1.6" stroke="#204b3b" strokeWidth="1.5" />
      <path d="M2.5 8h15" stroke="#204b3b" strokeWidth="1.5" />
      <path d="M6 8v9M12 11h4M12 14h4" stroke="#204b3b" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function LedgerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
      <rect x="3.5" y="2.5" width="13" height="15" rx="1.6" stroke="#204b3b" strokeWidth="1.5" />
      <path d="M7 6.7c0-.9.9-1.4 2-1.4 1.5 0 2.3.7 2.3 1.6 0 2-4.6.9-4.6 2.9 0 .9.9 1.6 2.3 1.6 1.1 0 2-.5 2-1.4" stroke="#204b3b" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M9.3 4.7v1M9.3 11.4v1" stroke="#204b3b" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M6.5 14.5h7" stroke="#204b3b" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function FolderIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
      <path d="M2.5 5.8c0-.7.6-1.3 1.3-1.3h3.4l1.4 1.7h7.1c.7 0 1.3.6 1.3 1.3v6.7c0 .7-.6 1.3-1.3 1.3H3.8c-.7 0-1.3-.6-1.3-1.3V5.8z" stroke="#204b3b" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

function CrewIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
      <circle cx="7" cy="6.5" r="2.4" stroke="#204b3b" strokeWidth="1.5" />
      <path d="M2.5 16c.4-3 2.2-4.6 4.5-4.6s4.1 1.6 4.5 4.6" stroke="#204b3b" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="14.5" cy="7.2" r="1.9" stroke="#204b3b" strokeWidth="1.4" />
      <path d="M11.9 16c.3-2.4 1.7-3.7 3.5-3.7 1.1 0 2 .5 2.7 1.4" stroke="#204b3b" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
      <circle cx="8.7" cy="8.7" r="5.2" stroke="#204b3b" strokeWidth="1.5" />
      <path d="M12.6 12.6L17 17" stroke="#204b3b" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function DigestIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
      <rect x="2.5" y="4.5" width="15" height="11" rx="1.6" stroke="#204b3b" strokeWidth="1.5" />
      <path d="M3.2 5.4L10 10.6l6.8-5.2" stroke="#204b3b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ReceiptIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M6 3.5h12v17l-2-1.3-2 1.3-2-1.3-2 1.3-2-1.3-2 1.3v-17z" stroke="#204b3b" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8.5 8h7M8.5 11.5h7M8.5 15h4.5" stroke="#204b3b" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <path d="M3 8.5l3 3 7-7.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ===========================================================================
// Hero product preview — a framed, browser-chrome presentation of the
// real Portfolio Snapshot (same four canonical fields/order app/page.tsx's
// authenticated dashboard uses: Properties, Portfolio Value, Monthly
// Rent, YTD NOI — never an invented metric) plus three property rows.
// Every address below is fabricated for this page and was never read
// from a real PropRoster account or any real property — see this
// module's own header comment and the dedicated regression test.
// ===========================================================================
const HERO_PREVIEW_PROPERTIES = [
  { address: '1842 Harbor Ridge Drive', rent: '$2,450/mo', flag: 'Lease expiring soon' },
  { address: '220 Willow Creek Lane', rent: '$1,890/mo', flag: null },
  { address: '76 Sunset Terrace', rent: '$1,760/mo', flag: null },
]

function HeroProductPreview() {
  return (
    <div className="heroProductFrame" aria-hidden="true">
      <div className="heroProductChrome">
        <span className="heroProductDot" />
        <span className="heroProductDot" />
        <span className="heroProductDot" />
        <span className="heroProductChromeUrl">app.proproster.com</span>
      </div>
      <div className="heroProductPanel">
        <div className="heroProductHead">
          <p className="eyebrow">PORTFOLIO SNAPSHOT</p>
        </div>
        <div className="organizeStageMetrics understandPortfolioGrid heroProductMetrics">
          <div className="organizeMetric"><strong>3</strong><span>Properties</span></div>
          <div className="organizeMetric"><strong>$1.2M</strong><span>Portfolio Value</span></div>
          <div className="organizeMetric"><strong>$6,100/mo</strong><span>Monthly Rent</span></div>
          <div className="organizeMetric"><strong>$38.4K</strong><span>YTD NOI</span></div>
        </div>
        <div className="heroProductProperties">
          <p className="heroProductPropertiesLabel">My Properties</p>
          {HERO_PREVIEW_PROPERTIES.map((p) => (
            <div className="heroProductPropertyRow" key={p.address}>
              <span className="heroProductPropertyAddress">{p.address}</span>
              <span className="heroProductPropertyRent">{p.rent}</span>
              {p.flag && <span className="statusPill pillWarn heroProductPropertyFlag">{p.flag}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ===========================================================================
// Product showcase — one large, real-UI mockup: a single property's
// workspace (the same Est. Value/Est. Equity/Monthly Rent/Mortgage field
// set the authenticated Property Snapshot uses) paired with its organized
// documents, so the claim "property information AND documents, in one
// place" is shown, not just stated. Fictional address, unchanged from the
// pre-existing "148 Maple Street" example already used elsewhere on this
// page and already covered by prior audits — kept for continuity, not
// derived from any real account.
// ===========================================================================
function ProductShowcase() {
  return (
    <div className="showcasePanel">
      <div className="showcasePanelAddress">
        <p className="eyebrow">RENTAL PROPERTY</p>
        <h3>148 Maple Street</h3>
        <p className="showcasePanelCity">Austin, TX</p>
      </div>
      <div className="showcasePanelMetrics">
        <div className="organizeMetric"><strong>$420K</strong><span>Est. Value</span></div>
        <div className="organizeMetric"><strong>$185K</strong><span>Est. Equity</span></div>
        <div className="organizeMetric"><strong>$2,450/mo</strong><span>Monthly Rent</span></div>
        <div className="organizeMetric"><strong>$1,340/mo</strong><span>Mortgage</span></div>
      </div>
      <div className="showcasePanelDocs">
        {['Lease', 'Insurance', 'Tax records', 'Photos'].map((doc) => <span key={doc} className="organizeStageDocChip">{doc}</span>)}
      </div>
    </div>
  )
}

// ===========================================================================
// Capabilities — a clean grid, not a second product story. Six of the
// strongest real capabilities (Step 10: "select the strongest examples,"
// not a 30-item feature catalog) — Tax Center and Tenant Connect get
// their own dedicated sections below rather than a duplicate grid tile.
// ===========================================================================
const CAPABILITIES = [
  { icon: WorkspaceIcon, title: 'Property Workspace', body: 'Every property’s information, numbers and history in one place.' },
  { icon: LedgerIcon, title: 'Rent Ledger', body: 'Track what’s due, what’s paid, and what’s outstanding by property.' },
  { icon: FolderIcon, title: 'Documents', body: 'Leases, insurance, tax records and photos, organized and easy to find.' },
  { icon: CrewIcon, title: 'PropCrew', body: 'Your own trusted contractors, ready when a property needs work.' },
  { icon: SearchIcon, title: 'Global Search', body: 'Find any property, document or record across your whole portfolio.' },
  { icon: DigestIcon, title: 'Landlord Digest', body: 'A weekly summary of what changed across your properties.' },
]

// ===========================================================================
// Tenant Connect — a distinct workflow section, not another grid tile.
// The six-step flow mirrors the real, live provider-outreach pipeline
// (lib/maintenance/provider-outreach.ts, the maintenance_provider_outreach/
// maintenance_appointments tables) — every step here happens in the
// product today. The one forward-looking line at the end is explicitly
// labeled "Planned" and points at the real Automate plan tier
// (lib/billing/plans.ts's COMING_SOON_PLAN_ORDER), never invented here —
// this section does not build or imply any new Tenant Connect capability.
// ===========================================================================
const TENANT_CONNECT_STEPS = [
  { label: 'Tenant reports an issue', detail: '"Kitchen faucet leaking"' },
  { label: 'Organized in your Maintenance view', detail: 'Submitted' },
  { label: 'Routed to your PropCrew contact', detail: "Jordan's Plumbing" },
  { label: 'Availability coordinated', detail: 'Tue & Thu afternoons' },
  { label: 'Appointment confirmed by you', detail: 'Thu, 2:00 PM' },
  { label: 'Resolution recorded with the property', detail: 'Scheduled' },
]

export default function LandingPage({ sessionExpired = false }: { sessionExpired?: boolean } = {}) {
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState<'signin' | 'signup' | 'reset'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [authMessage, setAuthMessage] = useState('')

  // Launch Essentials V1 — app/page.tsx passes sessionExpired=true when a
  // real session just disappeared on its own (not an explicit Log out —
  // see lib/auth/session-signal.ts). Opens straight to the sign-in panel
  // with a clear explanation, rather than leaving the visitor to wonder
  // why they're suddenly looking at the marketing page again.
  useEffect(() => {
    if (!sessionExpired) return
    setAuthMode('signin')
    setAuthOpen(true)
  }, [sessionExpired])
  // Tenant-Facing Experience V1 — "How will you use PropRoster?" (signup
  // only; irrelevant once signing back in to an existing account, which
  // may already hold either or both contexts — see onboarding.ts's own
  // header for why this is never persisted as a stored "role"). Defaults
  // to the pre-existing landlord flow so every other behavior here is
  // unchanged unless a visitor actively picks "I'm a tenant."
  const [intendedRole, setIntendedRole] = useState<IntendedRole>('owner')

  // A one-time "has the page mounted" flag drives the hero's own entrance
  // (fade + slight rise) — deliberately NOT scroll-triggered like the
  // sections below (the hero is visible immediately, so there is nothing
  // to scroll to), and deliberately NOT using useScrollReveal (that hook
  // needs an element already in the viewport to observe against — the
  // hero always is, on load). Reduced-motion visitors get heroReady=true
  // on the very next tick either way since this never depends on an
  // animation actually running to become visible. Unchanged from the
  // previous version of this page.
  const [heroReady, setHeroReady] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setHeroReady(true))
    return () => cancelAnimationFrame(id)
  }, [])

  // The same reveal-on-scroll treatment for every section, applied
  // directly via the [data-reveal] attribute (see app/globals.css) so
  // each section's literal <section>...</section> tag stays intact for
  // tests that slice this file by it.
  const storyReveal = useScrollReveal<HTMLElement>()
  const showcaseReveal = useScrollReveal<HTMLElement>()
  const capabilitiesReveal = useScrollReveal<HTMLElement>()
  const tenantConnectReveal = useScrollReveal<HTMLElement>()
  const taxCenterReveal = useScrollReveal<HTMLElement>()
  const pricingReveal = useScrollReveal<HTMLElement>()
  const privacyReveal = useScrollReveal<HTMLElement>()
  const finalCtaReveal = useScrollReveal<HTMLElement>()

  async function submitAuth() {
    if (!supabase || authMode === 'reset' || !email.trim() || password.length < 6) return
    setBusy(true)
    setAuthMessage('')
    setError('')
    if (authMode === 'signin') {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (signInError) {
        setError(toSafeErrorMessage(signInError, signInError.message))
      } else {
        trackEvent('login_completed')
      }
    } else {
      const { data, error: signUpError } = await supabase.auth.signUp({ email: email.trim(), password })
      if (signUpError) {
        setError(toSafeErrorMessage(signUpError, signUpError.message))
      } else {
        // Fired here, once, the moment Supabase confirms the account
        // itself was genuinely created — regardless of which branch
        // runs next (auto-confirmed vs. email-confirmation-pending
        // below). Both are a real signup; only a signUpError means it
        // didn't happen.
        trackEvent('sign_up_completed')
        if (data.session) {
          // Auto-confirmed (no email-verification step required for this
          // project) — the account already exists AND is signed in right
          // now, so the redirect can happen immediately; no need to leave
          // anything in localStorage for a later visit to act on.
          if (intendedRole === 'tenant') window.location.href = postSignupRedirectPath('tenant')
        } else {
          // Email confirmation required — there is no session yet to act
          // on, so the choice is remembered for the ONE time app/page.tsx
          // sees this account's first real sign-in (after they click the
          // confirmation link and sign in) and is cleared immediately
          // after — see app/page.tsx's own auth-state-change handler.
          try { if (intendedRole === 'tenant') window.localStorage.setItem(INTENDED_ROLE_STORAGE_KEY, intendedRole) } catch { /* best-effort only */ }
          setAuthMessage('Account created. Check your email to confirm your address, then sign in.')
        }
      }
    }
    setBusy(false)
  }

  // Launch Essentials V1 — the standard Supabase password-reset request.
  // Deliberately shows the SAME neutral confirmation whether or not the
  // email belongs to an account: resetPasswordForEmail's own success
  // response (`data: {}`) never reveals that either way, and nothing here
  // branches on account existence, so there is nothing left to leak.
  // redirectTo is derived from the browser's own origin (never hardcoded)
  // so this works unchanged in production and in every deploy-preview
  // environment — see app/reset-password/page.tsx for the landing side
  // of this link.
  async function submitReset() {
    if (!supabase || !email.trim()) return
    setBusy(true)
    setError('')
    setAuthMessage('')
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (resetError) {
      setError(toSafeErrorMessage(resetError, resetError.message))
    } else {
      setAuthMessage("If an account exists for that email, you'll receive password reset instructions shortly.")
    }
    setBusy(false)
  }

  function submitActiveForm() {
    if (authMode === 'reset') void submitReset()
    else void submitAuth()
  }

  function switchMode(mode: 'signin' | 'signup' | 'reset') {
    setAuthMode(mode)
    setError('')
    setAuthMessage('')
  }

  // Section 12: the previous full-time embedded sign-in card is now an
  // on-demand panel — opened from "Log In" (signin) or any "Start Free"
  // CTA (signup) in the header/hero/pricing. Same auth functions above,
  // unchanged; only visibility moved out of the hero's permanent layout.
  function openAuth(mode: 'signin' | 'signup') {
    switchMode(mode)
    setAuthOpen(true)
  }

  function closeAuth() {
    setAuthOpen(false)
  }

  // Accessibility: Escape closes the auth panel, same as any other modal.
  useEffect(() => {
    if (!authOpen) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeAuth()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [authOpen])

  return (
    <main className="landingPage">
      <header className="landingHeader">
        <div className="landingBrand">
          <HouseIcon />
          <span className="landingBrandText">
            <span className="brand"><Wordmark /></span>
            <span className="tagline">Your properties. Organized.</span>
          </span>
        </div>
        <nav className="landingNav" aria-label="Landing page">
          <Link href="/pricing" className="landingNavLink">Pricing</Link>
          <button type="button" className="landingNavLogin" onClick={() => openAuth('signin')}>Log In</button>
          {/* .landingNavStartFree is hidden at the same narrow-mobile
              breakpoint that already hides the Pricing link above
              (app/globals.css), so mobile doesn't show "Start Free"
              twice in one viewport (header + hero). Desktop keeps all
              four header items. */}
          <button type="button" className="primary landingNavStartFree" onClick={() => openAuth('signup')}>Start Free</button>
        </nav>
      </header>

      {/* Hero: copy on the left, a framed product preview on the right
          (desktop, >=901px — .landingHeroProduct is display:none by
          default). Mobile keeps the house-photo background exactly as
          before (public/hero-property.jpg — already-vetted generic
          stock photography, no identifiable address, no people; see
          public/README.md), single-column, no product frame (too small
          to read well below 901px). */}
      <section className="landingHero">
        <div className="landingHeroBg" aria-hidden="true">
          <img
            className="landingHeroBgImage"
            src="/hero-property.jpg"
            alt=""
            width={1536}
            height={1024}
            loading="eager"
            fetchPriority="high"
          />
          <div className="landingHeroBgFade" />
        </div>
        <div className="landingHeroGrid">
          <div className="landingHeroInner" data-ready={heroReady}>
            <h1>Your properties. Organized.</h1>
            <p className="landingHeroTagline">The simpler way to manage everything around your rental properties.</p>
            <p className="landingHeroSub">Tenants, maintenance, documents, rent and records — organized in one place instead of scattered across texts, email and spreadsheets.</p>
            <div className="landingHeroCtas">
              <button type="button" className="primary landingCtaPrimary" onClick={() => openAuth('signup')}>Start Free</button>
            </div>
            <p className="landingHeroFreeNote">Start with your first property free. No credit card required.</p>
          </div>
          <div className="landingHeroProduct" data-ready={heroReady}>
            <HeroProductPreview />
          </div>
        </div>
      </section>

      {/* Story: editorial, text-led — no card, no icon grid. The actual
          reason PropRoster exists: not one big task, a hundred small
          ones. */}
      <section className="landingStory" ref={storyReveal.ref} data-reveal={storyReveal.visible}>
        <div className="landingStoryInner">
          <p className="eyebrow">WHY PROPROSTER</p>
          <h2 className="landingStoryHeadline">Managing a rental isn&rsquo;t one big job. It&rsquo;s a hundred small ones.</h2>
          <p className="landingStoryBody">A leaking faucet alone means texting the tenant, finding a contractor, checking availability, proposing a time, confirming it, then saving the receipt afterward. PropRoster keeps all of it — and everything else about your properties — organized in one place instead of scattered across texts, email, spreadsheets and folders.</p>
        </div>
      </section>

      {/* Product showcase: one large, real-UI mockup — the strongest
          single example rather than a feature list. */}
      <section className="landingShowcase" aria-label="Property workspace" ref={showcaseReveal.ref} data-reveal={showcaseReveal.visible}>
        <div className="landingShowcaseInner">
          <div className="landingShowcaseText">
            <p className="eyebrow">PROPERTY WORKSPACE</p>
            <h2 className="landingSceneHeadline">Everything about a property, in one place.</h2>
            <p className="landingSceneBody">Property information, documents, leases and numbers — organized together instead of spread across a dozen apps and folders.</p>
          </div>
          <div className="landingShowcaseStage">
            <ProductShowcase />
          </div>
        </div>
      </section>

      {/* Capabilities: a clean structured grid — the section variety this
          page needed. Six of the strongest capabilities, not a 30-item
          catalog (Tenant Connect and Tax Center get their own sections
          below). */}
      <section className="landingCapabilities" ref={capabilitiesReveal.ref} data-reveal={capabilitiesReveal.visible}>
        <p className="eyebrow landingCapabilitiesEyebrow">EVERYTHING ELSE, ORGANIZED TOO</p>
        <div className="landingCapabilitiesGrid">
          {CAPABILITIES.map(({ icon: Icon, title, body }) => (
            <div className="landingCapabilityCard" key={title}>
              <IconBadge><Icon /></IconBadge>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
        <Link href="/investment-tools/rental-analyzer" className="landingEvaluatorLink">
          <IconBadge><EvaluatorIcon /></IconBadge>
          <span>Just want to run the numbers? Try the free Rental Property Analyzer &rarr;</span>
        </Link>
      </section>

      {/* Tenant Connect: a distinct workflow section (Step 9) — the real,
          live provider-outreach flow, explicit about what's available
          today vs. what's planned. Never implies PropRoster acts
          independently on the landlord's behalf (selects, engages,
          decides, or spends). */}
      <section className="landingTenantConnect" ref={tenantConnectReveal.ref} data-reveal={tenantConnectReveal.visible}>
        <div className="landingTenantConnectInner">
          <div className="landingTenantConnectText">
            <p className="eyebrow">TENANT CONNECT</p>
            <h2 className="landingSceneHeadline">Keeps you out of the middle of every request.</h2>
            <p className="landingSceneBody">Connect tenants with your trusted PropCrew — without all the back-and-forth. PropCrew is your own private directory, not a marketplace. You choose who to contact, and you confirm every appointment.</p>
            <p className="landingTenantConnectPlanned">
              <span className="statusPill pillMuted">Planned</span>
              {' '}Deeper automation — fewer manual confirmations along the way — is part of the Automate plan on our roadmap.
            </p>
          </div>
          <div className="landingTenantConnectSteps">
            <span className="statusPill pillGood landingTenantConnectLiveBadge">Available today</span>
            {TENANT_CONNECT_STEPS.map((step, i) => (
              <div className="coordinateStep" style={{ '--i': i } as React.CSSProperties} key={step.label}>
                <span className="coordinateStepDot" aria-hidden="true" />
                <div className="coordinateStepBody">
                  <strong>{step.label}</strong>
                  <span>{step.detail}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tax Center: a dedicated callout (Step 11) — previously absent
          from this page entirely. Positioned as one part of the system,
          never the reason PropRoster exists; disclaimer text matches
          app/tax-center/page.tsx's own verbatim. */}
      <section className="landingTaxCenter" ref={taxCenterReveal.ref} data-reveal={taxCenterReveal.visible}>
        <div className="landingTaxCenterInner">
          <IconBadge><ReceiptIcon /></IconBadge>
          <div>
            <p className="eyebrow">TAX CENTER</p>
            <h2 className="landingSceneHeadline">Ready when tax time comes, because you were organized all year.</h2>
            <p className="landingSceneBody">Income, expenses, receipts and property records stay organized as you go, so year-end preparation doesn&rsquo;t start with a search through months of emails and folders.</p>
            <p className="landingTaxCenterDisclaimer">PropRoster organizes information entered into your account and does not provide tax, legal, or accounting advice.</p>
          </div>
        </div>
      </section>

      {/* Pricing. UNCHANGED from the previous version of this page — same
          canonical lib/billing/plans.ts source app/pricing/page.tsx also
          reads from. */}
      <section className="landingPricing" id="pricing" ref={pricingReveal.ref} data-reveal={pricingReveal.visible}>
        <div className="landingPricingIntro">
          <p className="eyebrow">PRICING</p>
          <h2>Simple pricing that grows with your portfolio</h2>
          <p className="landingPricingSub">Start with your first property free. Upgrade when your portfolio grows.</p>
        </div>

        <div className="pricingGrid landingPricingGrid">
          {PUBLIC_PLAN_ORDER.map((planId) => {
            const def = PLANS[planId]
            const isPaid = planId !== 'free'
            return (
              <article className={`pricingCard${def.mostPopular ? ' pricingCardPopular' : ''}`} key={planId}>
                {def.mostPopular && <span className="pricingBadge">Most Popular</span>}
                <h3>{def.name}</h3>
                <p className="pricingTagline">{def.tagline}</p>
                <div className="pricingPrice">
                  <strong>${def.priceMonthly.toFixed(2)}</strong>
                  <span>/month</span>
                </div>
                <p className="landingPricingLimit">{def.maxProperties === 1 ? '1 property' : `Up to ${def.maxProperties} properties`}</p>
                {isPaid && EARLY_ACCESS_PRICING && <span className="statusPill pricingEarlyAccess">Early Access Pricing</span>}
                {PLAN_FEATURE_HIGHLIGHTS[planId] && (
                  <ul className="pricingFeatureList">
                    {PLAN_FEATURE_HIGHLIGHTS[planId]!.map((feature) => <li key={feature}>{feature}</li>)}
                  </ul>
                )}
              </article>
            )
          })}
        </div>

        <p className="landingPricingContact">
          More than 15 properties?{' '}
          <a href="mailto:sales@proproster.com?subject=PropRoster%20%E2%80%94%2016%2B%20properties">Contact us</a>.
        </p>

        <Link href="/pricing" className="landingPricingFullLink">View full pricing details &rarr;</Link>
      </section>

      {/* Privacy/trust note. UNCHANGED — accurate language only, no
          encryption or zero-knowledge claims this codebase doesn't back
          up; describes the actual owner-scoped RLS architecture already
          in place. */}
      <section className="landingPrivacyNote" ref={privacyReveal.ref} data-reveal={privacyReveal.visible}>
        <IconBadge><ShieldIcon /></IconBadge>
        <div>
          <h3>Your portfolio is private.</h3>
          <p>PropRoster is designed so your property, financial, tenant and document data remains tied to your account and is not displayed to other users.</p>
        </div>
      </section>

      {/* Final CTA. UNCHANGED — the page's last word, after a product
          story and pricing with no other large "Start Free" button along
          the way. */}
      <section className="landingFinalCta" ref={finalCtaReveal.ref} data-reveal={finalCtaReveal.visible}>
        <h2>Ready to get organized?</h2>
        <p>Start free. Add your first property in minutes.</p>
        <button type="button" className="primary landingCtaPrimary" onClick={() => openAuth('signup')}>Start Free</button>
      </section>

      <LegalFooter />

      {authOpen && (
        <div className="overlay landingAuthOverlay" onMouseDown={(e) => e.target === e.currentTarget && closeAuth()}>
          <div className="modal landingAuthModal" role="dialog" aria-modal="true" aria-labelledby="landing-auth-title">
            <div className="landingSignInCard">
              <div className="landingSignInCardTop">
                <div>
                  <p className="eyebrow">{authMode === 'signin' ? 'WELCOME BACK' : authMode === 'signup' ? 'CREATE YOUR ACCOUNT' : 'RESET PASSWORD'}</p>
                  <h2 id="landing-auth-title">{authMode === 'signin' ? 'Sign in to PropRoster' : authMode === 'signup' ? 'Create your PropRoster account' : 'Reset your password'}</h2>
                </div>
                <button type="button" className="iconButton" aria-label="Close" onClick={closeAuth}>&times;</button>
              </div>
              <p className="landingCardSub">
                {authMode === 'signin' ? 'Access your properties, documents, financials and investment tools.'
                  : authMode === 'signup' ? 'Free to start. Organize your first property in minutes.'
                  : "Enter your account email and we'll send you a link to reset your password."}
              </p>

              {/* Launch Essentials V1 — shown only when app/page.tsx sent
                  us here because a real session expired on its own (never
                  for a first visit or an explicit Log out). Independent of
                  error/authMessage below so switching modes or retrying
                  doesn't clear it prematurely. */}
              {sessionExpired && authMode === 'signin' && !error && !authMessage && (
                <div className="statusMessage errorMessage" role="alert">Your session has expired. Please sign in again.</div>
              )}

              {authMode === 'signup' && (
                <div className="landingRoleChoice">
                  <span className="landingRoleChoiceLabel">How will you use PropRoster?</span>
                  <div className="landingRoleChoiceOptions">
                    <button type="button" className={intendedRole === 'owner' ? 'active' : ''} aria-pressed={intendedRole === 'owner'} onClick={() => setIntendedRole('owner')}>I manage properties</button>
                    <button type="button" className={intendedRole === 'tenant' ? 'active' : ''} aria-pressed={intendedRole === 'tenant'} onClick={() => setIntendedRole('tenant')}>I&rsquo;m a tenant</button>
                  </div>
                </div>
              )}

              <label htmlFor="landing-email">Email</label>
              <div className="landingInputField">
                <MailIcon />
                <input
                  id="landing-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  onKeyDown={(e) => e.key === 'Enter' && submitActiveForm()}
                  placeholder="Enter your email"
                />
              </div>

              {authMode !== 'reset' && (
                <>
                  <label htmlFor="landing-password">Password</label>
                  <div className="landingInputField">
                    <LockIcon />
                    <input
                      id="landing-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'}
                      onKeyDown={(e) => e.key === 'Enter' && submitActiveForm()}
                      placeholder="Enter your password"
                    />
                    <button
                      type="button"
                      className="landingPasswordToggle"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-pressed={showPassword}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      <EyeIcon off={showPassword} />
                    </button>
                  </div>
                </>
              )}

              {authMode === 'signin' && (
                <button type="button" className="forgotPasswordLink" onClick={() => switchMode('reset')}>Forgot password?</button>
              )}

              {error && <div className="statusMessage errorMessage" role="alert">{error}</div>}
              {authMessage && <div className="statusMessage successMessage" role="status">{authMessage}</div>}

              <button className="primary landingSubmit" disabled={busy} onClick={submitActiveForm}>
                {busy ? 'Working…' : authMode === 'signin' ? 'Sign in' : authMode === 'signup' ? 'Create account' : 'Send reset link'}
              </button>
              {authMode === 'reset' ? (
                <button className="authSwitch" onClick={() => switchMode('signin')}>Back to sign in</button>
              ) : (
                <button className="authSwitch" onClick={() => switchMode(authMode === 'signin' ? 'signup' : 'signin')}>
                  {authMode === 'signin' ? 'New to PropRoster? Create an account' : 'Already have an account? Sign in'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
