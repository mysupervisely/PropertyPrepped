import {describe,it,expect,vi} from 'vitest'
import {prepareTenantMedia,uploadTenantMedia,TENANT_MEDIA_MAX_BYTES} from './media'
import type {SupabaseClient} from '@supabase/supabase-js'

describe('Tenant media',()=>{
  it('supports iPhone videos with a missing MIME type without changing bytes',async()=>{
    const file=new File(['original-video'],'sink.MOV')
    const result=prepareTenantMedia(file)
    expect(result.error).toBeUndefined()
    expect(result.file!.type).toBe('video/quicktime')
    expect(await result.file!.text()).toBe(await file.text())
  })
  it('accepts existing supported photos and videos without unnecessary copies',()=>{
    for(const type of ['image/jpeg','video/mp4','video/webm']) {
      const file=new File(['x'],'media',{type})
      expect(prepareTenantMedia(file).file).toBe(file)
    }
  })
  it('rejects empty, oversized, or unsupported files',()=>{
    expect(prepareTenantMedia(new File([],'empty.jpg',{type:'image/jpeg'})).error).toBeTruthy()
    expect(prepareTenantMedia(new File([new Uint8Array(TENANT_MEDIA_MAX_BYTES+1)],'big.mp4',{type:'video/mp4'})).error).toContain('15 MB')
    expect(prepareTenantMedia(new File(['x'],'script.html',{type:'text/html'})).error).toBeTruthy()
  })
  function fake(rowFails=false,uploadFails=false) {
    const upload=vi.fn(async(_path:string,_file:File)=>({error:uploadFails?{message:'failed'}:null}))
    const remove=vi.fn(async()=>({error:null}))
    const insert=vi.fn(async()=>({error:rowFails?{message:'failed'}:null}))
    const client={storage:{from:()=>({upload,remove})},from:()=>({insert})} as unknown as SupabaseClient
    return {client,upload,insert,remove}
  }
  it('scopes an upload to its conversation and saves video metadata on the same message',async()=>{
    const {client,upload,insert}=fake()
    expect(await uploadTenantMedia(client,'conversation-1','message-1',new File(['x'],'sink.mp4',{type:'video/mp4'}))).toBeNull()
    expect(upload.mock.calls[0][0]).toMatch(/^conversation-1\//)
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({message_id:'message-1',mime_type:'video/mp4',size_bytes:1}))
  })
  it('reports storage failures without linking nonexistent attachments',async()=>{
    const {client,insert}=fake(false,true)
    expect(await uploadTenantMedia(client,'c','m',new File(['x'],'sink.jpg',{type:'image/jpeg'}))).toBeTruthy()
    expect(insert).not.toHaveBeenCalled()
  })
  it('reports metadata failures and attempts to clean up the orphan',async()=>{
    const {client,remove}=fake(true)
    expect(await uploadTenantMedia(client,'c','m',new File(['x'],'sink.jpg',{type:'image/jpeg'}))).toBeTruthy()
    expect(remove).toHaveBeenCalledTimes(1)
  })
})
