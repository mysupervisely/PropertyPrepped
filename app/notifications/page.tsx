'use client'

// PropRoster — Mobile V3: Notifications & Activity Center.
//
// A portfolio-wide, chronological feed over public.notification_events
// (supabase/milestone-35-mobile-v3-notification-center.sql) — a table
// populated exclusively by SECURITY DEFINER database triggers, never by
// this page. This page only reads, formats (lib/notifications/events.ts),
// and marks read; it never derives or fabricates an event of its own.
//
// Does not duplicate the existing conversation/maintenance/PropCrew
// interfaces: every item links OUT to the real existing page
// (/tenant-connect, /maintenance) via lib/notifications/events.ts's
// navHrefForEvent() — this page never renders a message thread or a
// case detail itself.
//
// Page-shell pattern mirrors app/maintenance/page.tsx exactly (useAuthUser
// + AuthHeader + the same authShell/authCard sign-in gate, its own
// independent Supabase fetch).
//
// SECURITY: every query relies entirely on RLS
// (notification_events_select_own/_update_own, properties_select_own,
// maintenance_requests_select_own, property_conversations_select,
// tenant_access_select, leases_select_own — all pre-existing, all
// owner-scoped) — no explicit owner_id filter is strictly required for
// any of them, but one is added on notification_events itself for
// defense-in-depth clarity, same convention as lib/useSubscription.ts.
// No service-role key, no elevated client.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { useAuthUser } from '../../lib/useAuthUser'
import { AuthHeader } from '../../components/AuthHeader'
import {
  buildNotificationFeed, unreadCount, type NotificationEventRow, type NotificationContext,
} from '../../lib/notifications/events'
import type { DirectoryProperty } from '../../lib/tenant-connect/directory'

export default function NotificationsPage() {
  const { user, ready } = useAuthUser()

  if (!ready) return <main className="authShell"><div className="loadingState">Loading notifications…</div></main>

  if (!user) {
    return (
      <main className="authShell">
        <section className="authCard">
          <p className="eyebrow">PROPROSTER</p>
          <h1>Sign in required</h1>
          <p className="authIntro">Sign in to view your notifications.</p>
          <Link className="primary authSubmit" href="/">Go to sign in</Link>
        </section>
      </main>
    )
  }

  return <NotificationsWorkspace user={user} />
}

function NotificationsWorkspace({ user }: { user: User }) {
  const [events, setEvents] = useState<NotificationEventRow[]>([])
  const [properties, setProperties] = useState<DirectoryProperty[]>([])
  const [maintenanceRequests, setMaintenanceRequests] = useState<{ id: string; tenant_name: string }[]>([])
  const [conversations, setConversations] = useState<{ id: string; tenant_access_id: string }[]>([])
  const [access, setAccess] = useState<{ id: string; tenant_email: string; lease_id: string | null }[]>([])
  const [leases, setLeases] = useState<{ id: string; tenant_name: string }[]>([])
  const [outreach, setOutreach] = useState<{ id: string; contact_id: string }[]>([])
  const [contacts, setContacts] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [markingAll, setMarkingAll] = useState(false)

  async function load() {
    if (!supabase) return
    setLoading(true)
    setError('')
    const [
      { data: eventRows, error: eventError },
      { data: propertyRows },
      { data: maintenanceRows },
      { data: conversationRows },
      { data: accessRows },
      { data: leaseRows },
      { data: outreachRows },
      { data: contactRows },
    ] = await Promise.all([
      supabase.from('notification_events').select('*').eq('owner_id', user.id).order('created_at', { ascending: false }),
      supabase.from('properties').select('id,address,city'),
      supabase.from('maintenance_requests').select('id,tenant_name'),
      supabase.from('property_conversations').select('id,tenant_access_id'),
      supabase.from('tenant_property_access').select('id,tenant_email,lease_id'),
      supabase.from('leases').select('id,tenant_name'),
      // Provider Outreach / PropCrew tables: same defensive "may
      // legitimately not apply to every account" pattern every other
      // portfolio page in this app already uses for these.
      supabase.from('maintenance_provider_outreach').select('id,contact_id'),
      supabase.from('property_contacts').select('id,name'),
    ])
    if (eventError) { setError(eventError.message); setLoading(false); return }
    setEvents((eventRows || []) as NotificationEventRow[])
    setProperties((propertyRows || []) as DirectoryProperty[])
    setMaintenanceRequests((maintenanceRows || []) as { id: string; tenant_name: string }[])
    setConversations((conversationRows || []) as { id: string; tenant_access_id: string }[])
    setAccess((accessRows || []) as { id: string; tenant_email: string; lease_id: string | null }[])
    setLeases((leaseRows || []) as { id: string; tenant_name: string }[])
    setOutreach((outreachRows || []) as { id: string; contact_id: string }[])
    setContacts((contactRows || []) as { id: string; name: string }[])
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  const context: NotificationContext = useMemo(
    () => ({ properties, maintenanceRequests, conversations, access, leases, outreach, contacts }),
    [properties, maintenanceRequests, conversations, access, leases, outreach, contacts],
  )
  const feed = useMemo(() => buildNotificationFeed(events, context), [events, context])
  const unread = useMemo(() => unreadCount(events), [events])

  async function markRead(id: string) {
    if (!supabase) return
    setEvents((prev) => prev.map((e) => (e.id === id && e.read_at === null ? { ...e, read_at: new Date().toISOString() } : e)))
    await supabase.from('notification_events').update({ read_at: new Date().toISOString() }).eq('id', id)
  }

  async function markAllRead() {
    if (!supabase || unread === 0) return
    setMarkingAll(true)
    const now = new Date().toISOString()
    setEvents((prev) => prev.map((e) => (e.read_at === null ? { ...e, read_at: now } : e)))
    await supabase.from('notification_events').update({ read_at: now }).eq('owner_id', user.id).is('read_at', null)
    setMarkingAll(false)
  }

  function formatTimestamp(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  }

  return (
    <main className="shell">
      <AuthHeader />

      <section className="intro maintenanceHubIntro">
        <div className="maintenanceHubHead">
          <h1>Notifications</h1>
          {unread > 0 && (
            <button type="button" className="secondary" disabled={markingAll} onClick={() => void markAllRead()}>
              {markingAll ? 'Marking…' : 'Mark all as read'}
            </button>
          )}
        </div>
        {!loading && <p className="muted">{feed.length} notification{feed.length === 1 ? '' : 's'}{unread > 0 ? ` · ${unread} unread` : ''}</p>}
      </section>

      {error && <div className="globalError">{error}<button onClick={() => setError('')}>×</button></div>}

      {loading ? (
        <div className="emptyState"><strong>Loading…</strong></div>
      ) : feed.length === 0 ? (
        <div className="emptyState"><strong>Nothing yet.</strong><span>New tenant messages, maintenance activity, and PropCrew updates will show up here.</span></div>
      ) : (
        <div className="tenantDirectoryList">
          {feed.map((item) => (
            <Link
              key={item.id}
              href={item.navHref}
              className={`notificationRow${item.unread ? ' notificationRowUnread' : ''}`}
              onClick={() => void markRead(item.id)}
            >
              {item.unread && <span className="tenantInboxUnreadDot" aria-label="Unread" />}
              <span className="notificationRowBody">
                <span className="notificationRowTitle">{item.title}</span>
                <span className="muted notificationRowMeta">
                  {item.propertyLabel ? `${item.propertyLabel} · ` : ''}{formatTimestamp(item.createdAt)}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
