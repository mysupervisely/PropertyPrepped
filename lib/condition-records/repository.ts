import type { SupabaseClient } from '@supabase/supabase-js'
import { CONDITIONS_BUCKET, type Inspection, type Media } from './model'

type Failure = { message: string; code?: string }
function fail(error: Failure | null) { if (error) throw Object.assign(new Error(error.message), { code: error.code }) }
export async function loadConditionRecords(client: SupabaseClient, propertyId: string, ownerId: string) {
  async function pages(table: string) { const rows: unknown[] = []; for (let start = 0; ; start += 500) { const result = await client.from(table).select('*').eq('property_id', propertyId).eq('owner_id', ownerId).order('created_at', { ascending: false }).order('id').range(start, start + 499); fail(result.error); rows.push(...(result.data ?? [])); if ((result.data?.length ?? 0) < 500) break } return rows }
  const [records, media] = await Promise.all([pages('condition_inspections'), pages('condition_media')])
  return { records: records as Inspection[], media: media as Media[] }
}
export type NewInspection = Pick<Inspection, 'id' | 'owner_id' | 'property_id' | 'lease_id' | 'stage' | 'inspected_on' | 'inspector' | 'checklist' | 'rooms' | 'baseline_id' | 'amendment_of' | 'amendment_note' | 'template_version'>
export async function createInspection(client: SupabaseClient, input: NewInspection): Promise<Inspection> {
  try { const result = await client.from('condition_inspections').insert(input).select().single(); if (!result.error && result.data) return result.data as Inspection; fail(result.error) } catch (error) {
    const found = await client.from('condition_inspections').select('*').eq('id', input.id).eq('owner_id', input.owner_id).maybeSingle()
    if (!found.error && found.data) {
      if (found.data.property_id !== input.property_id || found.data.lease_id !== input.lease_id || found.data.stage !== input.stage || found.data.amendment_of !== input.amendment_of) throw new Error('A record with this identifier was already saved with different details. Reload saved records before continuing.')
      return found.data as Inspection
    }
    throw error
  }
  throw new Error('The new record could not be confirmed. Reload records before creating another.')
}
export type DraftPatch = Pick<Inspection, 'inspected_on' | 'inspector' | 'lease_id' | 'rooms' | 'checklist' | 'amendment_note' | 'baseline_id'> & { status?: 'draft' | 'finalized' }
export async function saveInspection(client: SupabaseClient, record: Inspection, patch: DraftPatch): Promise<Inspection> {
  const result = await client.from('condition_inspections').update(patch).eq('id', record.id).eq('owner_id', record.owner_id).eq('version', record.version).eq('status', 'draft').select().maybeSingle()
  fail(result.error)
  if (!result.data) throw new Error('This record changed in another session. Your edits are still here. Reload saved records before retrying.')
  return result.data as Inspection
}
export async function reserveConditionMedia(client: SupabaseClient, input: Omit<Media, 'created_at' | 'status'>): Promise<Media> {
  try { const result = await client.from('condition_media').insert({ ...input, status: 'pending' }).select().single(); fail(result.error); return result.data as Media } catch (error) {
    const found = await client.from('condition_media').select('*').eq('id', input.id).eq('owner_id', input.owner_id).maybeSingle()
    if (!found.error && found.data && found.data.storage_path === input.storage_path) return found.data as Media
    throw error
  }
}
export async function confirmConditionMedia(client: SupabaseClient, media: Media): Promise<Media> {
  if (media.status === 'ready') return media
  const result = await client.from('condition_media').update({ status: 'ready' }).eq('id', media.id).eq('owner_id', media.owner_id).eq('status', 'pending').select().maybeSingle(); fail(result.error)
  if (result.data) return result.data as Media
  const found = await client.from('condition_media').select('*').eq('id', media.id).eq('owner_id', media.owner_id).single(); fail(found.error)
  if (found.data?.status === 'ready') return found.data as Media
  throw new Error('The uploaded file could not be verified. Keep or remove the pending upload before finalizing.')
}
export async function uploadConditionMedia(client: SupabaseClient, media: Media, file: File): Promise<Media> {
  // Never overwrite an existing object or retry bytes automatically. Confirmation
  // is a server-side metadata check, also useful after a lost upload response.
  let uploadError: unknown = null
  try { const result = await client.storage.from(CONDITIONS_BUCKET).upload(media.storage_path, file, { contentType: media.mime_type, upsert: false }); uploadError = result.error } catch (error) { uploadError = error }
  try { return await confirmConditionMedia(client, media) } catch (error) {
    if (uploadError) throw new Error('The upload could not be confirmed. Use Check upload or remove the pending file before selecting it again.')
    throw error
  }
}
export async function removeConditionMedia(client: SupabaseClient, media: Media): Promise<void> {
  // Persist a removal reservation under the inspection lock BEFORE asking
  // Storage to delete bytes. Finalization rejects this state across HTTP calls.
  const reservation = await client.from('condition_media').update({ status: 'removing' }).eq('id', media.id).eq('owner_id', media.owner_id).select().single(); fail(reservation.error)
  if (!reservation.data) throw new Error('Could not reserve file removal. No file was removed.')
  const storage = await client.storage.from(CONDITIONS_BUCKET).remove([media.storage_path]); fail(storage.error)
  // Only remove the reference after storage confirms deletion. A failed or lost
  // response retains the reference for explicit recovery instead of hiding it.
  const result = await client.from('condition_media').delete().eq('id', media.id).eq('owner_id', media.owner_id); fail(result.error)
}
