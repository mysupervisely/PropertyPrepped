# PropRoster Mobile — Capacitor native shell

**This directory contains a native app SHELL, not a second application.**
It has no business logic, no screens, no API calls, and no Supabase
client of its own. It is a thin native wrapper (iOS + Android) around
the real, live PropRoster web application at **https://proproster.com**,
which remains the single source of truth for every screen, every API
route, every RLS/authorization check, and every byte of business logic.
See the Mobile Architecture & Readiness Audit (M1) for the full
reasoning behind this approach.

## What's here

```
mobile/
├── package.json              Capacitor CLI + platform packages only
├── capacitor.config.ts       PRODUCTION config (https://proproster.com) — the default
├── capacitor.config.dev.json DEV-ONLY config — never used unless explicitly passed
├── assets/                   Source icon/splash art (see "Branding" below)
├── www/                      Placeholder only — never actually shown (server.url wins)
├── ios/                      Generated Xcode project (com.proproster.app)
└── android/                  Generated Android Studio project (com.proproster.app)
```

No Turborepo, Nx, or workspace tooling — this is deliberately a plain,
standalone npm package. The repository root's Next.js app is untouched
and knows nothing about this directory.

## Production vs. development URL — read this before running `cap` commands

- **`capacitor.config.ts`** is the default used by every `cap` command
  (`sync`, `add`, `open`, `build`, ...) unless told otherwise. It is
  hard-coded to `https://proproster.com` — no env var, no fallback, no
  conditional branch. This is what ships.
- **`capacitor.config.dev.json`** points at a local `next dev` server
  instead. It is **never** used by default — you must pass it
  explicitly: `npx cap sync --config capacitor.config.dev.json`. Edit
  the URL inside it for your own machine first (see the file's own
  `$note2`).
- Never add a third config, an env-var override, or a conditional in
  `capacitor.config.ts` that could make a non-production URL load in a
  build you didn't explicitly ask for.

## App identity

- **Display name:** PropRoster
- **Bundle / application identifier:** `com.proproster.app` (iOS
  `PRODUCT_BUNDLE_IDENTIFIER` and Android `applicationId`/`namespace`).
  No prior convention existed anywhere in the repository; this was
  chosen per the M1 audit's recommendation. Treat this as permanent
  once App Store/Play Store distribution begins — changing it later
  means a new app listing, not an update.

## Branding / icons / splash

