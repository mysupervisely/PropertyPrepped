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

## Authentication form reliability follow-up

The shared hosted landing form now reports missing/malformed email and short
password entries instead of silently returning. Sign-in, signup and reset
share a synchronous submission lock. Unexpected request rejections route to
a safe error message, and a finally block always releases the lock and busy
state. No automatic retries, alternate auth providers, or authentication
bypasses were introduced. Password-reset confirmation remains neutral.

The obsolete repository-root Capacitor config was removed because the
canonical project is under `mobile/`, and the obsolete file imported a CLI
package absent from the web app's dependencies, breaking root typechecking.

Validation: 141 focused tests passed; TypeScript passed; Next.js production
build passed. Broad suite: 3,052 passed and 3 failed. All three failures were
reproduced on a detached baseline checkout before these edits: two desktop
layout source assertions and one calendar-year calculation test. They are
not attributed to the authentication change and remain visible.

These hosted-form changes are committed for review only. Because the native
shell loads proproster.com, a native rebuild alone will not expose this new
form behavior. A separate reviewed web deployment is required. No deployment
or merge occurred, and the cloud UI suite still exercises the currently
deployed form. Successful real authentication and upload tests remain open.

## Baseline test cleanup and UTC period consistency

The three prior baseline failures are resolved. Property Intelligence now
uses UTC for the year-completion gate, matching its existing UTC `asOf`
date. Previously a New Year boundary could label a snapshot annual while
its displayed date was still in the reviewed year. Added offset-boundary
and invalid-date cases. This defines snapshot consistency; it does not
claim jurisdiction-specific tax treatment or change recorded transactions.

The two desktop tests now reflect the existing Activity & notes heading
and distinguish the single base Quick Actions CSS rule from its scoped
desktop spacing override. No dashboard layout was changed.

Validation: all 181 test files / 3,057 tests passed, TypeScript passed, and
all 53 calculation tests passed independently in UTC, America/New_York,
and Asia/Seoul. No merge or production deployment occurred.

## Password-recovery resilience

Reset-link checking now distinguishes confirmed missing/expired sessions from
transport errors and stalled requests. A ten-second deadline exposes a retry
screen instead of leaving the visitor on Checking your reset link indefinitely.
The existing grace period for a PASSWORD_RECOVERY event is preserved. Cleanup
removes the auth listener and timers, and ignores stale responses after leaving
the page or retrying. Supabase remains the source of session validity; no local
authentication bypass was added.

Password submission now uses the existing synchronous request lock and finally
cleanup. A rejected update no longer leaves Updating stuck. Password-update
success is retained even if the following sign-out fails, and that failure is
disclosed on the completion screen rather than being mistaken for a failed
password update.

Validation: 182 files / 3,064 tests passed; TypeScript and the Next.js production
build passed. Seven new recovery tests cover valid/missing sessions, recovery
events, returned/thrown transport errors, timeout/cleanup and late-response races.
React review checked effect cleanup, stable retry dependencies, labelled inputs,
alerts and real auth calls. No live reset email, password change or sign-out was
performed. These hosted changes remain undeployed on the review branch.
