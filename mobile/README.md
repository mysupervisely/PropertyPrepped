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
├── www/                      Placeholder index and bundled connection recovery screen
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

The current iOS icon and launch screens use the user-supplied green roof/list
logo (`IMG_6725.png`, supplied October 30, 2026). `assets/icon.png` preserves
the original 1024 by 1024 image. The bundled iOS icon is opaque at 1024 by
1024. `assets/splash.png` and `assets/splash-dark.png` center the supplied full PropRoster wordmark
on a white 2732 by 2732 canvas, with no redesign. All six referenced iOS
launch images use this artwork, including dark appearances.

Android Capacitor icon and splash assets have also been regenerated from
these sources. Hosted website branding and the separate Bubblewrap/TWA
Google Play workflow have not been changed. Android build/release verification
remains pending. Native rendering requires a new cloud
build; it has not yet been verified with the new logo.

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
shown a purchase flow inside PropRoster's own app chrome — a navigation behavior only. Browser handoff does not establish payment
policy compliance. Review current storefront-specific requirements before
distribution. Neither Apple IAP nor Google Play Billing is implemented.

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
6. The app boots straight to `https://proproster.com` and behaves like the live site — use a dedicated test account with fictional data.

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

## Connection recovery

The production config sets `server.errorPath` to the bundled
`www/connection-error.html`. Capacitor can show it when top-level web
navigation fails, including when the initial hosted page cannot load.
It has no external assets, scripts, plugins, credentials, or patient/tenant
data. Try again navigates to the fixed production URL; it does not clear
storage or retry writes. This does not detect HTTP error pages that load
successfully, failed API requests, or provide offline access to records.

Browser checks can validate layout and retry destination, but native
fallback triggering and session retention still require simulator/device
testing: cold-launch offline, reconnect and retry, resume after network
loss, and verify whether an interrupted save completed before resubmitting.

## Manual Android debug build

On branch `ios-readiness-v1`, Codemagic offers **PropRoster Android Debug APK
(Capacitor, test only)**. It installs the locked mobile dependencies, syncs
the existing Android project, compiles a debug APK, and runs Android lint.
The workflow publishes the APK and lint report as downloadable build artifacts.
It has no automatic trigger or Play Store publishing step.

This is a test build of the Capacitor shell, not the existing Bubblewrap/TWA
Google Play release. Do not upload it to Play Console or replace an existing
installation that uses a different signing certificate. Android debug signing
uses the runner's test key; do not assume it stays the same between builds.
Use a separate test device/profile or emulator and fictional records.

Building this APK does not deploy or rebuild the hosted Next.js website and
does not require a Netlify deployment. It still loads the live production site;
hosting availability and undeployed website fixes remain separate concerns.

First cloud execution is pending. A passing compilation/lint result would not
verify launch, login, uploads, back navigation, keyboard behavior, the new logo,
or store acceptance. Those need emulator/device checks. The local execution
environment was unavailable when this workflow was added, so no Android build
or lint pass is claimed.

### APK packaging evidence

The Android debug workflow also runs `mobile/scripts/verify-debug-apk.py`.
It checks ZIP integrity, required Android entries, the bundled Capacitor
identity and fixed production URL, exact recovery HTML bytes, absence of
diagnostic start paths, and presence of launcher resource files. It writes
`android-build-evidence/apk-packaging.json` with the APK SHA-256 checksum
and check scope. A packaging failure fails the workflow.

Launcher resource presence does not verify the artwork visually. This script
does not parse the compiled manifest or verify the APK signature, launch,
authentication, uploads, back navigation, keyboard behavior, or store readiness.
Its first execution is pending; source review is not a passing Android build.

Packaging verifier regression coverage: six local tests pass using synthetic
ZIP fixtures. They cover the valid fixture, HTTP/localhost rejection, diagnostic
and navigation overrides, wrong identity, stale recovery HTML, missing DEX,
and missing launcher resources. The Android workflow runs these checks before
installing dependencies. Codemagic YAML parsing and existing five simulator
runner tests also pass. These are not a compiled APK or emulator run.

## Android emulator screenshot workflow

The uploaded first Android debug APK matched the packaging report checksum
(f2de88ee854aa09a49787739113bce0b28d7589ecc56c7c66043f6e7ae8ea287),
contained the supplied launcher/splash artwork and exact recovery HTML, and
had an Android Debug certificate in its v2 signing block. This was certificate
inspection, not full cryptographic signature verification. Lint reported 29
warnings and zero errors. No app launch was performed during artifact review.

**PropRoster Android Emulator Screenshots (test only)** is a separate manual
Codemagic Linux X2 workflow. It builds the same Capacitor debug shell, runs the
packaging verifier, selects the preinstalled API 36 AVD (API 35 fallback),
installs and launches the APK, and captures screenshots after 10 and 30 seconds.
Artifacts include android-emulator-evidence, startup logs, crash log, and a
summary explicitly scoped to installation/foreground launch/capture. The AVD
is ephemeral and wiped before launch. No credentials, account creation, login,
upload, Play Store publication, or hosted deployment is performed.

Linux is required because Codemagic Mac M2 runners cannot run Android emulators.
First cloud execution remains pending. Syntax, AVD selection and workflow
isolation checks pass locally; screenshots must be inspected to establish
what actually rendered. The native shell still loads the production website,
so unmerged hosted branding and viewport changes will not appear in it.

### Codemagic Linux plan restriction and GitHub fallback

The emulator workflow could not start because this Codemagic account's plan
does not include the selected Linux instance. This is not an APK compilation
or app runtime failure. The successful Mac M2 APK/lint workflow remains valid.

`.github/workflows/android-emulator-smoke.yml` provides a standard GitHub-hosted
Ubuntu 24.04 alternative for this public repository. It runs on PR changes to
that workflow or the emulator smoke script (restricted to ios-readiness-v1),
or manually after the workflow is available on the default branch. It uses
Java 21, the same mobile build/packaging checks, and an API 36 Google APIs AVD.
The job uses a read-only repository token, no secrets or publishing credentials,
a 25-minute timeout, and three-day artifact retention. KVM access is limited to
the ephemeral job user. Screenshot evidence remains pending until it runs.
