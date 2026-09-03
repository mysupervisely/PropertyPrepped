// PropRoster Milestone 27 — Guided Maintenance Intake M2 V1: submission.
//
// Reuses the EXACT SAME sequential-insert pattern
// app/tenant/page.tsx's pre-existing submitRequest() already used
// (property_conversations -> property_messages -> tenant_requests),
// extracted here so it's testable and so the guided-intake UI and the
// (still-available) plain-text path share one implementation. Extends
// that sequence with the M2-specific steps: create the
// maintenance_intake_sessions row (Section 10: "preserve the guided
// intake session/answers"), bulk-insert maintenance_intake_answers, and
// optionally attach photos via the EXISTING tenant-connect-attachments
// storage bucket/property_message_attachments table (Section 8 — no
// new upload architecture).
//
// Section 10's other requirement — "do not create a second maintenance
// case client-side" — is satisfied by construction: this module never
// inserts into public.maintenance_requests at all. The single
// tenant_requests insert below is the only write that can ever create a
// canonical case, and it does so exactly once via the
// tenant_requests_create_maintenance_case() trigger
// (milestone-26-canonical-maintenance-case.sql) — there is no code path
// here that could create a second one.
//
// Every insert here relies entirely on RLS for its security boundary,
// exactly like the pre-existing plain-text submission path — this
// module never uses a service-role key and never runs on the server.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { MaintenanceCategoryId } from '../categories'
import type { AnsweredStep } from './engine'

export type IntakePhoto = { file: File }

export type SubmitGuidedIntakeParams = {
  supabase: SupabaseClient
  propertyId: string
  ownerId: string
  tenantAccessId: string
  category: MaintenanceCategoryId
  treeVersion: string
  title: string
  description: string
  answeredSteps: AnsweredStep[]
  outcome: 'escalated_urgent' | 'escalated_to_dispatch'
  photos?: IntakePhoto[]
}

export type SubmitGuidedIntakeResult =
  | { ok: true; tenantRequestId: string; conversationId: string }
  | { ok: false; error: string }

/**
 * Creates the tenant's submission end to end: conversation, initial
 * message (the structured summary), the tenant_requests row (which the
 * M26 trigger turns into exactly one canonical maintenance_requests
 * case), the intake session, its answers, and any attached photos.
 * Stops and reports the first failure — same non-transactional,
 * sequential-insert contract app/tenant/page.tsx's plain-text path
 * already had; RLS is what actually keeps every write correctly
 * scoped, not client-side sequencing.
 */
export async function submitGuidedIntake(params: SubmitGuidedIntakeParams): Promise<SubmitGuidedIntakeResult> {
  const { supabase, propertyId, ownerId, tenantAccessId, category, treeVersion, title, description, answeredSteps, outcome, photos } = params

  const { data: userData } = await supabase.auth.getUser()
  const senderUserId = userData.user?.id

  const { data: conv, error: convErr } = await supabase
    .from('property_conversations')
    .insert({ property_id: propertyId, owner_id: ownerId, tenant_access_id: tenantAccessId, subject: title, conversation_type: 'Maintenance' })
    .select('id')
    .single()
  if (convErr || !conv) return { ok: false, error: convErr?.message || 'Could not start the request.' }
  const conversationId = conv.id as string

  const { data: msg, error: msgErr } = await supabase
    .from('property_messages')
    .insert({ conversation_id: conversationId, sender_user_id: senderUserId, sender_role: 'Tenant', message: description })
    .select('id')
    .single()
  if (msgErr || !msg) return { ok: false, error: msgErr?.message || 'Could not submit your report.' }
  const messageId = msg.id as string

  const { data: request, error: reqErr } = await supabase
    .from('tenant_requests')
    .insert({ property_id: propertyId, owner_id: ownerId, tenant_access_id: tenantAccessId, conversation_id: conversationId, category, title, description })
    .select('id')
    .single()
  if (reqErr || !request) return { ok: false, error: reqErr?.message || 'Could not submit your report.' }
  const tenantRequestId = request.id as string

  const { data: session, error: sessionErr } = await supabase
    .from('maintenance_intake_sessions')
    .insert({ request_id: tenantRequestId, owner_id: ownerId, tenant_access_id: tenantAccessId, tree_version: treeVersion, completed_at: new Date().toISOString(), outcome })
    .select('id')
    .single()
  // The request itself is already safely submitted at this point — a
  // session/answers failure is logged but never rolls back or hides the
  // tenant's already-created request from them (same "an email failure
  // must never take back a real write" principle notify.ts already
  // documents for this feature).
  if (!sessionErr && session) {
    const sessionId = session.id as string
    if (answeredSteps.length) {
      const answerRows = answeredSteps.map(({ step, value }) => ({
        session_id: sessionId,
        owner_id: ownerId,
        tenant_access_id: tenantAccessId,
        question_key: step.question.key,
        safety_class: step.question.safetyClass,
        answer_value: { value },
      }))
      await supabase.from('maintenance_intake_answers').insert(answerRows)
    }
  } else if (sessionErr) {
    console.error('guided intake: failed to persist intake session (request was still submitted)', sessionErr)
  }

  if (photos?.length) {
    for (const photo of photos) {
      const path = `${conversationId}/${crypto.randomUUID()}-${photo.file.name}`
      const { error: uploadErr } = await supabase.storage.from('tenant-connect-attachments').upload(path, photo.file)
      if (!uploadErr) {
        await supabase.from('property_message_attachments').insert({ message_id: messageId, storage_path: path, mime_type: photo.file.type, size_bytes: photo.file.size })
      } else {
        console.error('guided intake: photo upload failed (request was still submitted)', uploadErr)
      }
    }
  }

  return { ok: true, tenantRequestId, conversationId }
}
