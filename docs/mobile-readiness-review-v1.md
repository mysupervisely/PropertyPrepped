# Mobile readiness review V1

## Implemented

Added a bundled connection recovery page via Capacitor `server.errorPath`. The screen needs no network assets and provides a fixed HTTPS retry link. It does not clear sessions, store account data, or retry writes. It handles native navigation failures, not successful HTTP error responses or failures inside an already-loaded page.

## Source review

- Auth: Supabase persistence and token refresh are enabled. This is configuration evidence, not proof of session survival on a device. No auth bypass or new session storage was added.
- Navigation: native back handling follows the existing history decision helper; external navigation follows Capacitor's native handler. Modal dismissal and return from browser-based flows still need device verification.
- Uploads: existing image/file inputs and durable-byte helpers are present. Focused upload tests passed. This does not establish camera/picker permission behavior, cancellation, or success on a physical iPhone.
- Layout: existing safe-area CSS is present. Keyboard overlap and landscape behavior still require device checks.
- Recovery: checked the installed Capacitor 8.5.2 iOS failure handlers and current official config reference, https://capacitorjs.com/docs/config . Both support a local error path. Retry returns to the configured production host.

## Validation

- `npm run ios:verify`: passed.
- `cd mobile && npx cap sync ios`: passed.
- Generated iOS config and public assets contain the recovery page; fixed retry target and lack of remote assets/scripts checked.
- Focused Vitest run: 10 files, 127 tests passed (mobile, auth, uploads, existing mobile auth/layout wiring).
- Browser layout verification attempted but unavailable: Chromium executable absent; download returned invalid archives. No visual pass claimed.
- No new Xcode compilation, simulator launch, device run, production login, or real-data upload performed.

## Device acceptance checks

Use fictional data and a dedicated test account:

1. Cold launch offline, confirm recovery screen, reconnect, tap Try again.
2. Sign in, background/resume, relaunch, verify persistence, then explicitly log out.
3. Navigate forward/back and open/close modals without losing unsaved input unexpectedly.
4. Select/cancel photos and PDFs, try camera capture, verify uploaded content, then retry an interrupted upload only after checking whether it completed.
5. Open forms with the keyboard at small widths and rotate the device.
6. Test Tenant Connect requests, PropCrew actions, and Tax Center receipt entry.
7. Verify external links and return from browser flows.

Apple membership and signing remain external blockers for TestFlight. Website availability remains a dependency of the remote shell. No production deployment or store submission was made.

## Subsequent batch

Cloud evidence supplied by the user confirms three authentication-entry UI
tests passed with zero failures after native switch selector corrections.
Successful login and uploads remain untested. New logo assets, candidate
keyboard safe-area adjustment, camera-purpose description, TestFlight signing
configuration, and isolated offline capture were prepared afterward. These
new changes have local source/package checks only until another cloud run.
Android Capacitor branding assets were regenerated, but the existing separate
Bubblewrap/TWA distribution path was not replaced or validated.
