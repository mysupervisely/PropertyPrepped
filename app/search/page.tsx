'use client'

// PropRoster — Milestone 15: Global Search V1.
//
// Deterministic, database-backed search — no AI call, no vector/semantic
// search, no external search infrastructure (Elasticsearch/Algolia/etc).
// Every query runs through the SAME RLS-scoped Supabase client every
// other authenticated page already uses (lib/supabase.ts) — no new RPC,
// no service-role usage, ownership is enforced the exact same way it
// already is everywhere else. See lib/search/query.ts for the two-pass
// matching strategy (server-side ilike OR-filter to narrow candidates
// without downloading the whole table, then a precise multi-word AND
// check in JS) and lib/search/build-results.ts for the pure per-table
// result shaping + deep-link building (reusing app/page.tsx's existing
// ?openProperty=<id> mechanism, extended — not duplicated — for this).

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '../../lib/supabase'
import { useAuthUser } from '../../lib/useAuthUser'
import { AuthHeader } from '../../components/AuthHeader'
import { normalizeSearchWords, buildOrFilter } from '../../lib/search/query'
import {
  searchProperties, searchDocuments, searchContacts, searchSystems, searchMaintenance,
  searchFinancials, searchNotes, searchLeases, searchMortgages, searchInsurance,
  PROPERTY_SEARCH_COLUMNS, DOCUMENT_SEARCH_COLUMNS, CONTACT_SEARCH_COLUMNS, SYSTEM_SEARCH_COLUMNS,
  MAINTENANCE_SEARCH_COLUMNS, FINANCIAL_SEARCH_COLUMNS, NOTE_SEARCH_COLUMNS, LEASE_SEARCH_COLUMNS,
  MORTGAGE_SEARCH_COLUMNS, INSURANCE_SEARCH_COLUMNS,
  type SearchResult, type SearchResultType, type PropertyRef,
} from '../../lib/search/build-results'

const DEBOUNCE_MS = 300
const MIN_QUERY_LENGTH = 2
// Bounds how much any one table's candidate set can be — this is what
// keeps this "database-backed," not "download everything and filter in
// the browser." Reasonable for a normal small/medium landlord portfolio;
// see the completion report for the scale this was designed around.
const PER_TABLE_LIMIT = 15

const GROUP_KEY: Record<SearchResultType, string> = {
  Property: 'Property', Document: 'Document', PropCrew: 'PropCrew', System: 'System',
  Maintenance: 'Maintenance', Financial: 'Financial', Note: 'Note',
  Lease: 'LeaseMortgageInsurance', Mortgage: 'LeaseMortgageInsurance', Insurance: 'LeaseMortgageInsurance',
}
const GROUP_LABEL: Record<string, string> = {
  Property: 'Properties', Document: 'Documents', PropCrew: 'PropCrew', System: 'Systems',
  Maintenance: 'Maintenance', Financial: 'Financials', Note: 'Notes',
  LeaseMortgageInsurance: 'Leases / Insurance / Mortgage',
}
const GROUP_ORDER = ['Property', 'Document', 'PropCrew', 'System', 'Maintenance', 'Financial', 'Note', 'LeaseMortgageInsurance']
const TYPE_LABEL: Record<SearchResultType, string> = {
  Property: 'PROPERTY', Document: 'DOCUMENT', PropCrew: 'PROPCREW', System: 'SYSTEM',
  Maintenance: 'MAINTENANCE', Financial: 'FINANCIAL', Note: 'NOTE', Lease: 'LEASE', Mortgage: 'MORTGAGE', Insurance: 'INSURANCE',
}

export default function SearchPage() {
  const { user, ready } = useAuthUser()

  if (!ready) return <main className="authShell"><div className="loadingState">Loading Search…</div></main>

  if (!user) {
    return (
      <main className="authShell">
        <section className="authCard">
          <p className="eyebrow">PROPROSTER</p>
          <h1>Sign in required</h1>
          <p className="authIntro">Sign in to search your PropRoster portfolio.</p>
          <Link className="primary authSubmit" href="/">Go to sign in</Link>
        </section>
      </main>
    )
  }

  return <SearchWorkspace />
}

