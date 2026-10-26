'use client'

// PropRoster — Mobile V3: Notifications & Activity Center.
//
// Shared unread-count lookup for the header bell, same pattern as
// lib/useSubscription.ts (a thin hook every page that needs it can call
// independently — no global store, no context provider). Reads only the
// caller's own rows; RLS (notification_events_select_own) is the real
// boundary, this .eq is defense-in-depth clarity, same convention as
// every other hook in this app.

import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../supabase'

export function useUnreadNotificationCount(user: User | null): number {
  const [count, setCount] = useState(0)

  async function load() {
    if (!supabase || !user) { setCount(0); return }
    const { count: unread } = await supabase
      .from('notification_events')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', user.id)
      .is('read_at', null)
    setCount(unread || 0)
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  return count
}
