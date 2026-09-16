'use client'

// PropRoster — Launch Essentials V1: the other half of the password-reset
// flow LandingPage.tsx's "Forgot password?" panel starts. Supabase's own
// resetPasswordForEmail(email, { redirectTo }) sends the user an email
// whose link points back here; lib/supabase.ts already has
// detectSessionInUrl: true, so the Supabase client parses that link's URL
// fragment on load and establishes a short-lived recovery session
// automatically — a PASSWORD_RECOVERY event fires on
// supabase.auth.onAuthStateChange when it does. This page's whole job is
// to wait for that, then let the visitor set a new password via
// supabase.auth.updateUser({ password }), the standard Supabase Auth API
// for this — see node_modules/@supabase/auth-js's own GoTrueClient
// (resetPasswordForEmail's doc comment walks through this exact
// PASSWORD_RECOVERY -> updateUser sequence).
//
// A dedicated route rather than overloading "/" (the landing page): the
// landing page's own auth state (LandingPage.tsx) is built around the
// normal signed-in/signed-out split, and app/page.tsx's separate inline
// auth bootstrap treats any session as "load the dashboard" — neither is
// the right place to intercept a recovery-only session and hold the
// visitor on a "set your new password" screen instead.
//
// No migration, no new Supabase dashboard setting required to *use* this
// route locally or in preview — redirectTo is derived from
// window.location.origin at request time (LandingPage.tsx), never
// hardcoded, so it already matches whatever origin the request came from.
// The one manual step that still has to happen in the Supabase dashboard
// (documented in this milestone's completion report, not silently
// changed here): this exact path must be added to Auth -> URL
// Configuration -> Redirect URLs for the production and preview origins,
// or Supabase will refuse the redirect and bounce the recovery link to
// the default Site URL instead.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase, isSupabaseConfigured } from '../../lib/supabase'
import { toSafeErrorMessage } from '../../lib/user-facing-errors'

type RecoveryState = 'checking' | 'ready' | 'invalid'

export default function ResetPasswordPage() {
  const [recoveryState, setRecoveryState] = useState<RecoveryState>('checking')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!supabase) {
      setRecoveryState('invalid')
      return
    }
    const client = supabase
    let settled = false

    const { data: listener } = client.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        settled = true
        setRecoveryState('ready')
      }
    })

    // detectSessionInUrl usually finishes processing the link's URL
    // fragment before this runs, so a session already existing is treated
    // the same as PASSWORD_RECOVERY firing. If neither has happened after
    // a short window, the link is genuinely missing, already used, or
    // expired.
    client.auth.getSession().then(({ data }) => {
      if (settled) return
      if (data.session) {
        settled = true
        setRecoveryState('ready')
        return
      }
      setTimeout(() => {
        if (!settled) setRecoveryState('invalid')
      }, 2500)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  async function submitNewPassword() {
    if (!supabase || recoveryState !== 'ready') return
    setError('')
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setBusy(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setError(toSafeErrorMessage(updateError, updateError.message))
      setBusy(false)
      return
    }
    setDone(true)
    setBusy(false)
    // The recovery session is a real, valid session, but this app asks
    // for a fresh sign-in with the new password afterward rather than
    // silently continuing on a session that started from an emailed
    // link — the safer default if that email was opened on a shared or
    // public device.
    void supabase.auth.signOut()
  }

  if (!isSupabaseConfigured) {
    return (
      <main className="authShell">
        <section className="authCard">
          <p className="eyebrow">PROPROSTER</p>
          <h1>Password reset unavailable</h1>
          <p className="authIntro">This PropRoster deployment isn&rsquo;t connected to Supabase yet.</p>
          <Link className="primary authSubmit" href="/">Return to PropRoster</Link>
        </section>
      </main>
    )
  }

  if (done) {
    return (
      <main className="authShell">
        <section className="authCard">
          <p className="eyebrow">PROPROSTER</p>
          <h1>Password updated</h1>
          <p className="authIntro">Your password has been changed. Sign in with your new password to continue.</p>
          <Link className="primary authSubmit" href="/">Go to sign in</Link>
        </section>
      </main>
    )
  }

  if (recoveryState === 'checking') {
    return <main className="authShell"><div className="loadingState">Checking your reset link…</div></main>
  }

  if (recoveryState === 'invalid') {
    return (
      <main className="authShell">
        <section className="authCard">
          <p className="eyebrow">PROPROSTER</p>
          <h1>Reset link invalid or expired</h1>
          <p className="authIntro">This password reset link is no longer valid. Reset links expire after a short time and can only be used once.</p>
          <Link className="primary authSubmit" href="/">Return to PropRoster to request a new link</Link>
        </section>
      </main>
    )
  }

  return (
    <main className="authShell">
      <section className="authCard">
        <p className="eyebrow">PROPROSTER</p>
        <h1>Set a new password</h1>
        <p className="authIntro">Choose a new password for your account.</p>

        <label htmlFor="reset-password">New password</label>
        <div className="authPasswordField">
          <input
            id="reset-password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            onKeyDown={(e) => e.key === 'Enter' && void submitNewPassword()}
            placeholder="Enter a new password"
          />
          <button
            type="button"
            className="authPasswordToggle"
            onClick={() => setShowPassword((v) => !v)}
            aria-pressed={showPassword}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? 'Hide' : 'Show'}
          </button>
        </div>

        <label htmlFor="reset-password-confirm">Confirm new password</label>
        <div className="authPasswordField">
          <input
            id="reset-password-confirm"
            type={showPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            onKeyDown={(e) => e.key === 'Enter' && void submitNewPassword()}
            placeholder="Re-enter the new password"
          />
        </div>

        {error && <div className="statusMessage errorMessage" role="alert">{error}</div>}

        <button className="primary authSubmit" disabled={busy} onClick={() => void submitNewPassword()}>
          {busy ? 'Updating…' : 'Update password'}
        </button>
      </section>
    </main>
  )
}
