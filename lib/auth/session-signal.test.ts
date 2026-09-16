import { describe, expect, it } from 'vitest'
import { markExplicitSignOut, consumeExplicitSignOutFlag } from './session-signal'

// Launch Essentials V1 — Supabase's onAuthStateChange fires the identical
// SIGNED_OUT event whether a user clicked "Log out" or their session was
// silently revoked. This module is the one place that distinction is
// recorded, so lib/useAuthUser.ts and app/page.tsx's own inline auth
// bootstrap can tell "ordinary logout" apart from "session expired"
// without duplicating any detection logic.

describe('session-signal', () => {
  it('consumeExplicitSignOutFlag returns false when no explicit sign-out was marked', () => {
    expect(consumeExplicitSignOutFlag()).toBe(false)
  })

  it('returns true exactly once after markExplicitSignOut, then resets to false', () => {
    markExplicitSignOut()
    expect(consumeExplicitSignOutFlag()).toBe(true)
    expect(consumeExplicitSignOutFlag()).toBe(false)
  })
})
