# PropRoster iOS development entrypoint

**Canonical native project:** `mobile/ios/App/App.xcodeproj`.
**Canonical Capacitor configuration:** `mobile/capacitor.config.ts`.
**Cloud build configuration:** repository-root `codemagic.yaml`.

The native project, icon/splash assets, mobile npm dependencies, and a Codemagic TestFlight workflow already exist. Do not run `npx cap add ios` at repository root or create a second iOS project. The root-level `capacitor.config.ts` on this experimental branch is superseded by `mobile/capacitor.config.ts` and must not be used for builds.

## Next milestone: unsigned simulator build, no Apple enrollment needed

Codemagic currently contains an `ios-testflight` workflow requiring signing secrets and Apple Developer enrollment. Add a separate manual unsigned simulator build to validate compilation **without** Apple credentials. It should run `npm ci` in `mobile/`, `npx cap sync ios`, and `xcodebuild` for generic iOS Simulator with `CODE_SIGNING_ALLOWED=NO`. Capture build logs and an unsigned simulator `.app` artifact. No TestFlight submission.

## Release gates

Before App Store distribution, validate login/session handling, native navigation, camera/document uploads, Tenant Connect, PropCrew, Tax Center, privacy declarations, and App Store review requirements. In particular, a remote website shell may face Apple's minimum functionality review. Stripe-hosted checkout and digital-service payments require an App Store policy assessment, not merely browser handoff.

Do not put signing keys, API keys, or user data in source control.
