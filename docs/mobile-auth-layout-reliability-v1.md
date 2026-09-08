# Mobile Authentication & Layout Reliability V1

Fixes two real production issues found during repeated iPhone testing:
a recurring "JWT issued at future" auth error that could make the
dashboard briefly show a **false empty portfolio**, and the
authenticated mobile dashboard rendering shifted/clipped off the left
edge on iPhone. **Zero schema/RLS/environment/Netlify changes** — both
fixes are entirely application code (React state/render logic and CSS).

## Part 1 — Authentication

### Diagnosis (before any fix)

Traced the full client-side auth/session path (this app has no
server-side auth middleware for the dashboard — `app/page.tsx` talks to
Supabase directly from the browser):

- `lib/supabase.ts` — one module-level `createClient()` singleton
  (`persistSession: true, autoRefreshToken: true, detectSessionInUrl: true`).
  Confirmed only ONE `createClient()` call exists for the browser client
  (searched the whole codebase) — not a multiple-GoTrueClient-instance
  bug.
- `app/page.tsx`'s own auth bootstrap (`useAuthUser()` in
  `lib/useAuthUser.ts` is a separate, unrelated copy used by other
  routes) calls `supabase.auth.getUser()` on mount and listens to
  `onAuthStateChange`.
- `loadPortfolio()` — one `Promise.all` of ~18 Supabase queries; on any
  query error it set `error` to the raw message and returned, without
  ever populating `properties` (or any other collection).
- The dashboard's Portfolio Snapshot tiles, "You're all caught up.",
  and "My Properties" section header all rendered directly from
  `properties`/`totals`/`attentionItems` — with **no signal anywhere
  distinguishing "successfully loaded, genuinely zero" from "never
  successfully loaded, state unknown."**

### Root cause of the misleading "0 Properties" dashboard

Not a data-loss bug. `getUser()`'s `error` field was discarded entirely
(`.then(({ data }) => setUser(data.user ?? null))`), and `loadPortfolio()`
returning early on a query error left `properties` (etc.) at their
initial, empty `useState([])` value. On the FIRST load after sign-in —
including a cold app relaunch, which is exactly what happens when iOS
Safari or an installed PWA reclaims a backgrounded tab's memory and
reconstructs the page from scratch — if that first query batch failed
for any reason, the dashboard rendered fully authenticated (`user` was
still set) but with every collection still empty, which is
indistinguishable on screen from a real empty portfolio: 0 Properties,
$0 everywhere, "You're all caught up." The raw error (which can
literally read "JWT issued at future") was shown in the dismissible
`.globalError` banner at the same time, matching the report exactly.
Refreshing/re-authenticating "fixed" it only because a fresh load
attempt eventually succeeded and populated the real data — the
properties were never actually gone.

### "JWT issued at future" — clock/timing investigation

This exact string is PostgREST's own JWT-claim-validation error: it is
rejecting a token whose `iat` (issued-at) claim is, from the verifying
server's own clock, in the future. Investigated:

- **Not application-code JWT handling.** This codebase never decodes or
  validates a JWT's `iat`/`exp` itself, client or server — confirmed by
  search (no `jwt-decode`, no manual claim parsing anywhere). All
  validation is Supabase's own (PostgREST for data queries; GoTrue for
  auth). Application code cannot directly control PostgREST's or
  GoTrue's clock.
- **Not a duplicate-client race.** Exactly one browser-side
  `createClient()` exists.
- **Consistent with device/session-refresh timing, not corrupted
  application logic.** The error is a normal, transient outcome of
  ordinary token-refresh timing — a token's `iat` is stamped by
  Supabase's Auth service at issuance; if the DB-side verifier's clock
  and the issuing service's clock are ever even slightly out of step
  (a real, if brief, condition on hosted infrastructure), or a
  just-refreshed token is verified in a tight window after
  reissuance, this exact rejection can occur — then self-resolves,
  which matches "refresh restores the correct data" precisely.
  Mobile Safari's aggressive tab-suspend/resume lifecycle (confirmed
  as a real contributing factor to the SYMPTOM, not the JWT error
  itself) means a resumed session is more likely to hit a stale/
  about-to-refresh token right as the page reconstructs and fires its
  first query batch — i.e., mobile Safari resume behavior increases
  the FREQUENCY at which this class of transient error is
  encountered, without being its origin.
