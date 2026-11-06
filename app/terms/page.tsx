'use client'

import Link from 'next/link'
import { TERMS_REVIEW_DATE, TERMS_REVIEW_VERSION, TERMS_REVIEW_SECTIONS } from '../../lib/legal/terms-review'
import { useAuthUser } from '../../lib/useAuthUser'
import { AuthHeader } from '../../components/AuthHeader'
import { Wordmark } from '../../components/Wordmark'
import { LegalFooter } from '../../components/LegalFooter'

export default function TermsOfServicePage() {
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
        <p className="eyebrow">TERMS</p>
        <h1>Terms of Service</h1>
        <p>Review draft updated: {TERMS_REVIEW_DATE}</p>
      </section>

      <div className="legalReviewBanner" role="note">
        Proposed replacement for legal review. This version has not been adopted or approved by an attorney.
        Contracting-entity details, liability limits, and any dispute provisions must be finalized before rollout.
      </div>

      <div className="legalBody" data-terms-version={TERMS_REVIEW_VERSION}>
        <p>This draft explains the intended responsibilities and limits of the service. It does not promise immunity from lawsuits or replace rights that applicable law protects.</p>
        {TERMS_REVIEW_SECTIONS.map((section) => (
          <section key={section.title}>
            <h2>{section.title}</h2>
            {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </section>
        ))}
        <h2>Contact</h2>
        <p><a href="mailto:hello@proproster.com">hello@proproster.com</a></p>
      </div>

      <LegalFooter />
    </main>
  )
}