function SearchWorkspace() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [properties, setProperties] = useState<PropertyRef[]>([])
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestIdRef = useRef(0)

  // Loaded once, up front — small (a landlord's own property list), and
  // needed to label every OTHER result type with "which property is
  // this" without a per-result round trip.
  useEffect(() => {
    if (!supabase) return
    supabase.from('properties').select('id,address,city').order('created_at', { ascending: true }).then(({ data }) => {
      setProperties((data || []) as PropertyRef[])
    })
  }, [])

  async function runSearch(rawQuery: string) {
    const words = normalizeSearchWords(rawQuery)
    if (!words.length || words.join('').length < MIN_QUERY_LENGTH || !supabase) {
      setResults([])
      setSearched(false)
      return
    }
    const requestId = ++requestIdRef.current
    setLoading(true)
    const client = supabase

    const [
      { data: propRows }, { data: docRows }, { data: contactRows }, { data: linkRows },
      { data: systemRows }, { data: maintRows }, { data: txRows }, { data: noteRows },
      { data: leaseRows }, { data: mortgageRows }, { data: insuranceRows },
    ] = await Promise.all([
      client.from('properties').select('id,address,city,property_type').or(buildOrFilter(PROPERTY_SEARCH_COLUMNS, words)).limit(PER_TABLE_LIMIT),
      client.from('property_documents').select('id,property_id,name,category,document_type').or(buildOrFilter(DOCUMENT_SEARCH_COLUMNS, words)).limit(PER_TABLE_LIMIT),
      client.from('property_contacts').select('id,property_id,name,business_name,role,phone,email').or(buildOrFilter(CONTACT_SEARCH_COLUMNS, words)).limit(PER_TABLE_LIMIT),
      client.from('property_contact_links').select('contact_id,property_id'),
      client.from('property_systems').select('id,property_id,system_type,name,manufacturer,model,serial_number').or(buildOrFilter(SYSTEM_SEARCH_COLUMNS, words)).limit(PER_TABLE_LIMIT),
      client.from('maintenance_records').select('id,property_id,description,category,vendor').or(buildOrFilter(MAINTENANCE_SEARCH_COLUMNS, words)).limit(PER_TABLE_LIMIT),
      client.from('financial_transactions').select('id,property_id,description,category,vendor').or(buildOrFilter(FINANCIAL_SEARCH_COLUMNS, words)).limit(PER_TABLE_LIMIT),
      client.from('property_notes').select('id,property_id,body').or(buildOrFilter(NOTE_SEARCH_COLUMNS, words)).limit(PER_TABLE_LIMIT),
      client.from('leases').select('id,property_id,tenant_name,tenant_email').or(buildOrFilter(LEASE_SEARCH_COLUMNS, words)).limit(PER_TABLE_LIMIT),
      client.from('mortgages').select('id,property_id,lender,loan_number').or(buildOrFilter(MORTGAGE_SEARCH_COLUMNS, words)).limit(PER_TABLE_LIMIT),
      client.from('insurance_policies').select('id,property_id,carrier,policy_number').or(buildOrFilter(INSURANCE_SEARCH_COLUMNS, words)).limit(PER_TABLE_LIMIT),
    ])

    // A stale, slower request finishing after a newer one must never
    // clobber it — only the most recent keystroke's results ever render.
    if (requestId !== requestIdRef.current) return

    const propertyById = new Map(properties.map((p) => [p.id, p]))
    // Same union-of-primary-plus-links rule components/PropCrewPanel.tsx
    // already uses for "which properties does this provider serve."
    const propertyCountByContact = new Map<string, number>()
    ;(contactRows || []).forEach((c: { id: string; property_id: string }) => {
      const ids = new Set<string>([c.property_id])
      ;(linkRows || []).forEach((l: { contact_id: string; property_id: string }) => { if (l.contact_id === c.id) ids.add(l.property_id) })
      propertyCountByContact.set(c.id, ids.size)
    })

    const combined: SearchResult[] = [
      ...searchProperties(propRows || [], words),
      ...searchDocuments(docRows || [], words, propertyById),
      ...searchContacts(contactRows || [], words, propertyCountByContact),
      ...searchSystems(systemRows || [], words, propertyById),
      ...searchMaintenance(maintRows || [], words, propertyById),
      ...searchFinancials(txRows || [], words, propertyById),
      ...searchNotes(noteRows || [], words, propertyById),
      ...searchLeases(leaseRows || [], words, propertyById),
      ...searchMortgages(mortgageRows || [], words, propertyById),
      ...searchInsurance(insuranceRows || [], words, propertyById),
    ]
    setResults(combined)
    setSearched(true)
    setLoading(false)
  }

  function handleChange(next: string) {
    setQuery(next)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => { void runSearch(next) }, DEBOUNCE_MS)
  }

  const groups = GROUP_ORDER
    .map((key) => ({ key, label: GROUP_LABEL[key], items: results.filter((r) => GROUP_KEY[r.type] === key) }))
    .filter((g) => g.items.length > 0)

  return (
    <main className="shell">
      <AuthHeader />

      <section className="intro">
        <p className="eyebrow">SEARCH</p>
        <h1>Find anything in your portfolio.</h1>
      </section>

      <div className="searchInputWrap">
        <input
          type="text"
          inputMode="search"
          autoFocus
          className="searchInput"
          placeholder="Search your PropRoster…"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
        />
        {loading && <span className="addressResolving">Searching…</span>}
      </div>

      {!searched && (
        <p className="muted searchHint">Search across your properties, documents, PropCrew, systems, maintenance, financials and more.</p>
      )}

      {searched && !loading && results.length === 0 && (
        <div className="emptyState searchEmptyState">
          <strong>No results for &ldquo;{query.trim()}&rdquo;</strong>
          <span>Try searching by property address, provider name, document name, or a maintenance keyword.</span>
        </div>
      )}

      {groups.map((group) => (
        <section className="searchResultGroup" key={group.key}>
          <p className="eyebrow">{group.label.toUpperCase()}</p>
          <div className="searchResultList">
            {group.items.map((item) => (
              <Link className="searchResultRow" href={item.href} key={`${item.type}-${item.id}`}>
                <span className="searchResultType">{TYPE_LABEL[item.type]}</span>
                <span className="searchResultBody">
                  <strong>{item.title}</strong>
                  {item.subtitle && <span>{item.subtitle}</span>}
                  {item.detail && <span className="muted">{item.detail}</span>}
                </span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </main>
  )
}
