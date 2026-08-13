'use client'

// PropRoster: signed-out landing/sign-in experience (full-bleed hero +
// inline auth card). Fully self-contained — owns its own auth form state
// (authMode/email/password/error/authMessage/busy) since none of that is
// used anywhere in the authenticated app; the parent (app/page.tsx) just
// renders <LandingPage /> whenever there's no signed-in user.
//
// Real Supabase auth only: signInWithPassword / signUp, unchanged from the
// previous inline implementation. No mock data.
//
// Deliberately OMITTED vs. the approved visual reference: a "Remember me"
// checkbox and a "Forgot password?" link. Neither a persistent-session
// toggle nor a password-reset flow exists anywhere in this codebase
// (Supabase Auth session persistence is already always-on via
// lib/supabase.ts's persistSession:true, and there is no
// resetPasswordForEmail call/route anywhere) — adding either control here
// would be a checkbox with no effect or a link to a screen that doesn't
// exist. Per this milestone's explicit instruction, faking either was
// ruled out; they're left out rather than built as dead UI.

import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '../lib/supabase'

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

function DocumentIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
      <path d="M6 2.5h6l4 4V16a1.2 1.2 0 01-1.2 1.2H6A1.2 1.2 0 014.8 16V3.7A1.2 1.2 0 016 2.5z" stroke="#204b3b" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M12 2.5V6.3a.9.9 0 00.9.9H16" stroke="#204b3b" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M7.3 10.6h5.4M7.3 13.4h5.4" stroke="#204b3b" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function DollarIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
      <circle cx="10" cy="10" r="7.5" stroke="#204b3b" strokeWidth="1.5" />
      <path d="M10 5.8v8.4M12.4 7.9c0-1-1-1.7-2.4-1.7-1.5 0-2.6.8-2.6 1.9 0 2.7 5.2 1.3 5.2 4 0 1.1-1.2 1.9-2.6 1.9-1.4 0-2.4-.7-2.4-1.7" stroke="#204b3b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ChecklistIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
      <rect x="3.5" y="3" width="13" height="14" rx="1.6" stroke="#204b3b" strokeWidth="1.5" />
      <path d="M6.3 8.2l1.4 1.4 2.6-2.8" stroke="#204b3b" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M11.8 8h2.2M6.3 13.4h7.7" stroke="#204b3b" strokeWidth="1.5" strokeLinecap="round" />
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

const VALUE_PROPS: { icon: React.ReactNode; text: string }[] = [
  { icon: <DocumentIcon />, text: 'Keep all your property records and documents in one secure place.' },
  { icon: <DollarIcon />, text: 'Track income, expenses, and profitability with ease.' },
  { icon: <ChecklistIcon />, text: 'Stay on top of tasks, deadlines, and important milestones.' },
]

export default function LandingPage() {
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [authMessage, setAuthMessage] = useState('')

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
      if (signUpError) setError(signUpError.message)
      else if (!data.session) setAuthMessage('Account created. Check your email to confirm your address, then sign in.')
    }
    setBusy(false)
  }

  function switchMode(mode: 'signin' | 'signup') {
    setAuthMode(mode)
    setError('')
    setAuthMessage('')
  }

  return (
    <main className="landingPage">
      <header className="landingHeader">
        <div className="landingBrand">
          <HouseIcon />
          <span className="landingBrandText">
            <span className="brand">PropRoster</span>
            <span className="tagline">Your properties. Organized.</span>
          </span>
        </div>
        <nav className="landingNav" aria-label="Landing page">
          <Link href="/pricing" className="landingNavLink">Pricing</Link>
          <button type="button" className="landingNavLink" onClick={() => switchMode('signup')}>
            New to PropRoster? <span className="landingNavCta">Create an account</span>
          </button>
        </nav>
      </header>

      <section className="landingHero">
        {/*
          Decorative background only (aria-hidden, no alt-worthy content).
          No photograph is bundled in this repo — sourcing one would mean
          either hotlinking an external URL that can break later or adding
          a paid image-service dependency, both explicitly ruled out for
          this pass. Renders a warm gradient today; drop a real, licensed
          photo in at public/hero-property.jpg (any orientation, ~1600px+
          wide recommended) and it takes over automatically via the CSS
          background-image below — NO code change needed, the gradient is
          just the fallback layer underneath it.
        */}
        <div className="landingHeroBg" aria-hidden="true">
          <div className="landingHeroScrim" />
        </div>

        <div className="landingHeroContent">
          <div className="landingHeroHeadline">
            <h1>Your properties.<br />Organized.</h1>
            <p className="landingHeroSub">PropRoster helps real estate investors track properties, tenants, documents, finances, and tasks — all in one place.</p>
          </div>

          <div className="landingValueProps">
            <ul>
              {VALUE_PROPS.map((item) => (
                <li key={item.text}>
                  <IconBadge>{item.icon}</IconBadge>
                  <span>{item.text}</span>
                </li>
              ))}
            </ul>
            <p className="landingTrustLine"><IconBadge><ShieldIcon /></IconBadge> Secure. Private. Built for investors.</p>
          </div>

          <div className="landingSignInCard">
            <p className="eyebrow">{authMode === 'signin' ? 'WELCOME BACK' : 'CREATE YOUR ACCOUNT'}</p>
            <h2>{authMode === 'signin' ? 'Sign in to PropRoster' : 'Create your PropRoster account'}</h2>
            <p className="landingCardSub">Access your properties, documents, and financials.</p>

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

            <div className="landingDivider"><span>or</span></div>

            <Link href="/investment-tools/property-evaluator" className="landingEvaluatorCta">
              <IconBadge><EvaluatorIcon /></IconBadge>
              <span className="landingEvaluatorCtaText">
                <strong>Just want to run the numbers?</strong>
                <em>Try the free Property Evaluator →</em>
              </span>
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}
