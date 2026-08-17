'use client'

// PropRoster — Property Profile 2.0, Section 2: the Profile destination.
//
// Profile = identity/account information (name, contact, timezone) —
// deliberately kept separate from Settings/billing (Part 2: "Keep it
// conceptually separate from Settings"). Backed by public.user_profiles
// (supabase/milestone-11-property-profile-2.sql), 1:1 with auth.users, a
// row for every account (created by the on_auth_user_created_profile
// trigger). Email is shown read-only here — it's owned by Supabase Auth,
// changing it is a separate, more sensitive flow this milestone doesn't
// build.

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthUser } from '../../lib/useAuthUser'
import { PricingNavLink } from '../../components/PricingNavLink'
import { Wordmark } from '../../components/Wordmark'
import { COMMON_TIMEZONES, type UserProfile } from '../../lib/user-profile/types'

type Draft = { firstName: string; lastName: string; displayName: string; phone: string; timezone: string }

const emptyDraft: Draft = { firstName: '', lastName: '', displayName: '', phone: '', timezone: '' }

function draftFromProfile(profile: UserProfile | null): Draft {
  if (!profile) return emptyDraft
  return {
    firstName: profile.first_name || '',
    lastName: profile.last_name || '',
    displayName: profile.display_name || '',
    phone: profile.phone || '',
    timezone: profile.timezone || '',
  }
}

export default function ProfilePage() {
  const { user, ready } = useAuthUser()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!supabase || !user) return
    setLoading(true)
    supabase.from('user_profiles').select('*').eq('id', user.id).maybeSingle().then(({ data, error: fetchError }) => {
      if (fetchError) {
        setError(fetchError.message)
      } else {
        setProfile(data as UserProfile | null)
        setDraft(draftFromProfile(data as UserProfile | null))
      }
      setLoading(false)
    })
  }, [user?.id])

  async function save() {
    if (!supabase || !user) return
    setSaving(true)
    setError('')
    setSaved(false)
    // upsert — a profile row should already exist (created at signup by
    // the DB trigger), but this is defensive for any account created
    // before that trigger existed.
    const { data, error: saveError } = await supabase.from('user_profiles').upsert({
      id: user.id,
      first_name: draft.firstName.trim() || null,
      last_name: draft.lastName.trim() || null,
      display_name: draft.displayName.trim() || null,
      phone: draft.phone.trim() || null,
      timezone: draft.timezone || null,
      updated_at: new Date().toISOString(),
    }).select('*').single()

    if (saveError) {
      setError(saveError.message)
    } else {
      setProfile(data as UserProfile)
      setSaved(true)
    }
    setSaving(false)
  }

  if (!ready || (user && loading)) {
    return <main className="authShell"><div className="loadingState">Loading your profile…</div></main>
  }

  if (!user) {
    return (
      <main className="authShell">
        <section className="authCard">
          <p className="eyebrow">PROPROSTER</p>
          <h1>Sign in required</h1>
          <p className="authIntro">Sign in to view and edit your profile.</p>
          <Link className="primary authSubmit" href="/">Go to sign in</Link>
        </section>
      </main>
    )
  }

  return (
    <main className="shell">
      <header className="topbar">
        <Link href="/" className="brandButton"><span className="brand"><Wordmark /></span><span className="tagline">Profile</span></Link>
        <div className="accountActions">
          <PricingNavLink />
          <Link href="/" className="secondary">← Dashboard</Link>
        </div>
      </header>

      <section className="intro evaluatorIntro">
        <p className="eyebrow">PROFILE</p>
        <h1>Your identity, not your settings.</h1>
        <p>This is how PropRoster greets you and identifies you — separate from billing and account settings.</p>
      </section>

      {error && <div className="globalError">{error}<button onClick={() => setError('')}>×</button></div>}
      {saved && <div className="statusMessage successMessage">Profile saved.</div>}

      <section className="evaluatorSection profileFormSection">
        <div className="evaluatorSectionHead"><h2>Identity</h2><p>A real name here is what PropRoster greets you with — never your email, once one of these is set.</p></div>
        <div className="evalGrid">
          <label className="evalField"><span>First name</span><input value={draft.firstName} onChange={(e) => setDraft((d) => ({ ...d, firstName: e.target.value }))} placeholder="Kirollos" /></label>
          <label className="evalField"><span>Last name</span><input value={draft.lastName} onChange={(e) => setDraft((d) => ({ ...d, lastName: e.target.value }))} placeholder="Attalla" /></label>
          <label className="evalField fullField"><span>Preferred / display name<small>Optional — used instead of your first name if set (e.g. a nickname).</small></span><input value={draft.displayName} onChange={(e) => setDraft((d) => ({ ...d, displayName: e.target.value }))} placeholder="Kiro" /></label>
        </div>
      </section>

      <section className="evaluatorSection profileFormSection">
        <div className="evaluatorSectionHead"><h2>Contact</h2></div>
        <div className="evalGrid">
          <label className="evalField"><span>Email<small>Managed by your sign-in — not editable here.</small></span><input value={user.email || ''} disabled /></label>
          <label className="evalField"><span>Phone<small>Optional</small></span><input value={draft.phone} onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))} placeholder="(555) 123-4567" /></label>
          <label className="evalField"><span>Time zone<small>Optional</small></span>
            <select value={draft.timezone} onChange={(e) => setDraft((d) => ({ ...d, timezone: e.target.value }))}>
              <option value="">Not set</option>
              {COMMON_TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </label>
        </div>
      </section>

      <section className="evaluatorSection profileFormSection">
        <div className="evaluatorSectionHead"><h2>Photo</h2><p>Profile photos aren&apos;t supported yet — this is reserved space so it can be added later without another migration.</p></div>
        <div className="photoPlaceholder profilePhotoPlaceholder"><span>◐</span><small>Coming soon</small></div>
      </section>

      <div className="editPropertyFooter compactActions">
        <span />
        <button className="primary" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save Profile'}</button>
      </div>
    </main>
  )
}
