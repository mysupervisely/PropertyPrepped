# Android internal testing preparation

The existing Play app is PropRoster, package `com.proproster.app`; prior setup reports internal testers already configured. The Capacitor shell preserves this package. API 34/35 native auth-entry checks passed in [run 41317054836](https://github.com/mysupervisely/PropertyPrepped/actions/runs/41317054836). This does not prove credentialed sign-in, uploads, purchases or Play acceptance.

## Build workflows

- GitHub **Android Release Bundle Readiness** compiles an explicitly unsigned release bundle, runs release lint and checks production-shell packaging. Only reports are downloadable. It uses no signing secrets and does not upload to Play.
- Codemagic **PropRoster Android Signed AAB (internal testing preparation)** is manual. It requires the real upload key and explicit version settings, builds a signed `.aab`, checks its JAR signature and upload-certificate fingerprint, and exposes the bundle and verification report as artifacts. It has no store-publishing step or automatic trigger.

## One-time signing setup

In Play Console, open the existing PropRoster app and its App integrity / App signing page. Use the **upload key certificate** SHA-256, not the app signing certificate. Check the highest version code already used across all tracks. If this listing has no previous uploads, use 0 for that maximum. Do not guess, replace a registered key or create another listing. If no upload certificate is registered yet, first establish the owner's backed-up upload key and enrollment before using the signed workflow.

In Codemagic Team settings > Code signing identities > Android keystores, add the existing upload keystore with reference **proproster_upload**, its alias and passwords. Preserve an independent secure backup. Do not send passwords or keystores through chat or commit them to GitHub.

Create an **android_release** environment group with:

| Name | Value |
| --- | --- |
| `PROPROSTER_UPLOAD_CERT_SHA256` | Expected upload certificate SHA-256, copied from the existing Play app |
| `PLAY_MAX_VERSION_CODE` | Highest version already used on Play, or 0 only when none exists |
| `PROPROSTER_VERSION_CODE` | New positive integer strictly greater than that maximum |

Start `android-play-internal-bundle` on branch `ios-readiness-v1`. No Play service-account credentials are needed because this workflow does not publish. Download `app-release.aab` and `bundle-verification.json` only after all steps pass. The report's version is the configured Gradle version; compiled-manifest acceptance remains part of Play import validation. Packaging checks do not establish storefront payment-policy compliance.

## Upload and internal release

1. Open the existing PropRoster app > Testing > Internal testing > Create new release.
2. Upload the verified signed `.aab`. Check the package, version code and certificate acceptance in Play Console.
3. Review declarations, store requirements, release notes and the existing tester list. Resolve Play errors based on the actual console messages. Internal testing is separate from production launch.
4. Review the concrete internal-release details before rollout. Copy its opt-in link after Play makes it available.
5. Test installation/update, real sign-in and reset delivery, account privacy, property and move-in/out photo/video uploads, reconnect/resume, back navigation and keyboard behavior. Use fictional records for testing.

Current status: workflow preparation only. No signed upload artifact, Google Play upload or internal rollout is claimed until actual execution and console acceptance are verified. The current connected tools cannot read Codemagic signing identities or Play Console state; account setup must be inspected in those services.

References: [Android app signing](https://developer.android.com/studio/publish/app-signing), [Codemagic Android signing](https://docs.codemagic.io/yaml-code-signing/signing-android/).
