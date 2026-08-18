'use client'

import { ChangeEvent, DragEvent, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { DOCUMENT_CATEGORIES, FINANCIAL_CATEGORIES, MAINTENANCE_CATEGORIES, RENT_PAYMENT_METHODS } from '../lib/property-categories'
import { useSubscription } from '../lib/useSubscription'
import { canCreateProperty, entitlementsFor } from '../lib/billing/entitlements'
import { TenantConnectPanel } from '../components/TenantConnectPanel'
import { UpgradePrompt } from '../components/UpgradePrompt'
import LandingPage from '../components/LandingPage'
import { AuthHeader } from '../components/AuthHeader'
import DocumentIntelligencePanel, { type ApplyAction } from '../components/DocumentIntelligencePanel'
import { AddressAutocomplete } from '../components/AddressAutocomplete'
import { PropCrewPanel } from '../components/PropCrewPanel'
import { PropertySystemsPanel, type PropertySystem } from '../components/property-profile/PropertySystemsPanel'
import { PropertyNotesPanel, type PropertyNote } from '../components/property-profile/PropertyNotesPanel'
import { PropertyOwnershipPanel, type PropertyOwnership } from '../components/property-profile/PropertyOwnershipPanel'
import { PropertyTimelinePanel } from '../components/property-profile/PropertyTimelinePanel'
import type { NormalizedAddress } from '../lib/address/types'
import { deriveTimeline } from '../lib/property-timeline/derive-timeline'
import { resolveGreetingName, greetingTimeOfDay } from '../lib/user-profile/greeting'
import type { UserProfile } from '../lib/user-profile/types'
import { DOCUMENT_TYPES } from '../lib/document-intelligence/types'
import {
  buildLeaseDateItems, buildInsuranceDateItems, buildMortgageDateItems, buildMaintenanceDateItems,
  buildOpenMaintenanceItems, splitAttentionAndUpcoming, sortByDaysUntilAscending, limitItems,
  type DashboardDateItem, type OpenMaintenanceItem, type NavTarget,
} from '../lib/dashboard/attention'
import {
  documentActivity, maintenanceActivity, financialActivity, noteActivity,
  leaseActivity, insuranceActivity, mortgageActivity, propertyActivity, propCrewActivity,
  sortByTimestampDescending, type ActivityItem,
} from '../lib/dashboard/activity'
import {
  deriveOccupancy, deriveLeaseStatus, selectCurrentLease, sortLeaseHistory,
  normalizeTenants, isValidRentDueDay, formatRentDueDay,
} from '../lib/leases/status'
import { periodFromDate, formatPeriodLabel, type RentStatus } from '../lib/rent-ledger/status'
import {
  buildRentLedgerRows, buildRentDateItems, buildVacancyItems, buildSystemWarrantyDateItems, type VacancyItem,
} from '../lib/rent-ledger/ledger'

// Investment Tools 2.0 (Part 2): splits a resolved NormalizedAddress into
// this app's existing two-field address/city shape (properties.address,
// properties.city — unchanged database columns). Falls back to whatever
// was already typed when a provider field is missing, so a partial match
// never erases what the user had entered.
function applyNormalizedAddress(address: NormalizedAddress, fallbackAddress: string) {
  const cityState = [address.city, address.state].filter(Boolean).join(', ')
  const cityLine = [cityState, address.postalCode].filter(Boolean).join(' ')
  return {
    address: address.addressLine1 || address.formattedAddress || fallbackAddress,
    city: cityLine,
  }
}

type Property = {
  id: string
  owner_id: string
  address: string
  city: string
  property_type: string
  estimated_value: number
  mortgage_balance: number
  monthly_rent: number
  purchase_price: number
  monthly_expenses: number
  cover_photo_path: string | null
  coverUrl?: string
  // Property Profile 2.0, Section 5: additional Overview fields — all
  // nullable, all optional, never fabricated when absent.
  beds: number | null
  baths: number | null
  square_feet: number | null
  year_built: number | null
  lot_size_sqft: number | null
  purchase_date: string | null
  property_tax_annual: number | null
  hoa_monthly: number | null
  // Core Experience Bundle, item 6 (Property Financing Status
  // Foundation, supabase/milestone-13-financing-status.sql): one of
  // 'Active Mortgage' | 'Paid Off' | 'No Mortgage' | 'Unknown', or null
  // for a row that predates this column — null and 'Unknown' are always
  // treated identically ("not entered"), never as proof of anything.
  financing_status: string | null
  // Milestone 16 (Landlord Command Center): already selected by
  // loadPortfolio()'s existing `.select('*')` — properties.created_at
  // has always been fetched, just never typed until Recent Activity
  // needed a "Property added" timestamp. No new query.
  created_at: string
}

// Core Experience Bundle, item 6: the only four allowed values (mirrors
// the check constraint in supabase/milestone-13-financing-status.sql).
// 'Unknown' is the explicit, honest default — a blank/never-set mortgage
// field must never be silently read as "Paid Off" or "No Mortgage."
const FINANCING_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'Unknown', label: 'Unknown / Not Entered' },
  { value: 'Active Mortgage', label: 'Active Mortgage / Loan' },
  { value: 'Paid Off', label: 'Paid Off' },
  { value: 'No Mortgage', label: 'No Mortgage / Cash Purchase' },
]

type PropertyDocument = {
  id: string
  property_id: string
  owner_id: string
  name: string
  category: string
  storage_path: string
  size_bytes: number
  mime_type: string | null
  created_at: string
  document_type: string | null
  classification_confidence: string | null
  classification_source: string | null
  analysis_status: string
  analysis_error: string | null
}

type PropertyPhoto = {
  id: string
  property_id: string
  owner_id: string
  name: string
  storage_path: string
  is_cover: boolean
  created_at: string
  signedUrl?: string
}

type FinancialTransaction = {
  id: string
  property_id: string
  owner_id: string
  transaction_date: string
  transaction_type: 'Income' | 'Expense'
  category: string
  vendor: string | null
  description: string
  amount: number
  document_id: string | null
  is_recurring: boolean
  created_at: string
}



type LeaseRecord = {
  id: string; property_id: string; owner_id: string; tenant_name: string; tenant_email: string | null; monthly_rent: number; security_deposit: number; start_date: string; end_date: string; renewal_status: string; document_id: string | null; notes: string | null; created_at: string
  // Milestone 17: Tenant & Lease Management V2 — both nullable, added by
  // supabase/milestone-17-tenant-lease-v2.sql. Optional here (not every
  // row will have them; older rows have neither) rather than defaulted,
  // so absence renders as "not on file," never a guessed value.
  tenant_phone?: string | null
  rent_due_day?: number | null
}

// Milestone 18: Rent Ledger + PropWatch V1. One row per RECORDED
// payment — expected rent is never persisted (see lib/rent-ledger/).
type RentPaymentRecord = {
  id: string; owner_id: string; property_id: string; lease_id: string
  rent_period: string; date_received: string; amount: number; payment_method: string
  reference_number: string | null; notes: string | null; financial_transaction_id: string | null; created_at: string
}

type MortgageRecord = {
  id: string; property_id: string; owner_id: string; lender: string; loan_number: string | null; original_balance: number; current_balance: number; interest_rate: number; monthly_payment: number; escrow_amount: number; loan_term_years: number | null; maturity_date: string | null; document_id: string | null; created_at: string
}

type InsuranceRecord = {
  id: string; property_id: string; owner_id: string; carrier: string; policy_number: string | null; annual_premium: number; deductible: number; effective_date: string | null; expiration_date: string | null; document_id: string | null; created_at: string
}

type MaintenanceRecord = {
  id: string; property_id: string; owner_id: string; service_date: string; status: string; category: string; vendor: string | null; description: string; cost: number; document_id: string | null; financial_transaction_id: string | null; created_at: string
  // Property Profile 2.0: real links added by milestone-11 — which system
  // this serviced (feeds the Timeline's system-serviced source) and which
  // PropCrew provider did it (feeds PropCrew's real, never-fuzzy-matched
  // service history — see PropCrewPanel.tsx).
  system_id: string | null
  propcrew_contact_id: string | null
}

type PropertyContact = {
  id: string; property_id: string; owner_id: string; name: string; business_name: string | null; role: string; phone: string | null; email: string | null; website: string | null; notes: string | null; created_at: string
}

type MaintenanceRequest = {
  id: string; property_id: string; owner_id: string; tenant_name: string; tenant_email: string | null; title: string; description: string; priority: string; status: string; created_at: string
  assigned_contact_id: string | null
}

// Property Profile 2.0, Section 4: consolidated from 10 top-level tabs
// down to 5 ("Avoid creating 15+ top-level tabs... Overview / Financials
// / Property / People / Documents") — Lease/Mortgage/Insurance/
// Maintenance/Systems now live as sub-sections of "Property"; Contacts
// (now PropCrew)/Landlord/Tenant Connect live as sub-sections of
// "People"; Photos now lives as a sub-section of "Documents". Nothing
// was removed — every previous tab's content is still reachable, just
// regrouped.
type Tab = 'Overview' | 'Financials' | 'Property' | 'People' | 'Documents'
type PropertySubTab = 'Lease' | 'Mortgage' | 'Insurance' | 'Maintenance' | 'Systems'
// TenantConnectPanel stays bundled inside the Landlord sub-tab, exactly
// where it already rendered before this reorganization — not a separate
// sub-tab of its own.
type PeopleSubTab = 'PropCrew' | 'Landlord'
type DocumentsSubTab = 'Documents' | 'Photos'

const tabs: Tab[] = ['Overview', 'Financials', 'Property', 'People', 'Documents']
const propertySubTabs: PropertySubTab[] = ['Lease', 'Mortgage', 'Insurance', 'Maintenance', 'Systems']
const docCategories = ['All', ...DOCUMENT_CATEGORIES]
const requestPriorities = ['Low', 'Normal', 'High', 'Urgent']
const requestStatuses = ['Submitted', 'Scheduled', 'In Progress', 'Completed']

const money = (n: number) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0,
}).format(n || 0)

// Core Experience Bundle, item 4: sign-prefixed variants for Appreciation
// only (money()/plain percentages elsewhere stay exactly as they were —
// this is deliberately separate, not a change to existing formatting).
const signedMoney = (n: number) => (n >= 0 ? `+${money(n)}` : money(n))
const signedPercent = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`

// Appreciation = estimated/current value - purchase price (what the
// property itself has gained since purchase). Deliberately NOT Equity
// (value - debt, what the owner would keep if sold today) and NOT
// "Profit" — no renovation costs, selling costs, taxes, depreciation, or
// rental income enter this number; those live in Financials. Returns
// null (never shown) unless both purchase price and estimated value are
// genuinely available and positive — a $0/unset purchase price must
// never be read as "100% appreciation."
function appreciationFor(estimatedValue: number, purchasePrice: number): { amount: number; percent: number } | null {
  if (!(purchasePrice > 0) || !(estimatedValue > 0)) return null
  const amount = estimatedValue - purchasePrice
  return { amount, percent: (amount / purchasePrice) * 100 }
}

const formatSize = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Milestone 16: same local-noon date-only parsing already used
// throughout this file (e.g. `new Date(\`${lease.end_date}T12:00:00\`)`)
// and in lib/dashboard/date-classification.ts — a bare `new
// Date(dateOnlyString)` parses as UTC midnight, which displays one
// calendar day early in every negative-UTC-offset timezone.
const dateOnly = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString()

// Relative timestamp for Recent Activity — "Today," "Yesterday," "3 days
// ago," falling back to a plain calendar date beyond a week so the feed
// never has to guess at exact-second precision the user doesn't need.
function relativeTime(iso: string): string {
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return ''
  const days = Math.floor((Date.now() - then.getTime()) / (24 * 60 * 60 * 1000))
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return then.toLocaleDateString()
}

const safeName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_')

// Homepage snapshot cleanup: presentation-only helpers, no business logic.
// Compact currency for the snapshot row (e.g. "$1.82M" instead of
// "$1,820,000") — money() above (full precision) is still used everywhere
// else (property cards, financials, etc.) and is unchanged.
const compactMoney = (n: number) => {
  const value = n || 0
  const abs = Math.abs(value)
  if (abs >= 1_000_000) return `${value < 0 ? '-' : ''}$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 2)}M`
  if (abs >= 10_000) return `${value < 0 ? '-' : ''}$${Math.round(abs / 1000)}K`
  return money(value)
}

// Property Profile 2.0, Section 1: the greeting now reads from a real
// user_profiles row (see lib/user-profile/greeting.ts's fallback chain —
// display name -> first name -> email prefix -> "there"), not email
// directly. greetingTimeOfDay/resolveGreetingName are imported above.

// Portfolio Snapshot expand/collapse preference (Section 4): a lightweight,
// non-sensitive UI preference — no database migration for this alone (no
// existing user-preferences table to hang it on), just localStorage.
const SNAPSHOT_EXPANDED_STORAGE_KEY = 'proproster:portfolioSnapshotExpanded'


function EmptyModule({ title, text, action, onClick }: { title: string; text: string; action: string; onClick: () => void }) {
  return <div className="emptyModule"><strong>{title}</strong><span>{text}</span><button className="primary" onClick={onClick}>+ {action}</button></div>
}

// Milestone 17: Tenant & Lease Management V2 ---------------------------
//
// occupancyPillClass / leaseStatusPillClass map lib/leases/status.ts's
// derived OccupancyStatus/LeaseStatus onto this app's EXISTING pill
// vocabulary (statusPill + pillGood/pillWarn/pillBad/pillNeutral, already
// used by Document Intelligence and Smart Import) — no new badge system.
function occupancyPillClass(status: ReturnType<typeof deriveOccupancy>): string {
  if (status === 'Occupied') return 'pillGood'
  if (status === 'Upcoming tenancy') return 'pillWarn'
  return 'pillNeutral'
}
function leaseStatusPillClass(status: ReturnType<typeof deriveLeaseStatus>): string {
  if (status === 'Active') return 'pillGood'
  if (status === 'Upcoming' || status === 'Expiring Soon') return 'pillWarn'
  if (status === 'Expired') return 'pillBad'
  return 'pillNeutral'
}
// Milestone 18: same pill vocabulary, for Rent Ledger statuses.
function rentStatusPillClass(status: RentStatus): string {
  if (status === 'Paid') return 'pillGood'
  if (status === 'Due' || status === 'Partial') return 'pillWarn'
  if (status === 'Overdue') return 'pillBad'
  return 'pillNeutral' // Upcoming, Unknown
}

/** Tenant name(s)/phone/email — normalizeTenants() already returns an array so this renders correctly whether a future schema adds true multi-tenant support. */
function TenantContactList({ lease }: { lease: LeaseRecord }) {
  const tenants = normalizeTenants(lease)
  if (!tenants.length) return <p>No tenant name on file</p>
  return <>{tenants.map((t, i) => <p key={i} className="tenantContactRow"><strong>{t.name}</strong>{t.email && <span>{t.email}</span>}{t.phone && <span>{t.phone}</span>}{!t.email && !t.phone && <span className="muted">No contact info added</span>}</p>)}</>
}

/** The prominent Current Lease Card — the one place a landlord should be able to see everything about who's there and on what terms, at a glance. */
function LeaseCard({ lease, doc, heading, onEdit, onDelete, onOpenDocument }: {
  lease: LeaseRecord; doc: PropertyDocument | undefined; heading: string
  onEdit: () => void; onDelete: () => void; onOpenDocument: (doc: PropertyDocument) => void
}) {
  const status = deriveLeaseStatus(lease)
  const rentDue = formatRentDueDay(lease.rent_due_day ?? null)
  return <article className="recordCard currentLeaseCard">
    <div className="recordTop">
      <div>
        <span className={`statusPill ${leaseStatusPillClass(status)}`}>{status || 'Status unknown'}</span>
        <h3>{heading}</h3>
        <TenantContactList lease={lease} />
      </div>
      <div className="leaseCardActions">
        <button className="recordEdit" onClick={onEdit} aria-label={`Edit lease for ${lease.tenant_name}`}>Edit</button>
        <button className="recordDelete" onClick={onDelete} aria-label={`Delete lease for ${lease.tenant_name}`}>×</button>
      </div>
    </div>
    <div className="recordMetrics">
      <div><span>Monthly rent</span><strong>{money(lease.monthly_rent)}</strong></div>
      {lease.security_deposit > 0 && <div><span>Security deposit</span><strong>{money(lease.security_deposit)}</strong></div>}
      {rentDue && <div><span>Rent due</span><strong>{rentDue.replace('Rent due on the ', '').replace(' of each month', '')}</strong></div>}
    </div>
    <div className="recordRows">
      <div><span>Lease term</span><strong>{new Date(`${lease.start_date}T12:00:00`).toLocaleDateString()} – {new Date(`${lease.end_date}T12:00:00`).toLocaleDateString()}</strong></div>
      {doc && <div><span>Signed lease</span><button onClick={() => onOpenDocument(doc)}>{doc.name}</button></div>}
      {lease.notes && <div><span>Notes</span><strong>{lease.notes}</strong></div>}
    </div>
  </article>
}

