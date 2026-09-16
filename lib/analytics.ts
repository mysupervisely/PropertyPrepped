// PropRoster — Production Readiness & Product Analytics V1.
//
// The ONE place a product/activation event is fired from anywhere in the
// app — a thin wrapper around the GA4 `gtag` global that
// components/GoogleAnalytics.tsx already installs on every route
// (app/layout.tsx). This file does NOT touch that component or its own
// pageview-tracking behavior at all — pageviews are untouched, mature,
// already-shipped functionality; this is additive, for a small, fixed
// set of CUSTOM events layered on top.
//
// Design rules (Production Readiness & Product Analytics V1's own
// spec, Section "Build a Small Analytics Helper" / "Analytics Privacy
// Rules"):
//   - Safe no-op if GA is unavailable (ad-blocked, SSR/build, gtag not
//     yet loaded) — analytics must never throw or break the app.
//   - A closed, typed set of event names — no free-text event names,
//     so a call site can never accidentally invent an untracked/typo'd
//     event or smuggle a sensitive string in as the event name itself.
//   - No PII, ever: every event below carries at most a small,
//     non-identifying numeric/boolean/enum property — never an
//     address, name, email, phone number, file name, search query, or
//     any other user-entered free text. Callers pass only the
//     properties each event explicitly declares; there is no escape
//     hatch for an arbitrary object.
//   - Gated to the production build only (see isAnalyticsEnabled) —
//     this is a NEW event stream with no prior "mature" behavior to
//     preserve, so unlike the existing pageview tracking (left
//     untouched, per above), it can safely start clean: local `next
//     dev` traffic never reaches GA4 under this helper, so a
//     developer's own testing can never pollute production activation
//     funnels. (Netlify's own preview deploys still build with
//     `NODE_ENV=production`, so a PR preview's traffic is still
//     recorded under this gate — the same tradeoff GA4's own pageview
//     tracking already accepts today.)

export type AnalyticsEventName =
  | 'sign_up_completed'
  | 'login_completed'
  | 'first_property_created'
  | 'property_created'
  | 'document_uploaded'
  | 'expense_created'
  | 'tax_center_viewed'
  | 'global_search_used'

// Every event's own allowed property shape — deliberately narrow.
// Adding a new property here is a one-line, reviewable change; there
// is no generic Record<string, unknown> anywhere in this file, so a
// call site cannot pass through user content by accident.
type AnalyticsEventParams = {
  sign_up_completed?: never
  login_completed?: never
  first_property_created?: never
  property_created?: never
  document_uploaded?: never
  expense_created?: never
  tax_center_viewed?: never
  global_search_used?: never
}

function isAnalyticsEnabled(): boolean {
  return typeof window !== 'undefined' && process.env.NODE_ENV === 'production' && typeof window.gtag === 'function'
}

/**
 * Fire one product/activation event. Always safe to call — no-ops
 * silently (never throws) when GA isn't available, during SSR/build,
 * or outside a production build. Call this only after the action it
 * names has genuinely, successfully happened (a persisted insert, a
 * confirmed auth result, a completed search) — never speculatively,
 * and never from a render path where it could re-fire on every
 * re-render (wrap a "viewed" event in its own `useEffect(() => {...},
 * [])` at the call site, exactly like tax_center_viewed does).
 */
export function trackEvent<T extends AnalyticsEventName>(name: T, params?: AnalyticsEventParams[T]): void {
  if (!isAnalyticsEnabled()) return
  try {
    window.gtag('event', name, params || {})
  } catch {
    // Analytics must never break the app it's instrumenting.
  }
}
