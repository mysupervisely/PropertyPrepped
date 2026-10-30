# PropRoster iOS development entrypoint

**Canonical native project:** `mobile/ios/App/App.xcodeproj`.
**Canonical Capacitor configuration:** `mobile/capacitor.config.ts`.
**Cloud build configuration:** repository-root `codemagic.yaml`.

The native project, icon/splash assets, mobile npm dependencies, and a Codemagic TestFlight workflow already exist. Do not run `npx cap add ios` at repository root or create a second iOS project. The root-level `capacitor.config.ts` on this experimental branch is superseded by `mobile/capacitor.config.ts` and must not be used for builds.

## Current status and next steps

Unsigned simulator compilation succeeded in Codemagic at commit `861ac81`. Runtime behavior is not yet verified. Run `npm run ios:verify` at repository root to check the canonical mobile project references.

Both workflows use Node 22 and the mobile lockfile now supplies TypeScript for Capacitor config parsing. Root web dependencies are unnecessary for compiling this hosted shell.

Apple organization verification and membership activation remain pending. After activation, register the bundle ID and App Store Connect app, then configure distribution certificates and provisioning profiles in Codemagic. The current TestFlight workflow still needs signing identity/keychain/profile setup; publishing API credentials alone do not sign an app.

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