- **Conclusion:** the trigger for this specific error text originates
  in Supabase's own Auth/PostgREST infrastructure clock synchronization
  — not in anything this application's code executes, sends, or can
  directly correct. Per this milestone's own instruction ("if the root
  cause cannot safely be fixed entirely in application code, document
  that clearly and still fix the misleading false-empty-state
  behavior"), no attempt was made to "fix" PostgREST/GoTrue's clock
  validation (there is nothing safe to change here in application code
  — and nothing here indicates a genuine schema/RLS/config problem
  worth escalating; it is an ordinary, self-resolving distributed-clock
  condition). What WAS fixed, fully in application code: the dashboard
  no longer conflates "couldn't verify" with "confirmed zero."

### Fix (all application code — no schema/RLS/env/Netlify changes)

1. **Auth bootstrap** (`app/page.tsx`, the `useEffect` that used to call
   `getUser().then(({ data }) => ...)`): now reads `getUser()`'s
   `error`. A real error (not `AuthSessionMissingError`, i.e. not
   simply "never signed in") gets exactly **one** `refreshSession()`
   recovery attempt — a genuine Supabase refresh-token exchange, never
   a local bypass of JWT validation — before concluding the user is
   signed out. `onAuthStateChange` (the auth library's own state
   machine) is untouched; a genuine `SIGNED_OUT` event is never
   second-guessed.
2. **Load-status tracking** (`app/page.tsx`): two new state flags,
   `hasLoadedPortfolio` (has ANY load succeeded this session) and
   `portfolioLoadFailed` (did the MOST RECENT attempt fail). `loadPortfolio()`
   sets `hasLoadedPortfolio = true` only after every collection is
   actually populated — never optimistically.
3. **Three distinct dashboard states**, gated on these flags (in
   addition to the pre-existing "not configured"/"loading auth"/
   "signed out" gates):
   - `!hasLoadedPortfolio && busy` → a dedicated "Loading your
     portfolio…" screen (previously this window could flash the same
     zero-state dashboard).
   - `!hasLoadedPortfolio && portfolioLoadFailed` → a dedicated
     recovery screen: friendly copy, a "Try again" button — never the
     normal dashboard.
   - Once `hasLoadedPortfolio` is `true` (even once), NEITHER new gate
     applies again for the rest of the session — a later reload
     failure leaves the last-good (real) data on screen with just the
     existing `.globalError` banner, which is correct and unchanged.
   - A genuinely successful load with zero real properties is
     completely unaffected — neither new gate ever inspects
     `properties.length`.
4. **Friendly, non-technical, always-the-same user-facing message**
   (`lib/dashboard/portfolio-load-status.ts`): "We couldn't verify your
   session just now. This is usually temporary — your properties are
   still there. Try again in a moment." Deliberately never inspects the
   raw error text (no "does this say JWT" string-matching — brittle,
   and beside the point: ANY first-load failure is equally ambiguous,
   regardless of cause). The raw error is still logged via the
   existing `logPhotoUploadDiagnostic('PHOTO_RELOAD_ERROR', ...)` call
   for development diagnostics — only the user-facing text changed.
5. **Bounded, one-shot automatic retry**: on a first-load failure, one
   automatic retry fires after 2 seconds (`autoRetriedRef`, reset only
   on a new sign-in) — smooths over a truly momentary blip without any
   user action, then stops trying automatically; the manual "Try
   again" button remains available indefinitely. Never a loop, never a
   storm.

## Part 2 — iPhone/mobile left-edge clipping

