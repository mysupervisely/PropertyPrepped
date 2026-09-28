import type { CapacitorConfig } from '@capacitor/cli'

// PropRoster Mobile — PRODUCTION Capacitor configuration.
//
// This is the default configuration used by every `cap` command unless
// a command explicitly overrides it (see capacitor.config.dev.json).
// It always points the native shell at the live, production PropRoster
// web application — the single source of truth for every screen, every
// API call, and every RLS/authorization check. There is no bundled web
// app of its own in this project; `webDir` below is a placeholder
// directory required by Capacitor's tooling (asset generation, initial
// `cap add` scaffolding) and is never what the app actually loads at
// runtime — `server.url` always takes priority.
//
// server.url has NO environment-variable override and NO conditional
// branch here, on purpose. A developer who wants to point the shell at
// a local dev server must explicitly pass
// `--config capacitor.config.dev.json` to every `cap` command (see that
// file's own header comment for why). That extra, explicit step is what
// makes it structurally impossible for a development/localhost/HTTP URL
// to end up in a production sync or build by accident, silent default,
// or a forgotten environment variable.
//
// allowNavigation is deliberately left UNSET (not just empty) beyond
// Capacitor's own default. See mobile/README.md's "Billing safety"
// section for why this omission is safety-critical, not an oversight:
// it is what makes Capacitor hand off navigation to Stripe Checkout and
// the Stripe Customer Portal (checkout.stripe.com / billing.stripe.com)
// to the external system browser instead of loading them inside this
// app's own WebView — required to avoid an accidental in-app purchase
// flow before App Store/Play Store review. Do not add any stripe.com
// host to allowNavigation without re-reading that section first.
const config: CapacitorConfig = {
  appId: 'com.proproster.app',
  appName: 'PropRoster',
  webDir: 'www',
  server: {
    url: 'https://proproster.com',
    androidScheme: 'https',
  },
}

export default config
