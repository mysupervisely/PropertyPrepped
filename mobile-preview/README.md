# PropRoster Mobile Preview — visual QA walkthrough

Two rounds of work live in this directory:

- **Round 1 (public/auth screens)** — real production UI, unauthenticated.
- **Round 2 (authenticated product)** — the mobile-auth polish pass applied
  to Round 1's findings, plus a new safe preview harness (`app/preview/`)
  that renders the real dashboard/property/maintenance/etc. design system
  with fictional fixture data, since this sandbox has no reachable backend
  to sign in against for real.

**Primary viewport:** 393×852 (current Pro-sized iPhone). Verified additionally
at 375×812 and 430×932 for a representative subset of both rounds — all
render with zero horizontal overflow and zero console errors.

**Contact sheets:**
- `00-contact-sheet.png` — Round 1, public/auth screens.
- `00b-contact-sheet-authenticated.png` — Round 2, the authenticated product (dashboard/property/maintenance/PropCrew/Tax Center/Billing) — this is the one that answers "what does the PropRoster mobile app actually feel like."

## Round 1 — public/auth screens (unchanged findings, now fixed)

Captured from the same production Next.js build (`next build && next start`,
no dev-mode indicator) that the Capacitor shell loads at
`https://proproster.com`.

| # | File | Screen |
|---|------|--------|
| 1 | `01-landing-hero-393x852.png` | Landing page |
| 2 | `02-signin-modal-393x852.png` | Sign-in modal |
| 3 | `03-forgot-password-panel-393x852.png` | Forgot-password panel |
| 4 | `04-create-account-panel-393x852.png` | Create-account panel |
| 5 | `05-pricing-393x852.png` | Pricing |
| 6 | `06-terms-393x852.png` | Terms of Service |
| 7 | `07-privacy-393x852.png` | Privacy Policy |
| 8 | `08-investment-tools-hub-393x852.png` | Investment Tools hub (public) |
| 9 | `09-reset-password-393x852.png` | Reset-password page, no token (real "checking" state; the actual form needs a genuine Supabase email link) |
| 10 | `10-gate-generic-propcrew-393x852.png` | PropCrew, signed out — generic gate |
| 11 | `11-gate-billing-393x852.png` | Billing, signed out |
| 12 | `12-gate-tenant-portal-393x852.png` | Tenant Connect's own dedicated sign-in form |

**Findings from this round, and their fix status:**

1. Sign-in gates read as a bare web form floating in empty space, no
   branding, no back affordance. **Fixed** — `components/auth/AuthBackHeader.tsx`
   (a back arrow + PropRoster wordmark, linking home) is now shown above
   every gate at mobile widths, and `.authShell` switched from dead-centering
   to a top-aligned layout (`app/globals.css`).
2. The tenant portal sign-in was the most extreme case of #1. **Fixed** —
   same shared `.authShell`/`.authCard` CSS change; deliberately did **not**
   add a "back to landlord app" link there specifically, since
   `app/tenant/page.tsx`'s own comments explain tenants are intentionally
   never routed through the landlord landing page.
3. No visible back affordance. **Fixed** — see #1 (`AuthBackHeader`); the
   sign-in modal's existing "×" close button already served this role once
   made prominent (see #4).
4. The sign-in/sign-up modal floated over a still-visible, still-scrollable
   marketing page — read as a website modal, not an app screen. **Fixed** —
   at ≤560px it's now a full-screen sheet (CSS-only change to the existing
   `.overlay`/`.modal` classes `LandingPage.tsx` already used; no second
   auth system).
5. Zero technical mobile-web defects (overflow/console errors) at any
   width — unchanged, still true.

Also duplicated across ~9 page files: a hand-rolled "Sign in required" block.
Consolidated into the existing shared `components/SignInRequiredCard.tsx`
(already used by 3 pages) instead of 9 separate copies.

## Round 2 — the authenticated product (new)

### Why a preview harness was needed

The sandbox's `.env.local` points `NEXT_PUBLIC_SUPABASE_URL` at
`xyzcompany.supabase.co` — Supabase's own generic docs placeholder, not a
real project, and the network policy rejects it. There is no reachable
backend here, so the real dashboard/property/maintenance/etc. screens
could not be reached by signing in — not "a production backend we chose
not to touch," literally nothing to sign in against.

### How the harness works — `app/preview/`

- `app/preview/_lib/fixtures.ts` — entirely fictional data (landlord
  "Alex Morgan"; properties "123 Harbor Lane, Tampa, FL" and "842 Palm
  Avenue, St. Petersburg, FL"; fictional tenants/maintenance requests/
  PropCrew contacts). No real names, addresses, emails, or financial data
  anywhere in this file.
- `app/preview/page.tsx` — a client component that mirrors the real app's
  own single-page-app navigation style (`app/page.tsx`'s selectedId-based
  property workspace), built from the **same CSS classes** as production
  (`.shell`, `.grid`, `.propertyCard`, `.propertyHero`, `.tabs`,
  `.mobilePropertyNav`, `.miniStats`, `.overlay`/`.modal`, `.mobileBottomNav`,
  etc.) plus the real `Wordmark` and navigation icon components. It reads
  only from the fixtures file — no `supabase` import, no `fetch()` call,
  anywhere in the route.