### Diagnosis (measured, not guessed)

Built a static reproduction using the app's real, unmodified
`app/globals.css` against the exact class names/markup structure of the
affected sections (header, welcome heading, Portfolio Snapshot,
PropWatch, My Properties), then drove the environment's pre-installed
headless Chromium (via `playwright-core`) to measure
`getBoundingClientRect()` for every element at 320/375/390/393/430px —
the widths this milestone specifies — checking for both right-edge
overflow (`rect.right > viewport width`) and left-edge underflow
(`rect.left < 0`), plus `document.documentElement.scrollWidth` vs
`clientWidth` for whole-page horizontal overflow.

**Confirmed measured result:** at exactly 390px and 393px — ordinary,
common iPhone viewport widths (390px: iPhone 12/13/14/15 non-Pro; 393px:
iPhone 14/15/16 Pro) — `.topbarActions` (the header's search icon +
"+ Smart Upload" button) overflowed the right edge by 26-29px,
`document.documentElement.scrollWidth` exceeded `clientWidth` by the
same amount, and the page became horizontally scrollable. At 320px,
375px, and 430px, no overflow was measured at all.

**Root cause:** `.topbar`'s two flex children
(`.topbarBrandGroup`, `.topbarActions`) had `display: flex;
justify-content: space-between` with **no `flex-wrap`** by default.
`flex-wrap: wrap` was only applied at `@media (max-width: 380px)`,
and the Smart Upload/search buttons only shrink their own padding/font
at `@media (max-width: 430px)` — leaving a real gap, **381-429px**,
where the row could neither wrap nor shrink enough, and where 390px and
393px both fall.

**Why this explains left-edge clipping of OTHER, independently-
non-overflowing sections** (the welcome heading, PropWatch, My
Properties — none of which measured any overflow of their own): once
the header's overflow makes the whole page horizontally scrollable —
something this app should never allow — any incidental sideways touch
movement (very easy to trigger by accident on a touchscreen, and this
app has no `overflow-x: hidden` anywhere blocking it) leaves the
visible viewport scrolled away from x=0. Every other, correctly-sized
section then appears shifted and partially cut off on the left relative
to that scrolled position — one confirmed root cause plausibly
explaining every symptom in the report (offscreen heading, clipped
PropWatch/My Properties headings, inconsistent gutters, content not
visually centered) through a single mechanism, rather than four
unrelated bugs. This is the most parsimonious explanation consistent
with the measured evidence; a real device's precise touch/scroll
history cannot be replayed in this environment, so it is reported as
the well-evidenced, most-likely mechanism rather than an absolutely
certain one.

### Fix

Widened the existing, already-correct `.topbar` wrap rule's breakpoint
from `max-width: 380px` to `max-width: 480px` (`app/globals.css`) — the
same mechanism already used and proven correct at 320-380px, now
applied across the width range where the measurement showed it was
actually needed. This is additive to, not a replacement for, the
existing 430px shrink treatment (both can and do apply together).
**No global `overflow-x: hidden` was added** — the underlying
responsive cause was fixed directly, per this milestone's own
instruction not to paper over real overflow.

**Re-verified after the fix**, same measurement method: **zero**
horizontal overflow at 320/375/390/393/430px, and zero overflow at
600/768/900/1024/1440px (no desktop/tablet regression — the header does
not wrap at any of those wider widths, confirming the 480px breakpoint
doesn't reach that far).

## Explicitly deferred / out of scope for this milestone

- No Supabase dashboard, RLS, schema, environment variable, or Netlify
  configuration change was made or is believed necessary — see Part 1's
  diagnosis for why the JWT clock-timing trigger itself is Supabase
  infrastructure, not an application-code or schema defect.
- Tenant Connect next milestone, provider messaging, Smart Upload
  Structured Data, Property Intelligence, rent reminders, a native app,
  and unrelated dashboard redesign/refactoring were all explicitly out
  of scope and untouched.
