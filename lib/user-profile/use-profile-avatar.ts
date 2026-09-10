'use client'

// PropRoster — Simplification + Maintenance Workspace V2, Phase D.2:
// Profile entry point.
//
// The one place that resolves the landlord's own profile photo into a
// short-lived signed URL (public.user_profiles.photo_path, the
// profile-photos storage bucket is private — never a bare public URL).
// Extracted from components/AuthNavMenu.tsx, where this exact query
// used to live before the avatar and the "PropRoster tools" hamburger
// trigger were two different buttons with two different jobs (see
// components/ProfileEntryButton.tsx's own header comment) — a single
// shared hook means both never issue the query twice, and a future
// consumer (the planned My Card surface) gets the same photo for free.

import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { useAuthUser } from '../useAuthUser'

export function useProfileAvatarUrl(): string | null {
  const { user } = useAuthUser()
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase || !user) { setAvatarUrl(null); return }
    let cancelled = false
    supabase.from('user_profiles').select('photo_path').eq('id', user.id).maybeSingle().then(({ data }) => {
      if (cancelled) return
      const path = (data as { photo_path?: string | null } | null)?.photo_path
      if (!path) { setAvatarUrl(null); return }
      supabase!.storage.from('profile-photos').createSignedUrl(path, 3600).then(({ data: signed }) => {
        if (!cancelled) setAvatarUrl(signed?.signedUrl || null)
      })
    })
    return () => { cancelled = true }
  }, [user?.id])

  return avatarUrl
}
