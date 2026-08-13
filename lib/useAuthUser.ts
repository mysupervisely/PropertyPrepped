'use client'

// Shared Supabase auth bootstrap, used by every route outside the main
// app/page.tsx workspace (Investment Tools, Property Evaluator). The main
// workspace keeps its own inline copy of this logic so Milestone 7 cannot
// regress it — this hook exists so new routes don't duplicate it further.

import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from './supabase'

export function useAuthUser() {
  const [user, setUser] = useState<User | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!supabase) {
      setReady(true)
      return
    }
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null)
      setReady(true)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  return { user, ready }
}
