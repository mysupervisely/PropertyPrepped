// PropRoster — Tenant-Facing Experience V1 (PR #60 polish). Signed URL
// for a tenancy's own signed lease file.
//
// Deliberately NOT routed through tenant_documents_view/tenant_visible
// (Migration 29's opt-in "explicitly shared" flag) — a signed lease is
// not an arbitrary landlord document the owner separately chooses to
// share; the tenancy relationship itself already authorizes it, the
// same way tenant_lease_view already hands the tenant their own
// monthly_rent/start_date/end_date without any tenant_visible flag.
//
// No schema change: leases.document_id (existing column, references
// property_documents) already links a lease to its signed file — the
// same column app/page.tsx's own landlord-side lease card already
// reads (`selectedDocs.find(d => d.id === currentLease.document_id)`).
// tenant_lease_view doesn't expose document_id, so this route resolves
// it server-side instead of widening that view.
//
// Same two-step pattern document-url/route.ts already established: an
// RLS-scoped re-fetch through the CALLER'S OWN client is the
// authorization check — here, tenant_property_access, filtered to a
// row that is both status = 'Active' and this caller's own
// tenant_user_id (tenant_access_select's Active branch; RLS itself
// enforces tenant_user_id = auth.uid(), never trusted from the
// request) and whose lease_id matches the one requested. Only once
// that succeeds does the admin client do what the RLS-scoped client
// can't: read leases.document_id (leases has no tenant-facing SELECT
// policy) and sign the storage object. Never trusts a client-supplied
// document id or storage path — only the lease id the caller's own
// active tenancy is already scoped to, and only the document/path that
// id resolves to server-side.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, createRequestClient } from '../../../../lib/supabase-server'

export const runtime = 'nodejs'

function getBearerToken(header: string | null): string | null {
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match ? match[1] : null
}

export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req.headers.get('authorization'))
    if (!token) return NextResponse.json({ url: null }, { status: 401 })
    const client = createRequestClient(token)
    if (!client) return NextResponse.json({ url: null }, { status: 503 })

    const body = (await req.json().catch(() => ({}))) as { leaseId?: string }
    if (!body.leaseId) return NextResponse.json({ url: null }, { status: 400 })

    // Authorization check: RLS (tenant_access_select's Active branch)
    // only returns this row if the caller is its real, currently-Active
    // tenant_user_id — a Revoked or Invited-only relationship, or
    // someone else's lease_id, returns nothing here regardless of what
    // the request body claims.
    const { data: access } = await client
      .from('tenant_property_access')
      .select('property_id, lease_id')
      .eq('lease_id', body.leaseId)
      .eq('status', 'Active')
      .maybeSingle()
    if (!access) return NextResponse.json({ url: null }, { status: 404 })

    const admin = createAdminClient()
    if (!admin) return NextResponse.json({ url: null }, { status: 503 })

    // Defense in depth: re-verify the lease actually belongs to the
    // same property this tenancy is scoped to before ever reading its
    // document_id.
    const { data: lease } = await admin.from('leases').select('document_id, property_id').eq('id', body.leaseId).maybeSingle()
    if (!lease || lease.property_id !== access.property_id) return NextResponse.json({ url: null }, { status: 404 })
    if (!lease.document_id) return NextResponse.json({ url: null }, { status: 200 })

    const { data: doc } = await admin.from('property_documents').select('storage_path').eq('id', lease.document_id).maybeSingle()
    if (!doc) return NextResponse.json({ url: null }, { status: 200 })

    const { data: signed, error: signError } = await admin.storage.from('property-documents').createSignedUrl(doc.storage_path, 3600)
    if (signError || !signed) return NextResponse.json({ url: null }, { status: 500 })

    return NextResponse.json({ url: signed.signedUrl }, { status: 200 })
  } catch (err) {
    console.error('tenant-connect: lease-document-url route unexpected error', err)
    return NextResponse.json({ url: null }, { status: 500 })
  }
}
