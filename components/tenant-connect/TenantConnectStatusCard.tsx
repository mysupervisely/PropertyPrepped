'use client'

// PropRoster — Tenant Connect V1 (Milestone 24): the compact status card
// for Property > Rent > Tenant (Section 2). Scoped to the property's
// CURRENT lease only — a new, smaller, purpose-built component, not the
// existing components/TenantConnectPanel.tsx (that panel's own
// multi-tenant/general-conversation UI is broader than this milestone's
// "one lease, one tenant relationship" framing; it stays fully intact
// and untouched, simply no longer mounted at this call site — see the
// completion report for the reasoning).
//
// Reuses the EXACT SAME tenant_property_access table/columns/RLS M10
// already built — this component only adds a `lease_id` on invite
// (Section 3: "Invitation must be tied to... lease"), which that
// column already supported but the original owner-side panel never
// populated.

import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { tenantConnectStatusLabel, findAccessForLease } from '../../lib/tenant-connect/helpers'
import { notifyTenantConnect } from '../../lib/tenant-connect/notify-client'
import type { TenantPropertyAccess } from '../../lib/tenant-connect/types'

type LeaseForCard = { id: string; tenant_name: string; tenant_email: string | null }

export function TenantConnectStatusCard({
  supabase, propertyId, ownerId, currentLease, tenantConnectEnabled, onChanged,
}: {
  supabase: SupabaseClient
  propertyId: string
  ownerId: string
  currentLease: LeaseForCard | null
  tenantConnectEnabled: boolean
  onChanged?: () => void
}) {
  const [rows, setRows] = useState<TenantPropertyAccess[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showRevokeConfirm, setShowRevokeConfirm] = useState(false)

  async function load() {
    setLoading(true)
    const { data, error: err } = await supabase.from('tenant_property_access').select('*').eq('property_id', propertyId).order('created_at', { ascending: false })
    if (err) setError(err.message)
    setRows((data as TenantPropertyAccess[]) || [])
    setLoading(false)
  }

  useEffect(() => {
    if (tenantConnectEnabled) void load()
    else setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, tenantConnectEnabled])

  if (!tenantConnectEnabled) {
    return (
      <div className="tenantConnectCard tenantConnectCardLocked">
        <h3>Tenant Connect</h3>
        <p className="muted">Invite your tenant to message you and submit requests inside PropRoster.</p>
      </div>
    )
  }

  if (!currentLease) {
    return (
      <div className="tenantConnectCard">
        <h3>Tenant Connect</h3>
        <p className="muted">Add a lease first — Tenant Connect invites the tenant on this property's current lease.</p>
      </div>
    )
  }

  const access = findAccessForLease(rows, currentLease.id)
  const statusLabel = tenantConnectStatusLabel(access?.status ?? null)

  async function invite() {
    if (!currentLease?.tenant_email) return
    setBusy(true)
    setError('')
    const { data: inserted, error: err } = await supabase
      .from('tenant_property_access')
      .insert({ property_id: propertyId, owner_id: ownerId, tenant_email: currentLease.tenant_email.trim().toLowerCase(), lease_id: currentLease.id })
      .select('id')
      .single()
    setBusy(false)
    if (err || !inserted) { setError(err?.message || 'Unable to send invite.'); return }
    void notifyTenantConnect(supabase, 'invite', { accessId: inserted.id })
    await load()
    onChanged?.()
  }

  async function resend() {
    if (!access) return
    setBusy(true)
    void notifyTenantConnect(supabase, 'invite', { accessId: access.id })
    setBusy(false)
  }

  async function revoke() {
    if (!access) return
    setBusy(true)
    setError('')
    const { error: err } = await supabase.from('tenant_property_access').update({ status: 'Revoked', revoked_at: new Date().toISOString() }).eq('id', access.id)
    setBusy(false)
    setShowRevokeConfirm(false)
    if (err) { setError(err.message); return }
    await load()
    onChanged?.()
  }

  return (
    <div className="tenantConnectCard">
      <div className="tenantConnectCardHead">
        <h3>Tenant Connect</h3>
        <span className={`statusPill ${access?.status === 'Active' ? 'pillGood' : access?.status === 'Revoked' ? 'pillMuted' : access?.status === 'Invited' ? 'pillWarn' : ''}`}>{statusLabel}</span>
      </div>
      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          <div className="tenantConnectCardBody">
            <span>{currentLease.tenant_name}</span>
            {currentLease.tenant_email && <span className="muted">{currentLease.tenant_email}</span>}
          </div>
          {error && <p className="errorMessage">{error}</p>}
          <div className="tenantConnectCardActions">
            {!access && currentLease.tenant_email && <button className="primary" disabled={busy} onClick={() => void invite()}>{busy ? 'Sending…' : 'Invite Tenant'}</button>}
            {!access && !currentLease.tenant_email && <p className="muted">Add a tenant email on the lease to invite them.</p>}
            {access?.status === 'Invited' && <button className="secondary" disabled={busy} onClick={() => void resend()}>{busy ? 'Sending…' : 'Resend Invitation'}</button>}
            {access?.status === 'Active' && !showRevokeConfirm && <button className="dangerLink" onClick={() => setShowRevokeConfirm(true)}>Revoke access</button>}
            {access?.status === 'Active' && showRevokeConfirm && (
              <span className="tenantConnectRevokeConfirm">
                <span className="muted">Revoke this tenant&rsquo;s access?</span>
                <button className="secondary" onClick={() => setShowRevokeConfirm(false)}>Cancel</button>
                <button className="dangerButton" disabled={busy} onClick={() => void revoke()}>{busy ? 'Revoking…' : 'Revoke'}</button>
              </span>
            )}
            {access?.status === 'Revoked' && currentLease.tenant_email && <button className="secondary" disabled={busy} onClick={() => void invite()}>{busy ? 'Sending…' : 'Invite Tenant'}</button>}
          </div>
        </>
      )}
    </div>
  )
}
