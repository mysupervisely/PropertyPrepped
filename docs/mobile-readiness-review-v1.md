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

## Latest combined cloud evidence and follow-up

The user supplied `PropertyPrepped_3_artifacts 2.zip`. Login/password visibility
and reset navigation passed, but Start Free did not open signup after its tap:
the final screenshot remains on the homepage, with no role controls in the
accessibility tree. This is an activation failure, not another button/switch
selector mismatch. Its underlying cause remains unconfirmed. The test now
waits for a hittable CTA and captures evidence immediately before the single
tap; no retries or weakened assertions were added.

The keyboard-visible screenshot confirms the native `contentInset: automatic`
candidate did not resolve status-bar overlap. That setting was reverted. The
hosted auth overlay now binds its top/height to VisualViewport offset/height
and scrolls its content within the available area. The binding removes event
listeners and temporary dimensions on close. Four new tests cover resize,
scroll, cleanup, invalid heights, overscroll and missing-API fallback.
Actual visual correction still requires web deployment and device verification.

Installed-icon evidence showed placeholders for all SpringBoard icons, so it
does not verify the logo's appearance. A short rendering wait was added before
that capture. The connection-recovery capture was skipped after the UI failure;
it now runs before the UI suite so it can provide independent evidence.

Local follow-up: all 183 files / 3,068 tests and TypeScript pass. No successful
signup activation, fixed keyboard layout, verified new icon, or offline screen
pass is claimed from this failed cloud run. Nothing has been deployed.

## Reinspection of failed signup activation

Inspected the exported test recording and synthesized tap event. Around the
failed tap, the hero content was not yet visibly rendered, then appeared in
the next sampled video frame. The tap event targeted point (210, 437) on a
420 by 912 simulator. This supports a startup/rendering timing explanation;
it does not establish the exact browser/React event cause.

The UI suite now establishes hosted-app interactivity by opening and closing
Log In in setup before testing each flow. This uses real UI responses, not
a fixed startup sleep, a retry of Start Free, or a weaker signup assertion.
A single Start Free tap must still open signup after readiness. First-tap
behavior during initial rendering remains a separate product acceptance item.
The keyboard layout change still needs deployment before its cloud verification.

## Recovery diagnostic correction

The fourth supplied build passed all three auth-entry UI tests. Its recovery
screenshot was blank, and SpringBoard icons remained placeholders. These do
not verify recovery or branding. Live keyboard overlap still needs the pending
hosted viewport change deployed.

The isolated recovery harness previously used WebKit-restricted port 1. It now
reserves a non-listening ephemeral loopback port, first captures the bundled
recovery page directly using server.appStartPath, then captures navigation
failure at 10 and 30 seconds with app console logs. Original app restoration
remains in finally. This corrects diagnostics, not a proven production fix.
Simulator execution and visual inspection are still required on macOS.

## Independent simulator checks

The UI workflow now runs recovery and auth checks through one bounded runner.
A recovery diagnostic failure no longer skips auth testing. Either failure
still fails the build; no errors are suppressed. Five local regression checks
cover success, recovery failure, auth failure, timeout, and launch failure.
Recovery capture also rejects an app console process that has already exited,
including exit zero, instead of accepting a screenshot of a stopped app.
These checks validate orchestration only, not iOS rendering or authenticated use.

## Auth dialog keyboard focus

The hosted auth dialog now focuses its heading on open, contains forward and
backward Tab navigation, redirects outside programmatic focus, and restores
the prior connected focus target on dismissal. Focusing the heading avoids
automatically opening a phone keyboard. Available controls are recalculated
when tabbing so sign-in/signup/reset modes and disabled fields stay current.
Five behavioral regression tests pass; the full suite now passes 184 files
and 3,073 tests, with TypeScript passing. Device and assistive-technology
verification remains pending, and hosted deployment is still required.

## Android emulator launch verified on GitHub

Codemagic Linux was blocked by the account plan. The standard GitHub-hosted
Ubuntu fallback succeeded after making ANDROID_AVD_HOME explicit during
creation and launch. Successful run:
https://github.com/mysupervisely/PropertyPrepped/actions/runs/41164503887
Source head: 5a50aa186145b3d0e500ab5921aae57f9dab5ff8.

APK compilation, lint, packaging verification, API 36 emulator installation,
and foreground launch passed. The activity launch reported Status: ok and
cold launch TotalTime 4009 ms. Both 10/30-second PNGs were captured; the
30-second image was visually inspected and shows the live PropRoster landing
page with Log In and Start Free. The captured crash log is empty.

