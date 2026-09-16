'use client'

// Launch Essentials V1 — the shared "you need to sign in" card several
// pages already rendered independently (Tax Center, Documents, Rent
// Ledger), now with one addition: when the visitor had a session that
// expired/was revoked (rather than never having signed in at all — see
// lib/useAuthUser.ts's sessionExpired), the copy says so explicitly
// instead of the generic "Sign in required."

import Link from 'next/link'

export function SignInRequiredCard({ what, sessionExpired }: { what: string; sessionExpired?: boolean }) {
  return (
    <main className="authShell">
      <section className="authCard">
        <p className="eyebrow">PROPROSTER</p>
        <h1>{sessionExpired ? 'Session expired' : 'Sign in required'}</h1>
        <p className="authIntro">{sessionExpired ? 'Your session has expired. Please sign in again.' : `Sign in to view your ${what}.`}</p>
        <Link className="primary authSubmit" href="/">Go to sign in</Link>
      </section>
    </main>
  )
}
