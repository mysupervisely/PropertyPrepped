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

import { useEffect, useRef, useState } from 'react'
import { Wordmark } from '../../components/Wordmark'
import { GridIcon, WrenchIcon, PeopleIcon, ReceiptIcon } from '../../components/icons/NavIcons'
import {
  FIXTURE_LANDLORD, FIXTURE_PROPERTIES, FIXTURE_STATS, FIXTURE_MAINTENANCE,
  FIXTURE_PROPCREW, FIXTURE_TAX_SUMMARY, FIXTURE_BILLING, FIXTURE_DOCUMENTS,
  type FixtureProperty,
} from './_lib/fixtures'

const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)

type Screen = 'dashboard' | 'property' | 'maintenance' | 'propcrew' | 'taxcenter' | 'billing' | 'admin'
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

  function goDashboard() {
    setScreen('dashboard')
    setSelectedPropertyId(null)
    setNavMenuOpen(false)
  }
  function openProperty(id: string) {
    setSelectedPropertyId(id)
    setPropertyTab('overview')
    setScreen('property')
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
          <span className="muted" style={{ fontSize: 13 }}>{FIXTURE_LANDLORD.name}</span>
          <button type="button" className="secondary" aria-haspopup="true" aria-expanded={navMenuOpen} onClick={() => setNavMenuOpen((v) => !v)}>
            Account
          </button>
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
              {(['dashboard', 'maintenance', 'propcrew', 'taxcenter', 'billing', 'admin'] as Screen[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  className="secondary"
                  style={{ textAlign: 'left', border: 0 }}
                  onClick={() => { setScreen(s); setSelectedPropertyId(null); setNavMenuOpen(false) }}
                >
                  {({ dashboard: 'Dashboard', maintenance: 'Maintenance', propcrew: 'PropCrew', taxcenter: 'Tax Center', billing: 'Account & Billing', admin: 'Admin', property: 'Property' } as Record<Screen, string>)[s]}
                </button>
              ))}
            </nav>
          </div>
        </div>
      )}

      {screen === 'dashboard' && (
        <DashboardScreen onOpenProperty={openProperty} />
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

      <PreviewBottomNav screen={screen} onNavigate={(s) => { setScreen(s); setSelectedPropertyId(null); setNavMenuOpen(false) }} />
    </main>
  )
}

// Visually identical to the real components/MobileBottomNav.tsx (same
// classNames, same icons) but with onClick screen-switching instead of
// next/link hrefs — the real component's links point at actual routes
// (/maintenance, /propcrew, /tax-center), which would navigate this
// single-page preview away to those real, backend-less pages instead of
// switching its internal view. Not used by, or reachable from, any real
// page — components/MobileBottomNav.tsx itself is unchanged and is
// still exactly what production renders.
function PreviewBottomNav({ screen, onNavigate }: { screen: Screen; onNavigate: (s: Screen) => void }) {
  const navRef = useRef<HTMLElement>(null)

  // Same two effects as the real components/MobileBottomNav.tsx — the
  // body.hasBottomNav class and the measured --bottom-nav-height custom
  // property are what .shell's own mobile CSS uses to keep the page's
  // last real content clear of this fixed bar. Reproduced here (not
  // imported) so that CSS interaction is actually exercised in the
  // preview, not just the bar's visual appearance.
  useEffect(() => {
    document.body.classList.add('hasBottomNav')
    return () => { document.body.classList.remove('hasBottomNav') }
  }, [])
  useEffect(() => {
    const el = navRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      document.documentElement.style.setProperty('--bottom-nav-height', `${el.getBoundingClientRect().height}px`)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const items: { id: Screen; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: <GridIcon /> },
    { id: 'maintenance', label: 'Maintenance', icon: <WrenchIcon /> },
    { id: 'propcrew', label: 'PropCrew', icon: <PeopleIcon /> },
    { id: 'taxcenter', label: 'Tax Center', icon: <ReceiptIcon /> },
  ]
  return (
    <nav ref={navRef} className="mobileBottomNav" aria-label="Primary">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-current={screen === item.id ? 'page' : undefined}
          className={`mobileBottomNavItem${screen === item.id ? ' active' : ''}`}
          onClick={() => onNavigate(item.id)}
        >
          {item.icon}
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  )
}

function DashboardScreen({ onOpenProperty }: { onOpenProperty: (id: string) => void }) {
  return (
    <>
      <section className="intro">
        <p className="eyebrow">DASHBOARD</p>
        <h1>Good afternoon, {FIXTURE_LANDLORD.name.split(' ')[0]}.</h1>
      </section>

      <section className="stats">
        <div className="stat"><span>Portfolio Value</span><strong>{money(FIXTURE_STATS.portfolioValue)}</strong></div>
        <div className="stat"><span>Monthly Rent</span><strong>{money(FIXTURE_STATS.monthlyRent)}</strong></div>
        <div className="stat"><span>Properties</span><strong>{FIXTURE_STATS.properties}</strong></div>
        <div className="stat"><span>Occupied</span><strong>{FIXTURE_STATS.occupied}/{FIXTURE_STATS.properties}</strong></div>
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

function MaintenanceScreen({ selected, onSelect, onNewRequest }: { selected: ReturnType<typeof FIXTURE_MAINTENANCE.find>; onSelect: (id: string | null) => void; onNewRequest: () => void }) {
  return (
    <>
      <div className="sectionHead">
        <div>
          <h2>Maintenance</h2>
          <p>{FIXTURE_MAINTENANCE.length} requests across your portfolio</p>
        </div>
        <button type="button" className="primary" onClick={onNewRequest}>+ New Request</button>
      </div>

      {selected ? (
        <div className="propertyCard" style={{ padding: 22, marginBottom: 18 }}>
          <button type="button" className="breadcrumbBack" onClick={() => onSelect(null)}>← All Requests</button>
          <h2 style={{ margin: '10px 0 6px' }}>{selected.title}</h2>
          <span className={`statusPill ${maintenancePill(selected.status)}`}>{selected.status}</span>
          <p className="muted" style={{ marginTop: 14 }}>{selected.description}</p>
          <div className="miniStats" style={{ marginTop: 18 }}>
            <div><span>Category</span><strong>{selected.category}</strong></div>
            <div><span>Reported by</span><strong>{selected.reportedBy}</strong></div>
          </div>
          {selected.provider && <p className="muted" style={{ marginTop: 12 }}>Assigned to <strong>{selected.provider}</strong></p>}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {FIXTURE_MAINTENANCE.map((m) => {
            const prop = FIXTURE_PROPERTIES.find((p) => p.id === m.propertyId)
            return (
              <button key={m.id} type="button" className="propertyCard" style={{ padding: '16px 19px', textAlign: 'left' }} onClick={() => onSelect(m.id)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <div>
                    <p style={{ fontWeight: 650, marginBottom: 2 }}>{m.title}</p>
                    <p className="muted" style={{ fontSize: 12 }}>{prop?.address} · {m.category}</p>
                  </div>
                  <span className={`statusPill ${maintenancePill(m.status)}`}>{m.status}</span>
                </div>
              </button>
            )
          })}
        </div>
      )}
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
      <section className="stats">
        <div className="stat"><span>Total Income</span><strong>{money(s.totalIncome)}</strong></div>
        <div className="stat"><span>Total Expenses</span><strong>{money(s.totalExpenses)}</strong></div>
        <div className="stat"><span>Net Income</span><strong>{money(s.netIncome)}</strong></div>
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
