'use client'

// Public privacy policy for the PropRoster website and mobile app.

import Link from 'next/link'
import { useAuthUser } from '../../lib/useAuthUser'
import { AuthHeader } from '../../components/AuthHeader'
import { Wordmark } from '../../components/Wordmark'
import { LegalFooter } from '../../components/LegalFooter'

export default function PrivacyPolicyPage() {
  const { user, ready } = useAuthUser()

  return (
    <main className="shell investmentShell legalPage">
      {ready && user ? <AuthHeader /> : (
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

      <div className="legalBody">
        <h2>About this policy</h2>
        <p>This Privacy Policy explains how PropRoster collects, uses, and shares information through proproster.com and the PropRoster mobile app, including Tenant Connect, PropCrew maintenance coordination, and Tax Center features. PropRoster helps organize rental properties, documents, finances, and related communication. It does not provide tax, legal, or accounting advice.</p>
        <p>For privacy questions, contact <a href="mailto:hello@proproster.com">hello@proproster.com</a>. To request account and data deletion, see <a href="#account-deletion">Delete your PropRoster account</a> below. This page is available without signing in.</p>

        <h2>Information we collect</h2>
        <ul>
          <li><strong>Account and contact information:</strong> email address, authentication records, and names or contact details you provide. Supabase handles authentication and password credentials; do not send your password to support.</li>
          <li><strong>Property and financial records:</strong> property addresses, purchase details, valuations, mortgages, insurance, leases, rent records, income, expenses, receipts, and tax-related information you enter or import.</li>
          <li><strong>Tenant and service-provider information:</strong> names, email addresses, phone numbers, tenancy details, maintenance requests, messages, scheduling information, and responses submitted by you or participants in a property workflow.</li>
          <li><strong>Files and photos:</strong> documents, receipts, leases, property images, maintenance photos, and information contained in files you choose to upload.</li>
          <li><strong>Billing information:</strong> subscription status and billing records associated with your account. Stripe processes payment details provided through its checkout and billing services.</li>
          <li><strong>Technical and usage information:</strong> pages visited, feature activity, browser and device information, network information such as IP addresses processed by our infrastructure providers, and diagnostic information needed to operate and troubleshoot the service. Google Analytics uses cookies and identifiers for usage measurement.</li>
          <li><strong>Support and referral requests:</strong> information you send to support or provide when requesting contact from a real estate professional.</li>
        </ul>
        <p>Some information comes from landlords, tenants, or service providers participating in the same workflow. Property lookup and valuation services may also return information about an address you submit. Only provide information about others that you are authorized to use for the relevant property-management purpose.</p>

        <h2>How we use information</h2>
        <p>We use information to create and authenticate accounts; organize property and financial records; store and retrieve files; coordinate tenant communication, maintenance, and appointments; provide requested property lookups and document analysis; manage subscriptions; send service notifications; respond to support requests; understand product usage; and protect, maintain, and improve the service.</p>

        <h2>When information is shared</h2>
        <p>Information is shared with service providers as needed to perform their functions and with participants in workflows you use. For example, a landlord can receive a tenant&rsquo;s maintenance request, photos, and replies; an invited tenant can access relevant lease or maintenance information; and an assigned maintenance provider can receive property, issue, and scheduling details. Provider outreach may use a private response link, so recipients should not forward that link to others. If you request a real estate referral, the contact and property information needed for that request may be shared with the receiving professional.</p>
        <p>Our service providers include Supabase for authentication, databases, and file storage; Netlify for hosting; Stripe for subscription billing; Google Analytics for usage measurement; Resend for service emails; Anthropic for AI-assisted document analysis; and Mapbox and configured property-data services, such as RentCast or ATTOM, for address and valuation features. Availability depends on the feature and service configuration. Providers receive the information needed for the function used, rather than unrestricted access to your account.</p>
        <p>Authorized personnel may access information when necessary to provide support, operate the service, investigate misuse, or meet legal obligations. We may disclose information when required by law or reasonably necessary to protect users, enforce our terms, or address fraud or security incidents.</p>

        <h2>AI-assisted document analysis</h2>
        <p>When you use document-analysis features, the selected file and relevant processing instructions are sent to Anthropic&rsquo;s API to extract and organize information for your review. Files may contain personal or financial information. Avoid submitting information that is unnecessary for the task. AI output may be inaccurate; review extracted information before relying on it. AI processing is subject to the provider&rsquo;s applicable data-handling terms.</p>

        <h2>Analytics, cookies, and device storage</h2>
        <p>Google Analytics measures page visits and product usage. Our custom product events record actions such as account creation, property creation, document upload, or a search being used. Those custom events do not include email addresses, property addresses, search text, document names, file contents, or dollar amounts. Google Analytics separately processes standard analytics data under its own practices.</p>
        <p>The website and mobile app&rsquo;s embedded web experience use local storage and similar technologies to maintain sign-in sessions and interface preferences. Analytics may use cookies. Browser or device controls may allow you to clear storage, restrict cookies, or block analytics; doing so can affect sign-in and other functionality. Removing the mobile app does not delete your PropRoster account or server-stored information.</p>

        <h2>Security</h2>
        <p>PropRoster uses account-based access controls and database access policies to restrict access to records. Uploaded documents use private storage and time-limited access links where supported by the relevant workflow. Access may also be granted to authorized tenants or service providers as described above. Keep your login credentials and private file or response links secure.</p>
        <p>No system can guarantee absolute security, and we do not claim compliance with any specific security certification or regulatory framework. Contact us if you believe someone has accessed your account without authorization.</p>

        <h2>Retention</h2>
        <p>We retain account information and records while needed to provide the service. Following a verified deletion request, we process deletion of the account and its associated data, subject to limited information that must be retained for legal, billing, fraud-prevention, security, or dispute-resolution purposes. Where an exception applies, we will explain the relevant retained information and reason when responding to your request. Provider backups and records may follow separate deletion cycles; information may not disappear from all backup copies immediately.</p>
        <p>Deleting your account cannot remove copies another participant has already downloaded or independently retained. If your request concerns records managed by a landlord or another account holder, we will explain any coordination needed rather than treating account deactivation as deletion.</p>

        <h2 id="account-deletion">Delete your PropRoster account</h2>
        <p>To request deletion of your PropRoster account and associated personal data, email <a href="mailto:hello@proproster.com?subject=Delete%20my%20PropRoster%20account">hello@proproster.com</a> with the subject <strong>Delete my PropRoster account</strong>. Send the request from the email address registered to your account when possible. You can make this request without signing in or having the app installed.</p>
        <p>We may verify account ownership before deleting information. Do not send your password, payment-card number, or identity documents with the initial request. We will respond with any verification steps, an expected completion timeline, and any applicable retention exceptions, and confirm when the request is completed. Requests are handled manually. You can also contact us to request deletion of particular information without deleting your entire account.</p>
        <p>If you have a paid subscription, mention it in your request so we can help address subscription cancellation and prevent unintended future billing. Deleting the app alone does not cancel a subscription.</p>

        <h2>Your choices and privacy requests</h2>
        <p>You can review and update information through available account and property features. Contact us for information you cannot access or change, or to request access, correction, or deletion. Depending on where you live and the laws that apply, you may have additional privacy rights. We review requests under applicable requirements and may need to verify your identity and authority over the information requested.</p>

        <h2>Children</h2>
        <p>PropRoster is intended for adults managing rental properties and related services, rather than children. If you believe a child has provided personal information directly through an account, contact us so we can investigate and address it.</p>

        <h2>Processing locations</h2>
        <p>Our service providers may process information in the United States and other locations where they operate. Privacy protections and legal requirements can differ between locations.</p>

        <h2>Changes and contact</h2>
        <p>We may update this policy as features and data practices change. The date above identifies the latest revision. For privacy questions or requests, email <a href="mailto:hello@proproster.com">hello@proproster.com</a>.</p>
      </div>

      <LegalFooter />
    </main>
  )
}

const LAST_UPDATED = 'November 1, 2026'
