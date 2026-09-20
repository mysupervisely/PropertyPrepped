'use client'

// PropRoster — Admin Navigation V1: the platform-admin landing hub.
//
// - NOT in the public/customer navigation — reachable from the account/
//   tools menu (components/AuthNavMenu.tsx) only for a signed-in
//   platform admin, or by direct URL. Same convention as the two tools
//   it links to.
// - Authorization is the SAME platform_admins mechanism as every other
//   admin surface (lib/admin/usePlatformAdmin.ts, supabase/milestone-33-
//   platform-admin.sql) — never a billing-plan check. The client-side
//   check below is UX only; this page reads no admin data itself (it's
//   just two links), and each destination it links to independently
//   re-verifies platform-admin status server-side before showing or
//   returning anything.
// - Reuses the existing hub/tool-card pattern from
//   app/investment-tools/page.tsx (.toolGrid/.toolCard) — no new CSS.

import Link from 'next/link'
import { useAuthUser } from '../../lib/useAuthUser'
import { usePlatformAdmin } from '../../lib/admin/usePlatformAdmin'
import { AuthHeader } from '../../components/AuthHeader'

export default function AdminHubPage() {
  const { user, ready } = useAuthUser()
  const { isPlatformAdmin, loading: adminLoading } = usePlatformAdmin(user)

  if (!ready || (user && adminLoading)) return <main className="authShell"><div className="loadingState">Loading…</div></main>

  if (!user) {
    return (
      <main className="authShell">
        <section className="authCard">
          <p className="eyebrow">PROPROSTER</p>
          <h1>Sign in required</h1>
          <p className="authIntro">Sign in to continue.</p>
          <Link className="primary authSubmit" href="/">Go to sign in</Link>
        </section>
      </main>
    )
  }

  if (!isPlatformAdmin) {
    return (
      <main className="authShell">
        <section className="authCard">
          <p className="eyebrow">PROPROSTER</p>
          <h1>Not available</h1>
          <p className="authIntro">This page isn’t available on your account.</p>
          <Link className="primary authSubmit" href="/">Back to Dashboard</Link>
        </section>
      </main>
    )
  }

  return (
    <main className="shell">
      <AuthHeader hideMobileNav />

      <section className="intro">
        <p className="eyebrow">ADMIN</p>
        <h1>Platform tools.</h1>
        <p>Internal PropRoster tools. Never shown to landlord, tenant, vendor, or PropCrew accounts.</p>
      </section>

      <section className="toolGrid">
        <Link href="/admin/subscriptions" className="toolCard">
          <span className="toolIcon">$</span>
          <div>
            <h3>Subscriptions</h3>
            <p>See who&rsquo;s paid and who has an active subscription — plan, status, Stripe details, and billing summary metrics across every account.</p>
          </div>
          <span className="toolCta">Open →</span>
        </Link>

        <Link href="/admin/realtor-leads" className="toolCard">
          <span className="toolIcon">◆</span>
          <div>
            <h3>Realtor Leads</h3>
            <p>Manage every lead submitted through Realtor Connect — status, referrals, and internal notes.</p>
          </div>
          <span className="toolCta">Open →</span>
        </Link>
      </section>
    </main>
  )
}
