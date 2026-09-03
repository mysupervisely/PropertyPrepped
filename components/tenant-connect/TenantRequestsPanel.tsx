'use client'

// PropRoster — Tenant Connect V1 (Milestone 24): the landlord-side
// Requests list for Property > Rent > Tenant (Sections 6-9).
//
// Reuses M10's property_conversations/property_messages/attachments
// wholesale for the actual thread (same RLS, same sender-role-
// derivation trigger, same tenant-connect-attachments storage bucket) —
// tenant_requests (this milestone's one new table) is thin metadata
// (category/title/description/status) sitting beside a conversation,
// never a parallel messaging system. See supabase/milestone-24-tenant-
// connect-v1.sql's own header comment for the full reasoning — actually
// created in production by
// supabase/milestone-25-maintenance-coordination-foundation.sql (M1
// foundation repair; milestone-24's own migration was never applied to
// production — see docs/tenant-connect-maintenance-m1-foundation.md).

import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { notifyTenantConnect } from '../../lib/tenant-connect/notify-client'
import { TENANT_REQUEST_STATUSES, type TenantRequest, type TenantRequestStatus } from '../../lib/tenant-connect/types'
import type { PropertyMessage } from '../../lib/tenant-connect/types'
import { maintenanceCategoryLabel } from '../../lib/maintenance/categories'

type AccessRef = { id: string; tenant_email: string }