This verifies installation and visible signed-out launch only, not successful
login, signup activation, uploads, keyboard behavior, back navigation, offline
recovery, signature cryptography, or store acceptance. The old header icon is
expected because production web branding remains undeployed. The three-day
GitHub artifact contains screenshots, launch/activity/emulator/crash logs,
packaging evidence, lint reports, and the debug APK. No Codemagic plan upgrade
was purchased, and no production merge or app-store publication occurred.

## Android auth-entry instrumentation added; acceptance still blocked

Added native AuthEntryTest instrumentation for opening login, reset, returning
to login, opening signup role choice, and closing to landing. It never enters
credentials, creates an account, requests a reset email, or uploads data. If
the real connection-recovery screen appears, it exercises Try again once and
requires landing to return. Screenshot evidence is stored in the debug app's
internal storage and collected with run-as. Original test assertions are kept
when diagnostic capture also fails. Both app and instrumentation APKs compile.

The expanded cloud checks have NOT passed. Run 41195769790 showed the bundled
Android recovery screen and failed to find Log In. Later runs encountered
emulator/ADB failures, an unavailable CLI hierarchy dump, and a test evidence
path issue. The CLI approach was replaced with native instrumentation; the
evidence path and target activity startup were corrected. Subsequent API 36
instrumentation lost device connectivity. API 35 with a compact display also
failed screenshot capture before auth assertions (run 41198301099). These
failures do not establish successful form behavior or successful retry.

The earlier API 36 install/visible landing launch remains independently
verified by run 41164503887. Current workflow uses API 35 and the pinned maintained emulator runner
with its default software graphics settings. These are test-runner settings,
not production-app changes. Form navigation, keyboard, account activation,
authenticated login, and uploads remain pending. No production deployment,
store submission, or paid runner upgrade occurred. Do not keep rerunning the
same cloud job without addressing the device/screenshot failure evidence.


## Maintained Android runner follow-up

Run 41199027544 at a5ced304 built the debug app and instrumentation APKs and
passed packaging and lint tasks. The workflow now uses the pinned
reactivecircus/android-emulator-runner action and Gradle connected tests rather
than the custom emulator lifecycle for GitHub. Four local runner fixtures
passed: successful report/screenshots, preserved test failure, missing JUnit
report, and missing screenshots. These fixtures are not device acceptance.

The cloud emulator booted, started AuthEntryTest, then disappeared. The JUnit
report has one failure with no assertion detail and reports device
'emulator-5554' not found and an incomplete run. All four required auth
screenshots are missing. This is a failed, inconclusive device run, not proof
that the forms pass or that an application assertion caused the disconnection.
The runner preserves failure and uploads Gradle reports and available logs;
it cannot accept missing reports or screenshots as success. The underlying
emulator termination cause is unresolved. No unchanged retry was launched.

Review run: https://github.com/mysupervisely/PropertyPrepped/actions/runs/41199027544


## Android graphics isolation after resource diagnostics

Run 41224533416 at 7132308e passed compilation, lint, packaging and six runner
fixtures, but lost the emulator during AuthEntryTest. Its JUnit failure has no
usable assertion detail; required form screenshots are absent. Host diagnostics
show no recorded out-of-memory kill, 79 GB free disk and 14.9 GB available RAM
after termination. This does not establish peak memory use or the exit cause.

The maintained runner now explicitly uses SwiftShader with Vulkan disabled,
following https://developer.android.com/studio/run/emulator-troubleshooting .
This isolates a graphics compatibility possibility, not a proven root cause.
The API level, test assertions, evidence requirements and app remain unchanged.
A new cloud result is required before claiming any Android auth-entry pass.


## Bundled recovery branding

Added a self-contained inline vector version of the supplied green roof/list
mark beside PropRoster on the connection-recovery screen. A white tile keeps
the green mark visible in light and dark appearance. The mark is decorative
and hidden from accessibility, with the adjacent brand text retained. No
external assets, scripts, network probes or automatic retries were introduced.
The fixed HTTPS retry destination and existing recovery guidance are unchanged.
HTML/SVG structure and the self-contained recovery constraints were checked
locally. Visual verification on an installed native build remains pending.

The graphics isolation run 41226223537 also lost its emulator and produced no
usable auth-entry screenshots. Disabling Vulkan did not resolve the observed
disconnect; its cause and Android auth-entry acceptance remain unresolved.
No production deployment or store publication occurred.


## Receipt cleanup error handling

