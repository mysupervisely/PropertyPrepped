'use client'

// PropRoster — Tenant Connect V2.1/V2.2: a first-class, portfolio-wide
// landlord workspace for Tenant Connect, with its own navigation entry
// (components/AuthNavMenu.tsx). Reuses the EXACT SAME tables, RLS
// policies, and invitation/messaging workflows the existing property-
// level Rent > Tenant tab already uses (TenantConnectStatusCard,
// TenantRequestsPanel) — this page does not introduce a second Tenant
// Connect data model, a second messaging backend, or a second
// notification path.
//
// V2.2 adds a Messages tab (default) alongside V2.1's Tenants directory
// tab. The inbox and its thread view read/write the SAME
// property_conversations/property_messages/property_message_attachments/
// property_conversation_reads tables and the SAME 'landlord_update'
// notify kind TenantRequestsPanel already uses — see
// lib/tenant-connect/inbox.ts for the pure row-building logic
// (including the unread rule, reused verbatim from
// lib/tenant-connect/helpers.ts's isConversationUnread — no new unread
// derivation was invented). components/tenant-connect/TenantRequestsPanel.tsx
// itself is untouched; this page's thread view is its own small,
// portfolio-wide surface over the identical tables/RLS, not a
// refactor of that already-shipped property-level component.
//
// Page-shell pattern mirrors app/maintenance/page.tsx exactly (useAuthUser
// + AuthHeader + the same authShell/authCard sign-in gate, its own
// independent Supabase fetch) — same reason every other portfolio-wide
// page in this app is its own route rather than a tab bolted onto the
// single-page property workspace.
//
// SECURITY: every query below relies entirely on RLS
// (properties_select_own, leases_select_own, tenant_access_select/
// _insert/_update, tenant_requests_select, property_conversations_select,
// property_messages_select/_insert, property_message_attachments_select/
// _insert, property_conversation_reads_select/_upsert/_update — all
// pre-existing, all owner-scoped) — no explicit owner_id filter is
// added client-side because none is needed. No service-role key, no
// elevated client.

import { useEffect, useMemo, useRef, useState } from 'react'
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
import {
  buildMessageInbox, summarizeUnreadInbox, type MessageInboxRow,
} from '../../lib/tenant-connect/inbox'
import type { TenantPropertyAccess, TenantRequest, PropertyConversation, PropertyMessage } from '../../lib/tenant-connect/types'

