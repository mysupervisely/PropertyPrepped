# Android internal testing preparation

The existing Play app is PropRoster, package `com.proproster.app`; prior setup reports internal testers already configured. The Capacitor shell preserves this package. API 34/35 native auth-entry checks passed in [run 41317054836](https://github.com/mysupervisely/PropertyPrepped/actions/runs/41317054836). This does not prove credentialed sign-in, uploads, purchases or Play acceptance.

## Build workflows

- GitHub **Android Release Bundle Readiness** compiles an explicitly unsigned release bundle, runs release lint and checks production-shell packaging. Only reports are downloadable. It uses no signing secrets and does not upload to Play.
- Codemagic **PropRoster Android Signed AAB (internal testing preparation)** is manual. It requires the real upload key and explicit version settings, builds a signed `.aab`, checks its JAR signature and upload-certificate fingerprint, and exposes the bundle and verification report as artifacts. It has no store-publishing step or automatic trigger.

## One-time signing setup

In Play Console, open the existing PropRoster app and its App integrity / App signing page. Use the **upload key certificate** SHA-256, not the app signing certificate. Check the highest version code already used across all tracks. If this listing has no previous uploads, use 0 for that maximum. Do not guess, replace a registered key or create another listing. If no upload certificate is registered and there are no uploaded bundles, use the owner's backed-up first upload key. Export that key's public certificate with keytool and pin its SHA-256 in PROPROSTER_UPLOAD_CERT_SHA256 before running the signed workflow. Google Play has not yet supplied an upload fingerprint in this first-upload case. The Google-managed app signing fingerprint is not the upload fingerprint. Keep the same pin for the subsequent bundle verification; no check is bypassed.

In Codemagic Team settings > Code signing identities > Android keystores, add the existing upload keystore with reference **proproster_upload**, its alias and passwords. Preserve an independent secure backup. Do not send passwords or keystores through chat or commit them to GitHub.

The signed workflow now includes its non-secret first-upload settings directly in YAML. No environment-variable group is required:

| Name | First-upload value |
| --- | --- |
| `PROPROSTER_UPLOAD_CERT_SHA256` | `8881A844D49C4344872F8366CC8A68825D7BA31D19A4206768BCB4B5B0E1D14D` |
| `PLAY_MAX_VERSION_CODE` | `0` |
| `PROPROSTER_VERSION_CODE` | `1` |

These values match the newly generated upload certificate, not the Google-managed app signing certificate. Update the two version values after a successful Play upload before building the next release. Keystore passwords stay in Codemagic Code signing identities and never in source control.

Start `android-play-internal-bundle` on branch `ios-readiness-v1`. No Play service-account credentials are needed because this workflow does not publish. Download `app-release.aab` and `bundle-verification.json` only after all steps pass. The report's version is the configured Gradle version; compiled-manifest acceptance remains part of Play import validation. Packaging checks do not establish storefront payment-policy compliance.

## Upload and internal release

1. Open the existing PropRoster app > Testing > Internal testing > Create new release.
2. Upload the verified signed `.aab`. Check the package, version code and certificate acceptance in Play Console.
3. Review declarations, store requirements, release notes and the existing tester list. Resolve Play errors based on the actual console messages. Internal testing is separate from production launch.
4. Review the concrete internal-release details before rollout. Copy its opt-in link after Play makes it available.
5. Test installation/update, real sign-in and reset delivery, account privacy, property and move-in/out photo/video uploads, reconnect/resume, back navigation and keyboard behavior. Use fictional records for testing.

Current status: workflow preparation only. No signed upload artifact, Google Play upload or internal rollout is claimed until actual execution and console acceptance are verified. The current connected tools cannot read Codemagic signing identities or Play Console state; account setup must be inspected in those services.

References: [Android app signing](https://developer.android.com/studio/publish/app-signing), [Codemagic Android signing](https://docs.codemagic.io/yaml-code-signing/signing-android/).

## Console evidence supplied November 1, 2026

The user reached the existing PropRoster app under their personal Google account; proprosterteam@gmail.com showed registration instead. Protected with Play lists com.proproster.app with Play App Signing enabled. The supplied A3:54:4A:8A:A6:C0:56:67:D3:E1:38:0E:ED:C9:D5:85:2D:DA:FA:F0:D6:EA:18:B0:13:CC:2A:37:93:F3:45:91 fingerprint is an app signing certificate, not verified as an upload certificate. The internal track is inactive, its draft has no attached bundle, and Add from library reports No app bundles. No upload key has been located or changed. Next: inspect Codemagic Android keystores and establish the owner's backed-up upload key before signed execution. Do not assume the app signing key can sign our upload.

Release readiness run [41318110110](https://github.com/mysupervisely/PropertyPrepped/actions/runs/41318110110) passed unsigned release compilation, release lint and production-shell bundle packaging. The cloud JDK regression verified a temporary fixture signature and rejected an incorrect certificate and unsigned additions. This is not a real signed upload candidate or Play acceptance.

The user supplied a Codemagic screenshot showing reference proproster_upload successfully saved, common name/issuer PropRoster Android Upload, expiration March 19, 2054. The generated key was independently verified locally as a private-key entry under alias upload. The encrypted keystore and private setup instructions were saved for the owner; neither was committed to GitHub. The setup instructions' former android_release group is now superseded by the public YAML settings above. Actual Codemagic signed execution and Google Play import remain unverified.
