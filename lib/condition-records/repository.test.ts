import { expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createInspection, removeConditionMedia, saveInspection, uploadConditionMedia, type NewInspection } from './repository'
import type { Inspection, Media } from './model'

function fake(results: unknown[], storageResult = { error: null } as unknown) {
  const calls: unknown[][] = []
  const chain: Record<string, unknown> = {}
  for (const name of ['select','insert','update','delete','eq','single','maybeSingle']) chain[name] = (...args: unknown[]) => { calls.push([name,...args]); return chain }
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(results.shift()).then(resolve)
  const client = { from: (table: string) => { calls.push(['from',table]); return chain }, storage: { from: () => ({ upload: (...args: unknown[]) => { calls.push(['upload',...args]); return Promise.resolve(storageResult) }, remove: (...args: unknown[]) => { calls.push(['remove',...args]); return Promise.resolve(storageResult) } }) } } as unknown as SupabaseClient
  return { client, calls }
}
const file = { id:'media', inspection_id:'record', owner_id:'owner', property_id:'property', storage_path:'private/path', mime_type:'image/jpeg', status:'pending' } as Media
it('reserves removal before deleting bytes and only then deletes the reference', async () => {
  const {client,calls}=fake([{data:file,error:null},{error:null}])
  await removeConditionMedia(client,file)
  const names=calls.map(row=>row[0])
  expect(names.indexOf('update')).toBeLessThan(names.indexOf('remove'))
  expect(names.indexOf('remove')).toBeLessThan(names.indexOf('delete'))
  expect(calls).toContainEqual(['update',{status:'removing'}])
})
it('retains the reference when Storage removal fails and never touches bytes when reservation fails', async () => {
  const failed=fake([{data:file,error:null}],{error:{message:'offline'}})
  await expect(removeConditionMedia(failed.client,file)).rejects.toThrow('offline')
  expect(failed.calls.some(row=>row[0]==='delete')).toBe(false)
  const denied=fake([{data:null,error:{message:'read-only'}}])
  await expect(removeConditionMedia(denied.client,file)).rejects.toThrow('read-only')
  expect(denied.calls.some(row=>row[0]==='remove')).toBe(false)
})
it('checks server metadata after a lost upload response without overwriting or retrying bytes', async () => {
  const {client,calls}=fake([{data:{...file,status:'ready'},error:null}],{error:{message:'lost response'}})
  const result=await uploadConditionMedia(client,file,{} as File)
  expect(result.status).toBe('ready')
  expect(calls.filter(row=>row[0]==='upload')).toHaveLength(1)
  expect(calls.find(row=>row[0]==='upload')?.[3]).toEqual({contentType:'image/jpeg',upsert:false})
})
it('keeps failed upload reservations visible for explicit recovery', async () => {
  const {client,calls}=fake([{data:null,error:{message:'object missing'}}],{error:{message:'offline'}})
  await expect(uploadConditionMedia(client,file,{} as File)).rejects.toThrow('Check upload')
  expect(calls.some(row=>row[0]==='delete')).toBe(false)
})
it('uses optimistic draft versions and reports conflicts without retrying or discarding edits', async () => {
  const {client,calls}=fake([{data:null,error:null}])
  await expect(saveInspection(client,{id:'record',owner_id:'owner',version:7} as Inspection,{} as never)).rejects.toThrow('another session')
  expect(calls).toContainEqual(['eq','version',7]); expect(calls).toContainEqual(['eq','status','draft'])
  expect(calls.filter(row=>row[0]==='update')).toHaveLength(1)
})
it('does not silently reuse a recovered creation for a different property or lease', async () => {
  const input={id:'record',owner_id:'owner',property_id:'property',lease_id:'lease',stage:'move_in',amendment_of:null} as NewInspection
  const {client}=fake([{data:null,error:{message:'lost response'}},{data:{...input,lease_id:'different'},error:null}])
  await expect(createInspection(client,input)).rejects.toThrow('different details')
})
