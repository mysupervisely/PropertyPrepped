// PropRoster — Property Profile 2.0, Section 1/2: user profile.
//
// Mirrors public.user_profiles (supabase/milestone-11-property-profile-2.sql)
// 1:1 with auth.users. Every field except id is nullable — a brand-new
// account has a blank row (created by the on_auth_user_created_profile
// trigger), and nothing here is ever guessed or defaulted to a fake value.

export type UserProfile = {
  id: string
  first_name: string | null
  last_name: string | null
  display_name: string | null
  phone: string | null
  timezone: string | null
  photo_path: string | null
  created_at: string
  updated_at: string
}

/** A reasonable, non-exhaustive set of IANA timezone names for the Profile page's picker — not a claim of completeness, just the common US-relevant set plus UTC. */
export const COMMON_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Phoenix',
  'America/Los_Angeles',
  'America/Anchorage',
  'Pacific/Honolulu',
  'UTC',
] as const
