# PropRoster Android Trusted Web Activity

This is the **pre-build configuration**, not a signed Android app bundle. Do not upload these files to Google Play.

- Android package ID: `com.proproster.app` (must match the Play Console entry)
- Web origin: `https://proproster.com`
- Web manifest: `https://proproster.com/manifest.webmanifest`
- Build approach: Bubblewrap / Android Trusted Web Activity, using the existing hosted Next.js app. The production site remains unchanged.

## Build and verification checklist

1. On a machine with Node.js, Java JDK and Android SDK, install the current official Bubblewrap CLI and validate the web manifest and icon endpoints.
2. Initialize Bubblewrap with the web manifest URL, using `twa-manifest.json` as the intended settings reference. Verify all generated fields against the installed Bubblewrap version rather than assuming schema compatibility.
3. Generate and securely retain a dedicated Android signing keystore. Never commit the keystore, passwords, or signing secrets.
4. Build a **signed** release Android App Bundle (`.aab`), with application ID `com.proproster.app` and a unique, increasing version code.
5. Obtain the SHA-256 fingerprint of the actual app-signing certificate from Google Play Console once available. Publish `https://proproster.com/.well-known/assetlinks.json` with the package ID and **Play app-signing** fingerprint, not an invented value. Confirm it is served as JSON without redirects.
6. Upload the signed AAB to the **internal testing** track and validate Digital Asset Links verification, fullscreen TWA behavior, auth/session continuity, deep links, external links, payments, and all core PropRoster workflows on a real Android device.
7. Complete Play Store listing, privacy policy, data safety, account deletion disclosures, content rating and release review before production.

## Important constraints

- A website manifest or Capacitor dependency alone does not produce an Android binary.
- A TWA requires the live site and working Digital Asset Links association; without verified association it can open with browser chrome.
- Do not add a placeholder certificate fingerprint or use an upload-key fingerprint in place of the Play app-signing fingerprint.
- Google Play policies may require adjustments for authentication, billing, and account deletion; review before public launch.
- Keep Android signing material outside the repository and protect it with secure backups.

## Automated cloud checks

The GitHub Actions workflow `.github/workflows/android-twa-preflight.yml` can be run manually from the Actions tab. It checks the package configuration and the live PWA manifest/icon, and requires no local Mac or Android SDK. A successful preflight is **not** a signed Android build.

## Next build milestone

After preflight passes, add a reproducible Bubblewrap project generation step and unsigned build validation. Configure release signing using GitHub Actions secrets or a secure signing service, with explicit confirmation of Play App Signing and Digital Asset Links. Do not upload or distribute a build until signing and physical-device QA are complete.

## GitHub Actions jobs stuck in Queued

If both **Android TWA preflight** and **Android TWA unsigned build** remain queued with no runner assigned, treat this as a GitHub Actions execution issue, not evidence that Bubblewrap or Gradle failed. Do not repeatedly edit the workflow solely to trigger new jobs.

1. Open the queued run in GitHub Actions and check for approval, concurrency, runner availability, or account billing/usage notices.
2. In repository **Settings > Actions > General**, confirm Actions are enabled and GitHub-hosted runners are permitted. Confirm the organization/account Actions spending limit and billing status where applicable.
3. Check whether unrelated workflows on the same repository can start. If all are queued, investigate repository/account Actions settings before changing Android build scripts.
4. Once a runner starts, inspect the first failed step and its logs, then fix that specific failure on the Android branch. Avoid rerunning outdated attempts after newer commits.
5. A completed unsigned build is only an engineering artifact. It cannot replace secure release signing and real-device validation.
