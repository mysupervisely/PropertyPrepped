'use client'

// PropRoster: signed-out landing/sign-in experience.
//
// Dynamic Homepage V1: takes Public Homepage V2/V3's product-story
// architecture (real story, not a feature catalog; sign-in moved into an
// on-demand panel) and adds movement, depth and continuity — the
// Organize/Coordinate/Automate/Understand narrative becomes a sequence
// of cinematic "scenes" built from PropRoster's own real UI concepts
// (a Property Snapshot, a maintenance/PropCrew workflow, a Portfolio
// Snapshot) instead of a four-icon feature grid, using
// lib/homepage/use-scroll-reveal.ts as the one shared motion primitive
// for every reveal on the page. This is presentation/motion only: same
// brand (forest green/sage/charcoal, same wordmark/logo), same product
// claims, same pricing data source, same auth functions — nothing about
// WHAT PropRoster does changed, only how the page tells that story.
//
// Also resolves the real-iPhone-reported "too many Start Free CTAs"
// complaint: the old page had FIVE — header, hero, a full "Get Started
// Free" block right after the pricing grid, and "Start Free" again in
// the very next section (Ready to get organized?). The redundant
// pricing-section CTA block is gone; the intended rhythm is now
// header (persistent, small) -> hero (the real first ask) -> product
// story (zero) -> pricing (a link to full pricing, not another big
// button) -> one final close.
//
// Positioning is unchanged from Public Homepage V2: PropRoster is not a
// property-management company and does not compete with one on those
// terms — it is organization + automation for a self-managing landlord
// who wants to keep control of their properties, tenants and PropCrew
// without personally handling every small coordination task.
//
// Auth itself is UNCHANGED: same supabase.auth.signInWithPassword/signUp
// calls, same submitAuth/switchMode functions, same IntendedRole choice.
// Only WHEN the form is visible changed (opened by openAuth(), not
// always-rendered) — no new route, no new session logic, no auth-risk
// surface.
//
// Real Supabase auth only. No mock data. The property/portfolio numbers
// shown inside the Organize/Understand scenes are clearly-illustrative
// sample data (a marketing mockup of the real UI, not a live account) —
// exactly the same convention any product's marketing site uses to show
// its own interface; the metric LABELS and structure are the real,
// canonical ones (Est. Value/Est. Equity/Monthly Rent/Mortgage for a
// property, Properties/Portfolio Value/Monthly Rent/YTD NOI for a
// portfolio — see app/page.tsx's own Property Snapshot/Portfolio
// Snapshot), never a new metric or a new calculation invented for this
// page.
//
// Deliberately OMITTED vs. the approved visual reference: a "Remember me"
// checkbox and a "Forgot password?" link. Neither a persistent-session
// toggle nor a password-reset flow exists anywhere in this codebase
// (Supabase Auth session persistence is already always-on via
// lib/supabase.ts's persistSession:true, and there is no
// resetPasswordForEmail call/route anywhere) — adding either control here
// would be a checkbox with no effect or a link to a screen that doesn't
// exist.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../lib/supabase'
import { Wordmark } from './Wordmark'
import { PLANS, PUBLIC_PLAN_ORDER, PLAN_FEATURE_HIGHLIGHTS, EARLY_ACCESS_PRICING } from '../lib/billing/plans'
import { postSignupRedirectPath, INTENDED_ROLE_STORAGE_KEY, type IntendedRole } from '../lib/tenant-connect/onboarding'
import { useScrollReveal } from '../lib/homepage/use-scroll-reveal'

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

function CheckIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <path d="M3 8.5l3 3 7-7.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Section 9/14: secondary capabilities, deliberately a single quiet
// section rather than another feature grid.
const SECONDARY_FEATURES = [
  'Property profiles', 'Rent Ledger', 'Leases', 'Documents', 'Smart Upload',
  'PropCrew', 'Investment Tools', 'Insurance & mortgage records',
]

