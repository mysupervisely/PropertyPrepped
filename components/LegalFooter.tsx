import Link from 'next/link'

// Launch Essentials V1 — the one shared legal-navigation footer, used on
// the landing page, the pricing page, and the legal pages themselves
// (Phase 18: "Make Privacy Policy and Terms of Service discoverable...
// use conventional footer/legal navigation"). Deliberately small — a
// year, the two legal links, and the support contact.

export function LegalFooter() {
  return (
    <footer className="legalFooter">
      <span>&copy; {new Date().getFullYear()} PropRoster</span>
      <nav aria-label="Legal">
        <Link href="/privacy">Privacy Policy</Link>
        <Link href="/terms">Terms of Service</Link>
        <a href="mailto:sales@proproster.com">Contact</a>
      </nav>
    </footer>
  )
}
