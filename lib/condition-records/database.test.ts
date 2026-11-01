import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'

it('enforces ownership, lease isolation, upload verification, finalization, amendments and retention in PostgreSQL', async () => {
  const db = new PGlite()
  const A='10000000-0000-4000-8000-000000000001', B='10000000-0000-4000-8000-000000000002', P='20000000-0000-4000-8000-000000000001', Q='20000000-0000-4000-8000-000000000002', L='30000000-0000-4000-8000-000000000001', K='30000000-0000-4000-8000-000000000002', I='40000000-0000-4000-8000-000000000001', M='50000000-0000-4000-8000-000000000001'
  try {
    await db.exec(`create role authenticated; create role anon; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
      create table public.properties(id uuid primary key,owner_id uuid,address text default 'Original address',city text default 'City'); create table public.leases(id uuid primary key,property_id uuid,owner_id uuid,tenant_name text default 'Original tenant',start_date date default '2026-01-01',end_date date default '2026-12-31'); grant select,update,delete on public.properties,public.leases to authenticated;
      create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb); alter table storage.objects enable row level security; grant usage on schema storage to authenticated; grant select,insert,update,delete on storage.objects to authenticated;
      insert into auth.users values('${A}'),('${B}'); insert into public.properties(id,owner_id) values('${P}','${A}'),('${Q}','${B}'); insert into public.leases(id,property_id,owner_id) values('${L}','${P}','${A}'),('${K}','${Q}','${B}');`)
    const migration=readFileSync(join(__dirname,'../../supabase/milestone-36-condition-records.sql'),'utf8')
    await db.exec(migration); await db.exec(migration) // Re-running setup preserves data and policies.
    async function as(user: string) { await db.exec(`reset role; select set_config('request.jwt.claim.sub','${user}',false); set role authenticated;`) }
    await as(A)
    const tasks=JSON.stringify([{id:'task',label:'Inspect blinds',section:'Walkthrough',status:'todo',notes:'',due_on:''}]), rooms=JSON.stringify([{id:'room',name:'Bedroom',condition:'good',notes:'Blinds intact'}])
    await expect(db.query(`insert into public.condition_inspections(owner_id,property_id,lease_id,stage,checklist,rooms) values($1,$2,$3,'move_in',$4,$5)`,[A,Q,K,tasks,rooms])).rejects.toThrow(/Property/)
    await expect(db.query(`insert into public.condition_inspections(owner_id,property_id,lease_id,stage,checklist,rooms) values($1,$2,$3,'move_in',$4,$5)`,[A,P,K,tasks,rooms])).rejects.toThrow(/Lease/)
    await db.query(`insert into public.condition_inspections(id,owner_id,property_id,lease_id,stage,inspector,checklist,rooms) values($1,$2,$3,$4,'move_in','Owner',$5,$6)`,[I,A,P,L,tasks,rooms])
    await expect(db.exec(`update public.condition_inspections set status='finalized' where id='${I}'`)).rejects.toThrow(/checklist/)
    await db.exec(`update public.condition_inspections set checklist='[{"id":"task","label":"Inspect blinds","section":"Walkthrough","status":"done","notes":"","due_on":"","completed_at":"1900-01-01","completed_by":"${B}"}]' where id='${I}'`)
    const task=(await db.query<{checklist:{completed_by:string;completed_at:string}[]}>(`select checklist from public.condition_inspections where id='${I}'`)).rows[0].checklist[0]
    expect(task.completed_by).toBe(A); expect(task.completed_at).not.toContain('1900')
    const path=`${A}/${P}/${I}/${M}`
    await db.query(`insert into public.condition_media(id,inspection_id,property_id,owner_id,room_id,storage_path,original_name,mime_type,size_bytes) values($1,$2,$3,$4,'room',$5,'Blinds.jpg','image/jpeg',20)`,[M,I,P,A,path])
    await expect(db.exec(`update public.condition_media set status='ready' where id='${M}'`)).rejects.toThrow(/metadata/)
    await expect(db.exec(`update public.condition_inspections set status='finalized' where id='${I}'`)).rejects.toThrow(/unfinished uploads/)
    await db.query(`insert into storage.objects(bucket_id,name,metadata) values('condition-record-media',$1,'{"size":20,"mimetype":"image/jpeg"}')`,[path])
    await db.exec(`update public.condition_media set status='ready' where id='${M}'`)
    expect((await db.query(`delete from storage.objects where name=$1`,[path])).affectedRows).toBe(0)
    await expect(db.exec(`delete from public.condition_media where id='${M}'`)).rejects.toThrow(/stored file/)
    await as(B)
    expect((await db.exec(`select * from public.condition_inspections; select * from public.condition_media; select * from storage.objects; select * from public.condition_record_events;`)).every(result=>result.rows.length===0)).toBe(true)
    expect((await db.exec(`update public.condition_inspections set inspector='Intruder' where id='${I}'`))[0].affectedRows).toBe(0)
    await expect(db.query(`insert into storage.objects(bucket_id,name,metadata) values('condition-record-media',$1,'{}')`,[path+'x'])).rejects.toThrow()
    await as(A)
    await db.exec(`update public.condition_inspections set status='finalized' where id='${I}'`)
    await expect(db.exec(`update public.condition_inspections set inspector='Changed' where id='${I}'`)).rejects.toThrow(/read-only/)
    await expect(db.exec(`update public.condition_media set status='removing' where id='${M}'`)).rejects.toThrow(/owned draft/)
    expect((await db.query(`delete from storage.objects where name=$1`,[path])).affectedRows).toBe(0)
    expect((await db.query('select * from storage.objects')).rows).toHaveLength(1)
    await db.exec('reset role;')
    await db.exec(`create policy legacy_permissive_delete on storage.objects for delete to authenticated using(true); create policy legacy_permissive_read on storage.objects for select to authenticated using(true);`)
    await as(B)
    expect((await db.exec('select * from storage.objects'))[0].rows).toHaveLength(0)
    await as(A)
    expect((await db.query(`delete from storage.objects where name=$1`,[path])).affectedRows).toBe(0)
    const frozen = (await db.query<{lease_snapshot:{tenant_name:string};property_label_snapshot:string}>(`select lease_snapshot,property_label_snapshot from public.condition_inspections where id='${I}'`)).rows[0]
    expect(frozen.lease_snapshot.tenant_name).toBe('Original tenant')
    expect(frozen.property_label_snapshot).toBe('Original address, City')
    await expect(db.exec(`delete from public.properties where id='${P}'`)).rejects.toThrow()
    await expect(db.exec(`delete from public.leases where id='${L}'`)).rejects.toThrow()
    await expect(db.exec(`update public.leases set property_id='${Q}' where id='${L}'`)).rejects.toThrow()
    const amend='40000000-0000-4000-8000-000000000002'
    await db.query(`insert into public.condition_inspections(id,owner_id,property_id,lease_id,stage,inspector,checklist,rooms,amendment_of,amendment_note) select $1,owner_id,property_id,lease_id,stage,inspector,checklist,rooms,id,'Corrected notes' from public.condition_inspections where id=$2`,[amend,I])
    await db.exec(`update public.condition_inspections set status='finalized' where id='${amend}'`)
    const audit=await db.query(`select * from public.condition_record_events where inspection_id='${I}'`); expect(audit.rows.length).toBe(3)
    const out='40000000-0000-4000-8000-000000000003'
    await db.query(`insert into public.condition_inspections(id,owner_id,property_id,lease_id,stage,inspector,checklist,rooms,baseline_id) values($1,$2,$3,$4,'move_out','Owner',$5,$6,$7)`,[out,A,P,L,tasks,rooms,I])
    await expect(db.query(`insert into public.condition_inspections(owner_id,property_id,lease_id,stage,checklist,rooms,baseline_id) values($1,$2,$3,'move_out',$4,$5,$6)`,[A,P,K,tasks,rooms,I])).rejects.toThrow(/Lease/)
    const removal='50000000-0000-4000-8000-000000000002', removalPath=`${A}/${P}/${out}/${removal}`
    await db.query(`insert into public.condition_media(id,inspection_id,property_id,owner_id,room_id,storage_path,original_name,mime_type,size_bytes) values($1,$2,$3,$4,'room',$5,'Draft.jpg','image/jpeg',20)`,[removal,out,P,A,removalPath])
    await db.query(`insert into storage.objects(bucket_id,name,metadata) values('condition-record-media',$1,'{"size":20,"mimetype":"image/jpeg"}')`,[removalPath])
    await db.exec(`update public.condition_media set status='ready' where id='${removal}'; update public.condition_media set status='removing' where id='${removal}';`)
    expect((await db.query(`delete from storage.objects where name=$1`,[removalPath])).affectedRows).toBe(1)
    await db.exec(`delete from public.condition_media where id='${removal}'`)
    await db.exec('reset role; set role anon;'); await expect(db.exec('select * from public.condition_inspections')).rejects.toThrow()
  } finally { await db.close() }
},30000)
