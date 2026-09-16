'use client'

// PropRoster — Launch Essentials V1: Terms of Service surface.
//
// Same public-page pattern as app/privacy/page.tsx (mirrors
// app/pricing/page.tsx's header convention). A beta-ready draft
// structure, not a legally-approved final document — see the banner
// below. Deliberately omits jurisdiction-specific provisions
// (arbitration, class-action waivers, governing law, venue,
// indemnification, statutory waivers) that haven't actually been
// decided anywhere else in this project — inventing them here would
// misrepresent PropRoster's real legal position, which is exactly what
// this milestone's brief says not to do.

import Link from 'next/link'
import { useAuthUser } from '../../lib/useAuthUser'
import { AuthHeader } from '../../components/AuthHeader'
import { Wordmark } from '../../components/Wordmark'
import { LegalFooter } from '../../components/LegalFooter'

export default function TermsOfServicePage() {
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
        <p className="eyebrow">TERMS</p>
        <h1>Terms of Service</h1>
        <p>Last updated: {LAST_UPDATED}</p>
      </section>

      <div className="legalReviewBanner">
        Draft — Attorney Review Required. These terms describe how PropRoster is intended to be used during an early beta with a small number of landlords. They have not been reviewed by an attorney and should not be treated as a final, legally-binding agreement before a broader public launch.
      </div>

      <div className="legalBody">
        <h2>Service description</h2>
        <p>PropRoster is a tool for organizing information about rental properties: property details, documents, financial records, leases, maintenance coordination, and related tenant communication. PropRoster organizes information you enter into your account; it does not provide individualized legal, tax, accounting, or investment advice, and it does not verify the accuracy of information you or others enter.</p>

        <h2>Your account</h2>
        <p>You&rsquo;re responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account. Let us know promptly if you believe your account has been accessed without your authorization.</p>

        <h2>Acceptable use</h2>
        <p>Use PropRoster only for its intended purpose of organizing your own property, tenant, and financial information. Don&rsquo;t use it to store or transmit unlawful content, attempt to access another user&rsquo;s data, or interfere with the operation of the service.</p>

        <h2>Landlord responsibility for entered data</h2>
        <p>You are responsible for the accuracy of the property, financial, and tenant-related information you enter into PropRoster, and for complying with applicable law in how you collect, use, and store information about your tenants and properties. PropRoster is a record-keeping and organization tool, not a substitute for your own legal or professional obligations as a landlord.</p>

        <h2>Tenant information</h2>
        <p>If you use PropRoster&rsquo;s Tenant Connect features, you remain responsible for your own communications and obligations toward your tenants. A tenant who creates a PropRoster account to interact with you through the product is responsible for the accuracy of the information they submit through it.</p>

        <h2>Document storage</h2>
        <p>Documents you upload are stored to help you organize your records. You are responsible for retaining your own copies of documents you consider critical; while we take reasonable steps to keep your files available and secure, we do not guarantee against loss and recommend keeping your own backups of anything irreplaceable.</p>

        <h2>Third-party services</h2>
        <p>PropRoster relies on third-party services to operate (including Supabase, Netlify, Stripe, Google Analytics, and, for optional features, AI document analysis and property-data providers). Availability and behavior of those services are outside our control, and PropRoster&rsquo;s own availability can be affected by them.</p>

        <h2>Availability</h2>
        <p>PropRoster is provided on an &ldquo;as available&rdquo; basis during this beta period. We do not guarantee uninterrupted or error-free operation, and features may change as the product develops.</p>

        <h2>Intellectual property</h2>
        <p>PropRoster&rsquo;s software, design, and branding are owned by PropRoster. You retain ownership of the data you enter into your account.</p>

        <h2>Termination</h2>
        <p>You may stop using PropRoster and request deletion of your account at any time by contacting us. We may suspend or terminate access to an account that violates these terms or misuses the service.</p>

        <h2>Disclaimers</h2>
        <p>PropRoster is provided without warranties of any kind, express or implied, including as to merchantability, fitness for a particular purpose, or non-infringement. PropRoster does not provide tax, legal, or accounting advice; review your property and financial records with a qualified professional, as noted throughout the product (see the Tax Center&rsquo;s own disclaimer).</p>

        <h2>Limitation of liability concepts</h2>
        <p>To the fullest extent permitted by applicable law, PropRoster and its operators are not liable for indirect, incidental, or consequential damages arising from use of the service. This general concept is included here as a placeholder for attorney-drafted language appropriate to your jurisdiction before a broader public launch — no specific liability cap, indemnification obligation, arbitration clause, or governing-law/venue provision is included in this draft, since none has been decided.</p>

        <h2>Contact</h2>
        <p>Questions about these terms can be sent to <a href="mailto:sales@proproster.com">sales@proproster.com</a>.</p>
      </div>

      <LegalFooter />
    </main>
  )
}

const LAST_UPDATED = 'September 2026'
