// PropPrepped Milestone 8: the only endpoint that talks to the AI provider.
//
// - API keys never reach the browser: this file runs server-side only
//   (Next.js Route Handler, Node runtime) and reads ANTHROPIC_API_KEY from
//   the server environment.
// - No generic file-fetch endpoint: the client sends a documentId, never a
//   storage path. The path is resolved server-side, only after an
//   RLS-scoped lookup proves the caller owns that document.
// - Every Supabase call in this file uses the caller's own access token
//   (see lib/supabase-server.ts) — never a service-role key. RLS enforces
//   ownership on every read and write.
// - Business logic lives in lib/document-intelligence/analyze-request.ts so
//   it can be unit tested without a live database or network call; this
//   file is just the thin adapter that wires real Supabase/fetch/Anthropic
//   implementations to that logic.

import { NextRequest, NextResponse } from 'next/server'
import { createRequestClient } from '../../../../lib/supabase-server'
import { handleAnalyzeRequest } from '../../../../lib/document-intelligence/analyze-request'
import { analyzeDocument } from '../../../../lib/document-intelligence/analyze-document'
import { getDocumentIntelligenceProvider, isDocumentIntelligenceConfigured } from '../../../../lib/document-intelligence/provider'

export const runtime = 'nodejs'

function getBearerToken(header: string | null): string | null {
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  return match ? match[1] : null
}

export async function POST(req: NextRequest) {
  try {
    const token = getBearerToken(req.headers.get('authorization'))
    if (!token) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })

    const supabase = createRequestClient(token)
    if (!supabase) return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 503 })

    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError || !userData?.user) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
    }
    const ownerId = userData.user.id

    const payload = (await req.json().catch(() => ({}))) as { documentId?: unknown; documentType?: unknown }
    const configured = isDocumentIntelligenceConfigured()
    const provider = configured ? getDocumentIntelligenceProvider() : null

    const result = await handleAnalyzeRequest(payload, {
      isAiConfigured: () => configured,
      getDocument: async (documentId) => {
        // RLS on property_documents already restricts rows to owner_id =
        // auth.uid() of the token above — another user's document simply
        // does not come back here, indistinguishable from "doesn't exist".
        const { data } = await supabase.from('property_documents').select('*').eq('id', documentId).single()
        return data || null
      },
      updateDocumentStatus: async (documentId, patch) => {
        await supabase.from('property_documents').update(patch).eq('id', documentId)
      },
      createSignedUrl: async (storagePath) => {
        // Short expiration — this URL is only ever used server-side, immediately, once.
        const { data } = await supabase.storage.from('property-documents').createSignedUrl(storagePath, 60)
        return data?.signedUrl || null
      },
      fetchFileBytes: async (url) => {
        const resp = await fetch(url)
        if (!resp.ok) throw new Error(`download failed (${resp.status})`)
        return resp.arrayBuffer()
      },
      analyze: async (analyzeInput) => {
        if (!provider) throw new Error('AI provider not configured.')
        return analyzeDocument(analyzeInput, provider)
      },
      getNextVersion: async (documentId) => {
        const { data } = await supabase
          .from('document_analyses')
          .select('analysis_version')
          .eq('document_id', documentId)
          .order('analysis_version', { ascending: false })
          .limit(1)
        return (data?.[0]?.analysis_version || 0) + 1
      },
      saveAnalysis: async (row) => {
        const { data } = await supabase
          .from('document_analyses')
          .insert({ ...row, owner_id: ownerId })
          .select('id')
          .single()
        return data || null
      },
      recordUsage: async (row) => {
        await supabase.from('ai_usage_events').insert({ ...row, owner_id: ownerId })
      },
    })

    return NextResponse.json(result.body, { status: result.status })
  } catch (err) {
    console.error('document-intelligence analyze error', err)
    return NextResponse.json({ error: 'Something went wrong analyzing this document.' }, { status: 500 })
  }
}
