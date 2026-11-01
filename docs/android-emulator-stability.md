# Android emulator validation status

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
