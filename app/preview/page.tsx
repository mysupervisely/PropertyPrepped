'use client'

// Mobile Preview harness — see app/preview/layout.tsx for why this
// route exists and why it cannot reach production. Reads only from
// app/preview/_lib/fixtures.ts — no supabase import, no fetch() call,
// nowhere in this file or its siblings. It mirrors the real app's own
// single-page-app navigation style (app/page.tsx's selectedId-based
// property workspace) using the SAME CSS classes from app/globals.css,
// so the visual result is faithful to production even though this
// isn't literally app/page.tsx's code (that file fetches everything
// from a live Supabase client with no seam to swap in fixture data
// safely — see the milestone report for why that tradeoff was made).

import { useState } from 'react'
import { Wordmark } from '../../components/Wordmark'
import { WrenchIcon, PeopleIcon, ReceiptIcon, DollarIcon, UploadIcon, PersonIcon, HomeIcon, ChatIcon } from '../../components/icons/NavIcons'
import { resolveInitials } from '../../lib/user-profile/greeting'
import {
  QUICK_ACTION_IDS, QUICK_ACTION_LABELS, QUICK_ACTION_SELECTION_SIZE, DEFAULT_QUICK_ACTIONS,
  isValidQuickActionSelection, type QuickActionId,
} from '../../lib/dashboard/quick-actions'
import {
  FIXTURE_LANDLORD, FIXTURE_PROPERTIES, FIXTURE_STATS, FIXTURE_MAINTENANCE,
  FIXTURE_PROPCREW, FIXTURE_TAX_SUMMARY, FIXTURE_BILLING, FIXTURE_DOCUMENTS,
  FIXTURE_ATTENTION_ITEMS, FIXTURE_CONVERSATIONS, FIXTURE_NOTIFICATIONS, type FixtureProperty, type FixtureAttentionNav,
  type FixtureConversation,
} from './_lib/fixtures'
// Design Foundation V1, Desktop Workspace V1 (preview parity): the
// REAL shared detail component and REAL pure enrichment/filter logic
// — not a hand-copied mirror — so the Maintenance preview screen is
// exactly as faithful to production as the Tenant Connect screen
// already is. See MaintenanceScreen() below for how fixture data is
// adapted into this module's real row shapes.
import { MaintenanceCaseDetail } from '../../components/maintenance/MaintenanceCaseDetail'
import {
  enrichMaintenanceCases, filterMaintenanceCases, showsDedicatedUrgentBadge,
  type MaintenanceCaseRow, type PropCrewContactRef, type EnrichedMaintenanceCase,
} from '../../lib/maintenance/command-center'
import { filterMessageInbox, type MessageInboxRow } from '../../lib/tenant-connect/inbox'
import { MaintenanceCategoryIcon } from '../../components/icons/MaintenanceCategoryIcon'

// Mobile V2 — Quick Actions (preview parity): the SAME catalog/icon
// pairing app/page.tsx uses, not a second hand-maintained list — only
// the navigation underneath differs (this preview switches an internal
// `screen` instead of real routes/Supabase writes).
const QUICK_ACTION_ICON_COMPONENTS: Record<QuickActionId, (props: { className?: string }) => React.ReactElement> = {
  add_expense: DollarIcon,
  smart_upload: UploadIcon,
  maintenance: WrenchIcon,
  invite_tenant: PersonIcon,
  tax_center: ReceiptIcon,
  propcrew: PeopleIcon,
  add_property: HomeIcon,
  tenant_messages: ChatIcon,
}

const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

// Mobile Header Avatar V1 (preview parity): same pure resolveInitials()
// the real ProfileEntryButton uses, given FIXTURE_LANDLORD's fictional
// name split into first/last — no new logic, no real profile data.
function previewInitials(fullName: string): string {
  const [first, last] = fullName.trim().split(/\s+/)
  return resolveInitials({ first_name: first || null, last_name: last || null, display_name: null }, FIXTURE_LANDLORD.email)
}

type Screen = 'dashboard' | 'property' | 'maintenance' | 'tenantconnect' | 'notifications' | 'propcrew' | 'taxcenter' | 'billing' | 'admin'
type PropertyTab = 'overview' | 'documents' | 'tenant'

function occupancyPill(p: FixtureProperty) {
  return p.occupancy === 'occupied' ? 'pillGood' : 'pillMuted'
}
function rentPill(p: FixtureProperty) {
  if (p.rentStatus === 'On time') return 'pillGood'
  if (p.rentStatus === 'Late') return 'pillWarn'
  return 'pillMuted'
}
function maintenancePill(status: string) {
  if (status === 'Resolved') return 'pillGood'
  if (status === 'In Progress' || status === 'Scheduled') return 'pillWarn'
  return 'pillNeutral'
}