- **Trade-off, disclosed plainly:** this is not literally `app/page.tsx`'s
  own 2,900-line function running with swapped data. That file (and most
  of the real components it renders) calls the live Supabase client
  directly with no seam to inject fixture data safely, and there's no
  dependency-injection layer in this codebase to add one without either
  touching the shared production auth/data singleton (`lib/supabase.ts`,
  deliberately left untouched — see below) or duplicating real product
  logic. What's here instead is a faithful visual reconstruction using the
  real design system and CSS classes, hand-assembled for this preview.

### Why this cannot become a production auth bypass

Two independent gates in `app/preview/layout.tsx`, both required:

1. `process.env.NODE_ENV !== 'production'` — Next.js statically inlines
   `NODE_ENV` at build time, and `next build` (what Netlify runs) always
   sets it to `'production'`, making this condition literally `false` in
   that build. **Verified empirically, not just argued:** ran a real
   `npm run build && npm run start` and confirmed `GET /preview` returns
   a genuine 404 with zero fixture content in the response body.
2. `process.env.PREVIEW_MODE === '1'` — a plain, server-only env var
   (never `NEXT_PUBLIC_`-prefixed, so it's never bundled to the client).
   Netlify's environment for proproster.com doesn't set this, and nothing
   in the codebase sets it automatically.

Neither gate touches `lib/supabase.ts`, real authentication, or RLS — the
preview route never calls any of them, so there's nothing there to bypass
or weaken. One disclosed nuance: like any Next.js route, the preview
page's own client-side JS chunk still exists on disk at a hashed, unlinked
path as a normal build artifact (confirmed: not referenced by any other
page's bundle or manifest) — this is standard Next.js code-splitting
behavior for any route, not a preview-specific weakness, and the route
itself always 404s server-side before that chunk could ever be loaded.

A persistent brown "PREVIEW MODE — fictional fixture data" banner is
shown on every screen so it can never be mistaken for a real account.

### Walkthrough

| # | File | Screen |
|---|------|--------|
| 20 | `20-auth-dashboard-top-393x852.png` | Dashboard — stats + top of property grid |
| 21 | `21-auth-dashboard-scrolled-393x852.png` | Dashboard, scrolled |
| 22 | `22-auth-property-overview-393x852.png` | Individual property — Overview tab |
| 23 | `23-auth-property-tenant-393x852.png` | Individual property — Tenant Connect tab |
| 24 | `24-auth-property-documents-393x852.png` | Individual property — Documents tab |
| 25 | `25-auth-maintenance-list-393x852.png` | Maintenance — request list |
| 26 | `26-auth-maintenance-detail-393x852.png` | Maintenance — request detail |
| 27 | `27-auth-maintenance-new-modal-393x852.png` | Maintenance — New Request modal (action sheet) |
| 28 | `28-auth-propcrew-393x852.png` | PropCrew directory |
| 29 | `29-auth-taxcenter-393x852.png` | Tax Center |
| 30 | `30-auth-account-menu-393x852.png` | Account/profile menu |
| 31 | `31-auth-billing-393x852.png` | Account & Billing |
| 32 | `32-auth-admin-393x852.png` | Admin hub (fixture representation only — see below) |

`verify-auth-*-375x812.png` / `verify-auth-*-430x932.png` — dashboard and
property overview re-shot at the two secondary widths.

**Not captured / not faithfully representable:**
- **Admin hub (#32)** is a simplified stand-in, not a reconstruction of
  the real cross-account admin tool — that page reads other customers'
  real data server-side, which has no fictional-fixture equivalent worth
  building.
- **The account/profile menu (#30)** is a simplified stand-in for the
  real `AuthNavMenu` component, not a pixel-faithful reproduction — that
  component wasn't inspected closely enough this round to justify the
  stronger "faithful" claim made for the dashboard/property/maintenance/
  PropCrew/Tax Center/Billing screens, which do reuse the exact real CSS
  classes those pages use.
- Real, live data of any kind (an actual customer's real portfolio) —
  by definition, since this is fixture data.

### Mobile usability defects found and fixed this round

- **Tax Center's stat row overflowed horizontally at 393px** — a
  preview-only bug (an inline `grid-template-columns: repeat(3, 1fr)`
  style overriding the real, already-correct `.stats` mobile rule that
  collapses to one column below 760px). Fixed in the preview code itself;
  this was never a production bug since production's Tax Center doesn't
  carry that inline override — worth flagging because it demonstrates the
  harness catching a real class of mistake, not because it says anything
  about the shipped app.
- **The real app's Mobile Property Section Selector** (`.tabs` hidden
  below 761px, replaced by a `.mobilePropertyNav` "current section ▾"
  dropdown) was initially missing from the preview's first draft — the
  preview's own property tabs were invisible on mobile until this was
  added to match. Now implemented identically to the real pattern
  (`app/globals.css`'s own documented Mobile Property Section Selector V1).

### Subjective observations (not fixed — for review)

- The account-menu overlay (#30) is functionally fine but visually the
  least polished screen here, appropriate for a simplified stand-in
  clearly labeled as such above.
- Card density on the dashboard (#20/#21) reads a little sparse at this
  viewport — each property card carries a lot of vertical whitespace
  around a relatively small amount of information. Worth a look once
  this can be checked against the real, live data volume a real account
  would have.
