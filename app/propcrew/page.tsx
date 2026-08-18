'use client'

// PropRoster — PropCrew, Section 10: the portfolio-wide directory route.
// "PropCrew is the owner's private historical directory of service
// providers and professionals connected to their properties" — spanning
// every property, not scoped to one, which is why this is its own
// top-level route rather than only living inside a property's People tab
// (PropCrewPanel is also rendered there, scoped to that one property —
// same component, same data, two views).

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthUser } from '../../lib/useAuthUser'
import { AuthHeader } from '../../components/AuthHeader'
import { PropCrewPanel } from '../../components/PropCrewPanel'

type PropertyRef = { id: string; address: string; city: string }

export default function PropCrewPage() {
  const { user, ready } = useAuthUser()
  const [properties, setProperties] = useState<PropertyRef[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase || !user) return
    setLoading(true)
    supabase.from('properties').select('id, address, city').order('created_at', { ascending: true }).then(({ data }) => {
      setProperties((data || []) as PropertyRef[])
      setLoading(false)
    })
  }, [user?.id])

  if (!ready || (user && loading)) {
    return <main className="authShell"><div className="loadingState">Loading PropCrew…</div></main>
  }

  if (!user) {
    return (
      <main className="authShell">
        <section className="authCard">
          <p className="eyebrow">PROPROSTER</p>
          <h1>Sign in required</h1>
          <p className="authIntro">Sign in to view your PropCrew directory.</p>
          <Link className="primary authSubmit" href="/">Go to sign in</Link>
        </section>
      </main>
    )
  }

  return (
    <main className="shell">
      <AuthHeader />

      <section className="intro evaluatorIntro">
        {/* Launch Polish: PropCrew keeps its approved mixed-case brand
            casing here — an explicit exception for this branded product
            name, not a change to the eyebrow style used elsewhere. */}
        <p className="eyebrow">PropCrew</p>
        <h1>Every provider, across every property.</h1>
        <p>Your private directory of contractors, agents, lenders and professionals — never a marketplace, never shared with anyone else.</p>
      </section>

      {properties.length === 0 ? (
        <div className="emptyState compsEmptyState"><strong>Add a property first.</strong><span>PropCrew providers are linked to your properties — add one from the Dashboard to get started.</span></div>
      ) : (
        <PropCrewPanel ownerId={user.id} properties={properties} showHeader={false} />
      )}
    </main>
  )
}
