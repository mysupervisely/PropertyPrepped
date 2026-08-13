'use client'

// PropRoster Milestone 10: Tenant Connect — owner-side panel, embedded in
// the Landlord tab of a Rental Property (app/page.tsx).
//
// Every read/write here goes through the caller's own RLS-scoped Supabase
// client (lib/supabase.ts) — never a service-role key — exactly like the
// rest of this app's property/document/photo handling. RLS in
// supabase/milestone-10-tenant-connect.sql is the real security boundary;
// this component only ever asks for rows it's already entitled to see,
// and every insert here (invite, conversation, message) is validated
// again server-side by that same RLS, so a bug in this component's own
// logic can degrade the UI but can never grant access to another
// owner/tenant's data.
//
// This is the OWNER's view only — see the Milestone 10 completion report
// for why a full tenant-facing surface is out of scope for this pass
// (Section D explicitly allows deferring it: "implement only what is
// required for Tenant Connect safely").

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { isConversationUnread, messagePreview, tenantDisplayName } from '../lib/tenant-connect/helpers'
import type { ConversationType, PropertyConversation, PropertyMessage, TenantPropertyAccess } from '../lib/tenant-connect/types'

type ConversationRow = PropertyConversation & {
  tenant_property_access: Pick<TenantPropertyAccess, 'tenant_email' | 'status'> | null
  latestMessage: string | null
  latestMessageAt: string | null
  unread: boolean
}

const CONVERSATION_TYPES_FOR_NEW: ConversationType[] = ['General', 'Maintenance', 'Lease', 'Question', 'Other']

