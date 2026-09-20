'use client'

// PropRoster — Platform Admin Authorization Fix: client-side read of
// "is the signed-in user a platform admin", for admin page UX only.
//
// This is a DISPLAY/UX convenience — same disclaimer as
// lib/useSubscription.ts: it lets an admin page show the right screen
// without a network round trip's worth of flicker, and lets a non-admin
// see a friendly "not available" message. It is NEVER the security
// boundary. The real enforcement is server-side, in whichever API route
// backs the page, via lib/admin/platform-admin.ts's isCallerPlatformAdmin
// against the caller's own RLS-scoped user_subscriptions-independent
// platform_admins row (supabase/milestone-33-platform-admin.sql) — RLS
// denies a non-admin's row entirely, so this hook has nothing to leak
// beyond "yes/no for MY OWN account" even if a page's rendering logic
// were ever bypassed.

import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../supabase'

export type PlatformAdminState = {
  isPlatformAdmin: boolean
  loading: boolean
}

export function usePlatformAdmin(user: User | null): PlatformAdminState {
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!supabase || !user) {
        setIsPlatformAdmin(false)
        setLoading(false)
        return
      }
      setLoading(true)
      const { data } = await supabase.from('platform_admins').select('owner_id').eq('owner_id', user.id).maybeSingle()
      if (!cancelled) {
        setIsPlatformAdmin(Boolean(data))
        setLoading(false)
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  return { isPlatformAdmin, loading }
}
