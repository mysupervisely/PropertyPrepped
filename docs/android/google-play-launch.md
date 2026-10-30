# PropRoster Android / Google Play launch - M1 audit

Status: in progress. This is an implementation checklist, not evidence that an Android bundle exists.

## Confirmed from main
- Next.js 16 web application hosted at proproster.com with Supabase authentication and data.
- PWA manifest at app/manifest.ts, linked in app/layout.tsx, with 192px and 512px icons.
- @capacitor/core and @capacitor/app are dependencies; NativeBackButtonHandler is mounted in app/layout.tsx.
- No root capacitor.config.ts or android/app/build.gradle was found at the checked paths. Native Android project and signed AAB have not been confirmed.
- Google Play Console app record has been created by account owner. Package name com.proproster.app is planned but must be checked in Play Console before finalizing.

## Architecture decision gate
Prefer assessing a Trusted Web Activity (TWA) for the existing hosted Next.js app before committing to Capacitor. A TWA needs Digital Asset Links association between the Android signing certificate and proproster.com. Capacitor instead requires an appropriate web content strategy, plugin lifecycle, and testing; do not assume a hosted Next.js app can be bundled as static assets without changes.

## Required next implementation milestones
1. Verify exact Google Play package identifier and signing strategy. Keep signing keys out of Git.
2. Audit authenticated mobile flows: sign-in/sign-out, redirects, cookies/session persistence, file uploads/downloads, deep links, external links, back gestures, permissions, and tenant/landlord role switching.
3. Choose TWA versus Capacitor based on those tests. Document tradeoffs and Play policy requirements.
4. Create Android project with matching package ID, icons, splash, release build configuration, and reproducible AAB generation instructions.
5. For TWA, obtain SHA-256 signing certificate fingerprint and deploy /.well-known/assetlinks.json with exact package and fingerprint; verify asset association. Never invent a fingerprint.
6. Test on physical Android device: install, sign-in, sign-out, payments, file picker, camera, notifications, back navigation, offline/poor network, and updates.
7. Complete Play Console listing, privacy policy, Data safety, content rating, app access instructions for review, screenshots, testing tracks, and other applicable declarations.
8. Upload signed AAB to internal testing first; verify install and review status before any public release.

## Guardrails
- No change to production web experience or Supabase schema during this audit.
- Do not add fake native permissions or claim push notifications work without implementation.
- Do not publish or upload a build automatically.
