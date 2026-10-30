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
