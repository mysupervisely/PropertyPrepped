'use client'

// Launch Essentials V1 — the shared "you need to sign in" card several
// pages already rendered independently (Tax Center, Documents, Rent
// Ledger), now with one addition: when the visitor had a session that
// expired/was revoked (rather than never having signed in at all — see
// lib/useAuthUser.ts's sessionExpired), the copy says so explicitly
// instead of the generic "Sign in required."
//
// Mobile auth polish pass: every other page with its own hand-rolled
// "Sign in required" block (PropCrew, Search, Maintenance, Portfolio
// Import, Profile, the two admin routes' signed-out state) now renders
// this shared component too, instead of repeating the same JSX — one
// place to fix the mobile-preview findings (no back/brand affordance,
// excessive empty space) for all of them at once.

import Link from 'next/link'
import { AuthBackHeader } from './auth/AuthBackHeader'

export function SignInRequiredCard({ what, sessionExpired }: { what: string; sessionExpired?: boolean }) {
  return (
    <main className="authShell">
      <AuthBackHeader />
      <section className="authCard">
        <p className="eyebrow">PROPROSTER</p>
        <h1>{sessionExpired ? 'Session expired' : 'Sign in required'}</h1>
        <p className="authIntro">{sessionExpired ? 'Your session has expired. Please sign in again.' : `Sign in to view your ${what}.`}</p>
        <Link className="primary authSubmit" href="/">Go to sign in</Link>
      </section>
    </main>
  )
}
