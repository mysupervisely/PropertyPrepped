'use client'

// Shared Supabase auth bootstrap, used by every route outside the main
// app/page.tsx workspace (Investment Tools, Property Evaluator). The main
// workspace keeps its own inline copy of this logic so Milestone 7 cannot
// regress it — this hook exists so new routes don't duplicate it further.

import { useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { consumeExplicitSignOutFlag } from './auth/session-signal'

export function useAuthUser() {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)
  // Launch Essentials V1 — true only when a session that WAS present
  // disappeared on its own (a real expiration/revocation), never for an
  // ordinary first visit or an explicit Log out — see
  // lib/auth/session-signal.ts for how the two are told apart.
  const [sessionExpired, setSessionExpired] = useState(false)
  const hadUserRef = useRef(false)

  useEffect(() => {
    if (!supabase) {
      setReady(true)
      return
    }
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null)
      hadUserRef.current = Boolean(data.user)
      setReady(true)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' && hadUserRef.current && !consumeExplicitSignOutFlag()) {
        setSessionExpired(true)
      }
      hadUserRef.current = Boolean(session?.user)
      setUser(session?.user ?? null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  function clearSessionExpired() {
    setSessionExpired(false)
  }

  return { user, ready, sessionExpired, clearSessionExpired }
}
