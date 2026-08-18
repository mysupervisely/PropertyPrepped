'use client'

// PropRoster — Milestone 18: Rent Ledger V1.
//
// A landlord recordkeeping tool, NOT a payment processor. PropRoster
// records that rent was received; it never collects, moves, or
// processes money. No ACH, no Stripe, no bank linking, no tenant
// payment portal — the action here is always "Record Payment," never
// "Pay Rent."
//
// Expected rent is never persisted or cron-generated: every row below
// is derived live from each lease's monthly_rent/rent_due_day/start_date/
// end_date (lib/rent-ledger/status.ts, reusing Milestone 16's
// classifyDate/daysUntil for "how urgent is this due date" so the
// Rent Ledger, PropWatch, and each property's Financials tab all agree)
// and compared against however many rent_payments rows are actually on
// file for that lease + calendar month (lib/rent-ledger/ledger.ts).
//
// Recording a payment MAY also create exactly one linked
// financial_transactions Income/Rent row (financial_transaction_id) —
// the SAME canonical single-link pattern maintenance_records already
// uses for its optional "add this cost to Financials" checkbox. Deleting
// a rent payment deletes that same linked transaction, so the money is
// never counted twice and never left orphaned in the Financials ledger.
//
// Auth/page-shell pattern mirrors app/search/page.tsx exactly
// (useAuthUser + AuthHeader + the same authShell/authCard sign-in gate).
// URL params are read manually via window.location.search (the same
// deliberate choice app/account/billing/page.tsx and app/page.tsx both
// already make) rather than next/navigation's useSearchParams, so this
// page never needs a Suspense boundary.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../../lib/supabase'
import { useAuthUser } from '../../lib/useAuthUser'
import { AuthHeader } from '../../components/AuthHeader'
import { RENT_PAYMENT_METHODS } from '../../lib/property-categories'
import { periodFromDate, periodStart, shiftPeriod, formatPeriodLabel, shouldDeleteLinkedTransaction, type RentPeriod, type RentStatus } from '../../lib/rent-ledger/status'
import { buildRentLedgerRows, summarizeRentLedgerRows, type RentLedgerRow } from '../../lib/rent-ledger/ledger'

const money = (n: number | null | undefined) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0,
}).format(Number.isFinite(n as number) ? Number(n) : 0)

function rentStatusPillClass(status: RentStatus): string {
  if (status === 'Paid') return 'pillGood'
  if (status === 'Due' || status === 'Partial') return 'pillWarn'
  if (status === 'Overdue') return 'pillBad'
  return 'pillNeutral' // Upcoming, Unknown
}

type PropertyRef = { id: string; address: string; city: string; property_type: string }
type LeaseRef = { id: string; property_id: string; tenant_name: string; monthly_rent: number; rent_due_day: number | null; start_date: string; end_date: string }
type PaymentRow = {
  id: string; owner_id: string; property_id: string; lease_id: string; rent_period: string; date_received: string
  amount: number; payment_method: string; reference_number: string | null; notes: string | null; financial_transaction_id: string | null
  created_linked_transaction: boolean
}

function defaultDraft() {
  return {
    propertyId: '', leaseId: '', dateReceived: new Date().toISOString().slice(0, 10), amount: '',
    paymentMethod: RENT_PAYMENT_METHODS[0] as string, referenceNumber: '', notes: '', recordAsIncome: true,
  }
}

export default function RentLedgerPage() {
  const { user, ready } = useAuthUser()

  if (!ready) return <main className="authShell"><div className="loadingState">Loading Rent Ledger…</div></main>

  if (!user) {
    return (
      <main className="authShell">
        <section className="authCard">
          <p className="eyebrow">PROPROSTER</p>
          <h1>Sign in required</h1>
          <p className="authIntro">Sign in to view your Rent Ledger.</p>
          <Link className="primary authSubmit" href="/">Go to sign in</Link>
        </section>
      </main>
    )
  }

  return <RentLedgerWorkspace />
}

