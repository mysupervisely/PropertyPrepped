# PropRoster iOS development entrypoint

**Canonical native project:** `mobile/ios/App/App.xcodeproj`.
**Canonical Capacitor configuration:** `mobile/capacitor.config.ts`.
**Cloud build configuration:** repository-root `codemagic.yaml`.

The native project, icon/splash assets, mobile npm dependencies, and a Codemagic TestFlight workflow already exist. Do not run `npx cap add ios` at repository root or create a second iOS project. The root-level `capacitor.config.ts` on this experimental branch is superseded by `mobile/capacitor.config.ts` and must not be used for builds.

## Current status and next steps

Unsigned simulator compilation succeeded in Codemagic at commit `861ac81`. Runtime behavior is not yet verified. Run `npm run ios:verify` at repository root to check the canonical mobile project references.

Both workflows use Node 22 and the mobile lockfile now supplies TypeScript for Capacitor config parsing. Root web dependencies are unnecessary for compiling this hosted shell.

Apple organization verification and membership activation remain pending. After activation, register the bundle ID and App Store Connect app, then configure distribution certificates and provisioning profiles in Codemagic. The TestFlight workflow now selects uploaded App Store signing identities and applies their profiles. Those identities still need to be configured in Codemagic; publishing API credentials alone do not sign an app.

Before distribution, test login/session persistence, navigation, external links, uploads, keyboard/safe areas, Tenant Connect, PropCrew, and Tax Center with fictional data. Test cold launch without internet and hosted-site failure: a bundled recovery page is configured, but native triggering remains untested. A working native build does not guarantee that the hosted website is available.

## Release gates

Before App Store distribution, validate login/session handling, native navigation, camera/document uploads, Tenant Connect, PropCrew, Tax Center, privacy declarations, and App Store review requirements. In particular, a remote website shell may face Apple's minimum functionality review. Stripe-hosted checkout and digital-service payments require an App Store policy assessment, not merely browser handoff.

Do not put signing keys, API keys, or user data in source control.

## Cloud launch evidence

The unsigned workflow now runs `ios/scripts/simulator-smoke.py` after
compilation. It selects an available iPhone, boots with a bounded wait,
installs and launches the app, then captures screenshots at 15 and 30
seconds. Download `ios-simulator-evidence` artifacts and inspect both PNGs.
A successful job proves these commands completed, not that the website
loaded or any signed-in flow works. The runner uses no login credentials.

Run manually in Codemagic: branch `ios-readiness-v1`, workflow
`PropRoster iOS Simulator (unsigned)`. This needs simulator availability
and Codemagic build minutes, but no Apple signing membership or App Preview
team feature. If booting fails, review `summary.json` and device inventory.

## Native authentication-entry UI tests

A separate manual workflow, **PropRoster iOS UI Tests (unsigned)**
(`ios-ui-tests`), builds the same app and runs `AppUITests` through
Xcode's UI automation. Use branch `ios-readiness-v1`.

The three tests exercise login field entry/password visibility, Start Free
and closing the form, and reset-password navigation. Fictional credentials
are typed but never submitted. No account is created, no reset email is sent,
and no successful login or upload is claimed. Tests observe the hosted page,
so deployed UI changes and hosting availability can affect results.

The artifacts include `ui-tests.log`, exported `ui-attachments` (when supported), and `AuthEntry.xcresult` with screenshots
and accessibility trees. These results must come from a cloud run: local YAML,
project parsing and Python checks do not compile or execute Swift UI tests.
Signed-in tests need a dedicated test account and a separately authorized
fictional-data workflow. Never commit credentials or use a real tenant account.

## First UI run findings

The first cloud UI run compiled the test runner and executed all three tests.
Reset-password navigation passed. Login field entry reached the password
toggle, and Start Free opened the signup form, but those tests targeted
`aria-pressed` web controls as native buttons. The captured accessibility
trees expose them as `Switch` elements. Tests now use switch queries,
without removing assertions or changing product accessibility semantics.
A rerun is required to verify password visibility and full signup dismissal.

The focused login screenshot also shows the modal title under the iOS status
bar while editing. This is a separate keyboard/safe-area layout finding,
not resolved by the selector correction. Track it before release and check
on a device. No hosted CSS or production deployment was changed.

## Keyboard safe-area adjustment under verification

The canonical mobile config now uses `ios.contentInset: automatic` instead
of Capacitor's default `never`. This lets UIKit apply its native safe-area
scroll adjustments. No remote website CSS or Android behavior was changed.
This is a candidate fix for the observed status-bar overlap, not a verified
resolution. The native UI test now requires a visible software keyboard and
attaches a screenshot immediately after password entry, before toggling
visibility can dismiss the keyboard. Inspect that screenshot in the next
cloud result and compare homepage spacing for regressions.

The simulator smoke script also captures the screen after installation and
before launch as `installed-icon.png`. Inspect it for the new app icon;
its presence/location depends on SpringBoard's current home screen. The
launch artwork itself is brief and is not verified by 15/30-second captures.

## Next batched cloud run

Run `PropRoster iOS UI Tests (unsigned)` on `ios-readiness-v1` when ready.
This batch includes the new branding, candidate keyboard adjustment, visible
keyboard screenshot, existing three UI tests, and an isolated connection
failure capture. No signed-in test, real data, or store upload occurs.

`offline-smoke.py` copies the unsigned built app into a temporary directory,
changes only that copy to a closed loopback HTTPS port, installs it, captures
`offline-recovery.png`, and reinstalls the original app in a finally block.
It does not alter the source config, normal app artifact, or production URL.
Screenshot capture is evidence for manual inspection, not a semantic UI pass.

## TestFlight setup after Apple activation

1. Resolve Apple's enrollment/document verification and activate membership.
2. Register `com.proproster.app` and create its App Store Connect app record.
3. In Codemagic Code signing identities, upload or generate a matching Apple
   Distribution certificate and App Store provisioning profile. The YAML now
   selects them by `distribution_type: app_store` and bundle identifier.
4. Store the publishing API private key, key identifier, and issuer ID in the
   encrypted `appstore_credentials` group. Do not put them in chat or Git.
5. Review the remaining layout, login/upload, privacy and billing gates.
6. Only then manually run the signed TestFlight workflow. It applies profiles
   using `xcode-project use-profiles`, builds an internal-only export, and is
   configured to upload to TestFlight. Nothing runs automatically on push.

The preflight checks presence of required configuration without printing
values. It does not prove certificate validity, API permissions or membership
status. BUILD_NUMBER must be a positive integer and must exceed any previous
App Store Connect build number for the version; confirm before first upload.

Camera capture already exists in Smart Upload. The iOS plist now explains
that camera use is for property/maintenance photos, receipts and documents.
No microphone/location access was added. Camera permission, denial and file
picker behavior remain physical-device acceptance checks.

References checked October 30, 2026:
- https://docs.codemagic.io/yaml-code-signing/signing-ios/
- https://github.com/codemagic-ci-cd/cli-tools/blob/master/docs/xcode-project/use-profiles.md
- https://developer.apple.com/documentation/bundleresources/information-property-list/nscamerausagedescription