export function TenantRequestsPanel({
  supabase, propertyId, ownerId, tenantConnectEnabled,
}: {
  supabase: SupabaseClient
  propertyId: string
  ownerId: string
  tenantConnectEnabled: boolean
}) {
  const [requests, setRequests] = useState<TenantRequest[]>([])
  const [accessById, setAccessById] = useState<Map<string, AccessRef>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [openId, setOpenId] = useState<string | null>(null)
  const [threadMessages, setThreadMessages] = useState<PropertyMessage[]>([])
  const [attachmentsByMessage, setAttachmentsByMessage] = useState<Map<string, string[]>>(new Map())
  const [replyText, setReplyText] = useState('')
  const [attachFile, setAttachFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    setError('')
    const [{ data: reqRows, error: reqErr }, { data: accessRows }] = await Promise.all([
      supabase.from('tenant_requests').select('*').eq('property_id', propertyId).order('created_at', { ascending: false }),
      supabase.from('tenant_property_access').select('id, tenant_email').eq('property_id', propertyId),
    ])
    if (reqErr) setError(reqErr.message)
    setRequests((reqRows as TenantRequest[]) || [])
    setAccessById(new Map(((accessRows as AccessRef[]) || []).map((a) => [a.id, a])))
    setLoading(false)
  }

  useEffect(() => {
    if (tenantConnectEnabled) void load()
    else setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, tenantConnectEnabled])

  async function loadAttachments(messages: PropertyMessage[]) {
    if (!messages.length) { setAttachmentsByMessage(new Map()); return }
    const { data } = await supabase.from('property_message_attachments').select('message_id, storage_path').in('message_id', messages.map((m) => m.id))
    const rows = (data as { message_id: string; storage_path: string }[]) || []
    const byMessage = new Map<string, string[]>()
    for (const row of rows) {
      const { data: signed } = await supabase.storage.from('tenant-connect-attachments').createSignedUrl(row.storage_path, 3600)
      if (signed?.signedUrl) byMessage.set(row.message_id, [...(byMessage.get(row.message_id) || []), signed.signedUrl])
    }
    setAttachmentsByMessage(byMessage)
  }

  async function openRequest(request: TenantRequest) {
    setOpenId(request.id)
    setReplyText('')
    setAttachFile(null)
    const { data, error: err } = await supabase.from('property_messages').select('*').eq('conversation_id', request.conversation_id).order('created_at', { ascending: true })
    if (err) { setError(err.message); return }
    const messages = (data as PropertyMessage[]) || []
    setThreadMessages(messages)
    void loadAttachments(messages)
    await supabase.from('property_conversation_reads').upsert({ conversation_id: request.conversation_id, user_id: ownerId, last_read_at: new Date().toISOString() }, { onConflict: 'conversation_id,user_id' })
  }

  const open = requests.find((r) => r.id === openId) || null

  async function changeStatus(status: TenantRequestStatus) {
    if (!open) return
    setBusy(true)
    const { error: err } = await supabase.from('tenant_requests').update({ status }).eq('id', open.id)
    setBusy(false)
    if (err) { setError(err.message); return }
    void notifyTenantConnect(supabase, 'landlord_update', { requestId: open.id })
    await load()
  }

  async function sendReply() {
    if (!open || !replyText.trim()) return
    setBusy(true)
    setError('')
    const { data: msg, error: msgErr } = await supabase
      .from('property_messages')
      .insert({ conversation_id: open.conversation_id, sender_user_id: ownerId, sender_role: 'Owner', message: replyText.trim() })
      .select('id')
      .single()
    if (msgErr || !msg) { setBusy(false); setError(msgErr?.message || 'Could not send message.'); return }
    if (attachFile) {
      const path = `${open.conversation_id}/${crypto.randomUUID()}-${attachFile.name}`
      const { error: uploadErr } = await supabase.storage.from('tenant-connect-attachments').upload(path, attachFile)
      if (!uploadErr) await supabase.from('property_message_attachments').insert({ message_id: msg.id, storage_path: path, mime_type: attachFile.type, size_bytes: attachFile.size })
      else setError(`Message sent, but the attachment failed to upload: ${uploadErr.message}`)
    }
    setBusy(false)
    setReplyText('')
    setAttachFile(null)
    void notifyTenantConnect(supabase, 'landlord_update', { requestId: open.id })
    await openRequest(open)
  }

  if (!tenantConnectEnabled) return null

  return (
    <div className="tenantRequestsPanel">
      <div className="sectionHead workspaceHeading"><div><p className="eyebrow">TENANT CONNECT</p><h3>Requests</h3></div></div>
      {error && <div className="statusMessage errorMessage">{error}<button onClick={() => setError('')}>×</button></div>}
      {loading ? (
        <p className="muted">Loading requests…</p>
      ) : requests.length ? (
        <div className="maintenanceList">
          {requests.map((r) => (
            <button key={r.id} className="maintenanceRow requestRow tenantRequestRow" onClick={() => void openRequest(r)}>
              <div className="maintenanceDate"><strong>{new Date(r.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</strong><span>{new Date(r.created_at).getFullYear()}</span></div>
              <div className="maintenanceBody">
                <div className="maintenanceTitle">
                  <div>
                    <span className={`statusPill ${r.status === 'New' ? 'pillWarn' : r.status === 'Resolved' ? 'pillGood' : ''}`}>{r.status}</span>
                    <h3>{r.title}</h3>
                    <p>{maintenanceCategoryLabel(r.category)} · {accessById.get(r.tenant_access_id)?.tenant_email || 'Tenant'}</p>
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <p className="muted tenantConnectHint">Requests your tenant submits will show up here.</p>
      )}

      {open && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setOpenId(null)}>
          <div className="modal tenantConnectThreadModal">
            <div className="modalTop">
              <div><p className="eyebrow">{maintenanceCategoryLabel(open.category).toUpperCase()}</p><h2>{open.title}</h2></div>
              <button className="iconButton" onClick={() => setOpenId(null)}>×</button>
            </div>
            <div className="tenantConnectThreadMeta">
              <span>{accessById.get(open.tenant_access_id)?.tenant_email || 'Tenant'}</span>
              <select aria-label="Request status" value={open.status} disabled={busy} onChange={(e) => void changeStatus(e.target.value as TenantRequestStatus)}>
                {TENANT_REQUEST_STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <p className="requestDescription">{open.description}</p>
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
              {!threadMessages.length && <p className="muted">No replies yet.</p>}
            </div>
            <div className="tenantConnectCompose">
              <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} rows={3} placeholder="Write a reply…" />
              <div className="tenantConnectComposeRow">
                <label className="secondary tenantConnectAttachLabel">
                  {attachFile ? attachFile.name : 'Attach photo'}
                  <input type="file" accept="image/*" onChange={(e) => setAttachFile(e.target.files?.[0] || null)} hidden />
                </label>
                <button className="primary" disabled={busy || !replyText.trim()} onClick={() => void sendReply()}>{busy ? 'Sending…' : 'Reply'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