// Dynamic Homepage V1: a plain wrapper that applies the shared reveal
// primitive to whatever it's given — every scene's text column and
// stage use this SAME component so the fade/rise motion language is
// defined once (in CSS, via .sceneReveal/.sceneReveal--visible) rather
// than re-implemented per section.
function Reveal({ as: Tag = 'div', className = '', children, ...rest }: { as?: 'div' | 'section'; className?: string; children: React.ReactNode } & Record<string, unknown>) {
  const { ref, visible } = useScrollReveal<HTMLDivElement>()
  const Component = Tag as 'div'
  return (
    <Component ref={ref} className={`sceneReveal${visible ? ' sceneReveal--visible' : ''} ${className}`} {...rest}>
      {children}
    </Component>
  )
}

// ===========================================================================
// Scene 1 — Organize: a Property Snapshot mockup. Same field set/order the
// real, authenticated Property Snapshot uses (app/page.tsx) — Est. Value,
// Est. Equity, Monthly Rent, Mortgage — plus a small "organized documents"
// row, since "property information, documents" is the actual claim being
// illustrated. Sample data only (this is signed out — there is no real
// account to show), clearly a mockup, never presented as live.
// ===========================================================================
function OrganizeStage() {
  return (
    <div className="sceneStage organizeStage">
      <div className="organizeStageAddress">
        <p className="eyebrow">RENTAL PROPERTY</p>
        <h3>148 Maple Street</h3>
        <p className="organizeStageCity">Austin, TX</p>
      </div>
      <div className="organizeStageMetrics">
        <div className="organizeMetric"><strong>$420K</strong><span>Est. Value</span></div>
        <div className="organizeMetric"><strong>$185K</strong><span>Est. Equity</span></div>
        <div className="organizeMetric"><strong>$2,450/mo</strong><span>Monthly Rent</span></div>
        <div className="organizeMetric"><strong>$1,340/mo</strong><span>Mortgage</span></div>
      </div>
      <div className="organizeStageDocs">
        {['Lease', 'Insurance', 'Tax records', 'Photos'].map((doc) => <span key={doc} className="organizeStageDocChip">{doc}</span>)}
      </div>
    </div>
  )
}

// ===========================================================================
// Scene 2 — Coordinate: the real Tenant Connect + Maintenance workflow, as
// a sequential reveal rather than a chat mockup — tenant submits, it lands
// in the landlord's Maintenance view, gets routed to the landlord's OWN
// PropCrew contact (not a marketplace match), availability comes back,
// a time gets proposed, the landlord confirms. Every noun here is real
// product vocabulary (PropCrew, Maintenance) — nothing implies PropRoster
// hires anyone on its own.
// ===========================================================================
const COORDINATE_STEPS = [
  { label: 'Tenant submits a request', detail: '"Kitchen faucet leaking"' },
  { label: 'Appears in your Maintenance view', detail: 'Submitted' },
  { label: 'Routed to your PropCrew contact', detail: "Jordan's Plumbing" },
  { label: 'Availability collected', detail: 'Tue & Thu afternoons' },
  { label: 'Time proposed', detail: 'Thu, 2:00 PM' },
  { label: 'You confirm', detail: 'Scheduled' },
]

