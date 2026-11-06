import type { SupabaseClient } from '@supabase/supabase-js'
export const TENANT_MEDIA_MAX_BYTES = 15 * 1024 * 1024
export const TENANT_MEDIA_TYPES = ['image/jpeg','image/png','image/webp','image/heic','image/heif','video/mp4','video/quicktime','video/webm']
const extensions: Record<string,string> = {jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',heic:'image/heic',heif:'image/heif',mp4:'video/mp4',mov:'video/quicktime',webm:'video/webm'}
export function prepareTenantMedia(file: File): {file: File; error?: never} | {error: string; file?: never} {
  const type = file.type || extensions[file.name.split('.').pop()?.toLowerCase() || '']
  if (!file.size) return {error:'This file is empty. Please choose it again.'}
  if (file.size > TENANT_MEDIA_MAX_BYTES) return {error:'Choose a photo or short video under 15 MB.'}
  if (!TENANT_MEDIA_TYPES.includes(type)) return {error:'Choose a JPG, PNG, WebP, HEIC photo or MP4, MOV, WebM video.'}
  return {file:file.type===type ? file : new File([file],file.name,{type})}
}
export async function uploadTenantMedia(client: SupabaseClient, conversationId: string, messageId: string, file: File): Promise<string | null> {
  const prepared=prepareTenantMedia(file)
  if (prepared.error) return prepared.error
  const media=prepared.file!
  const path=`${conversationId}/${crypto.randomUUID()}.${media.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g,'') || 'bin'}`
  try {
    const {error}=await client.storage.from('tenant-connect-attachments').upload(path,media)
    if(error) return 'The file could not upload. Your message was saved; please attach the file again.'
    const {error:rowError}=await client.from('property_message_attachments').insert({message_id:messageId,storage_path:path,mime_type:media.type,size_bytes:media.size})
    if(rowError) { await client.storage.from('tenant-connect-attachments').remove([path]); return 'The file could not be linked to your message. Please attach it again.' }
    return null
  } catch { return 'The file could not upload. Your message was saved; please attach the file again.' }
}
export type TenantMediaLink = {url:string; mimeType:string | null}
