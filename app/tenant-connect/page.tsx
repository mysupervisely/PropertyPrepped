'use client'

// PropRoster — Tenant Connect V2.1: a first-class, portfolio-wide
// landlord workspace for Tenant Connect, with its own navigation entry
// (components/AuthNavMenu.tsx). Reuses the EXACT SAME tables, RLS
// policies, and invitation workflow the existing property-level Rent >
// Tenant tab already uses (components/tenant-connect/TenantConnectStatusCard.tsx) —
// this page does not introduce a second Tenant Connect data model or a
// second messaging system. See lib/tenant-connect/directory.ts for the
// pure row-building logic this page renders.
//
// Page-shell pattern mirrors app/maintenance/page.tsx exactly (useAuthUser
// + AuthHeader + the same authShell/authCard sign-in gate, its own
// independent Supabase fetch) — same reason every other portfolio-wide
// page in this app is its own route rather than a tab bolted onto the
// single-page property workspace.
//
// SECURITY: every query below relies entirely on RLS
// (properties_select_own, leases_select_own, tenant_access_select/
// _insert/_update, tenant_requests_select — all pre-existing, all
// owner-scoped) — no explicit owner_id filter is added client-side
// because none is needed. No service-role key, no elevated client.
//
// Does not duplicate the existing conversation/reply UI
// (components/tenant-connect/TenantRequestsPanel.tsx): "View requests"
// links out to the property's own Tenant tab
// (/?openProperty=<id>&openTab=Rent&openRentSubTab=Tenant, the same
// deep-link mechanism app/search/page.tsx already uses) instead of
// re-implementing the thread.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { useAuthUser } from '../../lib/useAuthUser'
import { useSubscription } from '../../lib/useSubscription'
import { entitlementsFor } from '../../lib/billing/entitlements'
import { AuthHeader } from '../../components/AuthHeader'
import { notifyTenantConnect } from '../../lib/tenant-connect/notify-client'
import { staleInvitedEmail, normalizeTenantEmail } from '../../lib/tenant-connect/helpers'
import {
  buildTenantDirectory, summarizeTenantDirectory, filterTenantDirectory,
  type DirectoryProperty, type DirectoryLease, type TenantDirectoryRow,
} from '../../lib/tenant-connect/directory'
import type { TenantPropertyAccess, TenantRequest } from '../../lib/tenant-connect/types'

export default function TenantConnectPage() {
  const { user, ready } = useAuthUser()

  if (!ready) return <main className="authShell"><div className="loadingState">Loading Tenant Connect…</div></main>

  if (!user) {
    return (
      <main className="authShell">
        <section className="authCard">
          <p className="eyebrow">PROPROSTER</p>
          <h1>Sign in required</h1>
          <p className="authIntro">Sign in to view Tenant Connect.</p>
          <Link className="primary authSubmit" href="/">Go to sign in</Link>
        </section>
      </main>
    )
  }

  return <TenantConnectWorkspace user={user} />
}

