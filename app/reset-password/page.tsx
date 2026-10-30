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

import { useEffect, useRef, useState } from 'react'
import { runAuthSubmission } from '../../lib/auth/form-submission'
import { watchRecoverySession, type RecoveryState } from '../../lib/auth/recovery-session'
import Link from 'next/link'
import { supabase, isSupabaseConfigured } from '../../lib/supabase'
import { toSafeErrorMessage } from '../../lib/user-facing-errors'


export default function ResetPasswordPage() {
  const [recoveryState, setRecoveryState] = useState<RecoveryState>('checking')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [recoveryAttempt, setRecoveryAttempt] = useState(0)
  const submission = useRef(false)

  useEffect(() => {
    if (!supabase) {
      setRecoveryState('invalid')
      return
    }
    const client = supabase
    setRecoveryState('checking')
    return watchRecoverySession(
      () => client.auth.getSession(),
      (onRecovery) => {
        const { data: listener } = client.auth.onAuthStateChange((event) => {
          if (event === 'PASSWORD_RECOVERY') onRecovery()
        })
        return () => listener.subscription.unsubscribe()
      },
      setRecoveryState,
    )
  }, [recoveryAttempt])

  async function submitNewPassword() {
    if (!supabase || recoveryState !== 'ready' || submission.current) return
    setError('')
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    await runAuthSubmission(submission, setBusy, async () => {
      if (!supabase) throw new Error('Authentication client unavailable')
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) {
        setError(toSafeErrorMessage(updateError, updateError.message))
        return
      }
      setDone(true)
      // A password update is complete even if the subsequent sign-out fails.
      const { error: signOutError } = await supabase.auth.signOut()
      if (signOutError) throw signOutError
    }, (requestError) => {
      setError(toSafeErrorMessage(requestError, 'Unable to complete your request. Please try again.'))
    })
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
          {error && <div className="statusMessage errorMessage" role="alert">Your password was updated, but sign-out could not be confirmed. Close this session on a shared device before leaving it unattended.</div>}
          <Link className="primary authSubmit" href="/">Go to sign in</Link>
        </section>
      </main>
    )
  }

  if (recoveryState === 'checking') {
    return <main className="authShell"><div className="loadingState">Checking your reset link…</div></main>
  }

  if (recoveryState === 'unavailable') {
    return (
      <main className="authShell">
        <section className="authCard">
          <p className="eyebrow">PROPROSTER</p>
          <h1>We couldn’t check your reset link</h1>
          <p className="authIntro">Check your connection and try again. This does not mean your link has expired.</p>
          <button className="primary authSubmit" onClick={() => setRecoveryAttempt((attempt) => attempt + 1)}>Try again</button>
          <Link className="secondary authSubmit" href="/">Return to PropRoster</Link>
        </section>
      </main>
    )
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
