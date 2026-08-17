// PropRoster — Property Profile 2.0, Section 1: the homepage greeting
// fallback chain. Pure string logic, no Supabase/React — exercised
// directly in greeting.test.ts, and reused unchanged by both the
// homepage greeting ("Good morning, Jamie.") and anywhere else a
// short display name for the signed-in user is needed.
//
// Fallback order (Part 1, exact): display/preferred name -> first name
// -> email prefix -> "there". A real name, once set, always wins over the
// email — Part 1's explicit requirement ("Do NOT expose email as the
// visible greeting if a real name exists").

import type { UserProfile } from './types'

function emailPrefixName(email: string | null | undefined): string {
  const local = (email || '').split('@')[0]
  const first = local.split(/[._-]+/).find(Boolean)
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : 'there'
}

/** Never returns an empty string — always at least "there". */
export function resolveGreetingName(profile: UserProfile | null, email: string | null | undefined): string {
  const displayName = profile?.display_name?.trim()
  if (displayName) return displayName

  const firstName = profile?.first_name?.trim()
  if (firstName) return firstName

  return emailPrefixName(email)
}

export function greetingTimeOfDay(hour: number = new Date().getHours()): 'morning' | 'afternoon' | 'evening' {
  if (hour < 12) return 'morning'
  if (hour < 18) return 'afternoon'
  return 'evening'
}
