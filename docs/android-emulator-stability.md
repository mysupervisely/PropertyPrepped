# Android emulator validation status

Current result: Android 14 and 15 auth-entry jobs passed in run [41317054836](https://github.com/mysupervisely/PropertyPrepped/actions/runs/41317054836). Earlier findings below record the investigation; the verified result and acceptance limits are at the end.

The user reports the current review app works in their manual testing. This is accepted as user-reported shared-app testing, not proof of Android emulator or store readiness.

GitHub run 41305389143 attempts 1 and 2 built the APK and test APK and passed packaging checks. The API 35 emulator using binary 37.2.13 disconnected during the instrumentation run. Attempt 2 booted successfully, started one test, then produced a blank failure and device-not-found cleanup errors. No passing native result is claimed. Host diagnostics did not show an out-of-memory kill; the exact disconnect cause remains unproven.

The next run pins emulator 36.4.10 (build 15004761), as listed in Google's official emulator archive, for a controlled version comparison. It starts adb before emulator launch and captures live logcat before tests, retaining it even if the device later disappears. Tests and screenshot acceptance requirements remain unchanged. This pin is a test-infrastructure experiment, not an established fix or a change to the shipping app.

References:
- https://developer.android.com/studio/emulator_archive
- https://github.com/ReactiveCircus/android-emulator-runner/blob/a421e43855164a8197daf9d8d40fe71c6996bb0d/action.yml

The pinned 36.4.10 run (41307316721) also failed: the device disappeared during the native test. Live logs confirm the app activity and WebView started, but do not establish a specific app crash or a passing assertion. Version pinning alone did not fix the disconnect.

The next controlled comparison runs API 30 and API 35 independently, with fail-fast disabled and distinct diagnostic artifacts. This retains the failing modern Android check while testing whether the disconnect also reproduces on an older system image. An API 30 pass alone is not modern-Android or release acceptance. No assertions are relaxed.

API 30 produced a concrete auth-entry assertion failure, rather than a device-loss result: the WebView logged JavaScript parse errors for production Next.js chunks and could not expose Log In. API 35 still lost the device. The API 30 result is retained as a runtime compatibility finding, not a native authentication pass.

The native configuration now requires WebView 111, matching the hosted framework's documented browser baseline. Capacitor's installed Android Bridge routes below-minimum WebViews to server.errorPath; the bundled recovery page includes Android WebView/Chrome update guidance. APK packaging verifies that the baseline is present. This fallback still needs native verification.

The next auth matrix uses API 34 and 35, retaining modern Android coverage, and switches the software graphics backend from SwiftShader/gfxstream to swangle as a controlled emulator-stability experiment. Old Android with an updated WebView is not yet tested. No test assertions are relaxed and no native pass is claimed.

Run 41310244332: API 34 completed the native auth-entry test successfully (one test, zero assertion failures), but the workflow still failed because all required screenshots were missing during post-test collection. API 35 stayed connected and produced a specific assertion failure for Back to sign in. It is not a native pass. The swangle comparison therefore produced more actionable evidence than prior device-loss runs, but is not proof that all instability is fixed.

Gradle's default post-test APK cleanup can remove the private evidence directory before the runner's EXIT collector reads it. The test invocation now passes android.injected.androidTest.leaveApksInstalledAfterRun=true, documented by the Android Gradle team (https://issuetracker.google.com/issues/295039976). This retains the APK only in the wiped ephemeral emulator until evidence capture, without changing shipping app settings. Regression fixtures require that argument; missing screenshot/report checks remain mandatory. The next run must verify actual screenshot collection and inspect the API 35 final hierarchy before changing its assertion.

Run 41312912774: API 34 passed the complete job, including required screenshot collection. Its reset-screen screenshot shows Back to sign in visibly inside the modal. API 35 stayed connected but failed that accessible-element assertion. Its collected tar was truncated at 1,024 bytes with unexpected EOF, so the API 35 screenshot/hierarchy could not be inspected. The cause of the navigation failure remains unknown.

The collector now retrieves the hierarchy first and each screenshot independently, with bounded commands and atomic per-file completion. Empty or missing images still fail acceptance. The native test prints visibility, clickability and screen bounds at the failed assertion, and writes the final hierarchy before the final screenshot so diagnostics do not depend on image capture. No navigation assertions or platform coverage were removed.

Run 41316512274: API 34 passed again. API 35 reproduced Back to sign in failure, with full diagnostics now collected. Its final screenshot visibly shows the reset form and Back to sign in, while the accessibility tree retains the previous sign-in form's Password/Forgot password?/Sign in nodes. This is evidence of stale accessibility descendants; clearing the automation cache is the next targeted test correction, not yet a verified fix. UiAutomation.clearCache is public from API 34 (https://developer.android.com/reference/android/app/UiAutomation#clearCache()). The test now refreshes the tree for polling, waits for closed headings to disappear, and waits for UI idle before screenshots. All original navigation assertions remain.

Android exec-out also returned cat error text with host exit code zero for screenshots that were never reached. Screenshot acceptance now requires the PNG signature. Nine runner regressions cover missing, empty, stale and remote-error output, independent collection and preserved failure exits; seven packaging regressions also pass.

Verified result: run 41317054836 at source commit fe81202ca597a16d14e91ce58eba785405a959cd passed both native auth-entry jobs on API 34 and API 35. APK compilation, lint, packaging checks, the native login/reset/back/sign-up/close flow and mandatory screenshot collection passed. The API 35 reset and returned-to-landing screenshots were visually inspected; the reset button is visible and the final modal is closed. Sixteen local runner/packaging regressions passed.

This clears the reported auth-entry automation blocker. It is not credentialed sign-in, account creation, password-reset email delivery, file-upload, physical-device or app-store acceptance. No release was published; Apple enrollment is still user-reported pending. Evidence: https://github.com/mysupervisely/PropertyPrepped/actions/runs/41317054836
