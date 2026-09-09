// PropRoster — Tenant Connect: Provider Outreach V1. The account-less
// provider page (Section 4). A Server Component: the admin client is
// used here, server-side only, exactly because a provider has no
// Supabase session to scope an RLS-safe client to (same justification
// as the respond route) — nothing service-role-flavored is ever sent
// to the browser. The token is hashed and looked up here; only the
// explicit safe-view fields (lib/maintenance/provider-outreach.ts's
// buildProviderSafeView) ever reach the rendered HTML — property
// value/mortgage/rent/lease financials/tax/portfolio/PropWatch/
// internal notes are never fetched by this query in the first place
// (Section 4's own "do NOT expose" list).

import { createAdminClient } from '../../../lib/supabase-server'
import { buildProviderSafeView, type ProviderOutreachStatus } from '../../../lib/maintenance/provider-outreach'
import { ProviderResponseActions } from '../../../components/provider/ProviderResponseActions'
import { Wordmark } from '../../../components/Wordmark'
import { createHash } from 'crypto'

export const dynamic = 'force-dynamic'

async function loadOutreach(rawToken: string) {
  const admin = createAdminClient()
  if (!admin) return null
  const tokenHash = createHash('sha256').update(rawToken).digest('hex')
  const { data: outreach } = await admin
    .from('maintenance_provider_outreach')
    .select('id, status, provider_message, token_expires_at, maintenance_request_id, contact_id')
    .eq('token_hash', tokenHash)
    .maybeSingle()
  if (!outreach) return null
  if (new Date(outreach.token_expires_at).getTime() < Date.now()) return { expired: true as const }

  // Only the columns the safe view can ever use — never `select('*')`
  // here (Section 4's own "minimum useful information" instruction).
  const [{ data: request }, { data: contact }] = await Promise.all([
    admin.from('maintenance_requests').select('title, description, priority, property_id').eq('id', outreach.maintenance_request_id).maybeSingle(),
    admin.from('property_contacts').select('name').eq('id', outreach.contact_id).maybeSingle(),
  ])
  if (!request || !contact) return null
  const { data: property } = await admin.from('properties').select('address, city').eq('id', request.property_id).maybeSingle()
  if (!property) return null

  return {
    expired: false as const,
    outreachId: outreach.id as string,
    providerMessage: outreach.provider_message as string | null,
    view: buildProviderSafeView({
      propertyAddress: property.address,
      propertyCity: property.city,
      issueTitle: request.title,
      tenantReport: request.description,
      priority: request.priority,
      providerName: contact.name,
      status: outreach.status as ProviderOutreachStatus,
    }),
  }
}

export default async function ProviderOutreachPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const result = await loadOutreach(token)

  return (
    <main className="providerShell">
      <div className="providerCard">
        <div className="providerBrand"><Wordmark /></div>
        {!result ? (
          <div className="providerInvalid">
            <h1>Link not found</h1>
            <p>This request link isn&apos;t valid. Please contact the property owner directly.</p>
          </div>
        ) : result.expired ? (
          <div className="providerInvalid">
            <h1>Link expired</h1>
            <p>This request link has expired. Please contact the property owner directly.</p>
          </div>
        ) : (
          <>
            <div className="providerField">
              <span className="providerLabel">Property</span>
              <p>{result.view.propertyAddress}{result.view.propertyCity ? <><br />{result.view.propertyCity}</> : null}</p>
            </div>
            <div className="providerField">
              <span className="providerLabel">Issue</span>
              <p>{result.view.issueTitle}</p>
            </div>
            {result.view.tenantReport && (
              <div className="providerField">
                <span className="providerLabel">Tenant report</span>
                <p>{result.view.tenantReport}</p>
              </div>
            )}
            <div className="providerField">
              <span className="providerLabel">Urgency</span>
              <p><span className={`statusPill priority${result.view.priority}`}>{result.view.priority}</span></p>
            </div>
            <ProviderResponseActions
              token={token}
              initialStatus={result.view.status}
              initialMessage={result.providerMessage}
            />
          </>
        )}
      </div>
    </main>
  )
}
