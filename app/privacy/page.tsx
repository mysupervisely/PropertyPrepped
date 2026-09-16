'use client'

// PropRoster — Launch Essentials V1: Privacy Policy surface.
//
// Public/marketing-style page, reachable signed-in or signed-out —
// mirrors app/pricing/page.tsx's own header pattern exactly (AuthHeader
// when signed in, the lightweight marketing header otherwise) rather
// than inventing a second convention.
//
// This is a beta-ready baseline written to accurately describe this
// codebase's actual architecture and behavior (owner-scoped RLS, the 8
// analytics events in lib/analytics.ts, the real third-party services
// this app calls), not a template with unverified claims pasted in. It
// is explicitly marked as a draft requiring attorney review before a
// broader public launch — see the banner below, which is not hidden in
// a comment.

import Link from 'next/link'
import { useAuthUser } from '../../lib/useAuthUser'
import { AuthHeader } from '../../components/AuthHeader'
import { Wordmark } from '../../components/Wordmark'
import { LegalFooter } from '../../components/LegalFooter'

export default function PrivacyPolicyPage() {
  const { user, ready } = useAuthUser()

  return (
    <main className="shell investmentShell legalPage">
      {ready && user ? <AuthHeader hideMobileNav /> : (
        <header className="topbar">
          <Link href="/" className="brandButton"><span className="brand"><Wordmark /></span><span className="tagline">Your real estate portfolio, all in one place.</span></Link>
          <div className="accountActions">
            <Link className="primary" href="/">Sign In</Link>
          </div>
        </header>
      )}

      <section className="intro">
        <p className="eyebrow">PRIVACY</p>
        <h1>Privacy Policy</h1>
        <p>Last updated: {LAST_UPDATED}</p>
      </section>

      <div className="legalReviewBanner">
        Draft — Attorney Review Required. This page describes PropRoster&rsquo;s current data practices as accurately as we can, to support an early beta with a small number of landlords. It has not been reviewed by an attorney and should not be treated as a final, legally-binding policy before a broader public launch.
      </div>

      <div className="legalBody">
        <h2>What PropRoster is</h2>
        <p>PropRoster is a tool that helps landlords organize information about their rental properties — property details, documents, financial records, leases, maintenance, and related tenant communication. PropRoster organizes information entered into your account; it does not provide tax, legal, or accounting advice.</p>

        <h2>Account information</h2>
        <p>When you create a PropRoster account, we (through Supabase, our authentication and database provider) store your email address and an encrypted password credential. We use this to authenticate you and to communicate with you about your account.</p>

        <h2>Property information</h2>
        <p>Information you enter about your properties — addresses, valuations, mortgage and insurance details, purchase information, and similar records — is stored in our database and associated with your account only. It is not shared with or visible to other PropRoster users.</p>

        <h2>Tenant-related information you enter</h2>
        <p>If you use PropRoster to record information related to your tenants (for example, lease terms, rent payment records, or maintenance requests), that information is entered by you, the landlord, and is stored as part of your account&rsquo;s records. If a tenant uses PropRoster&rsquo;s Tenant Connect features directly, their account and the information they submit through it are handled the same way — access is scoped to the landlord and tenant involved in that property relationship, not shared more broadly.</p>

        <h2>Uploaded documents</h2>
        <p>Documents you upload (leases, receipts, insurance policies, and similar files) are stored in private cloud storage. They are not publicly accessible; access requires a signed, time-limited link generated only for an authenticated request from your account. Some uploaded documents may be analyzed by an AI document-processing service (see Service Providers below) to help extract structured information for your review.</p>

        <h2>Financial and property records</h2>
        <p>Income and expense records, rent ledger entries, and tax-related figures you enter or import are stored as part of your account&rsquo;s data. PropRoster organizes this information; it does not verify it, and it does not report it to any tax authority.</p>

        <h2>Usage and analytics data</h2>
        <p>We use Google Analytics (GA4) to understand overall product usage and a small set of internal PropRoster events — for example, that an account was created, that a property was added, or that a search was run — to help us understand which parts of the product are being used. These internal events are deliberately limited: they do not include your email address, property addresses, search text, document names, file contents, or dollar amounts. Google Analytics also independently collects standard web-analytics information (such as pages visited and general device/browser information) under its own privacy practices.</p>

        <h2>Cookies and similar technologies</h2>
        <p>PropRoster uses your browser&rsquo;s local storage to keep you signed in between visits and to remember a small number of interface preferences. Google Analytics sets its own cookies as part of its standard measurement functionality.</p>

        <h2>Service providers</h2>
        <p>PropRoster relies on a small number of third-party services to operate: Supabase (database, authentication, and file storage), Netlify (application hosting), Stripe (subscription billing, for paid plans), Google Analytics (usage analytics), and, for optional features, Anthropic&rsquo;s API (AI-assisted document analysis) and property-data providers such as Mapbox (address lookup) and third-party valuation data sources. Each of these providers processes the specific data necessary to provide its function and is subject to its own privacy practices.</p>

        <h2>Security practices</h2>
        <p>Property, financial, tenant, and document data is scoped to your account at the database level, so that in the ordinary course of using the product, other PropRoster users cannot see it. Uploaded files are stored in private storage and served only via signed, time-limited links. We cannot guarantee absolute security of any system, and we do not claim compliance with any specific security certification or regulatory framework (such as SOC 2, HIPAA, GDPR, or CCPA) at this time.</p>

        <h2>Data retention and deletion</h2>
        <p>We retain your account data for as long as your account is active, so that PropRoster can continue to provide the service to you. If you would like your account and its associated data deleted, contact us using the information below and we will process that request manually during this beta period.</p>

        <h2>Your choices</h2>
        <p>You can access, update, or remove most of the information you&rsquo;ve entered directly within the product. For anything you cannot change yourself — including a full account deletion request — contact us using the information below.</p>

        <h2>Changes to this policy</h2>
        <p>Because PropRoster is in an early beta, this policy may change as the product and its legal review evolve. We will update the &ldquo;Last updated&rdquo; date above when it does.</p>

        <h2>Contact</h2>
        <p>Questions about this policy or your data can be sent to <a href="mailto:sales@proproster.com">sales@proproster.com</a>.</p>
      </div>

      <LegalFooter />
    </main>
  )
}

const LAST_UPDATED = 'September 2026'