export function TenantConnectPanel({
  propertyId,
  ownerId,
  tenantConnectEnabled,
}: {
  propertyId: string
  ownerId: string
  tenantConnectEnabled: boolean
}) {
  const [tenants, setTenants] = useState<TenantPropertyAccess[]>([])
  const [conversations, setConversations] = useState<ConversationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')

  const [showNewConversation, setShowNewConversation] = useState(false)
  const [newSubject, setNewSubject] = useState('')
  const [newType, setNewType] = useState<ConversationType>('General')
  const [newTenantAccessId, setNewTenantAccessId] = useState('')
  const [newFirstMessage, setNewFirstMessage] = useState('')

  const [openConversationId, setOpenConversationId] = useState<string | null>(null)
  const [threadMessages, setThreadMessages] = useState<PropertyMessage[]>([])
  const [replyText, setReplyText] = useState('')
  const [attachFile, setAttachFile] = useState<File | null>(null)

  async function loadAll() {
    if (!supabase) return
    const client = supabase // narrow once — TS otherwise loses the null-check inside the closure below
    setLoading(true)
    setError('')
    const [tenantsRes, conversationsRes] = await Promise.all([
      client.from('tenant_property_access').select('*').eq('property_id', propertyId).order('created_at', { ascending: false }),
      client
        .from('property_conversations')
        .select('*, tenant_property_access(tenant_email, status)')
        .eq('property_id', propertyId)
        .order('updated_at', { ascending: false }),
    ])
    if (tenantsRes.error) setError(tenantsRes.error.message)
    if (conversationsRes.error) setError(conversationsRes.error.message)
    setTenants((tenantsRes.data as TenantPropertyAccess[]) || [])

    const convs = (conversationsRes.data as unknown as ConversationRow[]) || []
    // Latest message + this owner's own read marker are fetched per
    // conversation — a small foundation-scale panel (one property's
    // conversations at a time), not worth a bespoke SQL view yet.
    const enriched = await Promise.all(
      convs.map(async (c) => {
        const [msgRes, readRes] = await Promise.all([
          client.from('property_messages').select('message, created_at').eq('conversation_id', c.id).order('created_at', { ascending: false }).limit(1),
          client.from('property_conversation_reads').select('last_read_at').eq('conversation_id', c.id).eq('user_id', ownerId).maybeSingle(),
        ])
        const latest = msgRes.data?.[0]
        return {
          ...c,
          latestMessage: latest?.message ?? null,
          latestMessageAt: latest?.created_at ?? null,
          unread: isConversationUnread(latest?.created_at ?? null, readRes.data?.last_read_at ?? null),
        }
      }),
    )
    setConversations(enriched)
    setLoading(false)
  }

  useEffect(() => {
    if (tenantConnectEnabled) void loadAll()
    else setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, tenantConnectEnabled])

  async function sendInvite() {
    if (!supabase || !inviteEmail.trim()) return
    setBusy(true)
    setError('')
    const { error: err } = await supabase.from('tenant_property_access').insert({
      property_id: propertyId,
      owner_id: ownerId,
      tenant_email: inviteEmail.trim().toLowerCase(),
    })
    setBusy(false)
    if (err) {
      setError(err.message)
      return
    }
    setInviteEmail('')
    setShowInvite(false)
    await loadAll()
  }

  async function revokeTenant(accessId: string) {
    if (!supabase) return
    setBusy(true)
    const { error: err } = await supabase.from('tenant_property_access').update({ status: 'Revoked', revoked_at: new Date().toISOString() }).eq('id', accessId)
    setBusy(false)
    if (err) setError(err.message)
    else await loadAll()
  }

  async function startConversation() {
    if (!supabase || !newTenantAccessId || !newSubject.trim() || !newFirstMessage.trim()) return
    setBusy(true)
    setError('')
    const { data: conv, error: convErr } = await supabase
      .from('property_conversations')
      .insert({ property_id: propertyId, owner_id: ownerId, tenant_access_id: newTenantAccessId, subject: newSubject.trim(), conversation_type: newType })
      .select('id')
      .single()
    if (convErr || !conv) {
      setBusy(false)
      setError(convErr?.message || 'Could not start conversation.')
      return
    }
    const { error: msgErr } = await supabase
      .from('property_messages')
      .insert({ conversation_id: conv.id, sender_user_id: ownerId, sender_role: 'Owner', message: newFirstMessage.trim() })
    setBusy(false)
    if (msgErr) {
      setError(msgErr.message)
      return
    }
    setShowNewConversation(false)
    setNewSubject('')
    setNewFirstMessage('')
    setNewTenantAccessId('')
    await loadAll()
    setOpenConversationId(conv.id)
  }

  async function openConversation(id: string) {
    setOpenConversationId(id)
    setReplyText('')
    setAttachFile(null)
    if (!supabase) return
    const { data, error: err } = await supabase.from('property_messages').select('*').eq('conversation_id', id).order('created_at', { ascending: true })
    if (err) {
      setError(err.message)
      return
    }
    setThreadMessages((data as PropertyMessage[]) || [])
    // Mark read — best-effort, never blocks the thread from opening.
    await supabase.from('property_conversation_reads').upsert({ conversation_id: id, user_id: ownerId, last_read_at: new Date().toISOString() }, { onConflict: 'conversation_id,user_id' })
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unread: false } : c)))
  }

  async function sendReply() {
    if (!supabase || !openConversationId || !replyText.trim()) return
    setBusy(true)
    setError('')
    const { data: msg, error: msgErr } = await supabase
      .from('property_messages')
      .insert({ conversation_id: openConversationId, sender_user_id: ownerId, sender_role: 'Owner', message: replyText.trim() })
      .select('id')
      .single()
    if (msgErr || !msg) {
      setBusy(false)
      setError(msgErr?.message || 'Could not send message.')
      return
    }
    if (attachFile) {
      const path = `${openConversationId}/${crypto.randomUUID()}-${attachFile.name}`
      const { error: uploadErr } = await supabase.storage.from('tenant-connect-attachments').upload(path, attachFile)
      if (!uploadErr) {
        await supabase.from('property_message_attachments').insert({ message_id: msg.id, storage_path: path, mime_type: attachFile.type, size_bytes: attachFile.size })
      } else {
        setError(`Message sent, but the attachment failed to upload: ${uploadErr.message}`)
      }
    }
    setBusy(false)
    setReplyText('')
    setAttachFile(null)
    await openConversation(openConversationId)
    await loadAll()
  }

  async function closeConversation(id: string, status: 'Open' | 'Closed') {
    if (!supabase) return
    const { error: err } = await supabase.from('property_conversations').update({ status }).eq('id', id)
    if (err) setError(err.message)
    else await loadAll()
  }

  if (!tenantConnectEnabled) {
    return (
      <div className="tenantConnectLocked">
        <h3>Tenant Connect</h3>
        <p>Message your tenants directly inside PropRoster, organized by property. Included on Portfolio and Portfolio Pro.</p>
      </div>
    )
  }

  const activeTenants = tenants.filter((t) => t.status === 'Active')
  const openConversation_ = conversations.find((c) => c.id === openConversationId)

  return (
    <div className="tenantConnect">
      <div className="tenantConnectHead">
        <h3>Tenant Connect</h3>
        <div className="tenantConnectHeadActions">
          <button className="secondary" onClick={() => setShowInvite(true)}>+ Invite tenant</button>
          <button className="primary" disabled={!activeTenants.length} onClick={() => setShowNewConversation(true)}>+ New conversation</button>
        </div>
      </div>
      {!activeTenants.length && !loading && <p className="muted tenantConnectHint">Invite a tenant by email to start a conversation. They&rsquo;ll be able to accept once they sign in with that email.</p>}
      {error && <div className="statusMessage errorMessage">{error}<button onClick={() => setError('')}>×</button></div>}

      {tenants.length > 0 && (
        <div className="tenantConnectTenants">
          {tenants.map((t) => (
            <span key={t.id} className={`tenantChip tenantChip${t.status}`}>
              {tenantDisplayName(t.tenant_email, t.status)}
              {t.status !== 'Revoked' && <button className="tenantChipRevoke" disabled={busy} onClick={() => void revokeTenant(t.id)} title="Revoke access">×</button>}
            </span>
          ))}
        </div>
      )}

      {loading ? (
        <p className="muted">Loading conversations…</p>
      ) : conversations.length ? (
        <div className="tenantConnectList">
          {conversations.map((c) => (
            <button key={c.id} className={`tenantConnectRow${c.unread ? ' tenantConnectRowUnread' : ''}`} onClick={() => void openConversation(c.id)}>
              <div className="tenantConnectRowTop">
                <span className="tenantConnectRowSubject">{c.unread && <span className="unreadDot" aria-label="Unread" />}{c.subject}</span>
                <span className={`statusPill ${c.status === 'Open' ? 'pillGood' : 'pillMuted'}`}>{c.status}</span>
              </div>
              <div className="tenantConnectRowMeta">
                <span>{c.tenant_property_access ? tenantDisplayName(c.tenant_property_access.tenant_email, c.tenant_property_access.status) : 'Tenant'}</span>
                <span>·</span>
                <span>{c.conversation_type}</span>
              </div>
              <p className="tenantConnectRowPreview">{c.latestMessage ? messagePreview(c.latestMessage) : 'No messages yet.'}</p>
              <small className="muted">{c.latestMessageAt ? `Last activity ${new Date(c.latestMessageAt).toLocaleString()}` : `Started ${new Date(c.created_at).toLocaleDateString()}`}</small>
            </button>
          ))}
        </div>
      ) : (
        <p className="muted">No conversations yet.</p>
      )}

      {showInvite && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setShowInvite(false)}>
          <div className="modal tenantConnectModal">
            <div className="modalTop"><h2>Invite a tenant</h2><button className="iconButton" onClick={() => setShowInvite(false)}>×</button></div>
            <label>Tenant email<input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="tenant@example.com" /></label>
            <p className="muted">They&rsquo;ll get access once they sign in to PropRoster with this exact email address.</p>
            <div className="modalActions"><button className="secondary" onClick={() => setShowInvite(false)}>Cancel</button><button className="primary" disabled={busy || !inviteEmail.trim()} onClick={() => void sendInvite()}>{busy ? 'Sending…' : 'Send invite'}</button></div>
          </div>
        </div>
      )}

      {showNewConversation && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setShowNewConversation(false)}>
          <div className="modal tenantConnectModal">
            <div className="modalTop"><h2>New conversation</h2><button className="iconButton" onClick={() => setShowNewConversation(false)}>×</button></div>
            <label>Tenant<select value={newTenantAccessId} onChange={(e) => setNewTenantAccessId(e.target.value)}><option value="">Select a tenant</option>{activeTenants.map((t) => <option key={t.id} value={t.id}>{t.tenant_email}</option>)}</select></label>
            <label>Type<select value={newType} onChange={(e) => setNewType(e.target.value as ConversationType)}>{CONVERSATION_TYPES_FOR_NEW.map((t) => <option key={t}>{t}</option>)}</select></label>
            <label>Subject<input value={newSubject} onChange={(e) => setNewSubject(e.target.value)} placeholder="Upcoming inspection" /></label>
            <label>Message<textarea value={newFirstMessage} onChange={(e) => setNewFirstMessage(e.target.value)} rows={4} placeholder="Write your first message…" /></label>
            <div className="modalActions"><button className="secondary" onClick={() => setShowNewConversation(false)}>Cancel</button><button className="primary" disabled={busy || !newTenantAccessId || !newSubject.trim() || !newFirstMessage.trim()} onClick={() => void startConversation()}>{busy ? 'Starting…' : 'Start conversation'}</button></div>
          </div>
        </div>
      )}

      {openConversation_ && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setOpenConversationId(null)}>
          <div className="modal tenantConnectThreadModal">
            <div className="modalTop">
              <div>
                <p className="eyebrow">{openConversation_.conversation_type.toUpperCase()}</p>
                <h2>{openConversation_.subject}</h2>
              </div>
              <button className="iconButton" onClick={() => setOpenConversationId(null)}>×</button>
            </div>
            <div className="tenantConnectThreadMeta">
              <span>{openConversation_.tenant_property_access ? tenantDisplayName(openConversation_.tenant_property_access.tenant_email, openConversation_.tenant_property_access.status) : 'Tenant'}</span>
              <button className="secondary" onClick={() => void closeConversation(openConversation_.id, openConversation_.status === 'Open' ? 'Closed' : 'Open')}>{openConversation_.status === 'Open' ? 'Mark Closed' : 'Reopen'}</button>
            </div>
            <div className="tenantConnectThread">
              {threadMessages.map((m) => (
                <div key={m.id} className={`tenantConnectBubble tenantConnectBubble${m.sender_role}`}>
                  <div className="tenantConnectBubbleMeta"><strong>{m.sender_role}</strong><span>{new Date(m.created_at).toLocaleString()}</span></div>
                  <p>{m.message}</p>
                </div>
              ))}
              {!threadMessages.length && <p className="muted">No messages yet.</p>}
            </div>
            <div className="tenantConnectCompose">
              <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} rows={3} placeholder="Write a reply…" />
              <div className="tenantConnectComposeRow">
                {openConversation_.conversation_type === 'Maintenance' && (
                  <label className="secondary tenantConnectAttachLabel">
                    {attachFile ? attachFile.name : 'Attach photo'}
                    <input type="file" accept="image/*" onChange={(e) => setAttachFile(e.target.files?.[0] || null)} hidden />
                  </label>
                )}
                <button className="primary" disabled={busy || !replyText.trim()} onClick={() => void sendReply()}>{busy ? 'Sending…' : 'Send'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
