// PropRoster Mobile M3 — the smallest maintainable way for the existing
// web app to know it's running inside the PropRoster Capacitor native
// shell (mobile/), rather than an ordinary browser tab.
//
// Capacitor's own `Capacitor` object (from @capacitor/core) is the
// correct primitive for this: the native bridge injects it only when
// actually running inside a Capacitor app, and it resolves to safe,
// inert "web platform" defaults on every normal browser visit — which
// is the overwhelming majority of traffic to proproster.com. This file
// is a thin, intention-revealing wrapper around it, never a parallel
// detection mechanism (no user-agent sniffing, no custom global flag,
// no cookie).
//
// Use sparingly, only where structurally necessary (e.g. Android
// hardware back-button handling — see components/mobile/
// NativeBackButtonHandler.tsx). This must never become a place to fork
// the application's behavior broadly — see the M3 audit's "do not
// create broad native-specific forks" instruction. A normal browser
// visit must behave identically whether or not this module is ever
// imported.

import { Capacitor } from '@capacitor/core'

export function isNativeShell(): boolean {
  return Capacitor.isNativePlatform()
}

export type NativePlatform = 'ios' | 'android' | 'web'

export function nativePlatform(): NativePlatform {
  return Capacitor.getPlatform() as NativePlatform
}
