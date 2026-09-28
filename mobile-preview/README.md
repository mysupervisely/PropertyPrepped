# PropRoster Mobile Preview — visual QA walkthrough

**What this is:** real PropRoster UI, viewed at iPhone widths, captured from the
same production Next.js build (`next build && next start`, no dev-mode
indicator) that the Capacitor shell loads at `https://proproster.com`. Nothing
here is a mockup or a redesign — every screenshot is the actual app rendered
by a real browser (Chromium via Playwright) at real mobile viewport sizes.

**Primary viewport:** 393×852 (current Pro-sized iPhone). Verified additionally
at 375×812 and 430×932 for the landing hero, sign-in modal, pricing, and one
sign-in-gate screen (`verify-*.png` files) — all three widths render with zero
horizontal overflow and zero console errors.

**Contact sheet:** `00-contact-sheet.png` — the 8 major screens side by side.

## Why authenticated screens aren't here

This sandbox's `.env.local` points `NEXT_PUBLIC_SUPABASE_URL` at
`xyzcompany.supabase.co` — Supabase's own generic documentation placeholder,
not a real project. The environment's outbound network policy actively
rejects connections to it. That means **no working backend exists in this
environment at all** — not "a production backend we chose not to touch," but
literally no reachable Supabase instance, real or otherwise. Signing in
couldn't succeed here even with real credentials; every attempt fails at the
network layer.

No demo/seed/test-account mechanism exists anywhere in this codebase (checked:
no `supabase/` local-dev config, no seed script, no demo-mode flag) to
substitute. So the dashboard, property list, an individual property, Property
Details, Maintenance, Tenant Connect, PropCrew, Tax Center, the profile menu,
Billing, and the Admin dashboard — all the real signed-in screens — could
**not** be captured, and nothing was faked in their place.

What *could* be captured, and turned out to be genuinely informative: every
protected route's **sign-in gate** is real, shipped UI (not a placeholder),
and it renders correctly. Three representative gates are included below.

## Walkthrough

| # | File | Screen | Real feature or gate? |
|---|------|--------|------------------------|
| 1 | `01-landing-hero-393x852.png` | Landing page | Real — public marketing/entry point |
| 2 | `02-signin-modal-393x852.png` | Sign-in modal (clicked "Log In") | Real — this **is** the actual login screen |
| 3 | `03-forgot-password-panel-393x852.png` | Forgot-password panel | Real — opened from the sign-in modal |
| 4 | `04-create-account-panel-393x852.png` | Create-account panel | Real — opened from the sign-in modal, includes the landlord/tenant role toggle |
| 5 | `05-pricing-393x852.png` | Pricing | Real — public |
| 6 | `06-terms-393x852.png` | Terms of Service | Real — public |
| 7 | `07-privacy-393x852.png` | Privacy Policy | Real — public |
| 8 | `08-investment-tools-hub-393x852.png` | Investment Tools hub | Real — public tool-selection screen (not gated; only saving results requires sign-in) |
| 9 | `09-reset-password-393x852.png` | Reset-password page, no token | Real code path, but not representative of the real "set new password" form — that only renders after a genuine Supabase recovery-link click, which this environment can't generate. Shown honestly as "Checking your reset link…", not faked further. |
| 10 | `10-gate-generic-propcrew-393x852.png` | PropCrew, signed out | Real — the generic "Sign in required" guard used across most protected routes |
| 11 | `11-gate-billing-393x852.png` | Account & Billing, signed out | Real — its own worded gate |
| 12 | `12-gate-tenant-portal-393x852.png` | Tenant Connect portal, signed out | Real — tenants get their **own** dedicated sign-in form, separate from the landlord login shown in #2 |

`verify-*-375x812.png` / `verify-*-430x932.png` — the same landing hero,
sign-in modal, pricing, and PropCrew gate, re-shot at the two secondary
widths to confirm the layout holds up across the requested range.

**Interaction states captured:** modal opened (#2), a second panel opened
from inside that modal (#3, #4). **Not capturable:** mobile bottom navigation
(only renders for a signed-in session), a selected property, any modal/form
inside the authenticated workspace, empty vs. populated dashboard states —
all gated behind the same missing backend.

## Mobile UX problems observed (not fixed — for your review)

1. **The sign-in-gate screens (#10–#12) feel like a bare web form floating in
   space, not an app screen.** No header/logo chrome, no back affordance, and
   a large amount of empty space above and below a small centered card —
   most pronounced on the taller iPhone viewport. This is the single biggest
   thing undercutting the "feels like an app" goal, and it's hit by every
   protected route on first load before sign-in.
2. **The tenant portal sign-in (#12) is the most extreme case of #1** — the
   card is vertically centered with roughly 40% empty space above and below
   it and no visual branding beyond a small "PROPROSTER · TENANT" label.
3. **No visible "back" affordance on the gate screens.** "Go to sign in" /
   "Sign In" only moves forward; there's no way to return to the previous
   screen except a hardware/gesture back (which M3 does now handle) — but
   there's nothing *on screen* suggesting that's possible, which reads as a
   dead end.
4. **The modal panels (#2–#4) sit on top of the still-visible, still-scrollable
   marketing page behind them** rather than a fully own-screen presentation —
   functionally fine and not broken, but it's a distinctly "website modal"
   feel rather than a native-style sheet/screen transition.
5. Everything actually checked for technical mobile-web correctness —
   horizontal overflow, console errors, layout at 375/393/430px — came back
   clean. The problems here are about *feel*, not bugs.

## Report

See the accompanying message for the full numbered report (screens
captured, screens not captured and why, top 5 priority fixes before
TestFlight, and confirmations that no production data or CI credentials
were touched).