function CoordinateStage() {
  return (
    <div className="sceneStage coordinateStage">
      {COORDINATE_STEPS.map((step, i) => (
        <div className="coordinateStep" style={{ '--i': i } as React.CSSProperties} key={step.label}>
          <span className="coordinateStepDot" aria-hidden="true" />
          <div className="coordinateStepBody">
            <strong>{step.label}</strong>
            <span>{step.detail}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

// ===========================================================================
// Scene 3 — Automate: the SAME request from Scene 2, now shown completing
// itself — the actual maintenance-case status vocabulary this app already
// uses (Submitted -> Scheduled -> In Progress -> Completed, see
// lib/maintenance/command-center.ts), checked off in sequence. The message
// is "PropRoster moves the routine coordination forward," never
// "PropRoster decides/spends/hires/enters/authorizes on its own."
// ===========================================================================
const AUTOMATE_STEPS = ['Reminder sent to PropCrew', 'Availability collected', 'Time proposed to tenant', 'Confirmed by you', 'Scheduled']

function AutomateStage() {
  return (
    <div className="sceneStage automateStage">
      <div className="automateStageHead">
        <span>Kitchen faucet leaking</span>
        <span className="statusPill pillGood">Scheduled</span>
      </div>
      <div className="automateStageList">
        {AUTOMATE_STEPS.map((step, i) => (
          <div className="automateStep" style={{ '--i': i } as React.CSSProperties} key={step}>
            <span className="automateStepCheck" aria-hidden="true"><CheckIcon /></span>
            <span>{step}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ===========================================================================
// Scene 4 — Understand: the visual "zoom out," one property's Property
// Snapshot transforming into the portfolio-wide Portfolio Snapshot — same
// four fields/order the real, authenticated Dashboard uses (app/page.tsx:
// Properties, Portfolio Value, Monthly Rent, YTD NOI), never a new
// calculation. `showPortfolio` is driven by a second scroll marker further
// down this scene's own (desktop-only) taller wrapper — see the CSS
// comment on .landingSceneTall for how the crossfade timing works, and how
// it degrades to two normal stacked panels on mobile.
// ===========================================================================
function UnderstandStage({ showPortfolio }: { showPortfolio: boolean }) {
  return (
    <div className="sceneStage understandStage">
      <div className={`understandPanel understandPanelProperty${showPortfolio ? ' understandPanelHidden' : ''}`}>
        <p className="eyebrow">148 MAPLE STREET</p>
        <div className="organizeStageMetrics understandMetrics">
          <div className="organizeMetric"><strong>$420K</strong><span>Est. Value</span></div>
          <div className="organizeMetric"><strong>$2,450/mo</strong><span>Monthly Rent</span></div>
        </div>
      </div>
      <div className={`understandPanel understandPanelPortfolio${showPortfolio ? ' understandPanelVisible' : ''}`}>
        <p className="eyebrow">PORTFOLIO SNAPSHOT</p>
        <div className="understandMetrics understandPortfolioGrid">
          <div className="organizeMetric"><strong>3</strong><span>Properties</span></div>
          <div className="organizeMetric"><strong>$1.2M</strong><span>Portfolio Value</span></div>
          <div className="organizeMetric"><strong>$6,100/mo</strong><span>Monthly Rent</span></div>
          <div className="organizeMetric"><strong>$38.4K</strong><span>YTD NOI</span></div>
        </div>
      </div>
    </div>
  )
}

export default function LandingPage() {
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  // Tenant-Facing Experience V1 — "How will you use PropRoster?" (signup
  // only; irrelevant once signing back in to an existing account, which
  // may already hold either or both contexts — see onboarding.ts's own
  // header for why this is never persisted as a stored "role"). Defaults
  // to the pre-existing landlord flow so every other behavior here is
  // unchanged unless a visitor actively picks "I'm a tenant."
  const [intendedRole, setIntendedRole] = useState<IntendedRole>('owner')

  // Dynamic Homepage V1: a one-time "has the page mounted" flag drives the
  // hero's own entrance (fade + slight rise) — deliberately NOT scroll-
  // triggered like the scenes below (the hero is visible immediately, so
  // there is nothing to scroll to), and deliberately NOT using
  // useScrollReveal (that hook needs an element already in the viewport to
  // observe against — the hero always is, on load). Reduced-motion visitors
  // get heroReady=true on the very next tick either way since this never
  // depends on an animation actually running to become visible.
  const [heroReady, setHeroReady] = useState(false)
  useEffect(() => {
    const id = requestAnimationFrame(() => setHeroReady(true))
    return () => cancelAnimationFrame(id)
  }, [])

  // Scene 4 (Understand)'s own two scroll markers — see UnderstandStage's
  // header comment. stageMarker fires first (the scene entering view at
  // all); portfolioMarker fires later, positioned further down the same
  // tall wrapper, and flips the crossfade from the property-level panel to
  // the portfolio-level one.
  const stageMarker = useScrollReveal<HTMLDivElement>({ threshold: 0.1 })
  const portfolioMarker = useScrollReveal<HTMLDivElement>({ threshold: 0.1, rootMargin: '0px 0px -30% 0px' })

  // Dynamic Homepage V1: the same reveal-on-scroll treatment as every
  // scene, applied directly (rather than via the <Reveal> convenience
  // wrapper) to the sections below that several pre-existing tests slice
  // by their own literal <section>...</section> tags — <Reveal>'s output
  // element is a runtime choice (Component variable), so its source
  // never contains a literal "</section>" for those tests to anchor on.
  const secondaryReveal = useScrollReveal<HTMLElement>()
  const pricingReveal = useScrollReveal<HTMLElement>()
  const privacyReveal = useScrollReveal<HTMLElement>()
  const finalCtaReveal = useScrollReveal<HTMLElement>()

  async function submitAuth() {
    if (!supabase || !email.trim() || password.length < 6) return
    setBusy(true)
    setAuthMessage('')
    setError('')
    if (authMode === 'signin') {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (signInError) setError(signInError.message)
    } else {
      const { data, error: signUpError } = await supabase.auth.signUp({ email: email.trim(), password })
      if (signUpError) {
        setError(signUpError.message)
      } else if (data.session) {
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
    setBusy(false)
  }

  function switchMode(mode: 'signin' | 'signup') {
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

  // Accessibility (Section 24): Escape closes the auth panel, same as any
  // other modal — this is a genuinely new interaction this milestone
  // introduces (the form was never a dismissible overlay before), so it
  // gets real keyboard support from the start rather than inheriting a gap.
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
          {/* Public Homepage V3, real-iPhone follow-up (2nd round): this
              button (and its onClick) is unchanged — .landingNavStartFree
              is hidden at the same narrow-mobile breakpoint that already
              hides the Pricing link above (app/globals.css), so mobile
              doesn't show "Start Free" twice in one viewport (header +
              hero). Desktop keeps all four header items. */}
          <button type="button" className="primary landingNavStartFree" onClick={() => openAuth('signup')}>Start Free</button>
        </nav>
      </header>

      {/* Dynamic Homepage V1: hero copy, CTA and background photo treatment
          are all UNCHANGED from Public Homepage V3 — this milestone only
          adds a one-time entrance (fade + slight rise, via heroReady) and a
          slow, non-scroll-linked "breathing" scale on the background photo
          (pure CSS @keyframes, see .landingHeroBgImage — no scroll
          listener, no rAF loop, disabled under reduced motion and z when
          heroReady is false so it never fights the entrance transition). */}
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
        <div className="landingHeroInner" data-ready={heroReady}>
          <h1>Your properties. Organized.</h1>
          <p className="landingHeroTagline">Keep control of your properties without managing every little detail.</p>
          <p className="landingHeroSub">PropRoster helps organize the information and numbers behind your properties, simplify communication with tenants and your trusted PropCrew, and automate routine coordination.</p>
          <div className="landingHeroCtas">
            <button type="button" className="primary landingCtaPrimary" onClick={() => openAuth('signup')}>Start Free</button>
          </div>
          <p className="landingHeroFreeNote">Start with your first property free. No credit card required.</p>
        </div>
      </section>

      {/* Dynamic Homepage V1: the product story. Replaces the previous
          four-icon .landingPillars grid AND the separate three-step "How
          it works" section with one continuous sequence of scenes — each
          built from a real PropRoster UI concept (never a laptop mockup,
          never a stock photo) that settles into view as the visitor
          scrolls. Copy for each scene's heading/body is the exact same
          wording the four-pillar grid already used (Organize/Coordinate/
          Automate/Understand + their one-line descriptions) — only the
          presentation changed. */}
      <section className="landingScenes" aria-label="How PropRoster works">
        <div className="landingScene">
          <div className="landingSceneInner">
            <Reveal className="landingSceneText">
              <p className="eyebrow">ORGANIZE</p>
              <h2 className="landingSceneHeadline">Organize.</h2>
              <p className="landingSceneBody">Property information, documents, leases and numbers — all in one place.</p>
            </Reveal>
            <Reveal className="landingSceneStageWrap">
              <OrganizeStage />
            </Reveal>
          </div>
        </div>

        <div className="landingScene">
          <div className="landingSceneInner landingSceneInner--reverse">
            <Reveal className="landingSceneText">
              <p className="eyebrow">COORDINATE</p>
              <h2 className="landingSceneHeadline">Coordinate.</h2>
              <p className="landingSceneBody">Connect tenants with your trusted PropCrew — without all the back-and-forth.</p>
              <p className="landingSceneNote">PropCrew is your own private directory, not a marketplace. You choose who to contact, and you confirm every appointment.</p>
            </Reveal>
            <Reveal className="landingSceneStageWrap">
              <CoordinateStage />
            </Reveal>
          </div>
        </div>

        <div className="landingScene">
          <div className="landingSceneInner">
            <Reveal className="landingSceneText">
              <p className="eyebrow">AUTOMATE</p>
              <h2 className="landingSceneHeadline">Automate.</h2>
              <p className="landingSceneBody">PropRoster helps move requests, availability and provider communication forward. You stay in control of every decision.</p>
            </Reveal>
            <Reveal className="landingSceneStageWrap">
              <AutomateStage />
            </Reveal>
          </div>
        </div>

        {/* Understand: the one scene with a real transformation — a taller
            wrapper on desktop (see .landingSceneTall in CSS) holds a
            sticky stage plus two scroll markers; on mobile the wrapper is
            normal height and the two panels simply stack. */}
        <div className="landingScene landingSceneTall">
          <div className="landingSceneInner">
            <div className="landingSceneText landingSceneTextSticky">
              <p className="eyebrow">UNDERSTAND</p>
              <h2 className="landingSceneHeadline">Understand.</h2>
              <p className="landingSceneBody">See the financial picture of each property — and your whole portfolio — more clearly.</p>
            </div>
            <div className="landingSceneStageWrap landingSceneStageStickyWrap">
              <div ref={stageMarker.ref} className="landingSceneMarker landingSceneMarkerTop" />
              <div className={`sceneReveal${stageMarker.visible ? ' sceneReveal--visible' : ''} landingSceneStageSticky`}>
                <UnderstandStage showPortfolio={portfolioMarker.visible} />
              </div>
              <div ref={portfolioMarker.ref} className="landingSceneMarker landingSceneMarkerBottom" />
            </div>
          </div>
        </div>
      </section>

      {/* Section 6/9: secondary capabilities — one quiet section, not a
          second feature grid. Also where the free Rental Property
          Analyzer stays reachable (Section 11 — no longer a competing
          hero CTA, but still a real, findable link). */}
      <section className="landingSecondary" ref={secondaryReveal.ref} data-reveal={secondaryReveal.visible}>
        <h2>Everything else stays organized too.</h2>
        <p className="landingSecondaryList">{SECONDARY_FEATURES.join(' · ')}</p>
        <Link href="/investment-tools/rental-analyzer" className="landingEvaluatorLink">
          <IconBadge><EvaluatorIcon /></IconBadge>
          <span>Just want to run the numbers? Try the free Rental Property Analyzer &rarr;</span>
        </Link>
      </section>

      {/* Section 7: pricing. Every price, property limit, tagline, and
          feature bullet below is read directly from lib/billing/plans.ts
          — the same canonical source app/pricing/page.tsx renders from —
          so this section and the full /pricing page can never drift into
          contradictory numbers. Deliberately omits the Coming Soon
          (Automate) card for a compact section — "View full pricing"
          covers it.
          Dynamic Homepage V1 (CTA cleanup): the old .landingPricingCta
          block (repeating the free-signup pitch a second time, in its
          own words) is gone — it duplicated both the hero's CTA above
          and the final-close CTA below, back to back with no product
          story in between, which is exactly the "excessive CTA" pattern
          flagged on a real iPhone. "View full
          pricing details" is the appropriate next action from this
          compact teaser; the page's own final section still closes with
          one real Start Free. */}
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

      {/* Section 8: privacy/trust note. Accurate language only — no
          encryption or zero-knowledge claims this codebase doesn't back up;
          this describes the actual owner-scoped RLS architecture already in
          place (every table is scoped to owner_id = auth.uid()). */}
      <section className="landingPrivacyNote" ref={privacyReveal.ref} data-reveal={privacyReveal.visible}>
        <IconBadge><ShieldIcon /></IconBadge>
        <div>
          <h3>Your portfolio is private.</h3>
          <p>PropRoster is designed so your property, financial, tenant and document data remains tied to your account and is not displayed to other users.</p>
        </div>
      </section>

      {/* Section 9: the ONE final CTA — the page's last word, after a
          product story and pricing with no other large "Start Free"
          button along the way. */}
      <section className="landingFinalCta" ref={finalCtaReveal.ref} data-reveal={finalCtaReveal.visible}>
        <h2>Ready to get organized?</h2>
        <p>Start free. Add your first property in minutes.</p>
        <button type="button" className="primary landingCtaPrimary" onClick={() => openAuth('signup')}>Start Free</button>
      </section>

      {authOpen && (
        <div className="overlay landingAuthOverlay" onMouseDown={(e) => e.target === e.currentTarget && closeAuth()}>
          <div className="modal landingAuthModal" role="dialog" aria-modal="true" aria-labelledby="landing-auth-title">
            <div className="landingSignInCard">
              <div className="landingSignInCardTop">
                <div>
                  <p className="eyebrow">{authMode === 'signin' ? 'WELCOME BACK' : 'CREATE YOUR ACCOUNT'}</p>
                  <h2 id="landing-auth-title">{authMode === 'signin' ? 'Sign in to PropRoster' : 'Create your PropRoster account'}</h2>
                </div>
                <button type="button" className="iconButton" aria-label="Close" onClick={closeAuth}>&times;</button>
              </div>
              <p className="landingCardSub">{authMode === 'signin' ? 'Access your properties, documents, financials and investment tools.' : 'Free to start. Organize your first property in minutes.'}</p>

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
                  placeholder="Enter your email"
                />
              </div>

              <label htmlFor="landing-password">Password</label>
              <div className="landingInputField">
                <LockIcon />
                <input
                  id="landing-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={authMode === 'signin' ? 'current-password' : 'new-password'}
                  onKeyDown={(e) => e.key === 'Enter' && void submitAuth()}
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

              {error && <div className="statusMessage errorMessage" role="alert">{error}</div>}
              {authMessage && <div className="statusMessage successMessage" role="status">{authMessage}</div>}

              <button className="primary landingSubmit" disabled={busy} onClick={() => void submitAuth()}>
                {busy ? 'Working…' : authMode === 'signin' ? 'Sign in' : 'Create account'}
              </button>
              <button className="authSwitch" onClick={() => switchMode(authMode === 'signin' ? 'signup' : 'signin')}>
                {authMode === 'signin' ? 'New to PropRoster? Create an account' : 'Already have an account? Sign in'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