When Storage upload succeeds but the receipt row insert returns an error or
no ID, cleanup now remains best effort even if removeFile rejects. The helper
returns the original row-save error (or its existing safe fallback) instead
of rejecting with a secondary cleanup exception. No automatic upload retry,
new storage path, schema change, or auth change was introduced. A failed
cleanup can still leave an orphaned file; this change does not claim removal
succeeded. Thrown/ambiguous insert outcomes remain outside this narrow fix.

Validation: all eight upload-receipt Vitest tests passed, including two new
regressions covering cleanup rejection. Four additional Node behavioral
checks passed against the helper with only its relative import adjusted for
Node resolution. Full application tests/build were not rerun for this batch.
No actual receipt or user data was uploaded, and nothing was deployed.
Apple enrollment remains pending according to the user's latest update.


## Uncertain receipt request outcomes

Unexpected upload and insert rejections now return actionable failure results
rather than escaping the receipt helper. Both advise checking Documents before
uploading again. No automatic retry occurs. If an insert throws, its commit
outcome is unknown, so the uploaded object is retained rather than risking a
saved record pointing to a deleted file. Explicit returned insert errors still
use the existing best-effort cleanup. This does not provide transactional or
idempotent upload guarantees; uncertain outcomes can require manual review.

All ten focused receipt tests passed, including Storage rejection and a
simulated committed insert whose response was lost. No live service requests,
production deployment, full application build, or device verification were
performed for this batch. Apple enrollment remains pending.


## Property custom-item save recovery

PropertyTaxPanel's custom-item save now uses catch/finally so a rejected
picker-byte read or unexpected save request releases the Saving state and
keeps the form/draft open. Unexpected outcomes advise checking existing items
and Documents before trying again. Receipt-result messaging no longer claims
an uncertain upload definitively failed. No automatic retry or write change
was added. This does not prevent duplicate writes after a manual retry of an
uncertain outcome and does not cover a request that never settles.

Validation: TSX syntax transform passed; two focused files / eleven tests
passed. The new test executes the actual extracted save handler with fake
adapters for failed read, uncertain save, and successful save. This is handler
isolation, not mounted React, browser, live Supabase, full build or device QA.
Apple is still pending. Changes remain in review and undeployed.


## Combined validation after receipt and custom-item fixes

Validated review head afd0a3ff60426f4b8c67340cce81527bf3937ecd in a fresh
checkout using npm ci and the committed lockfile on October 31, 2026.

- Full Vitest suite: 185 files, 3,078 tests passed.
- npx tsc --noEmit: passed.
- npm run build: passed with Next.js 16.4.3, including 51 prerendered pages.
- npm run ios:verify: passed canonical source identity/project/workflow checks.
- Working tree stayed clean after validation.

These checks cover the combined source, not actual authentication, real
receipt uploads, camera/picker behavior, device rendering, session persistence,
release signatures, or store acceptance. Android auth-entry emulator testing
remains unresolved. Apple enrollment is still pending per the user. Hosted
changes remain undeployed on the review branch; no merge or store submission
was performed. Next useful acceptance work is preview/browser validation with
fictional data and a dedicated test account, then native device verification.


## Mobile property-row space use

Mobile property rows now place existing rent and status/value in two columns,
with the second detail aligned right. Rent/Documents actions align with the
right edge below the existing attention message. Photo, title, city, occupancy
labels, values and action handlers are unchanged; desktop styles are unchanged.
Both stat columns can shrink and wrap long values. No new data is fabricated.

Production build passed. Visual browser checking was attempted, but Chromium
installation returned invalid ZIP downloads; no screenshot/overflow or device
pass is claimed. Mobile preview at narrow widths and enlarged text remains
required before deployment. This CSS-only change is committed for review and
is not yet visible on production.


## Mobile row touch targets and isolated browser verification

Rent/Documents controls now have mobile minimum dimensions of 44 by 44 CSS
pixels with compact 12px labels. This retains existing click handlers and
right alignment. Desktop controls are unchanged.

A separate local Chromium setup allowed isolated layout verification using
the complete application CSS and representative property-row HTML with
fictional data and placeholder photos. Widths 320, 375, 393, 430, 760 and
1024 had no horizontal page overflow. Mobile action controls measured at
least 44 by 44 pixels. Cases included a long address/city and Partially paid
status. The 393px screenshot was visually inspected. This supersedes the
previous browser-install blocker for local isolated checks, but is not an
authenticated React app, real iPhone/Safari, enlarged-text, or device pass.
No deployment or store publication occurred.
