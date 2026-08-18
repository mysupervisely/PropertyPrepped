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
import { AuthHeader } from '../../components/AuthHeader'
import { COMMON_TIMEZONES, type UserProfile } from '../../lib/user-profile/types'

// Launch Polish: same path-sanitizing helper app/page.tsx already uses
// for property photo/document uploads — not exported from there (a
// page component, not a shared module), so duplicated verbatim rather
// than reaching into an unrelated page file for one line.
const safeName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_')

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

  // Launch Polish: one canonical profile photo, mirroring
  // app/page.tsx's property cover-photo flow — a short-lived signed URL
  // for display (the profile-photos bucket is private, never a bare
  // public URL), and photoBusy doubles as the duplicate-click guard on
  // the upload input/remove button.
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [photoError, setPhotoError] = useState('')

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

  useEffect(() => {
    if (!supabase || !profile?.photo_path) { setPhotoUrl(null); return }
    let cancelled = false
    supabase.storage.from('profile-photos').createSignedUrl(profile.photo_path, 3600).then(({ data }) => {
      if (!cancelled) setPhotoUrl(data?.signedUrl || null)
    })
    return () => { cancelled = true }
  }, [profile?.photo_path])

  async function uploadPhoto(file: File) {
    if (!supabase || !user) return
    if (!file.type.startsWith('image/')) { setPhotoError('Choose an image file.'); return }
    setPhotoBusy(true)
    setPhotoError('')
    const path = `${user.id}/avatar/${crypto.randomUUID()}-${safeName(file.name)}`
    const { error: uploadError } = await supabase.storage.from('profile-photos').upload(path, file, { contentType: file.type, upsert: false })
    if (uploadError) {
      setPhotoError(uploadError.message)
      setPhotoBusy(false)
      return
    }
    const { data, error: saveError } = await supabase.from('user_profiles').upsert({ id: user.id, photo_path: path, updated_at: new Date().toISOString() }).select('*').single()
    if (saveError) {
      // The row write failed — remove the orphaned upload rather than
      // leaving a photo in storage nothing points to.
      await supabase.storage.from('profile-photos').remove([path])
      setPhotoError(saveError.message)
      setPhotoBusy(false)
      return
    }
    const oldPath = profile?.photo_path
    setProfile(data as UserProfile)
    if (oldPath && oldPath !== path) await supabase.storage.from('profile-photos').remove([oldPath])
    setPhotoBusy(false)
  }

  async function removePhoto() {
    if (!supabase || !user || !profile?.photo_path) return
    setPhotoBusy(true)
    setPhotoError('')
    const path = profile.photo_path
    const { data, error: saveError } = await supabase.from('user_profiles').upsert({ id: user.id, photo_path: null, updated_at: new Date().toISOString() }).select('*').single()
    if (saveError) {
      setPhotoError(saveError.message)
      setPhotoBusy(false)
      return
    }
    setProfile(data as UserProfile)
    await supabase.storage.from('profile-photos').remove([path])
    setPhotoBusy(false)
  }

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
      <AuthHeader />

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
          <label className="evalField"><span>First name</span><input value={draft.firstName} onChange={(e) => setDraft((d) => ({ ...d, firstName: e.target.value }))} placeholder="Jamie" /></label>
          <label className="evalField"><span>Last name</span><input value={draft.lastName} onChange={(e) => setDraft((d) => ({ ...d, lastName: e.target.value }))} placeholder="Rivera" /></label>
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
        <div className="evaluatorSectionHead"><h2>Photo</h2><p>A profile photo helps you recognize your account at a glance. Private to you — never shown to anyone else.</p></div>
        <div className="profilePhotoRow">
          <div className="profilePhotoPreview">
            {photoUrl ? <img src={photoUrl} alt="Profile photo" /> : <div className="photoPlaceholder profilePhotoPlaceholder"><span>◐</span></div>}
          </div>
          <div className="profilePhotoActions">
            <label className="secondary profilePhotoUploadButton">
              {photoBusy ? 'Uploading…' : photoUrl ? 'Change photo' : 'Add photo'}
              <input type="file" accept="image/*" disabled={photoBusy} onChange={(e) => { const file = e.target.files?.[0]; if (file) void uploadPhoto(file); e.target.value = '' }} />
            </label>
            {photoUrl && <button className="dangerLink" disabled={photoBusy} onClick={() => void removePhoto()}>Remove photo</button>}
          </div>
        </div>
        {photoError && <p className="errorMessage">{photoError}</p>}
      </section>

      <div className="editPropertyFooter compactActions">
        <span />
        <button className="primary" disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save Profile'}</button>
      </div>
    </main>
  )
}