type TenantConnectTab = 'messages' | 'tenants'
type TenantRequestFields = Pick<TenantRequest, 'id' | 'tenant_access_id' | 'status' | 'conversation_id' | 'maintenance_request_id'>
type ConversationFields = Pick<PropertyConversation, 'id' | 'property_id' | 'tenant_access_id' | 'maintenance_request_id' | 'status'>
type MessagePreviewFields = Pick<PropertyMessage, 'conversation_id' | 'message' | 'created_at'>
type ReadRow = { conversation_id: string; last_read_at: string }

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

  const [tab, setTab] = useState<TenantConnectTab>('messages')

  // Mobile V3 (Notifications & Activity Center): "accepted your
  // invitation" notifications deep-link here with ?tab=tenants — same
  // one-shot-flag-on-mount pattern app/page.tsx's own "?add=property"
  // and "?openProperty=" params already use, plain browser APIs only.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (new URLSearchParams(window.location.search).get('tab') === 'tenants') setTab('tenants')
  }, [])

  const [properties, setProperties] = useState<DirectoryProperty[]>([])
  const [leases, setLeases] = useState<DirectoryLease[]>([])
  const [access, setAccess] = useState<TenantPropertyAccess[]>([])
  const [tenantRequests, setTenantRequests] = useState<TenantRequestFields[]>([])
  const [conversations, setConversations] = useState<ConversationFields[]>([])
  const [messagePreviews, setMessagePreviews] = useState<MessagePreviewFields[]>([])
  const [reads, setReads] = useState<ReadRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Tenants tab state (V2.1, unchanged).
  const [search, setSearch] = useState('')
  const [rowBusy, setRowBusy] = useState<string | null>(null)
  const [rowError, setRowError] = useState<{ leaseId: string; message: string } | null>(null)
  const [manageOpenLeaseId, setManageOpenLeaseId] = useState<string | null>(null)
  const [revokeConfirmLeaseId, setRevokeConfirmLeaseId] = useState<string | null>(null)

  // Messages tab state (V2.2).
  const [openConversationId, setOpenConversationId] = useState<string | null>(null)
  const openConversationRef = useRef<string | null>(null)
  const [threadMessages, setThreadMessages] = useState<PropertyMessage[]>([])
  const [attachmentsByMessage, setAttachmentsByMessage] = useState<Map<string, string[]>>(new Map())
  const [replyText, setReplyText] = useState('')
  const [attachFile, setAttachFile] = useState<File | null>(null)
  const [threadBusy, setThreadBusy] = useState(false)
  const [threadError, setThreadError] = useState('')

  async function load() {
    if (!supabase) return
    setLoading(true)
    setError('')
    const [
      { data: propertyRows, error: propError },
      { data: leaseRows, error: leaseError },
      { data: accessRows },
      { data: requestRows },
      { data: conversationRows },
      { data: previewRows },
      { data: readRows },
    ] = await Promise.all([
      supabase.from('properties').select('id,address,city').order('created_at', { ascending: true }),
      supabase.from('leases').select('id,property_id,tenant_name,tenant_email,start_date,end_date'),
      // Tenant Connect tables: same defensive "may legitimately not
      // exist/apply yet" pattern app/maintenance/page.tsx and app/page.tsx
      // already use for these — a failure here must never block the
      // base property/lease list from loading.
      supabase.from('tenant_property_access').select('*'),
      supabase.from('tenant_requests').select('id,tenant_access_id,status,conversation_id,maintenance_request_id'),
      supabase.from('property_conversations').select('id,property_id,tenant_access_id,maintenance_request_id,status'),
      supabase.from('property_messages').select('conversation_id,message,created_at').order('created_at', { ascending: false }),
      supabase.from('property_conversation_reads').select('conversation_id,last_read_at').eq('user_id', user.id),
    ])
    const firstError = propError || leaseError
    if (firstError) { setError(firstError.message); setLoading(false); return }
    setProperties((propertyRows || []) as DirectoryProperty[])
    setLeases((leaseRows || []) as DirectoryLease[])
    setAccess((accessRows || []) as TenantPropertyAccess[])
    setTenantRequests((requestRows || []) as TenantRequestFields[])
    setConversations((conversationRows || []) as ConversationFields[])
    setMessagePreviews((previewRows || []) as MessagePreviewFields[])
    setReads((readRows || []) as ReadRow[])
    setLoading(false)
  }

  useEffect(() => { if (tenantConnectEnabled) void load(); else setLoading(false) }, [tenantConnectEnabled])

  // -- Tenants tab (V2.1, unchanged) ---------------------------------
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

  // -- Messages tab (V2.2) --------------------------------------------
  const inbox = useMemo(
    () => buildMessageInbox(conversations, messagePreviews, access, leases, properties, reads, tenantRequests),
    [conversations, messagePreviews, access, leases, properties, reads, tenantRequests],
  )
  const unreadCount = useMemo(() => summarizeUnreadInbox(inbox), [inbox])
  const openRow = inbox.find((r) => r.conversationId === openConversationId) || null

  // Same race guard as TenantRequestsPanel.loadAttachments: a rapid
  // "open A, then open B before A's fetch resolves" must never let A's
  // slower attachment map overwrite B's already-applied one.
  async function loadAttachments(messages: PropertyMessage[], forConversationId: string) {
    if (!supabase) return
    if (!messages.length) { if (openConversationRef.current === forConversationId) setAttachmentsByMessage(new Map()); return }
    const { data } = await supabase.from('property_message_attachments').select('message_id, storage_path').in('message_id', messages.map((m) => m.id))
    const rows = (data as { message_id: string; storage_path: string }[]) || []
    const byMessage = new Map<string, string[]>()
    for (const row of rows) {
      const { data: signed } = await supabase.storage.from('tenant-connect-attachments').createSignedUrl(row.storage_path, 3600)
      if (signed?.signedUrl) byMessage.set(row.message_id, [...(byMessage.get(row.message_id) || []), signed.signedUrl])
    }
    if (openConversationRef.current === forConversationId) setAttachmentsByMessage(byMessage)
  }

  async function openConversation(conversationId: string) {
    if (!supabase) return
    setOpenConversationId(conversationId)
    openConversationRef.current = conversationId
    setReplyText('')
    setAttachFile(null)
    setThreadError('')
    const { data, error: err } = await supabase.from('property_messages').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: true })
    if (err) { setThreadError(err.message); return }
    const messages = (data as PropertyMessage[]) || []
    if (openConversationRef.current !== conversationId) return
    setThreadMessages(messages)
    void loadAttachments(messages, conversationId)
    await supabase.from('property_conversation_reads').upsert({ conversation_id: conversationId, user_id: user.id, last_read_at: new Date().toISOString() }, { onConflict: 'conversation_id,user_id' })
    void load()
  }

  function closeThread() {
    setOpenConversationId(null)
    openConversationRef.current = null
  }

  async function sendReply() {
    if (!supabase || !openRow || !replyText.trim()) return
    setThreadBusy(true)
    setThreadError('')
    const { data: msg, error: msgErr } = await supabase
      .from('property_messages')
      .insert({ conversation_id: openRow.conversationId, sender_user_id: user.id, sender_role: 'Owner', message: replyText.trim() })
      .select('id')
      .single()
    if (msgErr || !msg) { setThreadBusy(false); setThreadError(msgErr?.message || 'Could not send message.'); return }
    if (attachFile) {
      const path = `${openRow.conversationId}/${crypto.randomUUID()}-${attachFile.name}`
      const { error: uploadErr } = await supabase.storage.from('tenant-connect-attachments').upload(path, attachFile)
      if (!uploadErr) await supabase.from('property_message_attachments').insert({ message_id: msg.id, storage_path: path, mime_type: attachFile.type, size_bytes: attachFile.size })
      else setThreadError(`Message sent, but the attachment failed to upload: ${uploadErr.message}`)
    }
    setThreadBusy(false)
    setReplyText('')
    setAttachFile(null)
    // Reuses the exact same notify kind TenantRequestsPanel's sendReply()
    // already calls. Every real conversation today originates from a
    // tenant_requests submission, so a matching request is always found
    // in practice; if a conversation genuinely has none (schema permits
    // it, no app code currently creates one that way), there is no
    // existing notify path for it and none is invented here — the
    // message still sends, it just has no email behind it, same
    // graceful-degradation convention as every other notify call site.
    const matchingRequest = tenantRequests.find((r) => r.conversation_id === openRow.conversationId)
    if (matchingRequest) void notifyTenantConnect(supabase, 'landlord_update', { requestId: matchingRequest.id })
    await openConversation(openRow.conversationId)
  }

  function formatTimestamp(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  return (
    <main className="shell">
      <AuthHeader />

      <section className="intro maintenanceHubIntro">
        <div className="maintenanceHubHead">
          <h1>Tenant Connect</h1>
        </div>
        {tenantConnectEnabled && !loading && tab === 'tenants' && (
          <p className="muted">
            {summary.connected} connected
            {summary.pending > 0 ? ` · ${summary.pending} pending` : ''}
            {summary.notConnected > 0 ? ` · ${summary.notConnected} not connected` : ''}
          </p>
        )}
        {tenantConnectEnabled && !loading && tab === 'messages' && (
          <p className="muted">{inbox.length} conversation{inbox.length === 1 ? '' : 's'}{unreadCount > 0 ? ` · ${unreadCount} unread` : ''}</p>
        )}
      </section>

      {tenantConnectEnabled && (
        <div className="maintenanceFilterRow" role="tablist" aria-label="Tenant Connect sections">
          <button type="button" role="tab" aria-selected={tab === 'messages'} className={`maintenanceFilterChip${tab === 'messages' ? ' active' : ''}`} onClick={() => setTab('messages')}>Messages{unreadCount > 0 ? ` (${unreadCount})` : ''}</button>
          <button type="button" role="tab" aria-selected={tab === 'tenants'} className={`maintenanceFilterChip${tab === 'tenants' ? ' active' : ''}`} onClick={() => setTab('tenants')}>Tenants</button>
        </div>
      )}

      {error && <div className="globalError">{error}<button onClick={() => setError('')}>×</button></div>}

      {!tenantConnectEnabled ? (
        <div className="emptyState"><strong>Tenant Connect isn&rsquo;t available on this plan.</strong></div>
      ) : loading ? (
        <div className="emptyState"><strong>Loading…</strong></div>
      ) : tab === 'messages' ? (
        inbox.length === 0 ? (
          <div className="emptyState"><strong>No conversations yet.</strong><span>Messages your tenants send will show up here.</span></div>
        ) : (
          <div className="tenantDirectoryList">
            {inbox.map((row) => (
              <button type="button" key={row.conversationId} className="tenantInboxRow" onClick={() => void openConversation(row.conversationId)}>
                <span className="tenantInboxRowHead">
                  <span className="tenantInboxRowBody">
                    <strong>{row.tenantName}</strong>
                    <span className="muted">{row.propertyLabel}</span>
                  </span>
                  {row.unread && <span className="tenantInboxUnreadDot" aria-label="Unread" />}
                  {row.latestMessageAt && <span className="muted tenantInboxTimestamp">{formatTimestamp(row.latestMessageAt)}</span>}
                </span>
                <span className="muted tenantInboxPreview">{row.latestMessagePreview || 'No messages yet.'}</span>
                {row.maintenanceRequestId && <span className="tenantInboxMaintenanceBadge">Maintenance request</span>}
              </button>
            ))}
          </div>
        )
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

      {openRow && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && closeThread()}>
          <div className="modal tenantConnectThreadModal">
            <div className="modalTop">
              <div><p className="eyebrow">{openRow.propertyLabel}</p><h2>{openRow.tenantName}</h2></div>
              <button className="iconButton" onClick={closeThread}>×</button>
            </div>
            {openRow.maintenanceRequestId && (
              <Link href="/maintenance" className="tenantRequestViewInMaintenance">View in Maintenance &rarr;</Link>
            )}
            {threadError && <p className="errorMessage">{threadError}</p>}
            <div className="tenantConnectThread">
              {threadMessages.map((m) => (
                <div key={m.id} className={`tenantConnectBubble tenantConnectBubble${m.sender_role}`}>
                  <div className="tenantConnectBubbleMeta"><strong>{m.sender_role}</strong><span>{new Date(m.created_at).toLocaleString()}</span></div>
                  <p>{m.message}</p>
                  {(attachmentsByMessage.get(m.id) || []).length > 0 && (
                    <div className="tenantConnectBubbleAttachments">
                      {(attachmentsByMessage.get(m.id) || []).map((url) => (
                        <a key={url} href={url} target="_blank" rel="noreferrer"><img src={url} alt="Attached photo" /></a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {!threadMessages.length && <p className="muted">No messages yet.</p>}
            </div>
            <div className="tenantConnectCompose">
              <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} rows={3} placeholder="Write a reply…" />
              <div className="tenantConnectComposeRow">
                <label className="secondary tenantConnectAttachLabel">
                  {attachFile ? attachFile.name : 'Attach photo'}
                  <input type="file" accept="image/*" onChange={(e) => setAttachFile(e.target.files?.[0] || null)} hidden />
                </label>
                <button className="primary" disabled={threadBusy || !replyText.trim()} onClick={() => void sendReply()}>{threadBusy ? 'Sending…' : 'Reply'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
