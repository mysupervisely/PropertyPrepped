// PropRoster Mobile M3 — Android hardware/gesture back-button handling.
//
// Pure decision logic only (no Capacitor/DOM dependency), so it's
// testable without a device or emulator — see
// components/mobile/NativeBackButtonHandler.tsx for the thin wiring
// that actually calls this from Capacitor's `backButton` event.
//
// This is the exact, minimal behavior Capacitor's own documentation
// recommends for the `backButton` event's `canGoBack` flag — no custom
// modal/overlay-aware history stack was built on top of it (that would
// be "a complicated navigation framework," explicitly out of scope).
// PropRoster's existing modals (Edit Property, Add Property, etc.) are
// plain React state, not separate browser-history entries, on web
// today — so "navigate backward when history allows it, otherwise let
// the OS exit the app" already matches the app's own existing,
// pre-existing back-navigation behavior (e.g. a desktop browser's own
// back button), not a new/different behavior introduced by this file.
// Making a modal itself a distinct history entry (so hardware back
// closes it before leaving the page) is a real, reasonable future
// enhancement — but it's a change to the WEB app's own modal
// architecture, not a mobile-shell concern, and is left for a future
// milestone rather than invented here.

export type BackButtonAction = 'history-back' | 'exit-app'

export function decideBackButtonAction(canGoBack: boolean): BackButtonAction {
  return canGoBack ? 'history-back' : 'exit-app'
}