/** Compact, stacked (never a wide table) Lease History row — tenant, period, rent, status — with an expand toggle for the rest. */
function LeaseHistoryRow({ lease, doc, onEdit, onDelete, onOpenDocument }: {
  lease: LeaseRecord; doc: PropertyDocument | undefined
  onEdit: () => void; onDelete: () => void; onOpenDocument: (doc: PropertyDocument) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const status = deriveLeaseStatus(lease)
  return <article className="leaseHistoryRow">
    <button className="leaseHistorySummary" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
      <span className={`statusPill ${leaseStatusPillClass(status)}`}>{status || 'Status unknown'}</span>
      <span className="leaseHistoryName">{lease.tenant_name}</span>
      <span className="leaseHistoryPeriod">{new Date(`${lease.start_date}T12:00:00`).toLocaleDateString()} – {new Date(`${lease.end_date}T12:00:00`).toLocaleDateString()}</span>
      <span className="leaseHistoryRent">{money(lease.monthly_rent)}</span>
      <span className="leaseHistoryChevron">{expanded ? '−' : '+'}</span>
    </button>
    {expanded && <div className="recordRows leaseHistoryDetail">
      <TenantContactList lease={lease} />
      {lease.security_deposit > 0 && <div><span>Security deposit</span><strong>{money(lease.security_deposit)}</strong></div>}
      {doc && <div><span>Signed lease</span><button onClick={() => onOpenDocument(doc)}>{doc.name}</button></div>}
      {lease.notes && <div><span>Notes</span><strong>{lease.notes}</strong></div>}
      <div className="leaseHistoryDetailActions"><button onClick={onEdit}>Edit</button><button className="dangerLink" onClick={onDelete}>Remove</button></div>
    </div>}
  </article>
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const { plan } = useSubscription(user)
  const entitlements = useMemo(() => entitlementsFor(plan), [plan])
  // Launch Pricing: one shared UpgradePrompt instance, distinguished by
  // WHY it was opened — 'propertyLimit' keeps the original property-count
  // framing (REACHED_LIMIT_COPY/NEXT_PLAN), 'documentIntelligence' shows
  // the AI-capability framing (targets Manage specifically, since
  // NEXT_PLAN's "next rung" may still be Organize, which doesn't include
  // it). Both reuse the same modal/checkout plumbing — no second prompt
  // component.
  const [showUpgrade, setShowUpgrade] = useState<null | 'propertyLimit' | 'documentIntelligence'>(null)
  // Portfolio Snapshot expand/collapse (Section 3/4) — defaults expanded;
  // corrected from localStorage on mount (client-only, so this can't run
  // during server rendering). Presentation preference only, never sent to
  // the server, never affects what data loads.
  const [snapshotExpanded, setSnapshotExpanded] = useState(true)
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SNAPSHOT_EXPANDED_STORAGE_KEY)
      if (stored !== null) setSnapshotExpanded(stored !== 'false')
    } catch {
      // Storage unavailable (private browsing, disabled storage, etc.) —
      // fall back to the default expanded state, never throw.
    }
  }, [])
  function toggleSnapshotExpanded() {
    setSnapshotExpanded((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(SNAPSHOT_EXPANDED_STORAGE_KEY, String(next))
      } catch {
        // Best-effort persistence only — the toggle still works this session either way.
      }
      return next
    })
  }
  const [properties, setProperties] = useState<Property[]>([])
  const [documents, setDocuments] = useState<PropertyDocument[]>([])
  const [photos, setPhotos] = useState<PropertyPhoto[]>([])
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([])
  const [leases, setLeases] = useState<LeaseRecord[]>([])
  const [mortgages, setMortgages] = useState<MortgageRecord[]>([])
  const [insurancePolicies, setInsurancePolicies] = useState<InsuranceRecord[]>([])
  const [maintenanceRecords, setMaintenanceRecords] = useState<MaintenanceRecord[]>([])
  const [contacts, setContacts] = useState<PropertyContact[]>([])
  const [maintenanceRequests, setMaintenanceRequests] = useState<MaintenanceRequest[]>([])
  // Property Profile 2.0
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  // QA: the greeting briefly showed the email-prefix fallback (e.g.
  // "Kirollos") before user_profiles resolved and it flipped to the real
  // preferred/display name ("Kiro") — resolveGreetingName(null, email)
  // legitimately falls through to the email prefix when profile is null,
  // which is correct once loading has actually finished, but wrong while
  // still in flight. This tracks that distinction; set once, true, after
  // the first successful profile fetch below — never reset except on
  // sign-out, so an in-app data refresh (loadPortfolio() called again
  // without a full remount) doesn't re-introduce the flicker.
  const [profileReady, setProfileReady] = useState(false)
  const [propertySystems, setPropertySystems] = useState<PropertySystem[]>([])
  const [rentPayments, setRentPayments] = useState<RentPaymentRecord[]>([])
  const [propertyNotes, setPropertyNotes] = useState<PropertyNote[]>([])
  const [propertyOwnership, setPropertyOwnership] = useState<PropertyOwnership[]>([])
  const [propertySubTab, setPropertySubTab] = useState<PropertySubTab>('Lease')
  const [peopleSubTab, setPeopleSubTab] = useState<PeopleSubTab>('PropCrew')
  const [documentsSubTab, setDocumentsSubTab] = useState<DocumentsSubTab>('Documents')
  const [propCrewPrefill, setPropCrewPrefill] = useState<{ name: string; businessName?: string; phone?: string; email?: string; website?: string } | null>(null)
  const [showTransaction, setShowTransaction] = useState(false)
  const [showModuleForm, setShowModuleForm] = useState<'Lease'|'Mortgage'|'Insurance'|'Maintenance'|null>(null)
  const [showRequestForm, setShowRequestForm] = useState(false)
  const [showDocIntelId, setShowDocIntelId] = useState<string | null>(null)
  // QA: Move / Refile — moveDraft holds the in-progress edits for the
  // document currently being moved (moveDocId), and moveError surfaces the
  // block-and-explain message when a linked canonical record prevents
  // changing the property.
  const [moveDocId, setMoveDocId] = useState<string | null>(null)
  const [moveDraft, setMoveDraft] = useState({ propertyId: '', category: '', documentType: '' })
  const [moveError, setMoveError] = useState('')
  const [leaseDraft, setLeaseDraft] = useState({ tenantName:'', tenantEmail:'', tenantPhone:'', monthlyRent:'', securityDeposit:'', rentDueDay:'', startDate:new Date().toISOString().slice(0,10), endDate:'', renewalStatus:'Active', documentId:'', notes:'' })
  // Milestone 17: null while adding a new lease; set to the lease's id
  // while editing an existing one — saveLease() branches insert/update
  // on this, and the same leaseDraft/modal is reused for both.
  const [editingLeaseId, setEditingLeaseId] = useState<string | null>(null)
  const [leaseFormError, setLeaseFormError] = useState('')
  const [mortgageDraft, setMortgageDraft] = useState({ lender:'', loanNumber:'', originalBalance:'', currentBalance:'', interestRate:'', monthlyPayment:'', escrowAmount:'', loanTermYears:'30', maturityDate:'', documentId:'' })
  const [insuranceDraft, setInsuranceDraft] = useState({ carrier:'', policyNumber:'', annualPremium:'', deductible:'', effectiveDate:'', expirationDate:'', documentId:'' })
  const [maintenanceDraft, setMaintenanceDraft] = useState({ serviceDate:new Date().toISOString().slice(0,10), status:'Completed', category:'Repair', vendor:'', description:'', cost:'', documentId:'', addToFinancials:true })
  const [requestDraft, setRequestDraft] = useState({ tenantName:'', tenantEmail:'', title:'', description:'', priority:'Normal', status:'Submitted' })
  const [financialYear, setFinancialYear] = useState(String(new Date().getFullYear()))
  const [transactionDraft, setTransactionDraft] = useState({ date: new Date().toISOString().slice(0, 10), type: 'Expense' as 'Income' | 'Expense', category: 'Repairs', vendor: '', description: '', amount: '', documentId: '', recurring: false })
  const [showAdd, setShowAdd] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('Overview')
  const [docCategory, setDocCategory] = useState('All')
  const [uploadCategory, setUploadCategory] = useState('Other')
  const [isDragging, setIsDragging] = useState(false)
  const [coverFile, setCoverFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState('')
  const [draft, setDraft] = useState({
    address: '', city: '', type: 'Rental Property', value: '', mortgage: '', rent: '', purchasePrice: '', monthlyExpenses: '', financingStatus: 'Unknown',
  })
  const [editDraft, setEditDraft] = useState({
    address: '', city: '', type: 'Rental Property', value: '', mortgage: '', rent: '', purchasePrice: '', monthlyExpenses: '', financingStatus: 'Unknown',
    beds: '', baths: '', squareFeet: '', yearBuilt: '', lotSizeSqft: '', purchaseDate: '', propertyTaxAnnual: '', hoaMonthly: '',
  })

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true)
      return
    }
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null)
      setAuthReady(true)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setSelectedId(null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (user) void loadPortfolio()
    else {
      setProperties([])
      setDocuments([])
      setPhotos([])
      setTransactions([])
      setLeases([])
      setMortgages([])
      setInsurancePolicies([])
      setMaintenanceRecords([])
      setContacts([])
      setMaintenanceRequests([])
      setUserProfile(null)
      setProfileReady(false)
      setPropertySystems([])
      setPropertyNotes([])
      setPropertyOwnership([])
    }
  }, [user?.id])

  const totals = useMemo(() => {
    const value = properties.reduce((sum, p) => sum + Number(p.estimated_value), 0)
    const debt = properties.reduce((sum, p) => sum + Number(p.mortgage_balance), 0)
    const rent = properties.reduce((sum, p) => sum + Number(p.monthly_rent), 0)
    // Homepage snapshot cleanup: same reduce pattern as `rent` directly
    // above, over the same already-loaded property field
    // (property.monthly_expenses) — a display aggregate only, not a new
    // calculation used anywhere else.
    const monthlyExpenses = properties.reduce((sum, p) => sum + Number(p.monthly_expenses), 0)
    const year = String(new Date().getFullYear())
    const ytd = transactions.filter((tx) => tx.transaction_date.startsWith(year))
    const income = ytd.filter((tx) => tx.transaction_type === 'Income').reduce((sum, tx) => sum + Number(tx.amount), 0)
    const expenses = ytd.filter((tx) => tx.transaction_type === 'Expense').reduce((sum, tx) => sum + Number(tx.amount), 0)
    return { value, debt, equity: value - debt, rent, monthlyExpenses, income, expenses, cashFlow: income - expenses }
  }, [properties, transactions])

  // Milestone 16: Landlord Command Center. Every input here is data
  // app/page.tsx already loads for the property workspace (loadPortfolio()
  // above) — no new query, no new table. All the actual date-threshold/
  // sort/dedup logic lives in lib/dashboard/ (unit tested there); this is
  // just wiring already-fetched, RLS-scoped rows into it.
  const NEEDS_ATTENTION_LIMIT = 10
  const UPCOMING_LIMIT = 8
  const OPEN_MAINTENANCE_LIMIT = 6
  const RECENT_ACTIVITY_LIMIT = 8

  const propertyLabelById = useMemo(() => new Map(properties.map((p) => [p.id, p.address])), [properties])

  const { attentionItems, upcomingItems, openMaintenanceItems, recentActivity, vacancyItems } = useMemo(() => {
    // Milestone 18: PropWatch's rent + warranty signals fold into the
    // SAME dateItems list Milestone 16 already builds — same
    // classifyDate() thresholds, same Needs Attention/Upcoming split,
    // no second dashboard. Always evaluated for the CURRENT calendar
    // month regardless of which month the Rent Ledger page itself is
    // browsing.
    const currentPeriod = periodFromDate(new Date())
    // Launch Pricing: Lease/Insurance/Mortgage/Maintenance signals stay
    // available to EVERY plan — "Do not destroy the Command Center for
    // Free/Organize users." Only the M18 additions (rent status, system
    // warranty, vacancy) are the "enhanced actionable PropWatch signals"
    // reserved for canUsePropWatch (Manage and above).
    const dateItems: DashboardDateItem[] = [
      ...buildLeaseDateItems(leases, propertyLabelById),
      ...buildInsuranceDateItems(insurancePolicies, propertyLabelById),
      ...buildMortgageDateItems(mortgages, propertyLabelById),
      ...buildMaintenanceDateItems(maintenanceRecords, propertyLabelById),
      ...(entitlements.canUsePropWatch ? buildRentDateItems(leases, properties, rentPayments, currentPeriod, propertyLabelById) : []),
      ...(entitlements.canUsePropWatch ? buildSystemWarrantyDateItems(propertySystems, propertyLabelById) : []),
    ]
    const { needsAttention, upcoming } = splitAttentionAndUpcoming(dateItems)
    const vacancy = entitlements.canUsePropWatch ? buildVacancyItems(properties, leases, propertyLabelById) : []

    const activity: ActivityItem[] = sortByTimestampDescending([
      ...documentActivity(documents, propertyLabelById),
      ...maintenanceActivity(maintenanceRecords, propertyLabelById),
      ...financialActivity(transactions, propertyLabelById),
      ...noteActivity(propertyNotes, propertyLabelById),
      ...leaseActivity(leases, propertyLabelById),
      ...insuranceActivity(insurancePolicies, propertyLabelById),
      ...mortgageActivity(mortgages, propertyLabelById),
      ...propertyActivity(properties),
      ...propCrewActivity(contacts, propertyLabelById),
    ])

    return {
      attentionItems: limitItems(sortByDaysUntilAscending(needsAttention), NEEDS_ATTENTION_LIMIT),
      upcomingItems: limitItems(sortByDaysUntilAscending(upcoming), UPCOMING_LIMIT),
      openMaintenanceItems: limitItems(buildOpenMaintenanceItems(maintenanceRecords, propertyLabelById), OPEN_MAINTENANCE_LIMIT),
      recentActivity: limitItems(activity, RECENT_ACTIVITY_LIMIT),
      vacancyItems: vacancy,
    }
  }, [leases, insurancePolicies, mortgages, maintenanceRecords, documents, transactions, propertyNotes, properties, contacts, propertyLabelById, rentPayments, propertySystems, entitlements])

  const openMaintenanceCount = useMemo(() => maintenanceRecords.filter((m) => m.status !== 'Completed').length, [maintenanceRecords])

  function goToNav(propertyId: string, nav: NavTarget) {
    openProperty(propertyId, nav.tab, nav.docsSubTab, nav.propSubTab, nav.peopleSubTab)
  }

  const selected = properties.find((property) => property.id === selectedId) || null
  const selectedDocs = documents.filter((doc) => doc.property_id === selectedId)
  const filteredDocs = docCategory === 'All' ? selectedDocs : selectedDocs.filter((doc) => doc.category === docCategory)
  const selectedPhotos = photos.filter((photo) => photo.property_id === selectedId)
  const selectedTransactions = transactions.filter((tx) => tx.property_id === selectedId)
  const selectedYearTransactions = selectedTransactions.filter((tx) => tx.transaction_date.startsWith(financialYear))
  const selectedLeases = leases.filter((row) => row.property_id === selectedId)
  const selectedMortgages = mortgages.filter((row) => row.property_id === selectedId)
  const selectedInsurance = insurancePolicies.filter((row) => row.property_id === selectedId)
  const selectedMaintenance = maintenanceRecords.filter((row) => row.property_id === selectedId)
  const selectedContacts = contacts.filter((row) => row.property_id === selectedId)
  const selectedRequests = maintenanceRequests.filter((row) => row.property_id === selectedId)
  const openRequests = selectedRequests.filter((row) => row.status !== 'Completed')
  const completedRequests = selectedRequests.filter((row) => row.status === 'Completed')
  const selectedSystems = propertySystems.filter((row) => row.property_id === selectedId)
  const selectedNotes = propertyNotes.filter((row) => row.property_id === selectedId)
  const selectedOwnership = propertyOwnership.filter((row) => row.property_id === selectedId)
  // Property Profile 2.0, Section 9: derived, not stored — see
  // lib/property-timeline/derive-timeline.ts for the architecture note.
  // Uses exactly the records already loaded above for this property, plus
  // property_systems (also already loaded here) — no additional request.
  const selectedTimeline = selected ? deriveTimeline({
    property: { id: selected.id, address: selected.address, purchase_date: selected.purchase_date },
    leases: selectedLeases, mortgages: selectedMortgages, insurancePolicies: selectedInsurance,
    maintenanceRecords: selectedMaintenance, financialTransactions: selectedTransactions,
    systems: selectedSystems, contacts: selectedContacts,
  }) : []

  async function loadPortfolio() {
    if (!supabase || !user) return
    const client = supabase
    setBusy(true)
    setError('')
    const [
      { data: propertyRows, error: propertyError }, { data: docRows, error: docError }, { data: photoRows, error: photoError },
      { data: transactionRows, error: transactionError }, { data: leaseRows, error: leaseError }, { data: mortgageRows, error: mortgageError },
      { data: insuranceRows, error: insuranceError }, { data: maintenanceRows, error: maintenanceError }, { data: contactRows, error: contactError },
      { data: requestRows, error: requestError }, { data: systemRows, error: systemError }, { data: noteRows, error: noteError },
      { data: ownershipRows, error: ownershipError }, { data: profileRow }, { data: rentPaymentRows, error: rentPaymentError },
    ] = await Promise.all([
      client.from('properties').select('*').order('created_at', { ascending: true }),
      client.from('property_documents').select('*').order('created_at', { ascending: false }),
      client.from('property_photos').select('*').order('created_at', { ascending: false }),
      client.from('financial_transactions').select('*').order('transaction_date', { ascending: false }),
      client.from('leases').select('*').order('created_at', { ascending: false }),
      client.from('mortgages').select('*').order('created_at', { ascending: false }),
      client.from('insurance_policies').select('*').order('created_at', { ascending: false }),
      client.from('maintenance_records').select('*').order('service_date', { ascending: false }),
      client.from('property_contacts').select('*').order('created_at', { ascending: false }),
      client.from('maintenance_requests').select('*').order('created_at', { ascending: false }),
      client.from('property_systems').select('*').order('created_at', { ascending: false }),
      client.from('property_notes').select('*').order('is_pinned', { ascending: false }).order('created_at', { ascending: false }),
      client.from('property_ownership').select('*').order('created_at', { ascending: true }),
      client.from('user_profiles').select('*').eq('id', user.id).maybeSingle(),
      client.from('rent_payments').select('*').order('date_received', { ascending: false }),
    ])
    const firstError = propertyError || docError || photoError || transactionError || leaseError || mortgageError || insuranceError || maintenanceError || contactError || requestError || systemError || noteError || ownershipError || rentPaymentError
    if (firstError) {
      setError(firstError.message)
      setBusy(false)
      return
    }

    const rawProperties = (propertyRows || []) as Property[]
    const rawPhotos = (photoRows || []) as PropertyPhoto[]
    const signedPhotos = await Promise.all(rawPhotos.map(async (photo) => {
      const { data } = await client.storage.from('property-photos').createSignedUrl(photo.storage_path, 3600)
      return { ...photo, signedUrl: data?.signedUrl }
    }))
    const coverMap = new Map(signedPhotos.filter((p) => p.is_cover).map((p) => [p.property_id, p.signedUrl]))
    setProperties(rawProperties.map((p) => ({ ...p, coverUrl: coverMap.get(p.id) })))
    setDocuments((docRows || []) as PropertyDocument[])
    setPhotos(signedPhotos)
    setTransactions((transactionRows || []) as FinancialTransaction[])
    setLeases((leaseRows || []) as LeaseRecord[])
    setMortgages((mortgageRows || []) as MortgageRecord[])
    setInsurancePolicies((insuranceRows || []) as InsuranceRecord[])
    setMaintenanceRecords((maintenanceRows || []) as MaintenanceRecord[])
    setContacts((contactRows || []) as PropertyContact[])
    setPropertySystems((systemRows || []) as PropertySystem[])
    setPropertyNotes((noteRows || []) as PropertyNote[])
    setPropertyOwnership((ownershipRows || []) as PropertyOwnership[])
    setUserProfile((profileRow || null) as UserProfile | null)
    setProfileReady(true)
    setMaintenanceRequests((requestRows || []) as MaintenanceRequest[])
    setRentPayments((rentPaymentRows || []) as RentPaymentRecord[])
    setBusy(false)
  }

  const handleImage = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setCoverFile(file)
    const reader = new FileReader()
    reader.onload = () => setImagePreview(String(reader.result || ''))
    reader.readAsDataURL(file)
  }

  // Section 8: check the plan boundary BEFORE opening the add-property
  // form at all, so a user who's already at their limit sees the upgrade
  // prompt instead of filling out a form that was always going to fail.
  // This is UX only — the database trigger (enforce_property_limit) is
  // what actually enforces the limit; see the PROPERTY_LIMIT_REACHED
  // fallback in addProperty() below for what happens if this check was
  // stale (e.g. a second tab already used up the last slot).
  function openAddProperty() {
    if (!canCreateProperty(plan, properties.length)) {
      setShowUpgrade('propertyLimit')
      return
    }
    setShowAdd(true)
  }

  // Authenticated Header Simplification, Part 6: the hamburger's
  // "+ Add Property" link (components/AuthNavMenu.tsx) navigates to
  // "/?add=property" rather than trying to drive a modal across a page
  // boundary — this reads that one-shot flag on load and opens the exact
  // same add-property flow the dashboard's own "+ Add Property" button
  // uses (My Properties section), then strips it from the URL so a
  // refresh or back-navigation doesn't re-open it. Plain browser APIs
  // only (no next/navigation searchParams hook), so "/" keeps its static
  // prerendering.
  useEffect(() => {
    if (!authReady || !user) return
    if (typeof window === 'undefined') return
    if (new URLSearchParams(window.location.search).get('add') !== 'property') return
    window.history.replaceState(null, '', window.location.pathname)
    // The add-property modal only renders in the dashboard view below —
    // clear any selected property first so it's actually visible even if
    // this flag arrives while a property workspace is open.
    setSelectedId(null)
    openAddProperty()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, user])

  async function addProperty() {
    if (!supabase || !user || !draft.address.trim() || !draft.city.trim()) return
    setBusy(true)
    setError('')
    const { data: inserted, error: insertError } = await supabase.from('properties').insert({
      owner_id: user.id,
      address: draft.address.trim(),
      city: draft.city.trim(),
      property_type: draft.type,
      estimated_value: Number(draft.value || 0),
      mortgage_balance: Number(draft.mortgage || 0),
      monthly_rent: Number(draft.rent || 0),
      purchase_price: Number(draft.purchasePrice || 0),
      monthly_expenses: Number(draft.monthlyExpenses || 0),
      financing_status: draft.financingStatus,
    }).select('*').single()

    if (insertError || !inserted) {
      // PROPERTY_LIMIT_REACHED is the trigger's distinguishable message
      // (Section 6/8) — show the upgrade prompt instead of a raw database
      // error. This is the real security boundary; it can fire even when
      // openAddProperty()'s check above passed, if another tab/request
      // used up the last slot in between.
      if (insertError?.message === 'PROPERTY_LIMIT_REACHED') {
        setShowAdd(false)
        setShowUpgrade('propertyLimit')
      } else {
        setError(insertError?.message || 'Unable to add property.')
      }
      setBusy(false)
      return
    }

    if (coverFile) {
      const path = `${user.id}/${inserted.id}/photos/${crypto.randomUUID()}-${safeName(coverFile.name)}`
      const { error: uploadError } = await supabase.storage.from('property-photos').upload(path, coverFile, { contentType: coverFile.type, upsert: false })
      if (!uploadError) {
        await supabase.from('property_photos').insert({ owner_id: user.id, property_id: inserted.id, name: coverFile.name, storage_path: path, is_cover: true })
        await supabase.from('properties').update({ cover_photo_path: path }).eq('id', inserted.id)
      }
    }

    setDraft({ address: '', city: '', type: 'Rental Property', value: '', mortgage: '', rent: '', purchasePrice: '', monthlyExpenses: '', financingStatus: 'Unknown' })
    setCoverFile(null)
    setImagePreview('')
    setShowAdd(false)
    await loadPortfolio()
    setBusy(false)
  }

  function openEditProperty(property: Property) {
    setEditDraft({
      address: property.address,
      city: property.city,
      type: property.property_type,
      value: String(property.estimated_value || ''),
      mortgage: String(property.mortgage_balance || ''),
      rent: String(property.monthly_rent || ''),
      purchasePrice: String(property.purchase_price || ''),
      monthlyExpenses: String(property.monthly_expenses || ''),
      financingStatus: property.financing_status || 'Unknown',
      beds: property.beds != null ? String(property.beds) : '',
      baths: property.baths != null ? String(property.baths) : '',
      squareFeet: property.square_feet != null ? String(property.square_feet) : '',
      yearBuilt: property.year_built != null ? String(property.year_built) : '',
      lotSizeSqft: property.lot_size_sqft != null ? String(property.lot_size_sqft) : '',
      purchaseDate: property.purchase_date || '',
      propertyTaxAnnual: property.property_tax_annual != null ? String(property.property_tax_annual) : '',
      hoaMonthly: property.hoa_monthly != null ? String(property.hoa_monthly) : '',
    })
    setShowEdit(true)
    setShowDeleteConfirm(false)
    setError('')
  }

  async function updateProperty() {
    if (!supabase || !user || !selected || !editDraft.address.trim() || !editDraft.city.trim()) return
    setBusy(true)
    setError('')
    const { error: updateError } = await supabase.from('properties').update({
      address: editDraft.address.trim(),
      city: editDraft.city.trim(),
      property_type: editDraft.type,
      estimated_value: Number(editDraft.value || 0),
      mortgage_balance: Number(editDraft.mortgage || 0),
      monthly_rent: Number(editDraft.rent || 0),
      purchase_price: Number(editDraft.purchasePrice || 0),
      monthly_expenses: Number(editDraft.monthlyExpenses || 0),
      financing_status: editDraft.financingStatus,
      beds: editDraft.beds ? Number(editDraft.beds) : null,
      baths: editDraft.baths ? Number(editDraft.baths) : null,
      square_feet: editDraft.squareFeet ? Number(editDraft.squareFeet) : null,
      year_built: editDraft.yearBuilt ? Number(editDraft.yearBuilt) : null,
      lot_size_sqft: editDraft.lotSizeSqft ? Number(editDraft.lotSizeSqft) : null,
      purchase_date: editDraft.purchaseDate || null,
      property_tax_annual: editDraft.propertyTaxAnnual ? Number(editDraft.propertyTaxAnnual) : null,
      hoa_monthly: editDraft.hoaMonthly ? Number(editDraft.hoaMonthly) : null,
    }).eq('id', selected.id).eq('owner_id', user.id)

    if (updateError) {
      setError(updateError.message)
      setBusy(false)
      return
    }
    setShowEdit(false)
    await loadPortfolio()
    setBusy(false)
  }

  async function deleteProperty() {
    if (!supabase || !user || !selected) return
    setBusy(true)
    setError('')

    const propertyDocs = documents.filter((doc) => doc.property_id === selected.id)
    const propertyPhotos = photos.filter((photo) => photo.property_id === selected.id)
    const documentPaths = propertyDocs.map((doc) => doc.storage_path)
    const photoPaths = propertyPhotos.map((photo) => photo.storage_path)

    if (documentPaths.length) {
      const { error: storageError } = await supabase.storage.from('property-documents').remove(documentPaths)
      if (storageError) { setError(`Could not remove property documents: ${storageError.message}`); setBusy(false); return }
    }
    if (photoPaths.length) {
      const { error: storageError } = await supabase.storage.from('property-photos').remove(photoPaths)
      if (storageError) { setError(`Could not remove property photos: ${storageError.message}`); setBusy(false); return }
    }

    const { error: deleteError } = await supabase.from('properties').delete().eq('id', selected.id).eq('owner_id', user.id)
    if (deleteError) {
      setError(deleteError.message)
      setBusy(false)
      return
    }

    setShowDeleteConfirm(false)
    setShowEdit(false)
    setSelectedId(null)
    await loadPortfolio()
    setBusy(false)
  }

  const openProperty = (id: string, tab: Tab = 'Overview', docsSubTab?: DocumentsSubTab, propSubTab?: PropertySubTab, peopleSubTab?: PeopleSubTab) => {
    setSelectedId(id)
    setActiveTab(tab)
    if (docsSubTab) setDocumentsSubTab(docsSubTab)
    if (propSubTab) setPropertySubTab(propSubTab)
    if (peopleSubTab) setPeopleSubTab(peopleSubTab)
    setDocCategory('All')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Smart Upload Foundation: a "PrepareOnly" item (lease/insurance/
  // mortgage/tax/etc. — see components/SmartUpload/PrepareOnlyReview.tsx)
  // links to "/?openProperty=<id>" after it's saved, so the user can jump
  // straight to that property's already-completed analysis and apply it
  // through the existing, unchanged Document Intelligence Apply flow.
  // Same one-shot-flag pattern as "?add=property" above — plain browser
  // APIs only, so "/" keeps its static prerendering. RLS (not this
  // effect) is what actually stops the id from resolving to anyone
  // else's property — openProperty() itself does no ownership check, the
  // same as every other call site of it in this file, all of which only
  // ever pass an id from the caller's own `properties` list; a forged id
  // here just fails to match any card render and shows nothing.
  //
  // Milestone 15 (Global Search): extended with optional ?openTab /
  // ?openDocsSubTab / ?openPropSubTab / ?openPeopleSubTab params so
  // app/search/page.tsx can deep-link into any tab a search result
  // points at, reusing this SAME mechanism rather than a second
  // navigation architecture. When none of the new params are present
  // (every existing caller of "?openProperty=<id>" alone), behavior is
  // byte-identical to before: Documents tab, Documents sub-tab.
  useEffect(() => {
    if (!authReady || !user) return
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const id = params.get('openProperty')
    if (!id) return
    const tab = (params.get('openTab') as Tab | null) || 'Documents'
    const docsSubTab = (params.get('openDocsSubTab') as DocumentsSubTab | null) || (tab === 'Documents' ? 'Documents' : undefined)
    const propSubTab = (params.get('openPropSubTab') as PropertySubTab | null) || undefined
    const peopleSubTab = (params.get('openPeopleSubTab') as PeopleSubTab | null) || undefined
    window.history.replaceState(null, '', window.location.pathname)
    openProperty(id, tab, docsSubTab, propSubTab, peopleSubTab)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, user])

  async function addDocumentFiles(files: FileList | File[]) {
    if (!supabase || !user || !selectedId) return
    const incoming = Array.from(files)
    if (!incoming.length) return
    setBusy(true)
    setError('')
    for (const file of incoming) {
      const path = `${user.id}/${selectedId}/documents/${crypto.randomUUID()}-${safeName(file.name)}`
      const { error: uploadError } = await supabase.storage.from('property-documents').upload(path, file, { contentType: file.type || undefined, upsert: false })
      if (uploadError) {
        setError(uploadError.message)
        continue
      }
      const { error: rowError } = await supabase.from('property_documents').insert({
        owner_id: user.id, property_id: selectedId, name: file.name, category: uploadCategory,
        storage_path: path, size_bytes: file.size, mime_type: file.type || null,
      })
      if (rowError) {
        await supabase.storage.from('property-documents').remove([path])
        setError(rowError.message)
      }
    }
    await loadPortfolio()
    setBusy(false)
  }

  async function addPhotoFiles(files: FileList | File[]) {
    if (!supabase || !user || !selectedId) return
    const incoming = Array.from(files).filter((file) => file.type.startsWith('image/'))
    if (!incoming.length) return
    setBusy(true)
    setError('')
    const hasCover = selectedPhotos.some((photo) => photo.is_cover)
    for (let index = 0; index < incoming.length; index++) {
      const file = incoming[index]
      const path = `${user.id}/${selectedId}/photos/${crypto.randomUUID()}-${safeName(file.name)}`
      const { error: uploadError } = await supabase.storage.from('property-photos').upload(path, file, { contentType: file.type, upsert: false })
      if (uploadError) {
        setError(uploadError.message)
        continue
      }
      const isCover = !hasCover && index === 0
      const { error: rowError } = await supabase.from('property_photos').insert({ owner_id: user.id, property_id: selectedId, name: file.name, storage_path: path, is_cover: isCover })
      if (rowError) {
        await supabase.storage.from('property-photos').remove([path])
        setError(rowError.message)
      } else if (isCover) {
        await supabase.from('properties').update({ cover_photo_path: path }).eq('id', selectedId)
      }
    }
    await loadPortfolio()
    setBusy(false)
  }

  // QA: "Open" didn't reliably open the document, particularly on mobile
  // Safari. Root cause — window.open() only bypasses the popup blocker
  // when called SYNCHRONOUSLY inside the click handler; by the time the
  // `await`ed signed-URL fetch resolved, iOS/mobile Safari no longer
  // treated this as a user-initiated action and silently blocked it (or
  // opened a blank tab that never navigated). Fix: open the tab
  // immediately, before the async call, then redirect it once the real
  // signed URL is known — same private, short-lived (60s) signed URL as
  // before, same storage bucket, no public URL, nothing re-uploaded.
  // This is the one place every "Open" action in the app goes through
  // (DocumentIntelligencePanel's "Open <name>" button uses the same
  // onOpenDocument callback), so normal Documents and Smart
  // Upload-created documents both go through this identical fix.
  async function openDocument(doc: PropertyDocument) {
    if (!supabase) return
    // Deliberately omit "noopener" here (unlike a normal <a target="_blank">
    // link) — noopener makes window.open() return null in every modern
    // browser, and we need the window reference to redirect it below.
    // opener is cleared manually instead once we're done with it.
    const newTab = window.open('', '_blank', 'noreferrer')
    const { data, error: urlError } = await supabase.storage.from('property-documents').createSignedUrl(doc.storage_path, 60)
    if (urlError || !data?.signedUrl) {
      newTab?.close()
      setError(urlError?.message || 'Unable to open this document. Please try again.')
      return
    }
    if (newTab) {
      try { newTab.opener = null } catch { /* not settable in every browser — best effort */ }
      newTab.location.href = data.signedUrl
    } else {
      // The synchronous open was itself blocked (rare) — fall back to a
      // same-tab navigation rather than silently doing nothing.
      window.location.href = data.signedUrl
    }
  }

  async function removeDocument(doc: PropertyDocument) {
    if (!supabase) return
    setBusy(true)
    const { error: storageError } = await supabase.storage.from('property-documents').remove([doc.storage_path])
    if (storageError) setError(storageError.message)
    const { error: rowError } = await supabase.from('property_documents').delete().eq('id', doc.id)
    if (rowError) setError(rowError.message)
    await loadPortfolio()
    setBusy(false)
  }

  // QA: Move / Refile — updates the canonical property_documents row's
  // property_id/category/document_type in place. Never re-uploads the
  // file, never creates a second row, never re-runs AI analysis. Moving
  // category/type only (same property) is always safe. Moving to a
  // DIFFERENT property is blocked, with an explanation, whenever the
  // document is linked from any canonical record (a financial
  // transaction, maintenance record, lease, insurance policy, mortgage,
  // or property system) — those records keep their own property_id
  // unchanged, so relocating just the document would leave it filed
  // under a different property than the record it supports. Deliberately
  // NOT a cascading migration (Part 2: "do not build a complicated
  // cascading record migration system") — the smallest safe behavior is
  // block-and-explain, not guess-and-move.
  const DOCUMENT_LINK_CHECKS: { table: string; label: string }[] = [
    { table: 'financial_transactions', label: 'a financial transaction' },
    { table: 'maintenance_records', label: 'a maintenance record' },
    { table: 'leases', label: 'a lease' },
    { table: 'insurance_policies', label: 'an insurance policy' },
    { table: 'mortgages', label: 'a mortgage' },
    { table: 'property_system_documents', label: 'a property system' },
  ]

  async function findDocumentLinks(documentId: string): Promise<string[]> {
    const client = supabase
    if (!client) return []
    const results = await Promise.all(
      DOCUMENT_LINK_CHECKS.map(({ table }) => client.from(table).select('id', { count: 'exact', head: true }).eq('document_id', documentId)),
    )
    return DOCUMENT_LINK_CHECKS.filter((_, i) => (results[i].count || 0) > 0).map((c) => c.label)
  }

  function openMoveDocument(doc: PropertyDocument) {
    setMoveDocId(doc.id)
    setMoveDraft({ propertyId: doc.property_id, category: doc.category, documentType: doc.document_type || '' })
    setMoveError('')
  }

  async function confirmMoveDocument() {
    if (!supabase || !user) return
    const doc = selectedDocs.find((d) => d.id === moveDocId)
    if (!doc) return
    setBusy(true)
    setMoveError('')
    if (moveDraft.propertyId !== doc.property_id) {
      const links = await findDocumentLinks(doc.id)
      if (links.length) {
        setMoveError(`Can't move this document to a different property — it's linked to ${links.join(', ')} on the current property. Unlink it there first, or leave this document filed where it is.`)
        setBusy(false)
        return
      }
    }
    const patch: Record<string, unknown> = { property_id: moveDraft.propertyId, category: moveDraft.category }
    // Same convention DocumentIntelligencePanel's own manual type-change
    // already uses — a user-set classification is never silently
    // overwritten by a later AI analysis (analyze-request.ts checks this
    // same flag).
    if (moveDraft.documentType) { patch.document_type = moveDraft.documentType; patch.classification_source = 'User' }
    const { error: moveDocError } = await supabase.from('property_documents').update(patch).eq('id', doc.id)
    if (moveDocError) {
      setMoveError(moveDocError.message)
      setBusy(false)
      return
    }
    // Keep document_analyses.property_id in sync with its document's own
    // property_id (the same invariant Smart Upload's property-confirmation
    // step maintains — see supabase/milestone-12-smart-upload.sql).
    if (moveDraft.propertyId !== doc.property_id) {
      await supabase.from('document_analyses').update({ property_id: moveDraft.propertyId }).eq('document_id', doc.id)
    }
    setMoveDocId(null)
    await loadPortfolio()
    setBusy(false)
  }

  // Milestone 8: hands extracted values from a document analysis to the
  // existing, already-trusted Add-record forms — pre-filled but never saved
  // automatically. The user still reviews the normal form and clicks Save,
  // so AI extraction never silently modifies a property record.
  function applyExtractedToModule(action: ApplyAction, values: Record<string, string>) {
    setShowDocIntelId(null)
    if (action === 'Insurance') { setInsuranceDraft((d) => ({ ...d, ...values })); setShowModuleForm('Insurance'); setActiveTab('Property'); setPropertySubTab('Insurance') }
    else if (action === 'Mortgage') { setMortgageDraft((d) => ({ ...d, ...values })); setShowModuleForm('Mortgage'); setActiveTab('Property'); setPropertySubTab('Mortgage') }
    else if (action === 'Lease') { setEditingLeaseId(null); setLeaseDraft((d) => ({ ...d, ...values })); setShowModuleForm('Lease'); setActiveTab('Property'); setPropertySubTab('Lease') }
    else if (action === 'Maintenance') { setMaintenanceDraft((d) => ({ ...d, ...values })); setShowModuleForm('Maintenance'); setActiveTab('Property'); setPropertySubTab('Maintenance') }
    else if (action === 'FinancialExpense') { setTransactionDraft((d) => ({ ...d, ...values })); setShowTransaction(true); setActiveTab('Financials') }
    else if (action === 'Contact') { setPropCrewPrefill({ name: values.name || values.businessName || 'New contact', businessName: values.businessName, phone: values.phone, email: values.email, website: values.website }); setActiveTab('People'); setPeopleSubTab('PropCrew') }
    else if (action === 'EstimatedValue' && selected) { openEditProperty(selected); setEditDraft((d) => ({ ...d, value: values.value || d.value })) }
  }

  async function setCover(photo: PropertyPhoto) {
    if (!supabase || !selectedId) return
    setBusy(true)
    await supabase.from('property_photos').update({ is_cover: false }).eq('property_id', selectedId)
    await supabase.from('property_photos').update({ is_cover: true }).eq('id', photo.id)
    await supabase.from('properties').update({ cover_photo_path: photo.storage_path }).eq('id', selectedId)
    await loadPortfolio()
    setBusy(false)
  }

  async function removePhoto(photo: PropertyPhoto) {
    if (!supabase || !selectedId) return
    setBusy(true)
    const wasCover = photo.is_cover
    const { error: storageError } = await supabase.storage.from('property-photos').remove([photo.storage_path])
    if (storageError) setError(storageError.message)
    await supabase.from('property_photos').delete().eq('id', photo.id)
    if (wasCover) {
      const remaining = selectedPhotos.filter((p) => p.id !== photo.id)
      if (remaining[0]) {
        await supabase.from('property_photos').update({ is_cover: true }).eq('id', remaining[0].id)
        await supabase.from('properties').update({ cover_photo_path: remaining[0].storage_path }).eq('id', selectedId)
      } else {
        await supabase.from('properties').update({ cover_photo_path: null }).eq('id', selectedId)
      }
    }
    await loadPortfolio()
    setBusy(false)
  }


  async function addTransaction() {
    if (!supabase || !user || !selectedId || !transactionDraft.description.trim() || Number(transactionDraft.amount) <= 0) return
    setBusy(true)
    setError('')
    const { error: insertError } = await supabase.from('financial_transactions').insert({
      owner_id: user.id,
      property_id: selectedId,
      transaction_date: transactionDraft.date,
      transaction_type: transactionDraft.type,
      category: transactionDraft.category,
      vendor: transactionDraft.vendor.trim() || null,
      description: transactionDraft.description.trim(),
      amount: Number(transactionDraft.amount),
      document_id: transactionDraft.documentId || null,
      is_recurring: transactionDraft.recurring,
    })
    if (insertError) setError(insertError.message)
    else {
      setShowTransaction(false)
      setTransactionDraft({ date: new Date().toISOString().slice(0, 10), type: 'Expense', category: 'Repairs', vendor: '', description: '', amount: '', documentId: '', recurring: false })
      await loadPortfolio()
    }
    setBusy(false)
  }

  function resetLeaseDraft() {
    setLeaseDraft({ tenantName:'', tenantEmail:'', tenantPhone:'', monthlyRent:'', securityDeposit:'', rentDueDay:'', startDate:new Date().toISOString().slice(0,10), endDate:'', renewalStatus:'Active', documentId:'', notes:'' })
    setEditingLeaseId(null); setLeaseFormError('')
  }

  function openLeaseForm(lease?: LeaseRecord) {
    if (lease) {
      setEditingLeaseId(lease.id)
      setLeaseDraft({
        tenantName: lease.tenant_name, tenantEmail: lease.tenant_email || '', tenantPhone: lease.tenant_phone || '',
        monthlyRent: String(lease.monthly_rent ?? ''), securityDeposit: String(lease.security_deposit ?? ''),
        rentDueDay: lease.rent_due_day ? String(lease.rent_due_day) : '',
        startDate: lease.start_date, endDate: lease.end_date, renewalStatus: lease.renewal_status,
        documentId: lease.document_id || '', notes: lease.notes || '',
      })
    } else {
      resetLeaseDraft()
    }
    setLeaseFormError('')
    setShowModuleForm('Lease')
  }

  async function saveLease() {
    if (!supabase || !user || !selectedId || !leaseDraft.tenantName.trim() || !leaseDraft.endDate) return
    const rentDueDay = leaseDraft.rentDueDay.trim() ? Number(leaseDraft.rentDueDay) : null
    if (!isValidRentDueDay(rentDueDay)) { setLeaseFormError('Rent due day must be a whole number from 1 to 31.'); return }
    setBusy(true); setError(''); setLeaseFormError('')
    const payload = {
      owner_id: user.id, property_id: selectedId, tenant_name: leaseDraft.tenantName.trim(),
      tenant_email: leaseDraft.tenantEmail.trim() || null, tenant_phone: leaseDraft.tenantPhone.trim() || null,
      monthly_rent: Number(leaseDraft.monthlyRent || 0), security_deposit: Number(leaseDraft.securityDeposit || 0),
      rent_due_day: rentDueDay, start_date: leaseDraft.startDate, end_date: leaseDraft.endDate,
      renewal_status: leaseDraft.renewalStatus, document_id: leaseDraft.documentId || null, notes: leaseDraft.notes.trim() || null,
    }
    const { error: e } = editingLeaseId
      ? await supabase.from('leases').update(payload).eq('id', editingLeaseId)
      : await supabase.from('leases').insert(payload)
    if (e) setError(e.message); else { setShowModuleForm(null); resetLeaseDraft(); await loadPortfolio() }
    setBusy(false)
  }

  async function saveMortgage() {
    if (!supabase || !user || !selectedId || !mortgageDraft.lender.trim()) return
    setBusy(true); setError('')
    const { error: e } = await supabase.from('mortgages').insert({ owner_id:user.id, property_id:selectedId, lender:mortgageDraft.lender.trim(), loan_number:mortgageDraft.loanNumber.trim()||null, original_balance:Number(mortgageDraft.originalBalance||0), current_balance:Number(mortgageDraft.currentBalance||0), interest_rate:Number(mortgageDraft.interestRate||0), monthly_payment:Number(mortgageDraft.monthlyPayment||0), escrow_amount:Number(mortgageDraft.escrowAmount||0), loan_term_years:Number(mortgageDraft.loanTermYears||0)||null, maturity_date:mortgageDraft.maturityDate||null, document_id:mortgageDraft.documentId||null })
    if (e) setError(e.message); else { await supabase.from('properties').update({ mortgage_balance:Number(mortgageDraft.currentBalance||0) }).eq('id', selectedId); setShowModuleForm(null); setMortgageDraft({ lender:'', loanNumber:'', originalBalance:'', currentBalance:'', interestRate:'', monthlyPayment:'', escrowAmount:'', loanTermYears:'30', maturityDate:'', documentId:'' }); await loadPortfolio() }
    setBusy(false)
  }

  async function saveInsurance() {
    if (!supabase || !user || !selectedId || !insuranceDraft.carrier.trim()) return
    setBusy(true); setError('')
    const { error: e } = await supabase.from('insurance_policies').insert({ owner_id:user.id, property_id:selectedId, carrier:insuranceDraft.carrier.trim(), policy_number:insuranceDraft.policyNumber.trim()||null, annual_premium:Number(insuranceDraft.annualPremium||0), deductible:Number(insuranceDraft.deductible||0), effective_date:insuranceDraft.effectiveDate||null, expiration_date:insuranceDraft.expirationDate||null, document_id:insuranceDraft.documentId||null })
    if (e) setError(e.message); else { setShowModuleForm(null); setInsuranceDraft({ carrier:'', policyNumber:'', annualPremium:'', deductible:'', effectiveDate:'', expirationDate:'', documentId:'' }); await loadPortfolio() }
    setBusy(false)
  }

  async function saveMaintenance() {
    if (!supabase || !user || !selectedId || !maintenanceDraft.description.trim()) return
    setBusy(true); setError('')
    let financialId: string | null = null
    if (maintenanceDraft.addToFinancials && Number(maintenanceDraft.cost) > 0) {
      const { data: tx, error: txError } = await supabase.from('financial_transactions').insert({ owner_id:user.id, property_id:selectedId, transaction_date:maintenanceDraft.serviceDate, transaction_type:'Expense', category:'Maintenance', vendor:maintenanceDraft.vendor.trim()||null, description:maintenanceDraft.description.trim(), amount:Number(maintenanceDraft.cost), document_id:maintenanceDraft.documentId||null, is_recurring:false }).select('id').single()
      if (txError) { setError(txError.message); setBusy(false); return }
      financialId = tx?.id || null
    }
    const { error: e } = await supabase.from('maintenance_records').insert({ owner_id:user.id, property_id:selectedId, service_date:maintenanceDraft.serviceDate, status:maintenanceDraft.status, category:maintenanceDraft.category, vendor:maintenanceDraft.vendor.trim()||null, description:maintenanceDraft.description.trim(), cost:Number(maintenanceDraft.cost||0), document_id:maintenanceDraft.documentId||null, financial_transaction_id:financialId })
    if (e) setError(e.message); else { setShowModuleForm(null); setMaintenanceDraft({ serviceDate:new Date().toISOString().slice(0,10), status:'Completed', category:'Repair', vendor:'', description:'', cost:'', documentId:'', addToFinancials:true }); await loadPortfolio() }
    setBusy(false)
  }

  // Contact/PropCrew add-edit-delete now lives inside PropCrewPanel
  // (components/PropCrewPanel.tsx) — it owns property_contacts writes
  // directly; this component only refreshes ITS OWN copy of `contacts`
  // (used by DocumentIntelligencePanel's vendor check and
  // PropertySystemsPanel's provider dropdown) via onChanged={loadPortfolio}.

  async function saveRequest() {
    if (!supabase || !user || !selectedId || !requestDraft.tenantName.trim() || !requestDraft.title.trim()) return
    setBusy(true); setError('')
    const { error: e } = await supabase.from('maintenance_requests').insert({ owner_id:user.id, property_id:selectedId, tenant_name:requestDraft.tenantName.trim(), tenant_email:requestDraft.tenantEmail.trim()||null, title:requestDraft.title.trim(), description:requestDraft.description.trim(), priority:requestDraft.priority, status:requestDraft.status })
    if (e) setError(e.message); else { setShowRequestForm(false); setRequestDraft({ tenantName:'', tenantEmail:'', title:'', description:'', priority:'Normal', status:'Submitted' }); await loadPortfolio() }
    setBusy(false)
  }

  async function updateRequestStatus(id: string, status: string) {
    if (!supabase) return
    setBusy(true); setError('')
    const { error: e } = await supabase.from('maintenance_requests').update({ status }).eq('id', id)
    if (e) setError(e.message); else await loadPortfolio()
    setBusy(false)
  }

  async function removeRequest(id: string) {
    if (!supabase) return
    setBusy(true); setError('')
    const { error: e } = await supabase.from('maintenance_requests').delete().eq('id', id)
    if (e) setError(e.message); else await loadPortfolio()
    setBusy(false)
  }

  async function removeModuleRecord(table: 'leases'|'mortgages'|'insurance_policies'|'maintenance_records', id: string, financialTransactionId?: string | null) {
    if (!supabase) return
    setBusy(true); setError('')
    const { error: e } = await supabase.from(table).delete().eq('id', id)
    if (e) setError(e.message)
    else { if (financialTransactionId) await supabase.from('financial_transactions').delete().eq('id', financialTransactionId); await loadPortfolio() }
    setBusy(false)
  }

  async function removeTransaction(id: string) {
    if (!supabase) return
    setBusy(true)
    const { error: deleteError } = await supabase.from('financial_transactions').delete().eq('id', id)
    if (deleteError) setError(deleteError.message)
    else await loadPortfolio()
    setBusy(false)
  }

  function exportTransactionsCsv() {
    if (!selected) return
    const esc = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`
    const rows = [['Date','Type','Category','Vendor','Description','Amount','Recurring','Document']]
    selectedYearTransactions.forEach((tx) => {
      const doc = selectedDocs.find((d) => d.id === tx.document_id)
      rows.push([tx.transaction_date, tx.transaction_type, tx.category, tx.vendor || '', tx.description, String(tx.amount), tx.is_recurring ? 'Yes' : 'No', doc?.name || ''])
    })
    const csv = rows.map((row) => row.map(esc).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${safeName(selected.address)}-${financialYear}-financials.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function parseCsvLine(line: string) {
    const values: string[] = []
    let current = ''
    let quoted = false
    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"' && quoted && line[i + 1] === '"') { current += '"'; i++ }
      else if (char === '"') quoted = !quoted
      else if (char === ',' && !quoted) { values.push(current.trim()); current = '' }
      else current += char
    }
    values.push(current.trim())
    return values
  }

  async function importTransactionsCsv(file: File) {
    if (!supabase || !user || !selectedId) return
    setBusy(true)
    setError('')
    try {
      const text = await file.text()
      const lines = text.split(/\r?\n/).filter(Boolean)
      if (lines.length < 2) throw new Error('CSV has no transaction rows.')
      const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase())
      const index = (name: string) => headers.indexOf(name.toLowerCase())
      const payload = lines.slice(1).map((line) => {
        const cols = parseCsvLine(line)
        const typeRaw = cols[index('Type')] || 'Expense'
        const amount = Number((cols[index('Amount')] || '0').replace(/[$,]/g, ''))
        return {
          owner_id: user.id,
          property_id: selectedId,
          transaction_date: cols[index('Date')] || new Date().toISOString().slice(0,10),
          transaction_type: typeRaw.toLowerCase() === 'income' ? 'Income' : 'Expense',
          category: cols[index('Category')] || 'Other',
          vendor: cols[index('Vendor')] || null,
          description: cols[index('Description')] || 'Imported transaction',
          amount,
          document_id: null,
          is_recurring: (cols[index('Recurring')] || '').toLowerCase() === 'yes',
        }
      }).filter((row) => row.amount > 0)
      if (!payload.length) throw new Error('No valid transactions found. Use the exported CSV format for best results.')
      const { error: importError } = await supabase.from('financial_transactions').insert(payload)
      if (importError) throw importError
      await loadPortfolio()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to import CSV.')
    }
    setBusy(false)
  }

  if (!isSupabaseConfigured) {
    return (
      <main className="authShell">
        <section className="authCard setupCard">
          <p className="eyebrow">PROPROSTER</p>
          <h1>Connect Supabase</h1>
          <p>PropRoster is ready for persistent accounts, properties and private uploads. Add your project values to <code>.env.local</code>, then run the included <code>supabase/schema.sql</code> for a fresh project, or the <code>supabase/milestone-5-property-records.sql</code>, <code>supabase/milestone-6-property-network.sql</code>, <code>supabase/milestone-7-investment-tools.sql</code>, <code>supabase/milestone-8-document-intelligence.sql</code>, <code>supabase/milestone-9-subscriptions.sql</code>, <code>supabase/milestone-10-tenant-connect.sql</code> and <code>supabase/milestone-11-property-profile-2.sql</code> upgrade files if you already have an earlier milestone installed. AI document analysis also needs a server-side <code>ANTHROPIC_API_KEY</code> — see <code>.env.example</code>.</p>
          <div className="setupCode">NEXT_PUBLIC_SUPABASE_URL=...<br />NEXT_PUBLIC_SUPABASE_ANON_KEY=...</div>
          <p className="muted">A ready-to-copy <code>.env.example</code> is included in the project.</p>
        </section>
      </main>
    )
  }

  if (!authReady) {
    return <main className="authShell"><div className="loadingState">Loading PropRoster…</div></main>
  }

  if (!user) {
    return <LandingPage />
  }

  if (selected) {
    const monthlyCashFlow = Number(selected.monthly_rent) - Number(selected.monthly_expenses)
    const equity = Number(selected.estimated_value) - Number(selected.mortgage_balance)
    const appreciation = appreciationFor(Number(selected.estimated_value), Number(selected.purchase_price))

    return (
      <main className="shell workspaceShell">
        <AuthHeader onBrandClick={() => setSelectedId(null)} onSmartUploadCompleted={() => void loadPortfolio()} />
        {error && <div className="globalError">{error}<button onClick={() => setError('')}>×</button></div>}

        {/* Contextual, property-scoped controls live here now, not in the
            global header (Authenticated Header Simplification, Part 4:
            "these are contextual property actions, not global
            navigation... do not make users open the hamburger just to
            edit the property they are currently viewing"). */}
        <button className="breadcrumbBack" onClick={() => setSelectedId(null)}>← All Properties</button>

        <section className="propertyHero">
          <div className="heroPhoto">{selected.coverUrl ? <img src={selected.coverUrl} alt={selected.address} /> : <div className="heroPlaceholder"><span>Property photo</span><small>Add photos in the Photos tab</small></div>}</div>
          <div className="heroInfo">
            <div className="heroInfoHead">
              <div><p className="eyebrow">{selected.property_type.toUpperCase()}</p><h1>{selected.address}</h1><p className="heroCity">{selected.city}</p></div>
              <div className="heroInfoActions"><button className="secondary" onClick={() => openEditProperty(selected)}>Edit</button><Link className="secondary" href={`/investment-tools/property-evaluator?propertyId=${selected.id}`}>Investment Analysis</Link></div>
            </div>
            <div className="heroMetrics"><div><span>Value</span><strong>{money(selected.estimated_value)}</strong></div><div><span>Mortgage</span><strong>{money(selected.mortgage_balance)}</strong></div><div><span>Equity</span><strong>{money(equity)}</strong></div><div><span>Rent</span><strong>{money(selected.monthly_rent)}/mo</strong></div></div>
          </div>
        </section>

        <nav className="tabs" aria-label="Property sections">{tabs.map((tab) => <button key={tab} className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)}>{tab}</button>)}</nav>

        {activeTab === 'Overview' && <section className="workspaceContent">
          <div className="sectionHead workspaceHeading"><div><p className="eyebrow">PROPERTY OVERVIEW</p><h2>At a glance</h2></div><button className="secondary" onClick={() => openEditProperty(selected)}>Edit property facts</button></div>
          <div className="overviewGrid">
            <div className="overviewPanel"><h3>Financial snapshot</h3><div className="detailRows">
              <div><span>Purchase price</span><strong>{money(selected.purchase_price)}</strong></div><div><span>Estimated value</span><strong>{money(selected.estimated_value)}</strong></div><div><span>Mortgage balance</span><strong>{money(selected.mortgage_balance)}</strong></div><div><span>Estimated equity</span><strong>{money(equity)}</strong></div>{appreciation && <div className={appreciation.amount >= 0 ? 'metricTone-good' : 'metricTone-bad'}><span>Appreciation</span><strong>{signedMoney(appreciation.amount)} <small>({signedPercent(appreciation.percent)})</small></strong></div>}<div><span>Monthly rent</span><strong>{money(selected.monthly_rent)}</strong></div><div><span>Monthly property expenses</span><strong>{money(selected.monthly_expenses)}</strong></div>{selected.property_tax_annual != null && <div><span>Annual property tax</span><strong>{money(selected.property_tax_annual)}</strong></div>}{selected.hoa_monthly != null && <div><span>HOA / month</span><strong>{money(selected.hoa_monthly)}</strong></div>}<div className="highlightRow"><span>Estimated cash flow</span><strong>{money(monthlyCashFlow)}/mo</strong></div>
            </div></div>
            {/* Core Experience Bundle, item 5 audit: automatic enrichment
                from an existing provider was investigated and intentionally
                NOT implemented here — RentCast's AVM Value endpoint (the
                only property-data integration this app currently calls)
                never returns the SUBJECT property's own facts, only
                comparable (other, nearby) properties' facts; the subject's
                own facts require RentCast's separate Property Records
                endpoint, a new billed request not added without approval
                (see the completion report). Whenever that IS wired in, the
                merge precedence must be: explicit user-confirmed value >
                reliable provider value > blank — never silently overwrite
                a value the user already entered/confirmed below. */}
            <div className="overviewPanel"><h3>Property facts</h3><div className="detailRows">
              {selected.beds != null && <div><span>Beds</span><strong>{selected.beds}</strong></div>}
              {selected.baths != null && <div><span>Baths</span><strong>{selected.baths}</strong></div>}
              {selected.square_feet != null && <div><span>Square feet</span><strong>{selected.square_feet.toLocaleString()}</strong></div>}
              {selected.year_built != null && <div><span>Year built</span><strong>{selected.year_built}</strong></div>}
              {selected.lot_size_sqft != null && <div><span>Lot size</span><strong>{selected.lot_size_sqft.toLocaleString()} sqft</strong></div>}
              {selected.purchase_date && <div><span>Purchase date</span><strong>{new Date(`${selected.purchase_date}T12:00:00`).toLocaleDateString()}</strong></div>}
              {selected.beds == null && selected.baths == null && selected.square_feet == null && selected.year_built == null && selected.lot_size_sqft == null && !selected.purchase_date && <p className="muted">No property facts added yet — add beds, baths, square footage and more from Edit property facts.</p>}
            </div></div>
          </div>

          <PropertyOwnershipPanel propertyId={selected.id} ownerId={user.id} records={selectedOwnership} onRefresh={() => void loadPortfolio()} />

          <div className="overviewGrid">
            <div className="overviewPanel"><h3>Notes</h3><PropertyNotesPanel propertyId={selected.id} ownerId={user.id} notes={selectedNotes} onRefresh={() => void loadPortfolio()} compact /></div>
            <div className="overviewPanel"><h3>Timeline</h3><PropertyTimelinePanel events={selectedTimeline} limit={6} /></div>
          </div>

          <div className="overviewPanel"><h3>Property file</h3><div className="fileSummary"><button onClick={() => { setActiveTab('Documents'); setDocumentsSubTab('Documents') }}><strong>{selectedDocs.length}</strong><span>Documents</span><small>Closing, insurance, taxes and more</small></button><button onClick={() => { setActiveTab('Documents'); setDocumentsSubTab('Photos') }}><strong>{selectedPhotos.length}</strong><span>Photos</span><small>Property gallery and records</small></button><button onClick={() => { setActiveTab('Property'); setPropertySubTab('Maintenance') }}><strong>{selectedMaintenance.length}</strong><span>Maintenance records</span><small>Repairs, vendors and warranties</small></button></div></div>

          <div className="quickActions"><div><p className="eyebrow">QUICK ACTIONS</p><h3>Keep this property prepped.</h3></div><div className="quickActionButtons"><button onClick={() => { setActiveTab('Documents'); setDocumentsSubTab('Documents') }}>Upload document</button><button onClick={() => { setActiveTab('Documents'); setDocumentsSubTab('Photos') }}>Add photos</button><button onClick={() => setActiveTab('Financials')}>Add transaction</button></div></div>
        </section>}

        {activeTab === 'Documents' && <section className="workspaceContent">
          <div className="subTabs" role="tablist" aria-label="Documents sections">{(['Documents', 'Photos'] as DocumentsSubTab[]).map((sub) => <button key={sub} role="tab" aria-selected={documentsSubTab === sub} className={documentsSubTab === sub ? 'active' : ''} onClick={() => setDocumentsSubTab(sub)}>{sub}</button>)}</div>

          {documentsSubTab === 'Documents' && <>
          <div className="sectionHead workspaceHeading"><div><p className="eyebrow">DOCUMENT CENTER</p><h2>Everything important, filed correctly</h2><p>Files are stored in a private Supabase bucket and opened with short-lived signed links.</p></div></div>
          <div className="documentLayout">
            <aside className="categoryPanel"><h3>Categories</h3>{docCategories.map((category) => <button key={category} className={docCategory === category ? 'active' : ''} onClick={() => setDocCategory(category)}><span>{category}</span><small>{category === 'All' ? selectedDocs.length : selectedDocs.filter((d) => d.category === category).length}</small></button>)}</aside>
            <div className="documentMain">
              <div className="uploadControls"><label>File category<select value={uploadCategory} onChange={(e) => setUploadCategory(e.target.value)}>{DOCUMENT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
                <label className={`dropZone ${isDragging ? 'dragging' : ''}`} onDragEnter={(e) => { e.preventDefault(); setIsDragging(true) }} onDragOver={(e) => e.preventDefault()} onDragLeave={() => setIsDragging(false)} onDrop={(e: DragEvent<HTMLLabelElement>) => { e.preventDefault(); setIsDragging(false); void addDocumentFiles(e.dataTransfer.files) }}><span className="uploadIcon">↑</span><strong>{busy ? 'Uploading…' : 'Drop documents here or choose files'}</strong><small>PDF, spreadsheets, receipts, contracts and more · up to 50 MB each</small><input type="file" multiple disabled={busy} onChange={(e) => e.target.files && void addDocumentFiles(e.target.files)} /></label>
              </div>
              <div className="documentHeader"><h3>{docCategory === 'All' ? 'All documents' : docCategory}</h3><span>{filteredDocs.length} file{filteredDocs.length === 1 ? '' : 's'}</span></div>
              <div className="documentList">{filteredDocs.length ? filteredDocs.map((doc) => <div className="documentRow" key={doc.id}><div className="fileIcon">{doc.name.split('.').pop()?.toUpperCase().slice(0, 4) || 'FILE'}</div><div className="fileName"><strong>{doc.name}</strong><span>{doc.category} · {formatSize(doc.size_bytes)} · {new Date(doc.created_at).toLocaleDateString()}{doc.document_type ? ` · ${doc.document_type}` : ''}{doc.analysis_status && doc.analysis_status !== 'Not Analyzed' && <span className={`aiStatusPill ${doc.analysis_status === 'Completed' ? 'pillGood' : doc.analysis_status === 'Failed' ? 'pillBad' : 'pillWarn'}`}>{doc.analysis_status === 'Completed' ? 'AI Analyzed' : doc.analysis_status}</span>}</span></div><div className="rowActions"><button onClick={() => void openDocument(doc)}>Open</button><button className="aiButton" onClick={() => setShowDocIntelId(doc.id)}>{doc.analysis_status === 'Completed' ? 'View AI Analysis' : 'Analyze with PropRoster AI'}</button><button onClick={() => openMoveDocument(doc)}>Move</button><button onClick={() => void removeDocument(doc)}>Remove</button></div></div>) : <div className="emptyState"><strong>No documents here yet</strong><span>Upload a file above and PropRoster will keep it with this property.</span></div>}</div>
            </div>
          </div>
          </>}

          {documentsSubTab === 'Photos' && <>
          <div className="sectionHead workspaceHeading"><div><p className="eyebrow">PROPERTY PHOTOS</p><h2>Visual record</h2><p>Keep listing photos, renovation progress, inspections and property-condition photos together.</p></div></div>
          <label className="photoUploader"><span>+</span><strong>{busy ? 'Uploading…' : 'Add property photos'}</strong><small>Select multiple images at once. The first photo becomes the cover if there is no cover yet.</small><input type="file" accept="image/*" multiple disabled={busy} onChange={(e) => e.target.files && void addPhotoFiles(e.target.files)} /></label>
          <div className="photoGallery">{selectedPhotos.length ? selectedPhotos.map((photo) => <div className={`galleryItem ${photo.is_cover ? 'coverItem' : ''}`} key={photo.id}>{photo.signedUrl ? <img src={photo.signedUrl} alt={photo.name} /> : <div className="heroPlaceholder">Photo unavailable</div>}<div className="galleryMeta"><span>{photo.name}</span><div className="galleryButtons">{!photo.is_cover && <button onClick={() => void setCover(photo)}>Set cover</button>}<button className="removePhoto" onClick={() => void removePhoto(photo)}>×</button></div></div></div>) : <div className="emptyGallery"><strong>No photos uploaded yet</strong><span>Add photos to build this property's visual history.</span></div>}</div>
          </>}
        </section>}

        {activeTab === 'Financials' && (() => {
          const income = selectedYearTransactions.filter((t) => t.transaction_type === 'Income').reduce((sum, t) => sum + Number(t.amount), 0)
          const expenses = selectedYearTransactions.filter((t) => t.transaction_type === 'Expense').reduce((sum, t) => sum + Number(t.amount), 0)
          const noiExpenses = selectedYearTransactions.filter((t) => t.transaction_type === 'Expense' && t.category !== 'Mortgage' && t.category !== 'CapEx').reduce((sum, t) => sum + Number(t.amount), 0)
          const noi = income - noiExpenses
          const cashFlow = income - expenses
          const monthKey = new Date().toISOString().slice(0,7)
          const monthRows = selectedTransactions.filter((t) => t.transaction_date.startsWith(monthKey))
          const monthCashFlow = monthRows.reduce((sum, t) => sum + (t.transaction_type === 'Income' ? Number(t.amount) : -Number(t.amount)), 0)
          const years = Array.from(new Set([String(new Date().getFullYear()), ...selectedTransactions.map((t) => t.transaction_date.slice(0,4))])).sort().reverse()
          // Milestone 18: compact "Rent this month" — Section 10's
          // preferred integration point (a Rent subsection within
          // Financials, not a new major property tab). Reuses the exact
          // same buildRentLedgerRows() the /rent-ledger page and
          // PropWatch both call — one canonical rent-status source.
          const currentRentPeriod = periodFromDate(new Date())
          // Launch Pricing: this card is a live current-month PREVIEW (not
          // stored history) that only makes sense alongside the ability to
          // act on it — hidden entirely for a plan without canUseRentLedger,
          // never shown half-functional. Existing recorded payments remain
          // fully visible on the /rent-ledger page itself regardless of
          // plan (Section: Downgrade Safety — read-only history, never
          // hidden data).
          const rentThisMonth = selected.property_type === 'Rental Property' && entitlements.canUseRentLedger
            ? buildRentLedgerRows([selected], selectedLeases, rentPayments, currentRentPeriod, new Map([[selected.id, selected.address]]))
            : []
          return <section className="workspaceContent financialWorkspace">
            <div className="sectionHead workspaceHeading financialHeading"><div><p className="eyebrow">FINANCIALS</p><h2>Property ledger</h2><p>Track every dollar with receipts and source documents attached to the transaction.</p></div><div className="financialActions"><select aria-label="Financial year" value={financialYear} onChange={(e) => setFinancialYear(e.target.value)}>{years.map((year) => <option key={year}>{year}</option>)}</select><label className="secondary csvButton">Import CSV<input type="file" accept=".csv,text/csv" onChange={(e) => { const file = e.target.files?.[0]; if (file) void importTransactionsCsv(file); e.target.value = '' }} /></label><button className="secondary" onClick={exportTransactionsCsv}>Export CSV</button><button className="primary" onClick={() => setShowTransaction(true)}>+ Add transaction</button></div></div>
            {rentThisMonth.length > 0 && rentThisMonth.map((row) => (
              <div className="rentThisMonthCard" key={row.leaseId}>
                <div className="rentThisMonthHead">
                  <div><p className="eyebrow">RENT — {formatPeriodLabel(currentRentPeriod).toUpperCase()}</p><h3>{row.tenantName}</h3></div>
                  <span className={`statusPill ${rentStatusPillClass(row.status)}`}>{row.status}</span>
                </div>
                <div className="recordMetrics">
                  <div><span>Expected</span><strong>{money(row.expectedAmount)}</strong></div>
                  <div><span>Received</span><strong>{money(row.totalPaid)}</strong></div>
                  {row.remaining > 0 && <div><span>Remaining</span><strong>{money(row.remaining)}</strong></div>}
                </div>
                <div className="rentThisMonthActions">
                  <Link href={`/rent-ledger?lease=${row.leaseId}`} className="primary">+ Record Payment</Link>
                  <Link href="/rent-ledger" className="secondary">View Rent Ledger</Link>
                </div>
              </div>
            ))}
            <div className="financialStats"><div className="financialStat"><span>{financialYear} income</span><strong>{money(income)}</strong></div><div className="financialStat"><span>{financialYear} expenses</span><strong>{money(expenses)}</strong></div><div className="financialStat"><span>NOI</span><strong>{money(noi)}</strong><small>Excludes mortgage & CapEx</small></div><div className="financialStat"><span>Net cash flow</span><strong>{money(cashFlow)}</strong><small>{money(monthCashFlow)} this month</small></div></div>
            <div className="ledgerWrap"><table className="ledger"><thead><tr><th>Date</th><th>Type</th><th>Category</th><th>Vendor</th><th>Description</th><th>Income</th><th>Expense</th><th>Attachment</th><th></th></tr></thead><tbody>{selectedYearTransactions.length ? selectedYearTransactions.map((tx) => { const doc = selectedDocs.find((d) => d.id === tx.document_id); return <tr key={tx.id}><td>{new Date(`${tx.transaction_date}T12:00:00`).toLocaleDateString()}</td><td><span className={`transactionType ${tx.transaction_type.toLowerCase()}`}>{tx.transaction_type}</span>{tx.is_recurring && <small className="recurringLabel">Recurring</small>}</td><td>{tx.category}</td><td>{tx.vendor || '—'}</td><td className="descriptionCell">{tx.description}</td><td className="moneyCell incomeCell">{tx.transaction_type === 'Income' ? money(tx.amount) : '—'}</td><td className="moneyCell">{tx.transaction_type === 'Expense' ? money(tx.amount) : '—'}</td><td>{doc ? <button className="attachmentButton" onClick={() => void openDocument(doc)}>{doc.name}</button> : <span className="muted">—</span>}</td><td><button className="deleteTransaction" aria-label={`Delete ${tx.description}`} onClick={() => void removeTransaction(tx.id)}>×</button></td></tr>}) : <tr><td colSpan={9}><div className="emptyLedger"><strong>No {financialYear} transactions yet</strong><span>Add your first rent payment or expense, or import a CSV.</span><button className="primary" onClick={() => setShowTransaction(true)}>+ Add transaction</button></div></td></tr>}</tbody></table></div>
            <p className="ledgerNote">NOI is shown as income less operating expenses and excludes transactions categorized as Mortgage or CapEx. PropRoster is an organization tool, not tax or accounting advice.</p>
          </section>
        })()}

        {activeTab === 'Property' && <section className="workspaceContent moduleWorkspace">
          <div className="subTabs" role="tablist" aria-label="Property sections">{propertySubTabs.map((sub) => <button key={sub} role="tab" aria-selected={propertySubTab === sub} className={propertySubTab === sub ? 'active' : ''} onClick={() => setPropertySubTab(sub)}>{sub}</button>)}</div>

          {propertySubTab === 'Lease' && (() => {
            const occupancy = deriveOccupancy(selectedLeases)
            const current = selectCurrentLease(selectedLeases)
            const history = sortLeaseHistory(selectedLeases).filter((l) => l.id !== current?.id)
            return <>
              <div className="sectionHead workspaceHeading"><div><p className="eyebrow">TENANTS &amp; LEASE</p><h2>Tenants &amp; lease terms</h2><p>Keep rent, deposits, renewal dates and the signed lease together.</p></div><button className="primary" onClick={() => openLeaseForm()}>+ Add lease</button></div>

              {current ? (
                <LeaseCard
                  lease={current}
                  doc={selectedDocs.find((d) => d.id === current.document_id)}
                  heading={occupancy === 'Upcoming tenancy' ? 'Upcoming tenancy' : 'Current lease'}
                  onEdit={() => openLeaseForm(current)}
                  onDelete={() => void removeModuleRecord('leases', current.id)}
                  onOpenDocument={(doc) => void openDocument(doc)}
                />
              ) : occupancy === 'Occupancy unknown' ? (
                <EmptyModule title="Occupancy unknown" text="This property has lease records whose dates we can't reliably read. Open a lease below to fix its dates." action="Add lease" onClick={() => openLeaseForm()} />
              ) : (
                <EmptyModule title="Currently vacant" text="No active lease on file for this property yet." action="Add lease" onClick={() => openLeaseForm()} />
              )}

              {history.length > 0 && <div className="leaseHistorySection">
                <h3 className="leaseHistoryHeading">Lease history</h3>
                <div className="leaseHistoryList">
                  {history.map((lease) => <LeaseHistoryRow
                    key={lease.id}
                    lease={lease}
                    doc={selectedDocs.find((d) => d.id === lease.document_id)}
                    onEdit={() => openLeaseForm(lease)}
                    onDelete={() => void removeModuleRecord('leases', lease.id)}
                    onOpenDocument={(doc) => void openDocument(doc)}
                  />)}
                </div>
              </div>}
            </>
          })()}

          {propertySubTab === 'Mortgage' && <><div className="sectionHead workspaceHeading"><div><p className="eyebrow">MORTGAGE</p><h2>Loan details</h2><p>Track your lender, balance, rate, payment and loan documents.</p></div><button className="primary" onClick={() => setShowModuleForm('Mortgage')}>+ Add mortgage</button></div>{selectedMortgages.length ? <div className="moduleGrid">{selectedMortgages.map((loan) => { const doc=selectedDocs.find(d=>d.id===loan.document_id); return <article className="recordCard" key={loan.id}><div className="recordTop"><div><span className="statusPill">Mortgage</span><h3>{loan.lender}</h3><p>{loan.loan_number ? `Loan ••••${loan.loan_number.slice(-4)}` : 'Loan number not added'}</p></div><button className="recordDelete" onClick={() => void removeModuleRecord('mortgages', loan.id)}>×</button></div><div className="recordMetrics"><div><span>Current balance</span><strong>{money(loan.current_balance)}</strong></div><div><span>Monthly payment</span><strong>{money(loan.monthly_payment)}</strong></div><div><span>Rate</span><strong>{Number(loan.interest_rate).toFixed(3)}%</strong></div></div><div className="recordRows"><div><span>Original balance</span><strong>{money(loan.original_balance)}</strong></div><div><span>Escrow / month</span><strong>{money(loan.escrow_amount)}</strong></div>{loan.maturity_date && <div><span>Maturity</span><strong>{new Date(`${loan.maturity_date}T12:00:00`).toLocaleDateString()}</strong></div>}{doc && <div><span>Loan document</span><button onClick={() => void openDocument(doc)}>{doc.name}</button></div>}</div></article>})}</div> : <EmptyModule title="No mortgage details yet" text="Add the lender, balance, rate, monthly payment and loan document." action="Add mortgage" onClick={() => setShowModuleForm('Mortgage')} />}</>}

          {propertySubTab === 'Insurance' && <><div className="sectionHead workspaceHeading"><div><p className="eyebrow">INSURANCE</p><h2>Coverage records</h2><p>Keep policy details, premiums, deductibles and expiration dates visible.</p></div><button className="primary" onClick={() => setShowModuleForm('Insurance')}>+ Add policy</button></div>{selectedInsurance.length ? <div className="moduleGrid">{selectedInsurance.map((policy) => { const doc=selectedDocs.find(d=>d.id===policy.document_id); const days=policy.expiration_date ? Math.ceil((new Date(`${policy.expiration_date}T12:00:00`).getTime()-Date.now())/86400000) : null; return <article className="recordCard" key={policy.id}><div className="recordTop"><div><span className={`statusPill ${days !== null && days < 45 ? 'warning' : ''}`}>{days !== null && days < 0 ? 'Expired' : days !== null && days < 45 ? 'Renew soon' : 'Active'}</span><h3>{policy.carrier}</h3><p>{policy.policy_number || 'Policy number not added'}</p></div><button className="recordDelete" onClick={() => void removeModuleRecord('insurance_policies', policy.id)}>×</button></div><div className="recordMetrics"><div><span>Annual premium</span><strong>{money(policy.annual_premium)}</strong></div><div><span>Deductible</span><strong>{money(policy.deductible)}</strong></div></div><div className="recordRows">{policy.effective_date && <div><span>Effective</span><strong>{new Date(`${policy.effective_date}T12:00:00`).toLocaleDateString()}</strong></div>}{policy.expiration_date && <div><span>Expires</span><strong>{new Date(`${policy.expiration_date}T12:00:00`).toLocaleDateString()}</strong></div>}{doc && <div><span>Policy document</span><button onClick={() => void openDocument(doc)}>{doc.name}</button></div>}</div></article>})}</div> : <EmptyModule title="No insurance policies yet" text="Add your carrier, policy, premium, deductible and declaration page." action="Add policy" onClick={() => setShowModuleForm('Insurance')} />}</>}

          {propertySubTab === 'Maintenance' && <><div className="sectionHead workspaceHeading"><div><p className="eyebrow">MAINTENANCE</p><h2>Property service history</h2><p>Repairs, preventative work, vendors, costs and receipts in one timeline.</p></div><button className="primary" onClick={() => setShowModuleForm('Maintenance')}>+ Add maintenance</button></div>{selectedMaintenance.length ? <div className="maintenanceList">{selectedMaintenance.map((item) => { const doc=selectedDocs.find(d=>d.id===item.document_id); return <article className="maintenanceRow" key={item.id}><div className="maintenanceDate"><strong>{new Date(`${item.service_date}T12:00:00`).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</strong><span>{new Date(`${item.service_date}T12:00:00`).getFullYear()}</span></div><div className="maintenanceBody"><div className="maintenanceTitle"><div><span className="statusPill">{item.status}</span><h3>{item.description}</h3><p>{item.category}{item.vendor ? ` · ${item.vendor}` : ''}</p></div><strong>{money(item.cost)}</strong></div><div className="maintenanceActions">{doc && <button onClick={() => void openDocument(doc)}>Open {doc.name}</button>}{item.financial_transaction_id && <span>Linked to Financials</span>}<button className="dangerLink" onClick={() => void removeModuleRecord('maintenance_records', item.id, item.financial_transaction_id)}>Remove</button></div></div></article>})}</div> : <EmptyModule title="No maintenance records yet" text="Add repairs, service calls, vendors, costs and receipts as they happen." action="Add maintenance" onClick={() => setShowModuleForm('Maintenance')} />}</>}

          {propertySubTab === 'Systems' && <PropertySystemsPanel propertyId={selected.id} ownerId={user.id} systems={selectedSystems} contacts={selectedContacts} documents={selectedDocs} onRefresh={() => void loadPortfolio()} />}
        </section>}

        {activeTab === 'People' && <section className="workspaceContent moduleWorkspace">
          <div className="subTabs" role="tablist" aria-label="People sections">
            <button role="tab" aria-selected={peopleSubTab === 'PropCrew'} className={peopleSubTab === 'PropCrew' ? 'active' : ''} onClick={() => setPeopleSubTab('PropCrew')}>PropCrew</button>
            {selected.property_type === 'Rental Property' && <button role="tab" aria-selected={peopleSubTab === 'Landlord'} className={peopleSubTab === 'Landlord' ? 'active' : ''} onClick={() => setPeopleSubTab('Landlord')}>Landlord</button>}
          </div>

          {peopleSubTab === 'PropCrew' && (
            <PropCrewPanel
              ownerId={user.id}
              properties={properties.map((p) => ({ id: p.id, address: p.address, city: p.city }))}
              scopePropertyId={selected.id}
              onChanged={() => void loadPortfolio()}
              prefill={propCrewPrefill}
              onPrefillConsumed={() => setPropCrewPrefill(null)}
            />
          )}

          {peopleSubTab === 'Landlord' && selected.property_type === 'Rental Property' && <>
            <div className="sectionHead workspaceHeading"><div><p className="eyebrow">LANDLORD CENTER</p><h2>Maintenance requests</h2><p>Owner-side tracking for tenant maintenance requests.</p></div><button className="primary" onClick={() => setShowRequestForm(true)}>+ Log request</button></div><div className="financialStats landlordStats"><div className="financialStat"><span>Open requests</span><strong>{openRequests.length}</strong></div><div className="financialStat"><span>Completed requests</span><strong>{completedRequests.length}</strong></div></div>{selectedRequests.length ? <div className="maintenanceList">{selectedRequests.map((req) => <article className="maintenanceRow requestRow" key={req.id}><div className="maintenanceDate"><strong>{new Date(req.created_at).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</strong><span>{new Date(req.created_at).getFullYear()}</span></div><div className="maintenanceBody"><div className="maintenanceTitle"><div><span className={`statusPill priority${req.priority}`}>{req.priority}</span><h3>{req.title}</h3><p>{req.tenant_name}{req.tenant_email ? ` · ${req.tenant_email}` : ''}</p></div></div>{req.description && <p className="requestDescription">{req.description}</p>}<div className="maintenanceActions"><select aria-label={`Status for ${req.title}`} value={req.status} onChange={(e) => void updateRequestStatus(req.id, e.target.value)}>{requestStatuses.map((s) => <option key={s}>{s}</option>)}</select><button className="dangerLink" onClick={() => void removeRequest(req.id)}>Remove</button></div></div></article>)}</div> : <EmptyModule title="No maintenance requests yet" text="Log tenant requests as they come in by phone, email or in person." action="Log request" onClick={() => setShowRequestForm(true)} />}
            <TenantConnectPanel propertyId={selected.id} ownerId={user.id} tenantConnectEnabled={entitlementsFor(plan).tenantConnect} />
          </>}
        </section>}

        {showModuleForm && <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setShowModuleForm(null)}><div className="modal moduleModal"><div className="modalTop"><div><p className="eyebrow">{showModuleForm.toUpperCase()}</p><h2>{showModuleForm === 'Lease' ? (editingLeaseId ? 'Edit lease' : 'Add lease') : `Add ${showModuleForm.toLowerCase()}`}</h2></div><button className="iconButton" onClick={() => setShowModuleForm(null)}>×</button></div>
          {showModuleForm === 'Lease' && <div className="leaseFormGroups">
            <fieldset className="formFieldset"><legend>Tenant information</legend><div className="formGrid">
              <label>Tenant name<input value={leaseDraft.tenantName} onChange={e=>setLeaseDraft({...leaseDraft,tenantName:e.target.value})} placeholder="Taylor Morgan" /></label>
              <label>Tenant email<input type="email" value={leaseDraft.tenantEmail} onChange={e=>setLeaseDraft({...leaseDraft,tenantEmail:e.target.value})} placeholder="tenant@example.com" /></label>
              <label>Tenant phone<input type="tel" value={leaseDraft.tenantPhone} onChange={e=>setLeaseDraft({...leaseDraft,tenantPhone:e.target.value})} placeholder="(555) 555-0100" /></label>
            </div></fieldset>
            <fieldset className="formFieldset"><legend>Lease dates</legend><div className="formGrid">
              <label>Start date<input type="date" value={leaseDraft.startDate} onChange={e=>setLeaseDraft({...leaseDraft,startDate:e.target.value})} /></label>
              <label>End date<input type="date" value={leaseDraft.endDate} onChange={e=>setLeaseDraft({...leaseDraft,endDate:e.target.value})} /></label>
              <label>Lease status<select value={leaseDraft.renewalStatus} onChange={e=>setLeaseDraft({...leaseDraft,renewalStatus:e.target.value})}><option>Active</option><option>Renewal pending</option><option>Month-to-month</option><option>Ended</option></select></label>
            </div></fieldset>
            <fieldset className="formFieldset"><legend>Rent &amp; deposit</legend><div className="formGrid">
              <label>Monthly rent<input inputMode="decimal" value={leaseDraft.monthlyRent} onChange={e=>setLeaseDraft({...leaseDraft,monthlyRent:e.target.value})} placeholder="2950" /></label>
              <label>Security deposit<input inputMode="decimal" value={leaseDraft.securityDeposit} onChange={e=>setLeaseDraft({...leaseDraft,securityDeposit:e.target.value})} placeholder="0" /></label>
              <label>Rent due day<input inputMode="numeric" value={leaseDraft.rentDueDay} onChange={e=>setLeaseDraft({...leaseDraft,rentDueDay:e.target.value})} placeholder="1" /><small>Day of the month, 1–31. Optional.</small></label>
            </div></fieldset>
            <fieldset className="formFieldset"><legend>Lease document</legend><div className="formGrid">
              <label className="fullField">Signed lease<select value={leaseDraft.documentId} onChange={e=>setLeaseDraft({...leaseDraft,documentId:e.target.value})}><option value="">No attachment</option>{selectedDocs.filter(d=>d.category==='Lease'||d.category==='Other').map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
              <label className="fullField">Notes<input value={leaseDraft.notes} onChange={e=>setLeaseDraft({...leaseDraft,notes:e.target.value})} /></label>
            </div></fieldset>
            {leaseFormError && <p className="errorMessage">{leaseFormError}</p>}
          </div>}
          {showModuleForm === 'Mortgage' && <div className="formGrid"><label>Lender<input value={mortgageDraft.lender} onChange={e=>setMortgageDraft({...mortgageDraft,lender:e.target.value})} /></label><label>Loan number<input value={mortgageDraft.loanNumber} onChange={e=>setMortgageDraft({...mortgageDraft,loanNumber:e.target.value})} /></label><label>Original balance<input inputMode="decimal" value={mortgageDraft.originalBalance} onChange={e=>setMortgageDraft({...mortgageDraft,originalBalance:e.target.value})} /></label><label>Current balance<input inputMode="decimal" value={mortgageDraft.currentBalance} onChange={e=>setMortgageDraft({...mortgageDraft,currentBalance:e.target.value})} /></label><label>Interest rate %<input inputMode="decimal" value={mortgageDraft.interestRate} onChange={e=>setMortgageDraft({...mortgageDraft,interestRate:e.target.value})} /></label><label>Monthly payment<input inputMode="decimal" value={mortgageDraft.monthlyPayment} onChange={e=>setMortgageDraft({...mortgageDraft,monthlyPayment:e.target.value})} /></label><label>Escrow / month<input inputMode="decimal" value={mortgageDraft.escrowAmount} onChange={e=>setMortgageDraft({...mortgageDraft,escrowAmount:e.target.value})} /></label><label>Loan term (years)<input inputMode="numeric" value={mortgageDraft.loanTermYears} onChange={e=>setMortgageDraft({...mortgageDraft,loanTermYears:e.target.value})} /></label><label>Maturity date<input type="date" value={mortgageDraft.maturityDate} onChange={e=>setMortgageDraft({...mortgageDraft,maturityDate:e.target.value})} /></label><label>Loan document<select value={mortgageDraft.documentId} onChange={e=>setMortgageDraft({...mortgageDraft,documentId:e.target.value})}><option value="">No attachment</option>{selectedDocs.filter(d=>d.category==='Mortgage'||d.category==='Closing'||d.category==='Other').map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label></div>}
          {showModuleForm === 'Insurance' && <div className="formGrid"><label>Carrier<input value={insuranceDraft.carrier} onChange={e=>setInsuranceDraft({...insuranceDraft,carrier:e.target.value})} /></label><label>Policy number<input value={insuranceDraft.policyNumber} onChange={e=>setInsuranceDraft({...insuranceDraft,policyNumber:e.target.value})} /></label><label>Annual premium<input inputMode="decimal" value={insuranceDraft.annualPremium} onChange={e=>setInsuranceDraft({...insuranceDraft,annualPremium:e.target.value})} /></label><label>Deductible<input inputMode="decimal" value={insuranceDraft.deductible} onChange={e=>setInsuranceDraft({...insuranceDraft,deductible:e.target.value})} /></label><label>Effective date<input type="date" value={insuranceDraft.effectiveDate} onChange={e=>setInsuranceDraft({...insuranceDraft,effectiveDate:e.target.value})} /></label><label>Expiration date<input type="date" value={insuranceDraft.expirationDate} onChange={e=>setInsuranceDraft({...insuranceDraft,expirationDate:e.target.value})} /></label><label className="fullField">Policy document<select value={insuranceDraft.documentId} onChange={e=>setInsuranceDraft({...insuranceDraft,documentId:e.target.value})}><option value="">No attachment</option>{selectedDocs.filter(d=>d.category==='Insurance'||d.category==='Other').map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label></div>}
          {showModuleForm === 'Maintenance' && <div className="formGrid"><label>Service date<input type="date" value={maintenanceDraft.serviceDate} onChange={e=>setMaintenanceDraft({...maintenanceDraft,serviceDate:e.target.value})} /></label><label>Status<select value={maintenanceDraft.status} onChange={e=>setMaintenanceDraft({...maintenanceDraft,status:e.target.value})}><option>Completed</option><option>Scheduled</option><option>In progress</option><option>Needs follow-up</option></select></label><label>Category<select value={maintenanceDraft.category} onChange={e=>setMaintenanceDraft({...maintenanceDraft,category:e.target.value})}>{MAINTENANCE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label><label>Vendor<input value={maintenanceDraft.vendor} onChange={e=>setMaintenanceDraft({...maintenanceDraft,vendor:e.target.value})} /></label><label>Cost<input inputMode="decimal" value={maintenanceDraft.cost} onChange={e=>setMaintenanceDraft({...maintenanceDraft,cost:e.target.value})} /></label><label>Receipt / invoice<select value={maintenanceDraft.documentId} onChange={e=>setMaintenanceDraft({...maintenanceDraft,documentId:e.target.value})}><option value="">No attachment</option>{selectedDocs.filter(d=>['Receipts','Warranties','Other'].includes(d.category)).map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label><label className="fullField">Description<input value={maintenanceDraft.description} onChange={e=>setMaintenanceDraft({...maintenanceDraft,description:e.target.value})} placeholder="HVAC repair, annual service, roof inspection…" /></label><label className="recurringCheck fullField"><input type="checkbox" checked={maintenanceDraft.addToFinancials} onChange={e=>setMaintenanceDraft({...maintenanceDraft,addToFinancials:e.target.checked})} /><span>Add this cost to Financials</span><small>PropRoster creates a linked Maintenance expense so you only enter the cost once.</small></label></div>}
          <div className="modalActions"><button className="secondary" onClick={() => setShowModuleForm(null)}>Cancel</button><button className="primary" disabled={busy} onClick={() => void (showModuleForm==='Lease'?saveLease():showModuleForm==='Mortgage'?saveMortgage():showModuleForm==='Insurance'?saveInsurance():saveMaintenance())}>{busy?'Saving…':'Save'}</button></div></div></div>}

        {showRequestForm && <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setShowRequestForm(false)}><div className="modal moduleModal"><div className="modalTop"><div><p className="eyebrow">LANDLORD CENTER</p><h2>Log maintenance request</h2></div><button className="iconButton" onClick={() => setShowRequestForm(false)}>×</button></div><div className="formGrid"><label>Tenant name<input value={requestDraft.tenantName} onChange={e=>setRequestDraft({...requestDraft,tenantName:e.target.value})} placeholder="Taylor Morgan" /></label><label>Tenant email<input type="email" value={requestDraft.tenantEmail} onChange={e=>setRequestDraft({...requestDraft,tenantEmail:e.target.value})} placeholder="tenant@example.com" /></label><label>Priority<select value={requestDraft.priority} onChange={e=>setRequestDraft({...requestDraft,priority:e.target.value})}>{requestPriorities.map(p=><option key={p}>{p}</option>)}</select></label><label>Status<select value={requestDraft.status} onChange={e=>setRequestDraft({...requestDraft,status:e.target.value})}>{requestStatuses.map(s=><option key={s}>{s}</option>)}</select></label><label className="fullField">Issue / title<input value={requestDraft.title} onChange={e=>setRequestDraft({...requestDraft,title:e.target.value})} placeholder="Leaking kitchen faucet" /></label><label className="fullField">Description<input value={requestDraft.description} onChange={e=>setRequestDraft({...requestDraft,description:e.target.value})} placeholder="Details the tenant shared…" /></label></div><div className="modalActions"><button className="secondary" onClick={() => setShowRequestForm(false)}>Cancel</button><button className="primary" disabled={busy || !requestDraft.tenantName.trim() || !requestDraft.title.trim()} onClick={() => void saveRequest()}>{busy?'Saving…':'Save request'}</button></div></div></div>}

        {showEdit && <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setShowEdit(false)}><div className="modal"><div className="modalTop"><div><p className="eyebrow">PROPERTY SETTINGS</p><h2>Edit property</h2></div><button className="iconButton" onClick={() => setShowEdit(false)}>×</button></div><div className="formGrid"><label>Street address<AddressAutocomplete value={editDraft.address} onTextChange={(v) => setEditDraft({ ...editDraft, address: v })} onSelect={(addr) => setEditDraft((d) => ({ ...d, ...applyNormalizedAddress(addr, d.address) }))} placeholder="123 Example Street" /></label><label>City, state & ZIP<input value={editDraft.city} onChange={(e) => setEditDraft({ ...editDraft, city: e.target.value })} placeholder="Example City, FL 12345" /></label><label>Property type<select value={editDraft.type} onChange={(e) => setEditDraft({ ...editDraft, type: e.target.value })}><option>Rental Property</option><option>Primary Residence</option><option>Vacation Home</option><option>Commercial</option><option>Land</option><option>Other</option></select></label><label>Purchase price<input inputMode="decimal" value={editDraft.purchasePrice} onChange={(e) => setEditDraft({ ...editDraft, purchasePrice: e.target.value })} placeholder="390000" /></label><label>Estimated value<input inputMode="decimal" value={editDraft.value} onChange={(e) => setEditDraft({ ...editDraft, value: e.target.value })} placeholder="520000" /></label><label>Mortgage balance<input inputMode="decimal" value={editDraft.mortgage} onChange={(e) => setEditDraft({ ...editDraft, mortgage: e.target.value })} placeholder="310000" /></label><label>Financing status<select value={editDraft.financingStatus} onChange={(e) => setEditDraft({ ...editDraft, financingStatus: e.target.value })}>{FINANCING_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label><label>Monthly rent<input inputMode="decimal" value={editDraft.rent} onChange={(e) => setEditDraft({ ...editDraft, rent: e.target.value })} placeholder="2950" /></label><label>Monthly property expenses<input inputMode="decimal" value={editDraft.monthlyExpenses} onChange={(e) => setEditDraft({ ...editDraft, monthlyExpenses: e.target.value })} placeholder="1925" /></label><label>Purchase date<input type="date" value={editDraft.purchaseDate} onChange={(e) => setEditDraft({ ...editDraft, purchaseDate: e.target.value })} /></label><label>Beds<input inputMode="numeric" value={editDraft.beds} onChange={(e) => setEditDraft({ ...editDraft, beds: e.target.value })} placeholder="3" /></label><label>Baths<input inputMode="decimal" value={editDraft.baths} onChange={(e) => setEditDraft({ ...editDraft, baths: e.target.value })} placeholder="2.5" /></label><label>Square feet<input inputMode="numeric" value={editDraft.squareFeet} onChange={(e) => setEditDraft({ ...editDraft, squareFeet: e.target.value })} placeholder="1850" /></label><label>Year built<input inputMode="numeric" value={editDraft.yearBuilt} onChange={(e) => setEditDraft({ ...editDraft, yearBuilt: e.target.value })} placeholder="1998" /></label><label>Lot size (sqft)<input inputMode="numeric" value={editDraft.lotSizeSqft} onChange={(e) => setEditDraft({ ...editDraft, lotSizeSqft: e.target.value })} placeholder="6500" /></label><label>Annual property tax<input inputMode="decimal" value={editDraft.propertyTaxAnnual} onChange={(e) => setEditDraft({ ...editDraft, propertyTaxAnnual: e.target.value })} placeholder="4200" /></label><label>HOA / month<input inputMode="decimal" value={editDraft.hoaMonthly} onChange={(e) => setEditDraft({ ...editDraft, hoaMonthly: e.target.value })} placeholder="0" /></label></div><div className="editPropertyFooter"><button className="dangerButton" onClick={() => setShowDeleteConfirm(true)}>Delete Property</button><div className="modalActions compactActions"><button className="secondary" onClick={() => setShowEdit(false)}>Cancel</button><button className="primary" disabled={busy || !editDraft.address.trim() || !editDraft.city.trim()} onClick={() => void updateProperty()}>{busy ? 'Saving…' : 'Save Changes'}</button></div></div></div></div>}

        {showDeleteConfirm && <div className="overlay deleteOverlay" onMouseDown={(e) => e.target === e.currentTarget && setShowDeleteConfirm(false)}><div className="modal deleteModal"><div className="modalTop"><div><p className="eyebrow dangerEyebrow">PERMANENT ACTION</p><h2>Delete this property?</h2></div><button className="iconButton" onClick={() => setShowDeleteConfirm(false)}>×</button></div><p className="deleteWarning">This permanently removes <strong>{selected.address}</strong> and its associated documents, photos, financial transactions, lease, mortgage, insurance, maintenance records, contacts, and maintenance requests. This cannot be undone.</p><div className="modalActions"><button className="secondary" onClick={() => setShowDeleteConfirm(false)}>Keep Property</button><button className="dangerButton solidDanger" disabled={busy} onClick={() => void deleteProperty()}>{busy ? 'Deleting…' : 'Delete Permanently'}</button></div></div></div>}

        {showTransaction && <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setShowTransaction(false)}><div className="modal transactionModal"><div className="modalTop"><div><p className="eyebrow">FINANCIALS</p><h2>Add transaction</h2></div><button className="iconButton" onClick={() => setShowTransaction(false)}>×</button></div><div className="formGrid transactionGrid"><label>Date<input type="date" value={transactionDraft.date} onChange={(e) => setTransactionDraft({ ...transactionDraft, date: e.target.value })} /></label><label>Type<select value={transactionDraft.type} onChange={(e) => setTransactionDraft({ ...transactionDraft, type: e.target.value as 'Income' | 'Expense', category: e.target.value === 'Income' ? 'Rent' : 'Repairs' })}><option>Income</option><option>Expense</option></select></label><label>Category<select value={transactionDraft.category} onChange={(e) => setTransactionDraft({ ...transactionDraft, category: e.target.value })}>{FINANCIAL_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label><label>Amount<input inputMode="decimal" value={transactionDraft.amount} onChange={(e) => setTransactionDraft({ ...transactionDraft, amount: e.target.value })} placeholder="1250.00" /></label><label>Vendor / payer<input value={transactionDraft.vendor} onChange={(e) => setTransactionDraft({ ...transactionDraft, vendor: e.target.value })} placeholder={transactionDraft.type === 'Income' ? 'Tenant name' : 'Vendor or company'} /></label><label>Attach document<select value={transactionDraft.documentId} onChange={(e) => setTransactionDraft({ ...transactionDraft, documentId: e.target.value })}><option value="">No attachment</option>{selectedDocs.map((doc) => <option value={doc.id} key={doc.id}>{doc.name}</option>)}</select></label><label className="fullField">Description<input value={transactionDraft.description} onChange={(e) => setTransactionDraft({ ...transactionDraft, description: e.target.value })} placeholder="August rent, HVAC repair, property tax…" /></label><label className="recurringCheck fullField"><input type="checkbox" checked={transactionDraft.recurring} onChange={(e) => setTransactionDraft({ ...transactionDraft, recurring: e.target.checked })} /><span>Mark as recurring monthly</span><small>This labels the transaction as recurring; automatic future posting can be enabled in a later milestone.</small></label></div><div className="modalActions"><button className="secondary" onClick={() => setShowTransaction(false)}>Cancel</button><button className="primary" disabled={busy || !transactionDraft.description.trim() || Number(transactionDraft.amount) <= 0} onClick={() => void addTransaction()}>{busy ? 'Saving…' : 'Save transaction'}</button></div></div></div>}

        {showDocIntelId && (() => {
          const activeDoc = selectedDocs.find((d) => d.id === showDocIntelId)
          if (!activeDoc) return null
          const latestInsurance = selectedInsurance[0]
          const latestMortgage = selectedMortgages[0]
          const latestLease = selectCurrentLease(selectedLeases) || selectedLeases[0]
          return (
            <DocumentIntelligencePanel
              document={activeDoc}
              contacts={selectedContacts}
              currentInsurancePremium={latestInsurance ? Number(latestInsurance.annual_premium) : null}
              currentMortgageBalance={latestMortgage ? Number(latestMortgage.current_balance) : null}
              currentMonthlyRent={latestLease ? Number(latestLease.monthly_rent) : Number(selected.monthly_rent)}
              currentEstimatedValue={Number(selected.estimated_value)}
              canUseDocumentIntelligence={entitlements.canUseDocumentIntelligence}
              onUpgradeClick={() => setShowUpgrade('documentIntelligence')}
              onClose={() => setShowDocIntelId(null)}
              onOpenDocument={() => void openDocument(activeDoc)}
              onRefresh={() => void loadPortfolio()}
              onApply={applyExtractedToModule}
            />
          )
        })()}

        {moveDocId && (() => {
          const moveDoc = selectedDocs.find((d) => d.id === moveDocId)
          if (!moveDoc) return null
          const currentProperty = properties.find((p) => p.id === moveDoc.property_id)
          return (
            <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setMoveDocId(null)}>
              <div className="modal">
                <div className="modalTop"><div><p className="eyebrow">DOCUMENT CENTER</p><h2>Move / refile document</h2></div><button className="iconButton" onClick={() => setMoveDocId(null)}>×</button></div>
                <p className="deleteWarning">Moving <strong>{moveDoc.name}</strong>. Currently filed under {currentProperty ? `${currentProperty.address}${currentProperty.city ? `, ${currentProperty.city}` : ''}` : 'this property'} · {moveDoc.category}{moveDoc.document_type ? ` · ${moveDoc.document_type}` : ''}.</p>
                <div className="formGrid">
                  <label>Property<select value={moveDraft.propertyId} onChange={(e) => setMoveDraft({ ...moveDraft, propertyId: e.target.value })}>{properties.map((p) => <option key={p.id} value={p.id}>{p.address}{p.city ? `, ${p.city}` : ''}</option>)}</select></label>
                  <label>Category<select value={moveDraft.category} onChange={(e) => setMoveDraft({ ...moveDraft, category: e.target.value })}>{DOCUMENT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></label>
                  <label className="fullField">Document type<select value={moveDraft.documentType} onChange={(e) => setMoveDraft({ ...moveDraft, documentType: e.target.value })}><option value="">Not classified</option>{DOCUMENT_TYPES.map((t) => <option key={t}>{t}</option>)}</select></label>
                </div>
                {moveError && <p className="errorMessage">{moveError}</p>}
                <div className="modalActions"><button className="secondary" onClick={() => setMoveDocId(null)}>Cancel</button><button className="primary" disabled={busy || !moveDraft.propertyId} onClick={() => void confirmMoveDocument()}>{busy ? 'Moving…' : 'Move'}</button></div>
              </div>
            </div>
          )
        })()}
      </main>
    )
  }

  return (
    <main className="shell">
      <AuthHeader onSmartUploadCompleted={() => void loadPortfolio()} />
      {error && <div className="globalError">{error}<button onClick={() => setError('')}>×</button></div>}
      <section className="intro welcomeIntro"><h1>Good {greetingTimeOfDay()}{profileReady ? `, ${resolveGreetingName(userProfile, user.email)}` : ''}.</h1><p>Here&apos;s your portfolio at a glance.</p></section>

      <section className="portfolioSnapshot">
        <div className="portfolioSnapshotHead">
          <h2>Portfolio Snapshot</h2>
          <button className="snapshotToggle" onClick={toggleSnapshotExpanded} aria-expanded={snapshotExpanded}>{snapshotExpanded ? 'Hide' : 'Show'}</button>
        </div>
        {snapshotExpanded ? (
          <div className="snapshotMetrics">
            <div className="snapshotMetric"><strong>{properties.length}</strong><span>{properties.length === 1 ? 'Property' : 'Properties'}</span></div>
            <div className="snapshotMetric"><strong>{compactMoney(totals.value)}</strong><span>Est. Value</span></div>
            <div className="snapshotMetric"><strong>{compactMoney(totals.rent)}</strong><span>Monthly Income</span></div>
            <div className="snapshotMetric"><strong>{compactMoney(totals.monthlyExpenses)}</strong><span>Monthly Expenses</span></div>
          </div>
        ) : (
          <p className="snapshotCollapsedSummary">{properties.length} propert{properties.length === 1 ? 'y' : 'ies'}</p>
        )}
      </section>

      {/* Milestone 16: Landlord Command Center — occupies the space
          reserved above ("future compact 'Needs Your Attention' section"),
          between the snapshot and My Properties, using the same
          .intro/.portfolioSnapshot/.sectionHead spacing already
          established. Every item's onClick reuses openProperty() (via
          goToNav()) directly — no second navigation system, no URL
          round-trip needed for a same-page dashboard.

          Milestone 18: PropWatch is this SAME section, not a second
          dashboard — rent (Overdue/Due/Partial) and system-warranty
          signals were folded into attentionItems/dateItems above,
          alongside the lease/insurance/mortgage/maintenance items
          Milestone 16 already built. Only the heading changed. */}

      <section className="commandCenterSection needsAttentionSection">
        {/* Launch Polish: PropWatch keeps its approved mixed-case brand
            casing here even though every other eyebrow on this page is
            plain uppercase — an explicit, deliberate exception for this
            one branded product name, not a change to the eyebrow style
            itself. */}
        <div className="sectionHead"><div><p className="eyebrow">PropWatch</p><h2>Needs your attention</h2><p>{attentionItems.length ? `${attentionItems.length} item${attentionItems.length === 1 ? '' : 's'} need a look` : 'Rent, leases, insurance, mortgages and scheduled maintenance across your portfolio.'}</p></div></div>
        {attentionItems.length === 0 ? (
          <div className="emptyState"><strong>You&apos;re all caught up.</strong></div>
        ) : (
          <div className="dashboardItemList">
            {attentionItems.map((item) => (
              <button key={`${item.type}-${item.id}`} className="dashboardItemRow" onClick={() => goToNav(item.propertyId, item.nav)}>
                <span className={`statusPill ${item.urgency === 'Expired' ? 'pillBad' : 'pillWarn'}`}>{item.urgency === 'Expired' ? 'Expired' : 'Due soon'}</span>
                <span className="dashboardItemBody">
                  <strong>{item.label}</strong>
                  <span>{item.description}</span>
                  <span className="muted">{item.propertyLabel} · {dateOnly(item.date)}</span>
                </span>
              </button>
            ))}
          </div>
        )}
        {vacancyItems.length > 0 && (
          <div className="dashboardItemList vacancyList">
            {vacancyItems.map((item: VacancyItem) => (
              <button key={item.id} className="dashboardItemRow" onClick={() => goToNav(item.propertyId, item.nav)}>
                <span className="statusPill pillNeutral">Vacant</span>
                <span className="dashboardItemBody">
                  <strong>{item.propertyLabel}</strong>
                  <span>No current lease</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="commandCenterSection">
        <div className="sectionHead"><div><h2>Upcoming</h2><p>Important dates coming up across your portfolio.</p></div></div>
        {upcomingItems.length === 0 ? (
          <div className="emptyState"><strong>No important dates coming up.</strong></div>
        ) : (
          <div className="dashboardItemList">
            {upcomingItems.map((item) => (
              <button key={`${item.type}-${item.id}`} className="dashboardItemRow" onClick={() => goToNav(item.propertyId, item.nav)}>
                <span className="statusPill pillNeutral">{item.daysUntil === 0 ? 'Today' : `${item.daysUntil}d`}</span>
                <span className="dashboardItemBody">
                  <strong>{item.label}</strong>
                  <span>{item.description}</span>
                  <span className="muted">{item.propertyLabel} · {dateOnly(item.date)}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="commandCenterSection">
        <div className="sectionHead"><div><h2>Open Maintenance</h2><p>{openMaintenanceCount ? `${openMaintenanceCount} open item${openMaintenanceCount === 1 ? '' : 's'} across your portfolio` : 'Nothing open right now.'}</p></div></div>
        {openMaintenanceItems.length === 0 ? (
          <div className="emptyState"><strong>No open maintenance items.</strong></div>
        ) : (
          <div className="dashboardItemList">
            {openMaintenanceItems.map((item) => (
              <button key={item.id} className="dashboardItemRow" onClick={() => goToNav(item.propertyId, item.nav)}>
                <span className="statusPill pillWarn">{item.status}</span>
                <span className="dashboardItemBody">
                  <strong>{item.description}</strong>
                  <span>{[item.category, item.vendor].filter(Boolean).join(' · ')}</span>
                  <span className="muted">{item.propertyLabel} · {dateOnly(item.date)}</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="commandCenterSection">
        <div className="sectionHead"><div><h2>Recent Activity</h2><p>What&apos;s changed across your portfolio lately.</p></div></div>
        {recentActivity.length === 0 ? (
          <div className="emptyState"><strong>Activity will appear here as you add information to your properties.</strong></div>
        ) : (
          <div className="dashboardItemList">
            {recentActivity.map((item) => (
              item.nav && item.propertyId ? (
                <button key={item.id} className="dashboardItemRow" onClick={() => goToNav(item.propertyId as string, item.nav as NavTarget)}>
                  <span className="dashboardItemBody"><strong>{item.description}</strong><span className="muted">{relativeTime(item.timestamp)}</span></span>
                </button>
              ) : (
                <div key={item.id} className="dashboardItemRow dashboardItemRowStatic">
                  <span className="dashboardItemBody"><strong>{item.description}</strong><span className="muted">{relativeTime(item.timestamp)}</span></span>
                </div>
              )
            ))}
          </div>
        )}
      </section>

      <section><div className="sectionHead"><div><h2>My Properties</h2><p>{busy && !properties.length ? 'Loading your portfolio…' : `${properties.length} propert${properties.length === 1 ? 'y' : 'ies'} in your portfolio`}</p></div><button className="primary" onClick={() => openAddProperty()}>+ Add Property</button></div>
        <div className="grid">{properties.map((property) => { const propertyOccupancy = property.property_type === 'Rental Property' ? deriveOccupancy(leases.filter((l) => l.property_id === property.id)) : null; return <article className="propertyCard" key={property.id}><button className="cardOpen" onClick={() => openProperty(property.id)}><div className="photo">{property.coverUrl ? <img src={property.coverUrl} alt={property.address} /> : <div className="photoPlaceholder"><span>⌂</span><small>Add property photos</small></div>}<span className="badge">{property.property_type}</span>{propertyOccupancy && <span className={`occupancyBadge ${occupancyPillClass(propertyOccupancy)}`}>{propertyOccupancy === 'Occupancy unknown' ? 'Unknown' : propertyOccupancy === 'Upcoming tenancy' ? 'Upcoming' : propertyOccupancy}</span>}</div></button><div className="cardBody"><button className="titleButton" onClick={() => openProperty(property.id)}><h3>{property.address}</h3><p className="muted">{property.city}</p></button><div className="miniStats"><div><span>Value</span><strong>{money(property.estimated_value)}</strong></div><div><span>Equity</span><strong>{money(Number(property.estimated_value) - Number(property.mortgage_balance))}</strong></div><div><span>Rent</span><strong>{money(property.monthly_rent)}</strong></div></div><div className="cardActions"><button onClick={() => openProperty(property.id, 'Documents', 'Documents')}>Documents</button><button onClick={() => openProperty(property.id, 'Documents', 'Photos')}>Photos</button><button onClick={() => openProperty(property.id, 'Financials')}>Financials</button></div></div></article> })}
          {!busy && properties.length === 0 && <button className="emptyPropertyCard" onClick={() => openAddProperty()}><strong>+ Add your first property</strong><span>Start building your organized property file.</span></button>}
        </div>
      </section>

      {showAdd && <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setShowAdd(false)}><div className="modal"><div className="modalTop"><h2>Add a property</h2><button className="iconButton" onClick={() => setShowAdd(false)}>×</button></div><label className="uploadBox">{imagePreview ? <img src={imagePreview} alt="Property preview" /> : <div><strong>Add a cover photo</strong><span>Choose a photo now or add one later</span></div>}<input type="file" accept="image/*" onChange={handleImage} /></label><div className="formGrid"><label>Street address<AddressAutocomplete value={draft.address} onTextChange={(v) => setDraft({ ...draft, address: v })} onSelect={(addr) => setDraft((d) => ({ ...d, ...applyNormalizedAddress(addr, d.address) }))} placeholder="123 Example Street" /></label><label>City, state & ZIP<input value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} placeholder="Example City, FL 12345" /></label><label>Property type<select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value })}><option>Rental Property</option><option>Primary Residence</option><option>Vacation Home</option><option>Commercial</option><option>Land</option><option>Other</option></select></label><label>Purchase price<input inputMode="decimal" value={draft.purchasePrice} onChange={(e) => setDraft({ ...draft, purchasePrice: e.target.value })} placeholder="390000" /></label><label>Estimated value<input inputMode="decimal" value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} placeholder="520000" /></label><label>Mortgage balance<input inputMode="decimal" value={draft.mortgage} onChange={(e) => setDraft({ ...draft, mortgage: e.target.value })} placeholder="310000" /></label><label>Financing status<select value={draft.financingStatus} onChange={(e) => setDraft({ ...draft, financingStatus: e.target.value })}>{FINANCING_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label><label>Monthly rent<input inputMode="decimal" value={draft.rent} onChange={(e) => setDraft({ ...draft, rent: e.target.value })} placeholder="2950" /></label><label>Monthly property expenses<input inputMode="decimal" value={draft.monthlyExpenses} onChange={(e) => setDraft({ ...draft, monthlyExpenses: e.target.value })} placeholder="1925" /></label></div><div className="modalActions"><button className="secondary" onClick={() => setShowAdd(false)}>Cancel</button><button className="primary" disabled={busy} onClick={() => void addProperty()}>{busy ? 'Saving…' : 'Save Property'}</button></div></div></div>}

      {showUpgrade === 'propertyLimit' && supabase && (
        <UpgradePrompt supabase={supabase} currentPlan={plan} onClose={() => setShowUpgrade(null)} />
      )}
      {showUpgrade === 'documentIntelligence' && supabase && (
        <UpgradePrompt
          supabase={supabase}
          currentPlan={plan}
          onClose={() => setShowUpgrade(null)}
          headline="AI Document Intelligence is included with Manage."
          targetPlanId="manage"
          description="Manage includes Smart Upload, Smart Import, AI Document Intelligence, Rent Ledger and PropWatch."
        />
      )}
    </main>
  )
}
