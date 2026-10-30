# PropRoster mobile launch gate (iOS + Android)

Date: 2026-10-29. Status: **not ready for store submission**.

## Existing implementation (verified in repository)
- Next.js PWA manifest, 192/512 icons, standalone display, iOS home-screen metadata, install prompt and network-only service worker.
- Native Capacitor shell at `mobile/`, not repository root. Separate `ios/` and `android/` projects, brand assets and production config.
- App identifier: `com.proproster.app`; production URL: `https://proproster.com`.
- Native Android back-button handler exists; device behavior not yet validated.
- No proof of App Store Connect / Play Console app records, release signing, successful device testing or review approval.

## Safe next gates
- [ ] Run `cd mobile && npm ci && npm run test:readiness && npm run sync` and record actual output.
- [ ] Run root `npm ci && npm test && npm run build` on a CI runner; verify no regression.
- [ ] Test iOS with Xcode and Android with Android Studio on physical devices, including cold start, login/logout, session expiry, password reset, external links, documents, photo uploads, camera/file picker, notifications and back gestures.
- [ ] Verify status bar and safe areas, accessible touch targets, keyboard, landscape, slow network, no-network error, and crash/recovery behavior.
- [ ] Review Apple 4.2 minimum-functionality / web-wrapper risk. Do not assume a simple remote website wrapper will be accepted. Plan meaningful native capabilities if review requires them.
- [ ] Review Apple in-app purchase and Google Play Billing requirements for any subscriptions or digital services. Existing Stripe browser handoff is **not** proof of compliance. Do not submit until approved purchase flows are established.
- [ ] Audit account deletion, privacy policy, data-safety disclosures, permission prompts, third-party SDKs, tracking and support contact.
- [ ] Confirm Apple Developer and Google Play Console organization accounts and app identifier ownership.
- [ ] Configure signing/certificates/keystores securely outside Git; create TestFlight and Play internal testing builds.
- [ ] Conduct tester acceptance, prepare screenshots, listing descriptions and privacy declarations, then submit.

## Release policy
Do not merge changes to live web UX merely to prepare native shells. Do not upload to stores, claim a native build passed, or represent a remote URL wrapper as store-approved without actual verification. Never commit certificates, keystores, tokens or production secrets.

## Repeatable guard
Run `cd mobile && npm run test:readiness` to verify key native configuration and PWA invariants. This test is source-level only: it does **not** replace iOS/Android builds or app-store policy review.
