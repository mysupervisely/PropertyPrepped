'use client'

// PropRoster Milestone 21: Realtor Connect V1 — the compact CTA card
// shown near a calculator's results (Sections 2/3). One shared component
// for both calculators — only the copy differs, passed in as props, so
// the two approved copy blocks can never drift apart from each other in
// code (Section 15: keep the legal-restraint copy consistent).
//
// Deliberately small/quiet (Section 14: "CTA does not dominate the
// calculator") — a bordered card matching the existing .evaluatorSection
// visual language, not a banner or a modal that opens on its own.

export function RealtorConnectCTA({
  headline,
  subheadline,
  description,
  buttonLabel,
  onClick,
}: {
  /** The approved lead-in question, e.g. "Need Help With This Investment?" */
  headline: string
  /** The approved bold sub-line, e.g. "Connect with a local real estate agent" */
  subheadline: string
  description: string
  buttonLabel: string
  onClick: () => void
}) {
  return (
    <section className="evaluatorSection realtorConnectCta">
      <h2>{headline}</h2>
      <p className="realtorConnectCtaSub">{subheadline}</p>
      <p className="muted">{description}</p>
      <button type="button" className="primary" onClick={onClick}>{buttonLabel}</button>
    </section>
  )
}
