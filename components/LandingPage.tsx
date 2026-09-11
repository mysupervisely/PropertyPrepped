'use client'

// PropRoster: signed-out landing/sign-in experience.
//
// Public Homepage V2 (Product Story + Pricing Simplification): the
// previous version of this page led with a permanently-embedded,
// half-the-hero sign-in card and four/three separately-worded "why
// PropRoster" sections that repeated the same few ideas (organize /
// analyze / stay ahead / understand your data). This version leads with
// the actual product story — Tenant Connect, Maintenance Coordination,
// Live Tax Center, the three current pillars — and moves sign-in/sign-up
// into an on-demand panel opened from "Log In" / "Start Free" in the
// header, so it never competes with the story for space.
//
// Auth itself is UNCHANGED: same supabase.auth.signInWithPassword/signUp
// calls, same submitAuth/switchMode functions, same IntendedRole choice.
// Only WHEN the form is visible changed (opened by openAuth(), not
// always-rendered) — no new route, no new session logic, no auth-risk
// surface.
//
// Real Supabase auth only. No mock data.
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

function DollarIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="7.5" stroke="#204b3b" strokeWidth="1.5" />
      <path d="M10 5.8v8.4M12.4 7.9c0-1-1-1.7-2.4-1.7-1.5 0-2.6.8-2.6 1.9 0 2.7 5.2 1.3 5.2 4 0 1.1-1.2 1.9-2.6 1.9-1.4 0-2.4-.7-2.4-1.7" stroke="#204b3b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Tenant Connect pillar icon: two people, a simple stand-in for "you and
// your tenant, connected" — matches the stroke weight/color of every
// other landing icon rather than introducing a new visual style.
function PeopleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
      <circle cx="7.2" cy="6.5" r="2.6" stroke="#204b3b" strokeWidth="1.5" />
      <path d="M2.8 16c.5-3 2.2-4.6 4.4-4.6s3.9 1.6 4.4 4.6" stroke="#204b3b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="14.3" cy="7.3" r="2.1" stroke="#204b3b" strokeWidth="1.5" />
      <path d="M12.6 11.9c1.6-.5 3.6-.1 4.6 2.7" stroke="#204b3b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Maintenance Coordination pillar icon: a wrench.
function WrenchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
      <path d="M13.4 3.2a3.6 3.6 0 00-4.7 4.4L3.3 12l1.8 1.8 4.4-5.4a3.6 3.6 0 004.4-4.7l-2.1 2.1-1.6-.4-.4-1.6 2.1-2.1-.5-.5z" stroke="#204b3b" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M4 15.4a1.3 1.3 0 101.8 1.8" stroke="#204b3b" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
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

// Section 4/13: the three current product pillars — significantly more
// prominent than generic document storage or Investment Tools, per this
// milestone's brief. Copy describes only what is actually live today
// (Section 5/6/7 of the brief) — no SMS outreach, no autonomous
// contractor hiring, no automatic appointment confirmation, no tax
// preparation/filing/advice.
const PILLARS: { icon: React.ReactNode; heading: string; text: string }[] = [
  {
    icon: <PeopleIcon />,
    heading: 'Tenant Connect',
    text: 'Give your tenants one simple place to connect with you. They can see rental and lease information, check rent status, submit maintenance requests, share availability and follow what’s happening, without you piecing it together across texts and emails.',
  },
  {
    icon: <WrenchIcon />,
    heading: 'Maintenance Coordination',
    text: 'Tenant reports it. PropRoster helps get it resolved. A request moves from your tenant to you to your trusted provider, with less back and forth between everyone involved. You stay in control of every confirmation.',
  },
  {
    icon: <DollarIcon />,
    heading: 'Live Tax Center',
    text: 'See your rental property’s tax year numbers take shape as you go. PropRoster organizes income, expenses and supporting records by property, so you are not reconstructing a year of activity every April.',
  },
]

const WORKFLOW_STEPS = [
  { title: 'Add your property', text: 'Enter the basics and PropRoster gives it a home for every record that follows.' },
  { title: 'Connect your tenant', text: 'Send a secure invitation. Your tenant gets their own simple portal.' },
  { title: 'Manage from one place', text: 'Rent, maintenance, documents and tax records, organized by property.' },
]

// Section 9/14: secondary capabilities, deliberately a single quiet
// section rather than another feature grid.
const SECONDARY_FEATURES = [
  'Property profiles', 'Rent Ledger', 'Leases', 'Documents', 'Smart Upload',
  'PropCrew', 'Investment Tools', 'Insurance & mortgage records',
]

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
          <button type="button" className="primary landingNavStartFree" onClick={() => openAuth('signup')}>Start Free</button>
        </nav>
      </header>

      <section className="landingHero">
        <div className="landingHeroContent">
          <p className="landingHeroEyebrow">SELF-MANAGE YOUR RENTALS<br />WITHOUT DOING EVERYTHING YOURSELF.</p>
          <h1>Your properties. Organized.</h1>
          <p className="landingHeroSub">PropRoster brings your properties, tenants, rent, maintenance, tax records and trusted providers together, so you can see what needs attention instead of tracking it all yourself.</p>
          <div className="landingHeroCtas">
            <button type="button" className="primary landingCtaPrimary" onClick={() => openAuth('signup')}>Start Free</button>
          </div>
          <p className="landingHeroFreeNote">Start with your first property free. No credit card required.</p>
        </div>
      </section>

      {/* Section 4: the three current product pillars. */}
      <section className="landingPillars">
        <div className="landingPillarsGrid">
          {PILLARS.map((item) => (
            <div className="landingPillarCard" key={item.heading}>
              <IconBadge>{item.icon}</IconBadge>
              <h2>{item.heading}</h2>
              <p>{item.text}</p>
            </div>
          ))}
        </div>
        <p className="landingTaxDisclaimer">PropRoster helps you stay organized. It does not prepare or file your taxes, and it is not tax or legal advice.</p>
      </section>

      {/* Section 5: simple workflow. */}
      <section className="landingWorkflow">
        <h2>How it works</h2>
        <div className="landingWorkflowSteps">
          {WORKFLOW_STEPS.map((step, i) => (
            <div className="landingWorkflowStep" key={step.title}>
              <span className="landingWorkflowNumber">{i + 1}</span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Section 6/9: secondary capabilities — one quiet section, not a
          second feature grid. Also where the free Rental Property
          Analyzer stays reachable (Section 11 — no longer a competing
          hero CTA, but still a real, findable link). */}
      <section className="landingSecondary">
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
          covers it. */}
      <section className="landingPricing" id="pricing">
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

        <div className="landingPricingCta">
          <p className="landingPricingCtaLead">Start with your first property free.</p>
          <button type="button" className="primary landingCtaPrimary" onClick={() => openAuth('signup')}>Get Started Free</button>
          <p className="landingPricingCtaNote">No credit card required.</p>
          <Link href="/pricing" className="landingPricingFullLink">View full pricing details &rarr;</Link>
        </div>
      </section>

      {/* Section 8: privacy/trust note. Accurate language only — no
          encryption or zero-knowledge claims this codebase doesn't back up;
          this describes the actual owner-scoped RLS architecture already in
          place (every table is scoped to owner_id = auth.uid()). */}
      <section className="landingPrivacyNote">
        <IconBadge><ShieldIcon /></IconBadge>
        <div>
          <h3>Your portfolio is private.</h3>
          <p>PropRoster is designed so your property, financial, tenant and document data remains tied to your account and is not displayed to other users.</p>
        </div>
      </section>

      {/* Section 9: final CTA. */}
      <section className="landingFinalCta">
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
