// Launch Essentials V1 — distinguishes a genuinely expired/revoked
// Supabase session from a user-initiated "Log out". Supabase's
// onAuthStateChange fires the identical SIGNED_OUT event for both cases,
// so the app can't tell them apart from that event alone.
//
// Every explicit "Log out" button in the app calls markExplicitSignOut()
// immediately before supabase.auth.signOut(). Every auth bootstrap
// (lib/useAuthUser.ts, app/page.tsx's own inline copy) calls
// consumeExplicitSignOutFlag() when it sees SIGNED_OUT: true means the
// user asked to be signed out (show the ordinary signed-out state); false
// means the session disappeared on its own (show a clear "your session
// expired" message instead).

let explicitSignOutRequested = false

export function markExplicitSignOut(): void {
  explicitSignOutRequested = true
}

export function consumeExplicitSignOutFlag(): boolean {
  const was = explicitSignOutRequested
  explicitSignOutRequested = false
  return was
}
