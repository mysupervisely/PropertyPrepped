'use client'
import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PropertyMessage } from '../../lib/tenant-connect/types'
import { prepareTenantMedia, uploadTenantMedia, type TenantMediaLink } from '../../lib/tenant-connect/media'
import { TenantMediaPreview } from './TenantMediaPreview'

export function TenantLandlordMessages({client, propertyId, ownerId, accessId}: {client:SupabaseClient;propertyId:string;ownerId:string;accessId:string}) {
  const [conversation,setConversation]=useState<string|null>(null)
  const [messages,setMessages]=useState<PropertyMessage[]>([])
  const [media,setMedia]=useState<Record<string,TenantMediaLink[]>>({})
  const [text,setText]=useState('')
  const [file,setFile]=useState<File|null>(null)
  const [busy,setBusy]=useState(false)
  const [notice,setNotice]=useState('')
  const [error,setError]=useState('')
  async function load(id?:string) {
    let selected=id
    if(!selected) {
      const {data,error}=await client.from('property_conversations').select('id').eq('tenant_access_id',accessId).eq('conversation_type','General').eq('status','Open').order('created_at',{ascending:false}).limit(1)
      if(error) throw error
      selected=data?.[0]?.id
    }
    if(!selected) return
    setConversation(selected)
    const {data,error}=await client.from('property_messages').select('*').eq('conversation_id',selected).order('created_at',{ascending:true})
    if(error) throw error
    const rows=(data||[]) as PropertyMessage[]
    setMessages(rows)
    if(!rows.length) {setMedia({});return}
    const {data:attachments}=await client.from('property_message_attachments').select('message_id,storage_path,mime_type').in('message_id',rows.map(m=>m.id))
    const next:Record<string,TenantMediaLink[]>={}
    for(const attachment of attachments||[]) {
      const {data}=await client.storage.from('tenant-connect-attachments').createSignedUrl(attachment.storage_path,3600)
      if(data?.signedUrl) (next[attachment.message_id] ||= []).push({url:data.signedUrl,mimeType:attachment.mime_type})
    }
    setMedia(next)
  }
  useEffect(()=>{ void load().catch(()=>setError('Could not load messages. Please refresh and try again.')) },[accessId])
  async function send() {
    if(busy||(!text.trim()&&!file))return
    setBusy(true);setError('');setNotice('')
    try {
      const {data:{user}}=await client.auth.getUser()
      if(!user)throw new Error('Please sign in again.')
      let id=conversation
      if(!id) {
        const {data,error}=await client.from('property_conversations').insert({property_id:propertyId,owner_id:ownerId,tenant_access_id:accessId,subject:'Tenant message',conversation_type:'General',status:'Open'}).select('id').single()
        if(error||!data)throw new Error('Could not start the conversation.')
        id=data.id as string;setConversation(id)
      }
      const {data,error}=await client.from('property_messages').insert({conversation_id:id,sender_user_id:user.id,sender_role:'Tenant',message:text.trim()||'Photo or video attached.'}).select('id').single()
      if(error||!data)throw new Error('Could not send your message. Please try again.')
      const uploadError=file ? await uploadTenantMedia(client,id,data.id,file) : null
      setText('');if(!uploadError)setFile(null)
      setNotice('Message saved to your landlord’s Tenant Connect inbox.');if(uploadError)setError(uploadError)
      await load(id)
    }catch(e){setError(e instanceof Error?e.message:'Could not send your message.')}
    finally {setBusy(false)}
  }
  return <section className="tenantPortalSection tenantMessageCard">
    <div className="tenantPortalSectionHead"><h2>Contact landlord</h2><button className="secondary" disabled={busy} onClick={()=>void load().catch(()=>setError('Could not refresh messages.'))}>Refresh</button></div>
    <p className="muted">Ask a question or send a photo. For repairs, use Request maintenance so your landlord can track the issue.</p>
    <div className="tenantConnectThread">{messages.map(m=><div className={`tenantConnectBubble tenantConnectBubble${m.sender_role}`} key={m.id}><div className="tenantConnectBubbleMeta"><strong>{m.sender_role==='Owner'?'Landlord':'You'}</strong><span>{new Date(m.created_at).toLocaleString()}</span></div><p>{m.message}</p><div className="tenantConnectBubbleAttachments">{(media[m.id]||[]).map(item=><TenantMediaPreview key={item.url} media={item}/>)}</div></div>)}</div>
    <label className="tenantMessageLabel" htmlFor="tenant-landlord-message">Your message</label><textarea id="tenant-landlord-message" value={text} onChange={e=>setText(e.target.value)} placeholder="How can your landlord help?" rows={3}/>
    <div className="tenantConnectComposeRow"><label className="secondary tenantConnectAttachLabel">{file?file.name:'Add photo or video'}<input hidden type="file" accept="image/*,video/mp4,video/quicktime,video/webm" disabled={busy} onChange={e=>{const picked=e.currentTarget.files?.[0];e.currentTarget.value='';if(!picked)return;const prepared=prepareTenantMedia(picked);if(prepared.error)setError(prepared.error);else{setFile(prepared.file!);setError('')}}}/></label>{file&&<button className="secondary" onClick={()=>setFile(null)}>Remove</button>}<button className="primary" disabled={busy||(!text.trim()&&!file)} onClick={()=>void send()}>{busy?'Sending…':'Send message'}</button></div>
    <p className="tenantMediaHint">Photos and short videos up to 15 MB. For emergencies, call emergency services or your landlord directly.</p>
    {notice&&<p className="statusMessage" role="status">{notice}</p>}{error&&<p className="errorMessage" role="alert">{error}</p>}
  </section>
}