function RentLedgerWorkspace() {
  const [properties, setProperties] = useState<PropertyRef[]>([])
  const [leases, setLeases] = useState<LeaseRef[]>([])
  const [payments, setPayments] = useState<PaymentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [period, setPeriod] = useState<RentPeriod>(() => periodFromDate(new Date()))
  const [expandedLeaseId, setExpandedLeaseId] = useState<string | null>(null)
  const [showRecordPayment, setShowRecordPayment] = useState(false)
  const [draft, setDraft] = useState(defaultDraft())
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  const [deepLinkHandled, setDeepLinkHandled] = useState(false)

  async function load() {
    if (!supabase) return
    setLoading(true)
    setError('')
    const [{ data: propertyRows, error: e1 }, { data: leaseRows, error: e2 }, { data: paymentRows, error: e3 }] = await Promise.all([
      supabase.from('properties').select('id,address,city,property_type').order('created_at', { ascending: true }),
      supabase.from('leases').select('id,property_id,tenant_name,monthly_rent,rent_due_day,start_date,end_date').order('created_at', { ascending: false }),
      supabase.from('rent_payments').select('*').order('date_received', { ascending: false }),
    ])
    const err = e1 || e2 || e3
    if (err) setError(err.message)
    setProperties((propertyRows || []) as PropertyRef[])
    setLeases((leaseRows || []) as LeaseRef[])
    setPayments((paymentRows || []) as PaymentRow[])
    setLoading(false)
  }

  useEffect(() => { void load() }, [])

  const propertyLabelById = useMemo(() => new Map(properties.map((p) => [p.id, `${p.address}${p.city ? `, ${p.city}` : ''}`])), [properties])
  const rentalProperties = useMemo(() => properties.filter((p) => p.property_type === 'Rental Property'), [properties])

  const rows = useMemo(() => buildRentLedgerRows(properties, leases, payments, period, propertyLabelById), [properties, leases, payments, period, propertyLabelById])
  const summary = useMemo(() => summarizeRentLedgerRows(rows), [rows])

  // Deep link from a property's Financials "Rent this month" card:
  // /rent-ledger?lease=<id> auto-opens Record Payment pre-filled for
  // that lease, once leases have actually loaded. Runs once.
  useEffect(() => {
    if (deepLinkHandled || !leases.length) return
    const leaseId = new URLSearchParams(window.location.search).get('lease')
    if (leaseId) {
      const lease = leases.find((l) => l.id === leaseId)
      if (lease) openRecordPayment(lease)
    }
    setDeepLinkHandled(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leases, deepLinkHandled])

  function openRecordPayment(lease?: LeaseRef) {
    setFormError('')
    setDraft({ ...defaultDraft(), propertyId: lease?.property_id || '', leaseId: lease?.id || '' })
    setShowRecordPayment(true)
  }

  const leasesForSelectedProperty = leases.filter((l) => l.property_id === draft.propertyId)

  async function saveRecordPayment() {
    if (!supabase || !draft.propertyId || !draft.leaseId) { setFormError('Choose a property and lease.'); return }
    const amount = Number(draft.amount)
    if (!(amount > 0)) { setFormError('Enter an amount greater than $0.'); return }
    if (!draft.dateReceived) { setFormError('Enter the date received.'); return }

    setBusy(true); setFormError('')
    const lease = leases.find((l) => l.id === draft.leaseId)
    let financialTransactionId: string | null = null

    if (draft.recordAsIncome) {
      const { data: txRow, error: txError } = await supabase.from('financial_transactions').insert({
        property_id: draft.propertyId, transaction_type: 'Income', category: 'Rent',
        description: `Rent — ${formatPeriodLabel(period)}${lease ? ` — ${lease.tenant_name}` : ''}`,
        amount, transaction_date: draft.dateReceived, vendor: lease?.tenant_name || null,
      }).select('id').single()
      if (txError) { setFormError(txError.message); setBusy(false); return }
      financialTransactionId = txRow.id
    }

    const { error: payError } = await supabase.from('rent_payments').insert({
      property_id: draft.propertyId, lease_id: draft.leaseId, rent_period: periodStart(period),
      date_received: draft.dateReceived, amount, payment_method: draft.paymentMethod,
      reference_number: draft.referenceNumber.trim() || null, notes: draft.notes.trim() || null,
      financial_transaction_id: financialTransactionId,
      // True only because we just created financialTransactionId above
      // — this is what lets deletePayment() safely know it's ours to
      // remove later, never a pre-existing/manual transaction.
      created_linked_transaction: financialTransactionId !== null,
    })
    if (payError) {
      // Best-effort cleanup: never leave a phantom Financials entry
      // behind if the payment record itself failed to save.
      if (financialTransactionId) await supabase.from('financial_transactions').delete().eq('id', financialTransactionId)
      setFormError(payError.message); setBusy(false); return
    }

    setShowRecordPayment(false)
    setDraft(defaultDraft())
    await load()
    setBusy(false)
  }

  async function deletePayment(payment: PaymentRow) {
    if (!supabase) return
    setBusy(true)
    await supabase.from('rent_payments').delete().eq('id', payment.id)
    // Only remove the linked financial_transactions row when THIS
    // payment is what created it (created_linked_transaction) — never
    // just because a link exists. A payment merely linked to a
    // pre-existing/manual transaction must never take that unrelated
    // transaction down with it.
    if (shouldDeleteLinkedTransaction(payment)) await supabase.from('financial_transactions').delete().eq('id', payment.financial_transaction_id as string)
    await load()
    setBusy(false)
  }

  return (
    <main className="shell">
      <AuthHeader />

      <section className="intro">
        <p className="eyebrow">RENT LEDGER</p>
        <h1>Track rent, month by month.</h1>
        <p>A recordkeeping tool — PropRoster records that rent was received, it does not collect payments. Use &ldquo;Record Payment&rdquo; after money has actually arrived.</p>
      </section>

      <div className="rentLedgerMonthNav">
        <button type="button" onClick={() => setPeriod((p) => shiftPeriod(p, -1))} aria-label="Previous month">←</button>
        <h2>{formatPeriodLabel(period)}</h2>
        <button type="button" onClick={() => setPeriod((p) => shiftPeriod(p, 1))} aria-label="Next month">→</button>
      </div>

      {error && <p className="errorMessage">{error}</p>}

      <div className="rentLedgerSummary">
        <div className="rentLedgerSummaryTile"><span>Expected Rent</span><strong>{money(summary.expected)}</strong></div>
        <div className="rentLedgerSummaryTile"><span>Collected</span><strong>{money(summary.collected)}</strong></div>
        <div className="rentLedgerSummaryTile"><span>Outstanding</span><strong>{money(summary.outstanding)}</strong></div>
        <div className="rentLedgerSummaryTile"><span>Paid</span><strong>{summary.paidCount} lease{summary.paidCount === 1 ? '' : 's'}</strong></div>
        <div className="rentLedgerSummaryTile"><span>Needs Attention</span><strong>{summary.needsAttentionCount} lease{summary.needsAttentionCount === 1 ? '' : 's'}</strong></div>
      </div>

      <div className="sectionHead">
        <div><h2>{formatPeriodLabel(period)} rent</h2><p>{rentalProperties.length ? `${rows.length} of ${rentalProperties.length} rental propert${rentalProperties.length === 1 ? 'y' : 'ies'} have rent due this month.` : 'Add a Rental Property with a lease to start tracking rent.'}</p></div>
        <button className="primary" onClick={() => openRecordPayment()} disabled={!rentalProperties.length}>+ Record Payment</button>
      </div>

      {loading ? (
        <div className="emptyState rentLedgerEmpty"><strong>Loading…</strong></div>
      ) : rows.length === 0 ? (
        <div className="emptyState rentLedgerEmpty"><strong>No rent due for {formatPeriodLabel(period)}.</strong><span>Vacant properties and leases outside this month don&apos;t appear here.</span></div>
      ) : (
        <div className="rentLedgerList">
          {rows.map((row) => {
            const rowPayments = payments.filter((p) => p.lease_id === row.leaseId && p.rent_period === periodStart(period))
            const expanded = expandedLeaseId === row.leaseId
            return (
              <article className="rentLedgerRow" key={row.leaseId}>
                <button className="rentLedgerRowSummary" onClick={() => setExpandedLeaseId(expanded ? null : row.leaseId)} aria-expanded={expanded}>
                  <span className={`statusPill ${rentStatusPillClass(row.status)}`}>{row.status}</span>
                  <span className="rentLedgerRowProperty">{row.propertyLabel}</span>
                  <span className="rentLedgerRowTenant">Tenant: {row.tenantName}</span>
                  <span className="rentLedgerRowDue">{row.dueDate ? `Due ${new Date(`${row.dueDate}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : 'Rent due day not entered'}</span>
                  <span className="rentLedgerRowAmount">{money(row.expectedAmount)}</span>
                </button>
                {expanded && (
                  <div className="rentLedgerRowDetail">
                    <div className="recordMetrics">
                      <div><span>Expected</span><strong>{money(row.expectedAmount)}</strong></div>
                      <div><span>Received</span><strong>{money(row.totalPaid)}</strong></div>
                      {row.remaining > 0 && <div><span>Remaining</span><strong>{money(row.remaining)}</strong></div>}
                    </div>
                    {row.dueDate === null && (
                      <p className="muted">Rent due day not entered for this lease. <Link href={`/?openProperty=${row.propertyId}&openTab=Property&openPropSubTab=Lease`}>Edit Lease</Link> to add one.</p>
                    )}
                    {rowPayments.length > 0 && (
                      <div className="rentPaymentList">
                        {rowPayments.map((p) => (
                          <div className="rentPaymentEntry" key={p.id}>
                            <span>
                              {money(p.amount)} · {p.payment_method}
                              <span className="muted">{new Date(`${p.date_received}T12:00:00`).toLocaleDateString()}{p.reference_number ? ` · Ref ${p.reference_number}` : ''}{p.notes ? ` · ${p.notes}` : ''}</span>
                            </span>
                            <button onClick={() => void deletePayment(p)} aria-label="Delete payment" disabled={busy}>×</button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="rentLedgerRowDetailActions">
                      <button className="primary" onClick={() => { const lease = leases.find((l) => l.id === row.leaseId); openRecordPayment(lease) }}>+ Record Payment</button>
                      <Link href={`/?openProperty=${row.propertyId}&openTab=Financials`}>View Financials</Link>
                    </div>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}

      {showRecordPayment && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setShowRecordPayment(false)}>
          <div className="modal moduleModal">
            <div className="modalTop"><div><p className="eyebrow">RENT LEDGER</p><h2>Record Payment</h2></div><button className="iconButton" onClick={() => setShowRecordPayment(false)}>×</button></div>
            <div className="leaseFormGroups">
              <fieldset className="formFieldset"><legend>Property &amp; lease</legend><div className="formGrid">
                <label>Property<select value={draft.propertyId} onChange={(e) => setDraft({ ...draft, propertyId: e.target.value, leaseId: '' })}>
                  <option value="">Choose a property</option>
                  {rentalProperties.map((p) => <option key={p.id} value={p.id}>{propertyLabelById.get(p.id)}</option>)}
                </select></label>
                <label>Lease<select value={draft.leaseId} onChange={(e) => setDraft({ ...draft, leaseId: e.target.value })} disabled={!draft.propertyId}>
                  <option value="">Choose a lease</option>
                  {leasesForSelectedProperty.map((l) => <option key={l.id} value={l.id}>{l.tenant_name} ({new Date(`${l.start_date}T12:00:00`).toLocaleDateString()} – {new Date(`${l.end_date}T12:00:00`).toLocaleDateString()})</option>)}
                </select></label>
                <label className="fullField">Rent period<strong style={{ display: 'block', padding: '10px 0' }}>{formatPeriodLabel(period)}</strong><small>Use the month navigation above to record a payment for a different month.</small></label>
              </div></fieldset>
              <fieldset className="formFieldset"><legend>Payment</legend><div className="formGrid">
                <label>Date received<input type="date" value={draft.dateReceived} onChange={(e) => setDraft({ ...draft, dateReceived: e.target.value })} /></label>
                <label>Amount<input inputMode="decimal" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} placeholder="2400" /></label>
                <label>Payment method<select value={draft.paymentMethod} onChange={(e) => setDraft({ ...draft, paymentMethod: e.target.value })}>{RENT_PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</select></label>
                <label>Reference / confirmation #<input value={draft.referenceNumber} onChange={(e) => setDraft({ ...draft, referenceNumber: e.target.value })} placeholder="Optional" /></label>
                <label className="fullField">Notes<input value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder="Optional" /></label>
                <label className="recurringCheck fullField"><input type="checkbox" checked={draft.recordAsIncome} onChange={(e) => setDraft({ ...draft, recordAsIncome: e.target.checked })} /><span>Record this as rental income in Financials</span><small>Creates one linked Income transaction so you don&apos;t have to enter it twice. Uncheck if you&apos;ve already logged this payment manually.</small></label>
              </div></fieldset>
              {formError && <p className="errorMessage">{formError}</p>}
            </div>
            <div className="modalActions"><button className="secondary" onClick={() => setShowRecordPayment(false)}>Cancel</button><button className="primary" disabled={busy} onClick={() => void saveRecordPayment()}>{busy ? 'Saving…' : 'Save Payment'}</button></div>
          </div>
        </div>
      )}
    </main>
  )
}
