# PropRoster iOS development entrypoint

**Canonical native project:** `mobile/ios/App/App.xcodeproj`.
**Canonical Capacitor configuration:** `mobile/capacitor.config.ts`.
**Cloud build configuration:** repository-root `codemagic.yaml`.

The native project, icon/splash assets, mobile npm dependencies, and a Codemagic TestFlight workflow already exist. Do not run `npx cap add ios` at repository root or create a second iOS project. The root-level `capacitor.config.ts` on this experimental branch is superseded by `mobile/capacitor.config.ts` and must not be used for builds.

## Current status and next steps

Unsigned simulator compilation succeeded in Codemagic at commit `861ac81`. Runtime behavior is not yet verified. Run `npm run ios:verify` at repository root to check the canonical mobile project references.

Both workflows use Node 22 and the mobile lockfile now supplies TypeScript for Capacitor config parsing. Root web dependencies are unnecessary for compiling this hosted shell.

Apple organization verification and membership activation remain pending. After activation, register the bundle ID and App Store Connect app, then configure distribution certificates and provisioning profiles in Codemagic. The current TestFlight workflow still needs signing identity/keychain/profile setup; publishing API credentials alone do not sign an app.

Before distribution, test login/session persistence, navigation, external links, uploads, keyboard/safe areas, Tenant Connect, PropCrew, and Tax Center with fictional data. Test cold launch without internet and hosted-site failure: no local error page is configured. A working native build does not guarantee that the hosted website is available.

## Release gates

Before App Store distribution, validate login/session handling, native navigation, camera/document uploads, Tenant Connect, PropCrew, Tax Center, privacy declarations, and App Store review requirements. In particular, a remote website shell may face Apple's minimum functionality review. Stripe-hosted checkout and digital-service payments require an App Store policy assessment, not merely browser handoff.

Do not put signing keys, API keys, or user data in source control.
