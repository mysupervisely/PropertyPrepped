// PropRoster — Mobile Authentication & Layout Reliability V1.
//
// See docs/mobile-auth-layout-reliability-v1.md for the full root-cause
// writeup. Real-device iPhone testing found a recurring "JWT issued at
// future" auth error that could make the dashboard briefly render a
// convincing but FALSE empty portfolio (0 Properties, $0 everywhere,
// "You're all caught up") — not because the user actually had zero
// properties, but because app/page.tsx's loadPortfolio() bailed out on
// a query error WITHOUT ever having populated `properties` (etc.) yet,
// and nothing distinguished "successfully loaded, genuinely empty"
// from "never successfully loaded — state unknown."
//
// This module deliberately does NOT try to detect "is this error
// JWT-related" by inspecting its message — matching an exact string
// like "JWT issued at future" would be exactly the kind of brittle
// guess this milestone's own brief warns against, and it wouldn't even
// be the right question: ANY failure on the very first portfolio load
// (of whatever underlying cause — an expired/invalid session, a
// network blip, a real backend error) leaves the app equally unable to
// tell "zero properties" from "couldn't check," so the safe behavior
// is identical either way. app/page.tsx makes that call purely
// structurally, via a `hasLoadedPortfolio` flag (has ANY load ever
// succeeded this session) — never by pattern-matching error text.
//
// The one thing this module standardizes: what the user actually SEES
// when a portfolio load fails. Per this milestone's own instruction —
// "keep error/retry UX concise and non-technical" and "do not expose
// 'JWT issued at future' as the primary user-facing explanation" — the
// user-facing copy is always this same short, friendly line, regardless
// of the underlying Postgres/PostgREST/GoTrue error text. The raw
// error is still available to development/diagnostic logging (see
// app/page.tsx's existing logPhotoUploadDiagnostic('PHOTO_RELOAD_ERROR',
// ...) call, unchanged) — just never surfaced as the headline.

const FRIENDLY_PORTFOLIO_LOAD_MESSAGE = "We couldn't verify your session just now. This is usually temporary — your properties are still there. Try again in a moment."

/** Always the same friendly, non-technical copy — see this file's header for why the underlying error text is never surfaced here. */
export function friendlyPortfolioLoadMessage(): string {
  return FRIENDLY_PORTFOLIO_LOAD_MESSAGE
}
