# Android emulator validation status

The user reports the current review app works in their manual testing. This is accepted as user-reported shared-app testing, not proof of Android emulator or store readiness.

GitHub run 41305389143 attempts 1 and 2 built the APK and test APK and passed packaging checks. The API 35 emulator using binary 37.2.13 disconnected during the instrumentation run. Attempt 2 booted successfully, started one test, then produced a blank failure and device-not-found cleanup errors. No passing native result is claimed. Host diagnostics did not show an out-of-memory kill; the exact disconnect cause remains unproven.

The next run pins emulator 36.4.10 (build 15004761), as listed in Google's official emulator archive, for a controlled version comparison. It starts adb before emulator launch and captures live logcat before tests, retaining it even if the device later disappears. Tests and screenshot acceptance requirements remain unchanged. This pin is a test-infrastructure experiment, not an established fix or a change to the shipping app.

References:
- https://developer.android.com/studio/emulator_archive
- https://github.com/ReactiveCircus/android-emulator-runner/blob/a421e43855164a8197daf9d8d40fe71c6996bb0d/action.yml