export default function PreviewApp() {
  const [screen, setScreen] = useState<Screen>('dashboard')
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null)
  const [propertyTab, setPropertyTab] = useState<PropertyTab>('overview')
  const [selectedMaintenanceId, setSelectedMaintenanceId] = useState<string | null>(null)
  const [navMenuOpen, setNavMenuOpen] = useState(false)
  const [newRequestOpen, setNewRequestOpen] = useState(false)
  const [attentionSheetOpen, setAttentionSheetOpen] = useState(false)
  // Mobile V2 — Quick Actions' Invite Tenant/Tenant Messages (preview
  // parity): same zero/one/many branching as app/page.tsx's
  // startTenantConnectQuickAction, and the same single destination for
  // both ids (the Tenant Connect tab handles invite AND messaging).
  const [inviteTenantPickerOpen, setInviteTenantPickerOpen] = useState(false)
  // Mobile V2 — customizable Dashboard Quick Actions (preview parity).
  // Plain component state, not persisted anywhere — matches every other
  // interaction in this preview (navMenuOpen, selected screens, etc.),
  // all of which already reset on reload. The real app's persistence
  // (public.quick_action_preferences, RLS-scoped) has nothing to do
  // with this fictional harness.
  const [quickActions, setQuickActions] = useState<QuickActionId[]>(DEFAULT_QUICK_ACTIONS)
  const [quickActionsCustomizeOpen, setQuickActionsCustomizeOpen] = useState(false)
  const [quickActionsDraft, setQuickActionsDraft] = useState<QuickActionId[]>(DEFAULT_QUICK_ACTIONS)
  // Smart Upload / Add Property (preview parity): neither has a fictional
  // screen of its own to navigate to (Smart Upload's document-
  // intelligence pipeline and Add Property's form are both real-
  // backend flows with nothing to simulate safely here) — a small
  // decorative confirmation dialog, same "fictional, no real write"
  // convention as the New Maintenance Request modal below, lets a
  // reviewer still see that the shortcut does something distinct.
  const [smartUploadPreviewOpen, setSmartUploadPreviewOpen] = useState(false)
  const [addPropertyPreviewOpen, setAddPropertyPreviewOpen] = useState(false)
  // Mobile V3 (Notifications & Activity Center, preview parity): lifted
  // here (not local to NotificationsScreen) so the header bell's badge
  // count and the Activity Center's own unread state never disagree —
  // same single-source-of-truth reasoning as every other piece of
  // lifted state in this file.
  const [readNotificationIds, setReadNotificationIds] = useState<Set<string>>(new Set())
  const unreadNotificationCount = FIXTURE_NOTIFICATIONS.filter((n) => n.unread && !readNotificationIds.has(n.id)).length

  function goDashboard() {
    setScreen('dashboard')
    setSelectedPropertyId(null)
    setNavMenuOpen(false)
  }
  function openProperty(id: string, tab: PropertyTab = 'overview') {
    setSelectedPropertyId(id)
    setPropertyTab(tab)
    setScreen('property')
  }
  function startTenantConnectQuickAction() {
    if (FIXTURE_PROPERTIES.length === 1) { openProperty(FIXTURE_PROPERTIES[0].id, 'tenant'); return }
    setInviteTenantPickerOpen(true)
  }

  function openQuickActionsCustomize() {
    setQuickActionsDraft(quickActions)
    setQuickActionsCustomizeOpen(true)
  }
  function toggleQuickActionDraft(id: QuickActionId) {
    setQuickActionsDraft((current) => {
      if (current.includes(id)) return current.filter((x) => x !== id)
      if (current.length >= QUICK_ACTION_SELECTION_SIZE) return current
      return [...current, id]
    })
  }
  function saveQuickActions(next: QuickActionId[]) {
    if (!isValidQuickActionSelection(next)) return
    setQuickActions(next)
    setQuickActionsCustomizeOpen(false)
  }
  function restoreDefaultQuickActions() {
    saveQuickActions(DEFAULT_QUICK_ACTIONS)
  }
  function quickActionNav(id: QuickActionId): { kind: 'screen'; screen: Screen } | { kind: 'button'; onClick: () => void } {
    switch (id) {
      case 'add_expense': return { kind: 'screen', screen: 'taxcenter' }
      case 'tax_center': return { kind: 'screen', screen: 'taxcenter' }
      case 'maintenance': return { kind: 'screen', screen: 'maintenance' }
      case 'propcrew': return { kind: 'screen', screen: 'propcrew' }
      case 'add_property': return { kind: 'button', onClick: () => setAddPropertyPreviewOpen(true) }
      case 'smart_upload': return { kind: 'button', onClick: () => setSmartUploadPreviewOpen(true) }
      case 'invite_tenant': return { kind: 'button', onClick: startTenantConnectQuickAction }
      case 'tenant_messages': return { kind: 'button', onClick: startTenantConnectQuickAction }
    }
  }
  function renderQuickAction(id: QuickActionId) {
    const Icon = QUICK_ACTION_ICON_COMPONENTS[id]
    const nav = quickActionNav(id)
    const onClick = nav.kind === 'screen' ? () => setScreen(nav.screen) : nav.onClick
    return (
      <button key={id} type="button" className="mobileQuickAction" onClick={onClick}>
        <span className="mobileQuickActionIcon" aria-hidden="true"><Icon /></span>
        <span className="mobileQuickActionLabel">{QUICK_ACTION_LABELS[id]}</span>
      </button>
    )
  }
  // Needs Attention V2 (preview): mirrors the real app's
  // goToNav/NavTarget mechanism — each fixture item's own `nav` says
  // exactly which existing preview screen/record it concerns, so
  // tapping it both closes the sheet and routes there in one motion,
  // never a duplicate resolution workflow inside the sheet itself.
  function goToAttentionItem(nav: FixtureAttentionNav) {
    setAttentionSheetOpen(false)
    if (nav.screen === 'maintenance') {
      setSelectedMaintenanceId(nav.maintenanceId)
      setScreen('maintenance')
    } else if (nav.screen === 'taxcenter') {
      setScreen('taxcenter')
    } else {
      setSelectedPropertyId(nav.propertyId)
      setPropertyTab(nav.tab)
      setScreen('property')
    }
  }

  const selectedProperty = FIXTURE_PROPERTIES.find((p) => p.id === selectedPropertyId) || null
  const selectedMaintenance = FIXTURE_MAINTENANCE.find((m) => m.id === selectedMaintenanceId)

  return (
    <main className="shell">
      <header className="topbar">
        <div className="topbarBrandGroup">
          <button type="button" className="brand" style={{ border: 0, background: 'transparent', cursor: 'pointer' }} onClick={goDashboard}>
            <Wordmark />
          </button>
        </div>
        <div className="topbarActions">
          {/* Mobile V3 (Notifications & Activity Center, preview parity):
              same .headerSearchButton/.headerBellButton classes the real
              AuthHeader renders, badge count from FIXTURE_NOTIFICATIONS'
              own unread rows — never a separately invented number. */}
          <button type="button" className="headerSearchButton headerBellButton" aria-label="Notifications" onClick={() => setScreen('notifications')}>
            🔔
            {unreadNotificationCount > 0 && <span className="headerBellBadge">{unreadNotificationCount}</span>}
          </button>
          {/* Mobile Header Avatar V1 (preview parity): the real app's
              header replaced a visible account-name + separate
              "Account" button with one circular avatar, showing
              initials when no photo is set — see
              components/ProfileEntryButton.tsx. Mirrored here with the
              same fictional-only data this file already uses. */}
          <div className="profileEntry">
            <button type="button" className="profileEntryButton" aria-label="Open account menu" aria-haspopup="true" aria-expanded={navMenuOpen} onClick={() => setNavMenuOpen((v) => !v)}>
              <span className="profileEntryFallback" aria-hidden="true">{previewInitials(FIXTURE_LANDLORD.name)}</span>
            </button>
          </div>
        </div>
      </header>

      {navMenuOpen && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setNavMenuOpen(false)}>
          <div className="modal" style={{ width: 'min(320px, 100%)' }}>
            <div className="modalTop">
              <h2 style={{ fontSize: 18 }}>{FIXTURE_LANDLORD.name}</h2>
              <button type="button" className="iconButton" aria-label="Close" onClick={() => setNavMenuOpen(false)}>&times;</button>
            </div>
            <p className="muted" style={{ marginBottom: 18 }}>{FIXTURE_LANDLORD.email}</p>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {(['dashboard', 'tenantconnect', 'maintenance', 'propcrew', 'taxcenter', 'billing', 'admin'] as Screen[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  className="secondary"
                  style={{ textAlign: 'left', border: 0 }}
                  onClick={() => { setScreen(s); setSelectedPropertyId(null); setNavMenuOpen(false) }}
                >
                  {({ dashboard: 'Dashboard', maintenance: 'Maintenance', tenantconnect: 'Tenant Connect', propcrew: 'PropCrew', taxcenter: 'Tax Center', billing: 'Account & Billing', admin: 'Admin', property: 'Property' } as Record<Screen, string>)[s]}
                </button>
              ))}
            </nav>
          </div>
        </div>
      )}

      {screen === 'dashboard' && (
        <DashboardScreen
          onOpenProperty={openProperty}
          onOpenAttention={() => setAttentionSheetOpen(true)}
          quickActions={quickActions}
          renderQuickAction={renderQuickAction}
          onCustomizeQuickActions={openQuickActionsCustomize}
        />
      )}

      {/* Mobile V2 — Quick Actions' Invite Tenant/Tenant Messages picker
          (preview parity): same .overlay/.modal/.dashboardItemList
          classes as app/page.tsx's picker, shown only when there's more
          than one fixture property. */}
      {inviteTenantPickerOpen && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setInviteTenantPickerOpen(false)}>
          <div className="modal">
            <div className="modalTop">
              <h2>Tenant Connect — choose a property</h2>
              <button type="button" className="iconButton" aria-label="Close" onClick={() => setInviteTenantPickerOpen(false)}>&times;</button>
            </div>
            <div className="dashboardItemList">
              {FIXTURE_PROPERTIES.map((p) => (
                <button key={p.id} type="button" className="dashboardItemRow" onClick={() => { setInviteTenantPickerOpen(false); openProperty(p.id, 'tenant') }}>
                  <span className="dashboardItemBody"><strong>{p.address}</strong><span className="muted">{p.city}, {p.state}</span></span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Mobile V2 — Quick Actions Customize sheet (preview parity): same
          pick-exactly-4/Restore Defaults interaction as app/page.tsx's
          sheet, saving straight to local state (no network — see
          saveQuickActions() above). */}
      {quickActionsCustomizeOpen && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setQuickActionsCustomizeOpen(false)}>
          <div className="modal quickActionsCustomizeModal">
            <div className="modalTop">
              <h2>Customize Quick Actions</h2>
              <button type="button" className="iconButton" aria-label="Close" onClick={() => setQuickActionsCustomizeOpen(false)}>&times;</button>
            </div>
            <p className="muted quickActionsCustomizeHint">Choose {QUICK_ACTION_SELECTION_SIZE} shortcuts for your mobile dashboard. Selected: {quickActionsDraft.length} of {QUICK_ACTION_SELECTION_SIZE}.</p>
            <div className="dashboardItemList quickActionsPickerList">
              {QUICK_ACTION_IDS.map((id) => {
                const Icon = QUICK_ACTION_ICON_COMPONENTS[id]
                const selected = quickActionsDraft.includes(id)
                const disabled = !selected && quickActionsDraft.length >= QUICK_ACTION_SELECTION_SIZE
                return (
                  <button
                    type="button"
                    key={id}
                    className={`dashboardItemRow quickActionsPickerRow${selected ? ' active' : ''}`}
                    aria-pressed={selected}
                    disabled={disabled}
                    onClick={() => toggleQuickActionDraft(id)}
                  >
                    <span className="quickActionsPickerIcon" aria-hidden="true"><Icon /></span>
                    <span className="dashboardItemBody"><strong>{QUICK_ACTION_LABELS[id]}</strong></span>
                    {selected && <span className="quickActionsPickerCheck" aria-hidden="true">✓</span>}
                  </button>
                )
              })}
            </div>
            <div className="modalActions quickActionsCustomizeActions">
              <button type="button" className="secondary" onClick={restoreDefaultQuickActions}>Restore Defaults</button>
              <button type="button" className="primary" disabled={quickActionsDraft.length !== QUICK_ACTION_SELECTION_SIZE} onClick={() => saveQuickActions(quickActionsDraft)}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile V2 — Smart Upload/Add Property decorative preview
          dialogs: see the state declarations above for why these two
          ids get a small confirmation dialog instead of a fictional
          screen. */}
      {smartUploadPreviewOpen && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setSmartUploadPreviewOpen(false)}>
          <div className="modal" style={{ width: 'min(420px, 100%)' }}>
            <div className="modalTop">
              <h2>Smart Upload</h2>
              <button type="button" className="iconButton" aria-label="Close" onClick={() => setSmartUploadPreviewOpen(false)}>&times;</button>
            </div>
            <p className="muted">In the live app, this opens PropRoster&apos;s Smart Upload modal — drop a lease, insurance policy, mortgage statement, or receipt and it&apos;s automatically classified and filed. Fictional preview only; no document-intelligence pipeline runs here.</p>
            <div className="modalActions"><button type="button" className="primary" onClick={() => setSmartUploadPreviewOpen(false)}>Close</button></div>
          </div>
        </div>
      )}
      {addPropertyPreviewOpen && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setAddPropertyPreviewOpen(false)}>
          <div className="modal" style={{ width: 'min(420px, 100%)' }}>
            <div className="modalTop">
              <h2>Add Property</h2>
              <button type="button" className="iconButton" aria-label="Close" onClick={() => setAddPropertyPreviewOpen(false)}>&times;</button>
            </div>
            <p className="muted">In the live app, this opens the same Add Property form as the dashboard&apos;s own &quot;+ Add Property&quot; button. Fictional preview only; no property is created here.</p>
            <div className="modalActions"><button type="button" className="primary" onClick={() => setAddPropertyPreviewOpen(false)}>Close</button></div>
          </div>
        </div>
      )}

      {attentionSheetOpen && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setAttentionSheetOpen(false)}>
          <div className="modal needsAttentionModal">
            <div className="modalTop">
              <h2>Needs Attention</h2>
              <button type="button" className="iconButton" aria-label="Close" onClick={() => setAttentionSheetOpen(false)}>&times;</button>
            </div>
            {FIXTURE_ATTENTION_ITEMS.length === 0 ? (
              <p className="muted needsAttentionEmpty">You&apos;re all caught up.</p>
            ) : (
              <div className="dashboardItemList">
                {FIXTURE_ATTENTION_ITEMS.map((item) => (
                  <button key={item.id} type="button" className="dashboardItemRow" onClick={() => goToAttentionItem(item.nav)}>
                    <span className={`statusPill ${item.category === 'Maintenance' ? 'pillWarn' : item.category === 'Missing Receipt' ? 'pillBad' : 'pillNeutral'}`}>{item.category}</span>
                    <span className="dashboardItemBody">
                      <strong>{item.title}</strong>
                      <span className="muted">{item.propertyLabel}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {screen === 'property' && selectedProperty && (
        <PropertyScreen
          property={selectedProperty}
          tab={propertyTab}
          onTab={setPropertyTab}
          onBack={goDashboard}
        />
      )}

      {screen === 'maintenance' && (
        <MaintenanceScreen
          selected={selectedMaintenance}
          onSelect={setSelectedMaintenanceId}
          onNewRequest={() => setNewRequestOpen(true)}
        />
      )}

      {screen === 'tenantconnect' && <TenantConnectScreen onOpenProperty={openProperty} />}
      {screen === 'notifications' && (
        <NotificationsScreen
          readIds={readNotificationIds}
          onMarkRead={(id) => setReadNotificationIds((prev) => new Set(prev).add(id))}
          onMarkAllRead={() => setReadNotificationIds(new Set(FIXTURE_NOTIFICATIONS.map((n) => n.id)))}
          onOpenTenantConnect={() => setScreen('tenantconnect')}
          onOpenMaintenance={() => setScreen('maintenance')}
        />
      )}
      {screen === 'propcrew' && <PropCrewScreen />}
      {screen === 'taxcenter' && <TaxCenterScreen />}
      {screen === 'billing' && <BillingScreen />}
      {screen === 'admin' && <AdminScreen />}

      {newRequestOpen && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setNewRequestOpen(false)}>
          <div className="modal">
            <div className="modalTop">
              <h2>New Maintenance Request</h2>
              <button type="button" className="iconButton" aria-label="Close" onClick={() => setNewRequestOpen(false)}>&times;</button>
            </div>
            <label>Property</label>
            <select defaultValue={FIXTURE_PROPERTIES[0].id} style={{ width: '100%', marginTop: 7, marginBottom: 14, padding: 11, borderRadius: 9, border: '1px solid var(--line)' }}>
              {FIXTURE_PROPERTIES.map((p) => <option key={p.id} value={p.id}>{p.address}</option>)}
            </select>
            <label>What&apos;s going on?</label>
            <input placeholder="e.g. Garbage disposal jammed" style={{ width: '100%', marginTop: 7, marginBottom: 14, padding: 11, borderRadius: 9, border: '1px solid var(--line)' }} />
            <label>Details</label>
            <textarea rows={4} placeholder="Add any useful detail for the provider…" style={{ width: '100%', marginTop: 7, padding: 11, borderRadius: 9, border: '1px solid var(--line)' }} />
            <div className="modalActions">
              <button type="button" className="secondary" onClick={() => setNewRequestOpen(false)}>Cancel</button>
              <button type="button" className="primary" onClick={() => setNewRequestOpen(false)}>Submit request</button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile V2 (navigation simplification) removed the fixed mobile
          bottom navigation bar — both here and in the real app (see
          components/AuthHeader.tsx's own comment; the real
          components/MobileBottomNav.tsx this preview used to mirror is
          deleted). The avatar/hamburger menu above is now the only
          mobile navigation entry point, exactly matching production. */}
    </main>
  )
}

function DashboardScreen({ onOpenProperty, onOpenAttention, quickActions, renderQuickAction, onCustomizeQuickActions }: {
  onOpenProperty: (id: string) => void
  onOpenAttention: () => void
  quickActions: QuickActionId[]
  renderQuickAction: (id: QuickActionId) => React.ReactElement
  onCustomizeQuickActions: () => void
}) {
  return (
    <>
      {/* Mobile V2 — above-the-fold parity fix: the real dashboard greeting
          uses "intro welcomeIntro" (smaller h1, tighter padding) with no
          eyebrow label — this preview was rendering the larger, more
          heavily padded base .intro instead, which made the whole
          dashboard noticeably taller here than in the real app and
          understated how much the above-the-fold spacing pass actually
          gains. Matches app/page.tsx's own dashboard intro exactly now,
          subtitle included. */}
      <section className="intro welcomeIntro">
        <h1>Good afternoon, {FIXTURE_LANDLORD.name.split(' ')[0]}.</h1>
        <p>Here&apos;s your portfolio at a glance.</p>
      </section>

      {/* Mobile V2 — Quick Actions redesign (preview parity): same
          compact single-row .mobileQuickActions/.mobileQuickActionsRow/
          .mobileQuickAction classes as app/page.tsx, hidden above the
          mobile breakpoint by the same CSS rule. quickActions is
          landlord-chosen (Customize sheet below) and defaults to the
          same DEFAULT_QUICK_ACTIONS the real app does. */}
      <section className="mobileQuickActions">
        <div className="mobileQuickActionsHead">
          <h2 className="mobileQuickActionsHeading">Quick Actions</h2>
          <button type="button" className="mobileQuickActionsCustomize" onClick={onCustomizeQuickActions}>Customize</button>
        </div>
        <div className="mobileQuickActionsRow">
          {quickActions.map((id) => renderQuickAction(id))}
        </div>
      </section>

      {/* Mobile Dashboard Grid V2 (preview parity): the real app's
          Portfolio Snapshot grid — same classes (.portfolioSnapshot*),
          same mobile 2x2 reflow via CSS (Portfolio Value | Monthly
          Rent on top, Properties | Needs Attention on the bottom), not
          the generic/unrelated .stats pattern this preview used to use.
          Needs Attention is the same compact, interactive tile the
          real dashboard now uses — a live count, tap to open the full
          aggregated list. Occupancy itself remains visible elsewhere
          (each property card's own badge, below). */}
      <section className="portfolioSnapshot">
        <div className="portfolioSnapshotGrid">
          <div className="portfolioSnapshotMetric portfolioSnapshotMetricProperties"><strong>{FIXTURE_STATS.properties}</strong><span>Properties</span></div>
          <div className="portfolioSnapshotMetric portfolioSnapshotMetricValue"><strong>{money(FIXTURE_STATS.portfolioValue)}</strong><span>Portfolio Value</span></div>
          <div className="portfolioSnapshotMetric portfolioSnapshotMetricRent"><strong>{money(FIXTURE_STATS.monthlyRent)}</strong><span>Monthly Rent</span></div>
          <div className="portfolioSnapshotMetric portfolioSnapshotMetricNOI"><strong>{money(FIXTURE_STATS.ytdNoi)}</strong><span>YTD NOI</span></div>
          <button type="button" className="portfolioSnapshotMetric needsAttentionSnapshotTile" onClick={onOpenAttention}>
            <span className="needsAttentionSnapshotHead">
              <span>Needs Attention</span>
              {FIXTURE_ATTENTION_ITEMS.length === 0
                ? <strong className="needsAttentionSnapshotCount needsAttentionSnapshotCountZero">0 <span aria-hidden="true">✓</span></strong>
                : <strong className="needsAttentionSnapshotCount">{FIXTURE_ATTENTION_ITEMS.length}</strong>}
            </span>
          </button>
        </div>
      </section>

      <div className="sectionHead">
        <div>
          <h2>My Properties</h2>
          <p>{FIXTURE_PROPERTIES.length} properties in your portfolio</p>
        </div>
        <button type="button" className="primary">+ Add Property</button>
      </div>

      <section className="grid">
        {FIXTURE_PROPERTIES.map((p) => (
          <article key={p.id} className="propertyCard">
            <button type="button" className="cardOpen" onClick={() => onOpenProperty(p.id)}>
              <div className="photo">
                <div className="photoPlaceholder"><span>🏠</span><small>{p.type}</small></div>
                <span className="badge">{p.type}</span>
                {p.occupancy === 'occupied' && <span className={`occupancyBadge ${occupancyPill(p)}`}>Occupied</span>}
                {p.occupancy === 'vacant' && <span className={`occupancyBadge ${occupancyPill(p)}`}>Vacant</span>}
              </div>
              <div className="cardBody">
                <h3>{p.address}</h3>
                <p className="muted">{p.city}, {p.state} {p.zip}</p>
                <div className="miniStats">
                  <div><span>Rent</span><strong>{p.monthlyRent > 0 ? `${money(p.monthlyRent)}/mo` : '—'}</strong></div>
                  <div><span>Status</span><strong><span className={`statusPill ${rentPill(p)}`}>{p.occupancy === 'vacant' ? 'Vacant' : p.rentStatus}</span></strong></div>
                </div>
              </div>
            </button>
            <div className="cardActions" style={{ padding: '0 19px 19px' }}>
              <button type="button">Edit</button>
              <button type="button">Documents</button>
            </div>
          </article>
        ))}
      </section>
    </>
  )
}

const PROPERTY_TABS: { id: PropertyTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'tenant', label: 'Tenant Connect' },
  { id: 'documents', label: 'Documents' },
]

// Mirrors the real app's Mobile Property Section Selector V1: .tabs is
// display:none below 761px (app/globals.css) and .mobilePropertyNav — a
// single "current section ▾" dropdown — takes over, sharing the same
// tab/onTab state as the desktop row rather than being a second
// competing nav. Both render here; CSS decides which one is visible.
function PropertyTabsNav({ tab, onTab }: { tab: PropertyTab; onTab: (t: PropertyTab) => void }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const current = PROPERTY_TABS.find((t) => t.id === tab)!
  return (
    <>
      <nav className="tabs">
        {PROPERTY_TABS.map((t) => (
          <button key={t.id} type="button" className={tab === t.id ? 'active' : ''} onClick={() => onTab(t.id)}>{t.label}</button>
        ))}
      </nav>
      <div className="mobilePropertyNav">
        <button type="button" className="mobilePropertyNavTrigger" aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>
          {current.label}
          <span className="mobilePropertyNavChevron" aria-hidden="true">▾</span>
        </button>
        {menuOpen && (
          <ul className="mobilePropertyNavMenu">
            {PROPERTY_TABS.map((t) => (
              <li key={t.id}>
                <button type="button" className={tab === t.id ? 'active' : ''} onClick={() => { onTab(t.id); setMenuOpen(false) }}>
                  {tab === t.id && <span className="mobilePropertyNavCheck">✓</span>}
                  {t.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}

function PropertyScreen({ property, tab, onTab, onBack }: { property: FixtureProperty; tab: PropertyTab; onTab: (t: PropertyTab) => void; onBack: () => void }) {
  const docs = FIXTURE_DOCUMENTS.filter((d) => d.propertyId === property.id)
  return (
    <>
      <button type="button" className="breadcrumbBack" onClick={onBack}>← All Properties</button>
      <section className="propertyHero">
        <div className="heroPhoto">
          <div className="heroPlaceholder"><span>🏠</span><small>{property.type}</small></div>
        </div>
        <div className="heroInfo">
          <h1>{property.address}</h1>
          <p className="heroCity">{property.city}, {property.state} {property.zip}</p>
          <div className="heroStatusPills">
            <span className={`statusPill ${occupancyPill(property)}`}>{property.occupancy === 'occupied' ? 'Occupied' : 'Vacant'}</span>
            {property.occupancy === 'occupied' && <span className={`statusPill ${rentPill(property)}`}>Rent: {property.rentStatus}</span>}
          </div>
          <button type="button" className="secondary">Edit</button>
        </div>
      </section>

      <PropertyTabsNav tab={tab} onTab={onTab} />

      {tab === 'overview' && (
        <section className="overviewInfoGrid" style={{ marginTop: 22 }}>
          <div className="propertySnapshotPrimaryGrid">
            <div className="stat"><span>Monthly Rent</span><strong>{property.monthlyRent > 0 ? money(property.monthlyRent) : '—'}</strong></div>
            <div className="stat"><span>Est. Value</span><strong>{money(property.value)}</strong></div>
          </div>
          <div className="stat">
            <span>Lease</span>
            <strong>{property.leaseEnd ? `Ends ${property.leaseEnd}` : 'No active lease'}</strong>
          </div>
        </section>
      )}

      {tab === 'tenant' && (
        <section style={{ marginTop: 22 }}>
          <h2 style={{ marginBottom: 12 }}>Tenant Connect</h2>
          {property.tenant ? (
            <div className="propertyCard" style={{ padding: 19 }}>
              <p style={{ fontWeight: 650, marginBottom: 4 }}>{property.tenant.name}</p>
              <p className="muted">{property.tenant.email}</p>
              <p className="muted">{property.tenant.phone}</p>
              <div className="cardActions">
                <button type="button">Message Tenant</button>
                <button type="button">View Lease</button>
              </div>
            </div>
          ) : (
            <p className="muted">No tenant on file — this property is currently vacant.</p>
          )}
        </section>
      )}

      {tab === 'documents' && (
        <section style={{ marginTop: 22 }}>
          <h2 style={{ marginBottom: 12 }}>Documents</h2>
          {docs.length === 0 ? (
            <p className="muted">No documents uploaded for this property yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {docs.map((d) => (
                <div key={d.id} className="propertyCard" style={{ padding: '14px 19px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ fontWeight: 650, marginBottom: 2 }}>{d.name}</p>
                    <p className="muted" style={{ fontSize: 12 }}>{d.category} · uploaded {d.uploadedAt}</p>
                  </div>
                  <button type="button" className="secondary">View</button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </>
  )
}

// Design Foundation V1, Desktop Workspace V1 (preview parity): fixture
// data adapted into the REAL lib/maintenance/command-center.ts row
// shapes — a synthetic tenant_requests-shaped link per case so
// enrichMaintenanceCases() resolves the SAME category fixture data
// already encodes (fixtures.ts's own `category` field), rather than
// inventing a second category source. Built once, module-level, same
// convention as the FIXTURE_* exports themselves.
const FIXTURE_MAINTENANCE_ROWS: MaintenanceCaseRow[] = FIXTURE_MAINTENANCE.map((m) => ({
  id: m.id,
  property_id: m.propertyId,
  owner_id: 'preview-owner',
  tenant_name: m.reportedBy,
  tenant_email: null,
  title: m.title,
  description: m.description,
  priority: 'Normal',
  status: m.status === 'New' ? 'Submitted' : m.status === 'Resolved' ? 'Completed' : m.status,
  source: 'tenant',
  assigned_contact_id: m.provider ? (FIXTURE_PROPCREW.find((c) => c.businessName === m.provider)?.id ?? null) : null,
  created_at: `${m.reportedAt}T12:00:00Z`,
}))
const FIXTURE_MAINTENANCE_TENANT_REQUEST_LINKS = FIXTURE_MAINTENANCE.map((m) => ({ id: `${m.id}-tr`, maintenance_request_id: m.id, category: m.category.toLowerCase() }))
const FIXTURE_ENRICHED_CASES: EnrichedMaintenanceCase[] = enrichMaintenanceCases(FIXTURE_MAINTENANCE_ROWS, FIXTURE_MAINTENANCE_TENANT_REQUEST_LINKS, [])
const FIXTURE_PROPCREW_CONTACTS: PropCrewContactRef[] = FIXTURE_PROPCREW.map((c) => ({
  id: c.id, property_id: 'preview-property', owner_id: 'preview-owner', name: c.name, business_name: c.businessName, role: c.role, email: c.email,
}))

// Reuses the real app/maintenance/page.tsx's own card markup/classes
// (not reimplemented) so the list looks identical to production.
function PreviewMaintenanceCard({ caseRow, selected, onOpen }: { caseRow: EnrichedMaintenanceCase; selected: boolean; onOpen: () => void }) {
  const prop = FIXTURE_PROPERTIES.find((p) => p.id === caseRow.property_id)
  const classNames = [
    'maintenanceCommandCenterCard',
    caseRow.urgent ? 'maintenanceCommandCenterCardUrgent' : '',
    !caseRow.active ? 'maintenanceCommandCenterCardCompleted' : '',
    selected ? 'maintenanceCommandCenterCardSelected' : '',
  ].filter(Boolean).join(' ')
  return (
    <button type="button" className={classNames} aria-current={selected ? 'true' : undefined} onClick={onOpen}>
      <MaintenanceCategoryIcon category={caseRow.category} className="maintenanceCommandCenterCardIcon" />
      <span className="maintenanceCommandCenterCardBody">
        <span className="maintenanceCommandCenterCardTitle">{caseRow.title}</span>
        <span className="maintenanceCommandCenterCardAddress">
          {prop?.address || 'Property'}
          {prop?.city && <span className="maintenanceCommandCenterCardAddressCityState">{prop.city}</span>}
        </span>
        <span className="maintenanceCommandCenterCardMeta">
          Opened {new Date(caseRow.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} &middot; {caseRow.source === 'tenant' ? 'Tenant' : 'Landlord'}
        </span>
      </span>
      {showsDedicatedUrgentBadge(caseRow, caseRow.urgent) ? (
        <span className="statusPill pillBad maintenanceUrgentBadge">Urgent</span>
      ) : (
        <span className="statusPill maintenanceCommandCenterCardStatus">{caseRow.status}</span>
      )}
    </button>
  )
}

// Design Foundation V1, Desktop Workspace V1 (preview parity): now
// mirrors app/maintenance/page.tsx's real two-panel structure and
// reuses the REAL, shared MaintenanceCaseDetail component (layout
// "overlay" below 1024px, "panel" at/above it — pure CSS, same as
// production) instead of a hand-rolled detail view. Every write
// action (assign/status/outreach/appointment) is a no-op here, same
// decorative-only convention as this file's other screens — nothing
// in this component writes anywhere.
function MaintenanceScreen({ selected, onSelect, onNewRequest }: { selected: ReturnType<typeof FIXTURE_MAINTENANCE.find>; onSelect: (id: string | null) => void; onNewRequest: () => void }) {
  const [search, setSearch] = useState('')
  const openCase = selected ? FIXTURE_ENRICHED_CASES.find((c) => c.id === selected.id) || null : null
  const propertyLabel = (propertyId: string) => {
    const p = FIXTURE_PROPERTIES.find((prop) => prop.id === propertyId)
    return p ? `${p.address}, ${p.city}` : 'Property'
  }
  const filtered = filterMaintenanceCases(FIXTURE_ENRICHED_CASES, search, propertyLabel)
  const detailProps = openCase ? {
    caseRow: openCase,
    propertyLabel: propertyLabel(openCase.property_id),
    contacts: FIXTURE_PROPCREW_CONTACTS,
    busy: false,
    onAssign: () => {},
    onStatusChange: () => {},
    onClose: () => onSelect(null),
    outreach: null,
    onSendOutreach: () => {},
    availabilityWindows: [],
    entryPreference: null,
    appointment: null,
  } : null

  return (
    <>
      <div className="sectionHead">
        <div>
          <h2>Maintenance</h2>
          <p>{FIXTURE_MAINTENANCE.length} requests across your portfolio</p>
        </div>
        <button type="button" className="primary" onClick={onNewRequest}>+ New Request</button>
      </div>

      <div className="maintenanceWorkspace">
        <div className="maintenanceListPanel">
          <div className="searchInputWrap">
            <input className="searchInput" type="search" placeholder="Search requests…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search maintenance requests" />
          </div>
          <div className="maintenanceCommandCenterList">
            {filtered.map((c) => (
              <PreviewMaintenanceCard key={c.id} caseRow={c} selected={c.id === selected?.id} onOpen={() => onSelect(c.id)} />
            ))}
          </div>
        </div>

        <div className="maintenanceDetailPanel">
          {detailProps ? (
            <MaintenanceCaseDetail {...detailProps} layout="panel" />
          ) : (
            <div className="maintenanceDetailPanelEmpty">Select a request to view details.</div>
          )}
        </div>
      </div>

      {detailProps && (
        <div className="maintenanceDetailOverlay">
          <MaintenanceCaseDetail {...detailProps} />
        </div>
      )}
    </>
  )
}

// Tenant Connect V2.1/V2.2 (preview parity): the same .tenantDirectoryList/
// .tenantDirectoryRow/.tenantInboxRow classes app/tenant-connect/page.tsx
// renders, over fixture properties/tenants/conversations only —
// connection status and unread flags here are fixed fictional labels
// (never invented beyond what FIXTURE_CONVERSATIONS/FIXTURE_PROPERTIES
// already encode), purely so the real design can be screenshotted.
// Design Foundation V1, Desktop Workspace V1 (preview parity): fixture
// conversations adapted into the REAL MessageInboxRow shape so this
// screen can reuse the REAL filterMessageInbox() rather than a
// hand-rolled search.
const FIXTURE_INBOX_ROWS: MessageInboxRow[] = FIXTURE_CONVERSATIONS.map((c) => ({
  conversationId: c.id,
  propertyId: c.propertyId,
  propertyLabel: FIXTURE_PROPERTIES.find((p) => p.id === c.propertyId)?.address || 'Property',
  tenantName: c.tenantName,
  maintenanceRequestId: c.maintenanceId,
  latestMessagePreview: c.preview,
  latestMessageAt: c.timestampLabel,
  unread: c.unread,
}))

function TenantConnectScreen({ onOpenProperty }: { onOpenProperty: (id: string, tab?: PropertyTab) => void }) {
  const [tab, setTab] = useState<'messages' | 'tenants'>('messages')
  const [search, setSearch] = useState('')
  const [messageSearch, setMessageSearch] = useState('')
  const [openConvoId, setOpenConvoId] = useState<string | null>(null)
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string[]>>({})
  const [replyText, setReplyText] = useState('')

  const rows = FIXTURE_PROPERTIES
    .filter((p) => p.tenant)
    .map((p) => ({ property: p, status: p.occupancy === 'occupied' ? 'Connected' : 'Not connected' }))
  const filtered = rows.filter((r) => {
    const q = search.trim().toLowerCase()
    if (!q) return true
    return r.property.tenant!.name.toLowerCase().includes(q) || r.property.address.toLowerCase().includes(q)
  })
  const unreadCount = FIXTURE_CONVERSATIONS.filter((c) => c.unread).length
  const filteredInbox = filterMessageInbox(FIXTURE_INBOX_ROWS, messageSearch)
  const openConvo: FixtureConversation | null = FIXTURE_CONVERSATIONS.find((c) => c.id === openConvoId) || null
  const openProperty = openConvo ? FIXTURE_PROPERTIES.find((p) => p.id === openConvo.propertyId) : null

  function sendDecorativeReply() {
    if (!openConvo || !replyText.trim()) return
    setReplyDrafts((prev) => ({ ...prev, [openConvo.id]: [...(prev[openConvo.id] || []), replyText.trim()] }))
    setReplyText('')
  }

  // Design Foundation V1, Desktop Workspace V1: the identical
  // extraction app/tenant-connect/page.tsx's own threadBody() is — one
  // implementation of "what an open conversation looks like," reused
  // by both the mobile overlay and the desktop panel below.
  function threadBody(convo: FixtureConversation) {
    const prop = FIXTURE_PROPERTIES.find((p) => p.id === convo.propertyId)
    return (
      <>
        <div className="modalTop">
          <div><p className="eyebrow">{prop?.address}</p><h2>{convo.tenantName}</h2></div>
          <button type="button" className="iconButton" aria-label="Close" onClick={() => setOpenConvoId(null)}>&times;</button>
        </div>
        {convo.maintenanceId && (
          <button type="button" className="tenantRequestViewInMaintenance" onClick={() => setOpenConvoId(null)}>View in Maintenance &rarr;</button>
        )}
        <div className="tenantConnectThread">
          <div className="tenantConnectBubble tenantConnectBubbleTenant">
            <div className="tenantConnectBubbleMeta"><strong>Tenant</strong><span>{convo.timestampLabel}</span></div>
            <p>{convo.preview}</p>
          </div>
          {(replyDrafts[convo.id] || []).map((text, i) => (
            <div key={i} className="tenantConnectBubble tenantConnectBubbleOwner">
              <div className="tenantConnectBubbleMeta"><strong>Owner</strong><span>Just now</span></div>
              <p>{text}</p>
            </div>
          ))}
        </div>
        <div className="tenantConnectCompose">
          <textarea value={replyText} onChange={(e) => setReplyText(e.target.value)} rows={3} placeholder="Write a reply…" />
          <div className="tenantConnectComposeRow">
            <label className="secondary tenantConnectAttachLabel">Attach photo<input type="file" accept="image/*" hidden /></label>
            <button type="button" className="primary" disabled={!replyText.trim()} onClick={sendDecorativeReply}>Reply</button>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="sectionHead">
        <div>
          <h2>Tenant Connect</h2>
          <p>{tab === 'messages' ? `${FIXTURE_CONVERSATIONS.length} conversations${unreadCount > 0 ? ` · ${unreadCount} unread` : ''}` : `${rows.length} connected · ${FIXTURE_PROPERTIES.length - rows.length} not connected`}</p>
        </div>
      </div>
      <div className="maintenanceFilterRow" role="tablist" aria-label="Tenant Connect sections">
        <button type="button" role="tab" aria-selected={tab === 'messages'} className={`maintenanceFilterChip${tab === 'messages' ? ' active' : ''}`} onClick={() => setTab('messages')}>Messages{unreadCount > 0 ? ` (${unreadCount})` : ''}</button>
        <button type="button" role="tab" aria-selected={tab === 'tenants'} className={`maintenanceFilterChip${tab === 'tenants' ? ' active' : ''}`} onClick={() => setTab('tenants')}>Tenants</button>
      </div>

      {tab === 'messages' ? (
        <div className="tenantConnectWorkspace">
          <div className="tenantConnectListPanel">
            <div className="searchInputWrap">
              <input className="searchInput" type="search" placeholder="Search conversations…" value={messageSearch} onChange={(e) => setMessageSearch(e.target.value)} aria-label="Search conversations" />
            </div>
            <div className="tenantDirectoryList">
              {filteredInbox.map((row) => (
                <button
                  type="button"
                  key={row.conversationId}
                  className={`tenantInboxRow${row.conversationId === openConvoId ? ' tenantInboxRowSelected' : ''}`}
                  aria-current={row.conversationId === openConvoId ? 'true' : undefined}
                  onClick={() => { setOpenConvoId(row.conversationId); setReplyText('') }}
                >
                  <span className="tenantInboxRowHead">
                    <span className="tenantInboxRowBody">
                      <strong>{row.tenantName}</strong>
                      <span className="muted">{row.propertyLabel}</span>
                    </span>
                    {row.unread && <span className="tenantInboxUnreadDot" aria-label="Unread" />}
                    <span className="muted tenantInboxTimestamp">{row.latestMessageAt}</span>
                  </span>
                  <span className="muted tenantInboxPreview">
                    {(replyDrafts[row.conversationId]?.length ? replyDrafts[row.conversationId][replyDrafts[row.conversationId].length - 1] : row.latestMessagePreview)}
                  </span>
                  {row.maintenanceRequestId && <span className="tenantInboxMaintenanceBadge">Maintenance request</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="tenantConnectThreadPanel">
            {openConvo ? threadBody(openConvo) : <div className="tenantConnectThreadPanelEmpty">Select a conversation to view messages.</div>}
          </div>
        </div>
      ) : (
        <>
          <div className="searchInputWrap">
            <input className="searchInput" type="search" placeholder="Search tenants or properties…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search the tenant directory" />
          </div>
          <div className="tenantDirectoryList">
            {filtered.map(({ property: p, status }) => (
              <div key={p.id} className="tenantDirectoryRow">
                <div className="tenantConnectCardHead">
                  <div className="tenantConnectCardBody">
                    <strong>{p.tenant!.name}</strong>
                    <span className="muted">{p.address}, {p.city}</span>
                    <span className="muted">{p.tenant!.email}</span>
                  </div>
                  <span className={`statusPill ${status === 'Connected' ? 'pillGood' : 'pillMuted'}`}>{status}</span>
                </div>
                <div className="tenantDirectoryRowLinks">
                  <button type="button" className="tenantConnectQuietAction" onClick={() => onOpenProperty(p.id, 'tenant')}>View in property &rarr;</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {openConvo && (
        <div className="overlay tenantConnectThreadOverlay" onMouseDown={(e) => e.target === e.currentTarget && setOpenConvoId(null)}>
          <div className="modal tenantConnectThreadModal">
            {threadBody(openConvo)}
          </div>
        </div>
      )}
    </>
  )
}

// Mobile V3 (Notifications & Activity Center, preview parity): same
// .tenantDirectoryList/.notificationRow classes app/notifications/page.tsx
// renders. Tapping a row marks it read locally (component state only,
// no network) and routes to the existing screen it's about — never a
// rendered thread/case detail of its own.
function NotificationsScreen({ readIds, onMarkRead, onMarkAllRead, onOpenTenantConnect, onOpenMaintenance }: {
  readIds: Set<string>
  onMarkRead: (id: string) => void
  onMarkAllRead: () => void
  onOpenTenantConnect: () => void
  onOpenMaintenance: () => void
}) {
  const rows = FIXTURE_NOTIFICATIONS.map((n) => ({ ...n, unread: n.unread && !readIds.has(n.id) }))
  const unreadCount = rows.filter((n) => n.unread).length

  function open(n: (typeof rows)[number]) {
    onMarkRead(n.id)
    if (n.screen === 'tenantconnect') onOpenTenantConnect()
    else onOpenMaintenance()
  }

  return (
    <>
      <div className="sectionHead">
        <div>
          <h2>Notifications</h2>
          <p>{rows.length} notifications{unreadCount > 0 ? ` · ${unreadCount} unread` : ''}</p>
        </div>
        {unreadCount > 0 && (
          <button type="button" className="secondary" onClick={onMarkAllRead}>Mark all as read</button>
        )}
      </div>
      <div className="tenantDirectoryList">
        {rows.map((n) => (
          <button type="button" key={n.id} className={`notificationRow${n.unread ? ' notificationRowUnread' : ''}`} style={{ cursor: 'pointer' }} onClick={() => open(n)}>
            {n.unread && <span className="tenantInboxUnreadDot" aria-label="Unread" />}
            <span className="notificationRowBody">
              <span className="notificationRowTitle">{n.title}</span>
              <span className="muted notificationRowMeta">{n.propertyLabel} · {n.timestampLabel}</span>
            </span>
          </button>
        ))}
      </div>
    </>
  )
}

function PropCrewScreen() {
  return (
    <>
      <div className="sectionHead">
        <div><h2>PropCrew</h2><p>Your service provider directory</p></div>
        <button type="button" className="primary">+ Add to PropCrew</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {FIXTURE_PROPCREW.map((c) => (
          <div key={c.id} className="propertyCard" style={{ padding: 19 }}>
            <p style={{ fontWeight: 650 }}>{c.name} · {c.businessName}</p>
            <p className="muted" style={{ marginBottom: 8 }}>{c.role}</p>
            <p className="muted" style={{ fontSize: 13 }}>{c.phone} · {c.email}</p>
            <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>Serves: {c.properties.join(', ')}</p>
          </div>
        ))}
      </div>
    </>
  )
}

function TaxCenterScreen() {
  const s = FIXTURE_TAX_SUMMARY
  return (
    <>
      <section className="intro"><p className="eyebrow">TAX CENTER</p><h1>{s.year} Summary</h1></section>
      {/* Mobile Tax Center Polish V1 (preview parity): the real page's
          own classes (.taxCenterSummary*) — "+ Add Expense" near the
          top on mobile (CSS order, same as the real page), Income |
          Expenses on top, Net beneath, Receipts last. Purely
          decorative here (no onClick), matching this preview's existing
          "+ Add Property" convention — never a real write, fictional
          data only. */}
      <section className="taxCenterSummarySection">
        <div className="taxCenterSummaryStrip">
          <div className="taxCenterSummaryTile taxCenterSummaryTileIncome"><span>Income</span><strong>{money(s.totalIncome)}</strong></div>
          <div className="taxCenterSummaryTile taxCenterSummaryTileExpenses"><span>Expenses</span><strong>{money(s.totalExpenses)}</strong></div>
          <div className="taxCenterSummaryTile taxCenterSummaryTileNet"><span>Net</span><strong>{money(s.netIncome)}</strong></div>
          <div className="taxCenterSummaryTile taxCenterSummaryTileReceipts"><span>Receipts</span><strong>{s.receiptCount}</strong></div>
        </div>
        <button type="button" className="primary taxCenterAddExpense">+ Add Expense</button>
      </section>
      <h2 style={{ marginBottom: 12 }}>Expense Categories</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {s.categories.map((c) => (
          <div key={c.label} className="propertyCard" style={{ padding: '14px 19px', display: 'flex', justifyContent: 'space-between' }}>
            <span>{c.label}</span>
            <strong>{money(c.amount)}</strong>
          </div>
        ))}
      </div>
    </>
  )
}

function BillingScreen() {
  const b = FIXTURE_BILLING
  return (
    <>
      <section className="intro"><p className="eyebrow">ACCOUNT</p><h1>Account &amp; Billing</h1></section>
      <div className="propertyCard" style={{ padding: 24 }}>
        <p className="muted">Current plan</p>
        <h2 style={{ margin: '4px 0 14px' }}>{b.plan} — ${b.price}/mo</h2>
        <div className="miniStats">
          <div><span>Properties</span><strong>{b.propertiesUsed} / {b.propertyLimit}</strong></div>
          <div><span>Renews</span><strong>{b.renewsOn}</strong></div>
        </div>
        <p className="muted" style={{ marginTop: 14 }}>Payment method: {b.paymentMethod}</p>
        <div className="cardActions">
          <button type="button" className="secondary">Manage Subscription</button>
        </div>
      </div>
    </>
  )
}

function AdminScreen() {
  return (
    <>
      <section className="intro"><p className="eyebrow">PROPROSTER · ADMIN</p><h1>Platform Admin</h1></section>
      <p className="muted" style={{ marginBottom: 18 }}>Fixture representation only — the real admin hub reads cross-account data server-side and is not reproduced with fictional accounts here.</p>
      <div className="propertyCard" style={{ padding: 19 }}>
        <p style={{ fontWeight: 650, marginBottom: 4 }}>Subscriptions</p>
        <p className="muted">View and manage customer subscriptions.</p>
      </div>
    </>
  )
}