function TenantConnectWorkspace({ user }: { user: User }) {
  const { plan } = useSubscription(user)
  const tenantConnectEnabled = entitlementsFor(plan).tenantConnect

  const [properties, setProperties] = useState<DirectoryProperty[]>([])
  const [leases, setLeases] = useState<DirectoryLease[]>([])
  const [access, setAccess] = useState<TenantPropertyAccess[]>([])
  const [tenantRequests, setTenantRequests] = useState<Pick<TenantRequest, 'tenant_access_id' | 'status'>[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [rowBusy, setRowBusy] = useState<string | null>(null)
  const [rowError, setRowError] = useState<{ leaseId: string; message: string } | null>(null)
  const [manageOpenLeaseId, setManageOpenLeaseId] = useState<string | null>(null)
  const [revokeConfirmLeaseId, setRevokeConfirmLeaseId] = useState<string | null>(null)

  async function load() {
    if (!supabase) return
    setLoading(true)
    setError('')
    const [
      { data: propertyRows, error: propError },
      { data: leaseRows, error: leaseError },
      { data: accessRows },
      { data: requestRows },
    ] = await Promise.all([
      supabase.from('properties').select('id,address,city').order('created_at', { ascending: true }),
      supabase.from('leases').select('id,property_id,tenant_name,tenant_email,start_date,end_date'),
      // Tenant Connect tables: same defensive "may legitimately not
      // exist/apply yet" pattern app/maintenance/page.tsx and app/page.tsx
      // already use for these — a failure here must never block the
      // base property/lease list from loading.
      supabase.from('tenant_property_access').select('*'),
      supabase.from('tenant_requests').select('tenant_access_id,status'),
    ])
    const firstError = propError || leaseError
    if (firstError) { setError(firstError.message); setLoading(false); return }
    setProperties((propertyRows || []) as DirectoryProperty[])
    setLeases((leaseRows || []) as DirectoryLease[])
    setAccess((accessRows || []) as TenantPropertyAccess[])
    setTenantRequests((requestRows || []) as Pick<TenantRequest, 'tenant_access_id' | 'status'>[])
    setLoading(false)
  }

  useEffect(() => { if (tenantConnectEnabled) void load(); else setLoading(false) }, [tenantConnectEnabled])

  const directory = useMemo(() => buildTenantDirectory(properties, leases, access, tenantRequests), [properties, leases, access, tenantRequests])
  const summary = useMemo(() => summarizeTenantDirectory(directory), [directory])
  const filtered = useMemo(() => filterTenantDirectory(directory, search), [directory, search])

  async function invite(row: TenantDirectoryRow) {
    if (!supabase || !row.tenantEmail) return
    setRowBusy(row.leaseId); setRowError(null)
    const { data: inserted, error: err } = await supabase
      .from('tenant_property_access')
      .insert({ property_id: row.propertyId, owner_id: user.id, tenant_email: normalizeTenantEmail(row.tenantEmail), lease_id: row.leaseId })
      .select('id')
      .single()
    if (err || !inserted) { setRowBusy(null); setRowError({ leaseId: row.leaseId, message: err?.message || 'Unable to send invite.' }); return }
    const result = await notifyTenantConnect(supabase, 'invite', { accessId: inserted.id })
    setRowBusy(null)
    if (!result?.sent) setRowError({ leaseId: row.leaseId, message: 'Invitation created, but the email could not be sent. Use "Resend" to try again.' })
    await load()
  }

  async function resend(row: TenantDirectoryRow) {
    if (!supabase || !row.access) return
    setRowBusy(row.leaseId); setRowError(null)
    const syncTo = staleInvitedEmail(row.access, row.tenantEmail)
    if (syncTo) {
      const { error: syncErr } = await supabase.from('tenant_property_access').update({ tenant_email: syncTo }).eq('id', row.access.id)
      if (syncErr) { setRowBusy(null); setRowError({ leaseId: row.leaseId, message: syncErr.message }); return }
      await load()
    }
    const result = await notifyTenantConnect(supabase, 'invite', { accessId: row.access.id })
    setRowBusy(null)
    if (!result?.sent) setRowError({ leaseId: row.leaseId, message: 'Could not send the invitation email. Please try again in a moment.' })
  }

  async function revoke(row: TenantDirectoryRow) {
    if (!supabase || !row.access) return
    setRowBusy(row.leaseId); setRowError(null)
    const { error: err } = await supabase.from('tenant_property_access').update({ status: 'Revoked', revoked_at: new Date().toISOString() }).eq('id', row.access.id)
    setRowBusy(null)
    setRevokeConfirmLeaseId(null)
    if (err) { setRowError({ leaseId: row.leaseId, message: err.message }); return }
    await load()
  }

  const propertyTenantHref = (propertyId: string) => `/?openProperty=${propertyId}&openTab=Rent&openRentSubTab=Tenant`

  return (
    <main className="shell">
      <AuthHeader />

      <section className="intro maintenanceHubIntro">
        <div className="maintenanceHubHead">
          <h1>Tenant Connect</h1>
        </div>
        {tenantConnectEnabled && !loading && (
          <p className="muted">
            {summary.connected} connected
            {summary.pending > 0 ? ` · ${summary.pending} pending` : ''}
            {summary.notConnected > 0 ? ` · ${summary.notConnected} not connected` : ''}
          </p>
        )}
      </section>

      {error && <div className="globalError">{error}<button onClick={() => setError('')}>×</button></div>}

      {!tenantConnectEnabled ? (
        <div className="emptyState"><strong>Tenant Connect isn&rsquo;t available on this plan.</strong></div>
      ) : loading ? (
        <div className="emptyState"><strong>Loading…</strong></div>
      ) : directory.length === 0 ? (
        <div className="emptyState"><strong>No current tenants yet.</strong><span>Add a lease to a property, then invite that tenant from here.</span></div>
      ) : (
        <>
          <div className="searchInputWrap">
            <input
              className="searchInput"
              type="search"
              placeholder="Search tenants or properties…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search the tenant directory"
            />
          </div>

          {filtered.length === 0 ? (
            <div className="emptyState"><strong>No tenants match &ldquo;{search}&rdquo;.</strong></div>
          ) : (
            <div className="tenantDirectoryList">
              {filtered.map((row) => (
                <div className="tenantDirectoryRow" key={row.leaseId}>
                  <div className="tenantConnectCardHead">
                    <div className="tenantConnectCardBody">
                      <strong>{row.tenantName}</strong>
                      <span className="muted">{row.propertyLabel}</span>
                      {row.tenantEmail && <span className="muted">{row.tenantEmail}</span>}
                    </div>
                    <span className={`statusPill ${row.statusLabel === 'Connected' ? 'pillGood' : row.statusLabel === 'Invited' ? 'pillWarn' : 'pillMuted'}`}>{row.statusLabel}</span>
                  </div>

                  {rowError?.leaseId === row.leaseId && <p className="errorMessage">{rowError.message}</p>}

                  <div className="tenantConnectCardActions">
                    {!row.access && row.tenantEmail && (
                      <button className="primary" disabled={rowBusy === row.leaseId} onClick={() => void invite(row)}>{rowBusy === row.leaseId ? 'Sending…' : 'Invite Tenant'}</button>
                    )}
                    {!row.access && !row.tenantEmail && <p className="muted">Add a tenant email on the lease to invite them.</p>}
                    {row.access?.status === 'Invited' && (
                      <button className="secondary" disabled={rowBusy === row.leaseId} onClick={() => void resend(row)}>{rowBusy === row.leaseId ? 'Sending…' : 'Resend Invitation'}</button>
                    )}
                    {row.access?.status === 'Active' && manageOpenLeaseId !== row.leaseId && (
                      <button className="tenantConnectQuietAction" onClick={() => setManageOpenLeaseId(row.leaseId)}>Manage access</button>
                    )}
                    {row.access?.status === 'Active' && manageOpenLeaseId === row.leaseId && revokeConfirmLeaseId !== row.leaseId && (
                      <span className="tenantConnectManagePanel">
                        <button className="tenantConnectQuietAction tenantConnectDestructive" onClick={() => setRevokeConfirmLeaseId(row.leaseId)}>Revoke access</button>
                        <button className="tenantConnectQuietAction" onClick={() => setManageOpenLeaseId(null)}>Done</button>
                      </span>
                    )}
                    {row.access?.status === 'Active' && revokeConfirmLeaseId === row.leaseId && (
                      <span className="tenantConnectRevokeConfirm">
                        <span className="muted">Revoke this tenant&rsquo;s access?</span>
                        <button className="secondary" onClick={() => setRevokeConfirmLeaseId(null)}>Cancel</button>
                        <button className="dangerButton" disabled={rowBusy === row.leaseId} onClick={() => void revoke(row)}>{rowBusy === row.leaseId ? 'Revoking…' : 'Revoke'}</button>
                      </span>
                    )}
                    {row.access?.status === 'Revoked' && row.tenantEmail && (
                      <button className="secondary" disabled={rowBusy === row.leaseId} onClick={() => void invite(row)}>{rowBusy === row.leaseId ? 'Sending…' : 'Invite Tenant'}</button>
                    )}
                  </div>

                  <div className="tenantDirectoryRowLinks">
                    <Link href={propertyTenantHref(row.propertyId)}>View in property &rarr;</Link>
                    {row.openRequestCount > 0 && <Link href="/maintenance">{row.openRequestCount} open request{row.openRequestCount === 1 ? '' : 's'} &rarr;</Link>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </main>
  )
}