Source art lives in `mobile/assets/` (`icon.png`, 1024×1024;
`splash.png`, 2732×2732), generated from the **existing, unmodified**
PropRoster brand mark at `public/icons/icon-512.png` (the same art the
web app's PWA manifest already uses) — a resolution-only upscale for
the icon, and the same unmodified logo centered on a plain canvas using
the web manifest's own `background_color` (`#f5f7f9`) for the splash.
**The logo itself was never redrawn, cropped, or altered.**

Native icons/splash screens for both platforms were generated from
these via `@capacitor/assets` (`npm run assets`, from `mobile/`) and
are already wired into both native projects (verified: iOS
`LaunchScreen.storyboard` references the generated `Splash` image set;
Android's launch theme references `@drawable/splash`).

**Known quality caveat, disclosed rather than hidden:** the source art
is only 512×512 natively; 1024×1024/2732×2732 versions used here are a
clean upscale, not new detail. Apple's App Store listing icon
requirement (1024×1024, no alpha) will accept this, but a true
higher-resolution source from a designer would look sharper — worth
doing before M13 submission, not required to keep testing/iterating
now. Separately, Android's *adaptive* icon foreground layer was
generated from the same full-bleed flat image (it has no transparent
margin, since the source has no alpha channel) — on some Android
launchers' circular/squircle masks this may crop a bit tighter than
ideal. This is a real, known limitation of reusing the existing flat
PWA icon as-is rather than a redesign; fixing it means asking for a
transparent-background version of the mark, which we're explicitly not
doing in M2 ("do not redesign the PropRoster logo").

## Billing safety — no code change needed, verified from source

`startCheckout`/`openBillingPortal` (`lib/billing/client.ts` in the web
app) navigate the top-level page to Stripe-hosted URLs
(`checkout.stripe.com`, `billing.stripe.com`) via
`window.location.href`. Inside this shell, that is **not** loaded in
the app's own WebView.

This was verified by reading the actual installed Capacitor native
source (not assumed from documentation):

- **iOS** — `WebViewDelegationHandler.swift`'s `decidePolicyFor
  navigationAction`: any top-level navigation whose host isn't
  `proproster.com` and isn't in `allowNavigation` is cancelled in the
  WebView and handed to `UIApplication.shared.open(...)` — the system
  browser.
- **Android** — `Bridge.java`'s `launchIntent(...)`: the same check
  (`appUri.getHost().equals(url.getHost())` / `appAllowNavigationMask`)
  fires an `Intent.ACTION_VIEW` to the OS instead of loading the URL in
  the WebView.

`allowNavigation` is deliberately **not set** anywhere in
`capacitor.config.ts` — that omission *is* the safety mechanism. Do not
add `stripe.com`/`checkout.stripe.com`/`billing.stripe.com` to it. The
practical effect: a signed-in user tapping "Manage Subscription" or any
Checkout link inside the app is handed off to Safari/Chrome, never
shown a purchase flow inside PropRoster's own app chrome — the standard
low-risk posture for avoiding an App Store Guideline 3.1.1 rejection
without implementing Apple IAP or Google Play Billing (neither was
implemented; none of this is a new billing system).

This mechanism was confirmed by reading the native source, **not** by
running the app on a simulator/device/emulator — none were available in
this environment. Confirming it live is real M3 work.

## Known gaps flagged for M3/M4 (not fixed in M2 — scope stayed to the shell)

- **Android hardware/gesture back button** — resolved in M3. See
  `lib/mobile/backButton.ts` + `components/mobile/NativeBackButtonHandler.tsx`
  in the web app root: navigates history back when possible, exits the
  app only when there is nowhere left to go. Still not verified on a
  real Android device/emulator (none available in this environment).
- **Photo/file uploads**: the web app's existing `<input type="file">`
  based upload flows (Smart Upload, document/photo upload) should work
  through the native WebView's own built-in file-picker support on both
  platforms with no plugin — this is standard WKWebView/Android WebView
  behavior, not something this shell adds. It has **not** been
  device-tested. A dedicated `@capacitor/camera` integration (for a
  more native camera-first capture experience) is a reasonable M8
  enhancement, not required for a working upload flow.
- **Keyboard behavior over forms**: the web app already handles
  `env(safe-area-inset-*)` for notch/home-indicator safe areas (built
  for the existing PWA/home-screen-install experience), which should
  carry over unchanged since Capacitor's WebView is the same kind of
  edge-to-edge context. Keyboard-avoidance for fixed-position elements
  (the bottom nav, the header) needs real device verification — this
  codebase has hit real mobile keyboard/layout bugs before (see
  `docs/mobile-auth-layout-reliability-v1.md`), so this is flagged
  explicitly rather than assumed fine.
- **Splash-screen control**: native launch-screen assets are wired and
  correct (see above), but `@capacitor/splash-screen` (for an explicit
  "keep showing until the page is ready" transition) is not installed.
  Without it, there may be a brief blank/white moment between the native
  launch screen disappearing and the remote page finishing its first
  paint, especially on a slow connection. Worth adding in a future
  milestone; not a functional blocker.

## Local development (dev config only — never production)

```bash
cd mobile
npm install
npx cap sync --config capacitor.config.dev.json   # after editing the URL in that file for your machine
npx cap open ios       # requires Xcode, macOS only
npx cap open android   # requires Android Studio
```

## Getting this on your iPhone

### Path A — local Mac + Xcode (device build, no TestFlight)

Requires a Mac. None of this can be done from this Linux environment.

1. Install Xcode (App Store). CocoaPods is **not** needed — this project's Capacitor version uses Swift Package Manager for iOS plugin dependencies (confirmed: no `Podfile` anywhere in the generated project or the installed `@capacitor/ios`/`@capacitor/cli` packages); Xcode resolves the `CapApp-SPM` local package automatically when it opens the project.
2. Clone this branch, `cd mobile && npm install`.
3. `npx cap open ios` — opens `mobile/ios/App/App.xcodeproj` in Xcode (confirmed via the installed `@capacitor/cli` source: it opens the `.xcworkspace` only when CocoaPods is in use; this project's package manager is SPM, so it opens the `.xcodeproj` directly).
4. In Xcode: select the `App` target → *Signing & Capabilities* → choose your own (free) Apple ID team so it can sign a debug build. (A paid Apple Developer account is only needed for TestFlight/App Store — not for running on your own device.)
5. Plug in your iPhone, select it as the run destination, hit Run (▶). First launch will ask you to trust the developer certificate on the phone (Settings → General → VPN & Device Management).
6. The app boots straight to `https://proproster.com` and behaves like the live site — sign in with your real PropRoster account.

Android equivalent: install Android Studio, `npx cap open android`, connect a device with USB debugging enabled (or use an emulator), Run.

### Path B — cloud build → TestFlight (no local Mac/Xcode needed) — M4

See `codemagic.yaml` at the repository root. Codemagic was chosen over
Apple's own Xcode Cloud specifically because Xcode Cloud's *first*
workflow must be configured from inside the local Xcode app (Apple's
own documentation: "Use Xcode to initially configure your project...
to use Xcode Cloud") — not an option here. Codemagic builds entirely
from a YAML config on a cloud macOS runner and needs no local Xcode at
any point.

This requires, in order: an Apple Developer Program membership, the
`com.proproster.app` bundle ID registered, an App Store Connect app
record created, and a Codemagic account connected to this repository
with an App Store Connect API key added as an encrypted variable group
named `appstore_credentials` (`APP_STORE_CONNECT_ISSUER_ID`,
`APP_STORE_CONNECT_KEY_IDENTIFIER`, `APP_STORE_CONNECT_PRIVATE_KEY`) —
none of that is stored in this repository. See the M4 milestone report
for the exact one-at-a-time setup steps.
