-- PropRoster M36: private, landlord-only lease condition records.
-- Run as the database owner. Existing data is not modified.
begin;
create table if not exists public.condition_inspections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  lease_id uuid references public.leases(id) on delete restrict,
  stage text not null check(stage in ('move_in','move_out')),
  inspected_on date not null default current_date,
  inspector text not null default '' check(length(inspector)<=200),
  status text not null default 'draft' check(status in ('draft','finalized')),
  checklist jsonb not null default '[]', rooms jsonb not null default '[]',
  baseline_id uuid references public.condition_inspections(id) on delete restrict,
  amendment_of uuid references public.condition_inspections(id) on delete restrict,
  amendment_note text not null default '' check(length(amendment_note)<=4000),
  template_version integer not null default 1,
  version integer not null default 1,
  created_at timestamptz not null default now(), finalized_at timestamptz,
  lease_snapshot jsonb not null default '{}', property_label_snapshot text not null default '',
  check(pg_column_size(checklist)+pg_column_size(rooms)<524288)
);
-- Composite references keep retained inspections attached to the original
-- property/owner even if another screen attempts to move a lease later.
create unique index if not exists condition_properties_owner_key on public.properties(id,owner_id);
create unique index if not exists condition_leases_property_owner_key on public.leases(id,property_id,owner_id);
do $$ begin
  if not exists(select 1 from pg_constraint where conname='condition_inspection_property_owner_fk' and conrelid='public.condition_inspections'::regclass) then alter table public.condition_inspections add constraint condition_inspection_property_owner_fk foreign key(property_id,owner_id) references public.properties(id,owner_id) on delete restrict; end if;
  if not exists(select 1 from pg_constraint where conname='condition_inspection_lease_property_owner_fk' and conrelid='public.condition_inspections'::regclass) then alter table public.condition_inspections add constraint condition_inspection_lease_property_owner_fk foreign key(lease_id,property_id,owner_id) references public.leases(id,property_id,owner_id) on delete restrict; end if;
end $$;
create table if not exists public.condition_media (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.condition_inspections(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  owner_id uuid not null references auth.users(id) on delete restrict,
  room_id text not null, storage_path text not null unique,
  original_name text not null check(length(original_name) between 1 and 500),
  mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp','image/heic','image/heif','video/mp4','video/quicktime','video/webm')),
  size_bytes bigint not null check(size_bytes>0 and size_bytes<=52428800),
  status text not null default 'pending' check(status in ('pending','ready','removing')),
  captured_on date, created_at timestamptz not null default now(),
  check(mime_type like 'video/%' or size_bytes<=20971520)
);
create table if not exists public.condition_record_events (
  id bigint generated always as identity primary key,
  inspection_id uuid not null references public.condition_inspections(id) on delete restrict,
  actor_id uuid not null, occurred_at timestamptz not null default now(),
  version integer not null, snapshot jsonb not null
);
create index if not exists condition_inspections_property_idx on public.condition_inspections(property_id, owner_id);
create index if not exists condition_media_inspection_idx on public.condition_media(inspection_id);
create index if not exists condition_events_inspection_idx on public.condition_record_events(inspection_id);
create index if not exists condition_inspections_owner_idx on public.condition_inspections(owner_id);
create index if not exists condition_inspections_lease_idx on public.condition_inspections(lease_id,property_id,owner_id);
create index if not exists condition_inspections_baseline_idx on public.condition_inspections(baseline_id);
create index if not exists condition_inspections_amendment_idx on public.condition_inspections(amendment_of);
create index if not exists condition_media_property_owner_idx on public.condition_media(property_id,owner_id);
create index if not exists condition_media_owner_idx on public.condition_media(owner_id);
alter table public.condition_inspections enable row level security;
alter table public.condition_media enable row level security;
alter table public.condition_record_events enable row level security;
grant select,insert,update on public.condition_inspections to authenticated;
grant select,insert,update,delete on public.condition_media to authenticated;
grant select on public.condition_record_events to authenticated;
-- No inspection DELETE grant. Records survive lease expiry and block destructive parent deletion.
drop policy if exists condition_owner_read on public.condition_inspections;
create policy condition_owner_read on public.condition_inspections for select to authenticated using(owner_id=(select auth.uid()));
drop policy if exists condition_owner_insert on public.condition_inspections;
create policy condition_owner_insert on public.condition_inspections for insert to authenticated with check(owner_id=(select auth.uid()));
drop policy if exists condition_owner_update on public.condition_inspections;
create policy condition_owner_update on public.condition_inspections for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
drop policy if exists condition_media_owner on public.condition_media;
create policy condition_media_owner on public.condition_media for all to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
drop policy if exists condition_events_owner on public.condition_record_events;
create policy condition_events_owner on public.condition_record_events for select to authenticated using(exists(select 1 from public.condition_inspections i where i.id=inspection_id and i.owner_id=(select auth.uid())));

create or replace function public.guard_condition_inspection() returns trigger
language plpgsql security definer set search_path='' as $$
declare item jsonb; previous jsonb; normalized jsonb='[]'; parent public.condition_inspections; ids uuid[]; room jsonb;
begin
  if auth.uid() is null or new.owner_id<>auth.uid() then raise exception 'Owner access required'; end if;
  if not exists(select 1 from public.properties p where p.id=new.property_id and p.owner_id=auth.uid()) then raise exception 'Property does not belong to this owner'; end if;
  if new.lease_id is not null and not exists(select 1 from public.leases l where l.id=new.lease_id and l.property_id=new.property_id and l.owner_id=auth.uid()) then raise exception 'Lease must belong to this property and owner'; end if;
  if tg_op='UPDATE' then
    if old.status='finalized' then raise exception 'Finalized reports are read-only. Create an amendment.'; end if;
    if (new.id,new.owner_id,new.property_id,new.stage,new.amendment_of,new.created_at,new.template_version) is distinct from (old.id,old.owner_id,old.property_id,old.stage,old.amendment_of,old.created_at,old.template_version) then raise exception 'Inspection identity cannot be changed'; end if;
    if new.lease_id is distinct from old.lease_id and old.lease_id is not null and exists(select 1 from public.condition_media m where m.inspection_id=new.id) then raise exception 'Lease cannot change after media has been attached'; end if;
    new.version=old.version+1; new.lease_snapshot=old.lease_snapshot; new.property_label_snapshot=old.property_label_snapshot;
  else
    if new.status<>'draft' then raise exception 'Create a draft first'; end if;
    new.version=1; new.created_at=clock_timestamp(); new.finalized_at=null; new.lease_snapshot='{}'; new.property_label_snapshot='';
  end if;
  if new.amendment_of is not null then
    select * into parent from public.condition_inspections where id=new.amendment_of;
    if not found or parent.status<>'finalized' or parent.owner_id<>new.owner_id or parent.property_id<>new.property_id or parent.lease_id is distinct from new.lease_id or parent.stage<>new.stage or new.id=new.amendment_of or length(trim(new.amendment_note))=0 then raise exception 'Amendments require a finalized report of the same lease and stage, and a reason'; end if;
  end if;
  if new.baseline_id is not null then
    select * into parent from public.condition_inspections where id=new.baseline_id;
    if not found or new.stage<>'move_out' or new.lease_id is null or parent.status<>'finalized' or parent.stage<>'move_in' or parent.owner_id<>new.owner_id or parent.property_id<>new.property_id or parent.lease_id is distinct from new.lease_id or parent.inspected_on>new.inspected_on then raise exception 'Baseline must be a finalized move-in report for the same lease'; end if;
  end if;
  if jsonb_typeof(new.checklist)<>'array' or jsonb_array_length(new.checklist)>200 or jsonb_typeof(new.rooms)<>'array' or jsonb_array_length(new.rooms)>100 then raise exception 'Invalid checklist or rooms'; end if;
  if exists(select 1 from jsonb_array_elements(new.checklist) e group by e->>'id' having count(*)>1) or exists(select 1 from jsonb_array_elements(new.rooms) e group by e->>'id' having count(*)>1) then raise exception 'Duplicate task or room IDs'; end if;
  for item in select * from jsonb_array_elements(new.checklist) loop
    if jsonb_typeof(item)<>'object' or jsonb_typeof(item->'id')<>'string' or jsonb_typeof(item->'label')<>'string' or jsonb_typeof(coalesce(item->'notes','""'::jsonb))<>'string' or coalesce(item->>'section','') not in ('Before','Walkthrough','After','Custom') or coalesce(length(item->>'id'),0) not between 1 and 100 or coalesce(length(trim(item->>'label')),0) not between 1 and 300 or coalesce(item->>'status','') not in ('todo','done','na') or length(coalesce(item->>'notes',''))>8000 or length(coalesce(item->>'section',''))>100 then raise exception 'Invalid checklist task'; end if;
    if coalesce(item->>'due_on','')<>'' then if (item->>'due_on') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Target dates must use YYYY-MM-DD'; end if; perform (item->>'due_on')::date; end if;
    previous=null;
    if tg_op='UPDATE' then select e into previous from jsonb_array_elements(old.checklist) e where e->>'id'=item->>'id'; end if;
    item=item-'completed_at'-'completed_by';
    if item->>'status'='done' then
      item=item||jsonb_build_object('completed_at',case when previous->>'status'='done' then (previous->>'completed_at')::timestamptz else clock_timestamp() end,'completed_by',case when previous->>'status'='done' then previous->>'completed_by' else auth.uid()::text end);
    end if;
    normalized=normalized||jsonb_build_array(item);
  end loop;
  new.checklist=normalized;
  for room in select * from jsonb_array_elements(new.rooms) loop
    if jsonb_typeof(room)<>'object' or jsonb_typeof(room->'id')<>'string' or jsonb_typeof(room->'name')<>'string' or jsonb_typeof(coalesce(room->'notes','""'::jsonb))<>'string' or coalesce(length(room->>'id'),0) not between 1 and 100 or coalesce(length(trim(room->>'name')),0) not between 1 and 200 or coalesce(room->>'condition','') not in ('not_checked','good','worn','damaged','not_applicable') or length(coalesce(room->>'notes',''))>8000 then raise exception 'Invalid room'; end if;
  end loop;
  if exists(select 1 from public.condition_media m where m.inspection_id=new.id and not exists(select 1 from jsonb_array_elements(new.rooms) r where r->>'id'=m.room_id)) then raise exception 'A room with media cannot be removed'; end if;
  if new.status='finalized' then
    if new.lease_id is null or length(trim(new.inspector))=0 or new.inspected_on>current_date or jsonb_array_length(new.checklist)=0 or exists(select 1 from jsonb_array_elements(new.checklist) t where t->>'status'='todo') then raise exception 'Link a lease, enter the inspector/date, and resolve every checklist task'; end if;
    if not exists(select 1 from jsonb_array_elements(new.rooms) r where r->>'condition'<>'not_applicable') or exists(select 1 from jsonb_array_elements(new.rooms) r where r->>'condition'='not_checked') then raise exception 'Record the condition of each applicable room'; end if;
    with recursive chain as (select new.id as id,new.amendment_of as amendment_of union all select i.id,i.amendment_of from public.condition_inspections i join chain c on i.id=c.amendment_of) select array_agg(id) into ids from chain;
    if exists(select 1 from public.condition_media m where m.inspection_id=any(ids) and (m.status<>'ready' or not exists(select 1 from storage.objects o where o.bucket_id='condition-record-media' and o.name=m.storage_path and (o.metadata->>'size')::bigint=m.size_bytes and o.metadata->>'mimetype'=m.mime_type))) then raise exception 'Resolve missing or unfinished uploads before finalizing'; end if;
    if exists(select 1 from jsonb_array_elements(new.rooms) r where r->>'condition'<>'not_applicable' and not exists(select 1 from public.condition_media m where m.inspection_id=any(ids) and m.room_id=r->>'id' and m.status='ready')) then raise exception 'Each applicable room needs a saved photo or video'; end if;
    if new.amendment_of is not null then
      select lease_snapshot,property_label_snapshot into new.lease_snapshot,new.property_label_snapshot from public.condition_inspections where id=new.amendment_of;
    else
      select jsonb_build_object('tenant_name',l.tenant_name,'start_date',l.start_date,'end_date',l.end_date) into new.lease_snapshot from public.leases l where l.id=new.lease_id;
      select p.address||case when coalesce(p.city,'')<>'' then ', '||p.city else '' end into new.property_label_snapshot from public.properties p where p.id=new.property_id;
    end if;
    new.finalized_at=clock_timestamp();
  else new.finalized_at=null;
  end if;
  return new;
end $$;
revoke all on function public.guard_condition_inspection() from public, anon, authenticated;
drop trigger if exists guard_condition_inspection on public.condition_inspections;
create trigger guard_condition_inspection before insert or update on public.condition_inspections for each row execute function public.guard_condition_inspection();

create or replace function public.audit_condition_inspection() returns trigger
language plpgsql security definer set search_path='' as $$ begin
  insert into public.condition_record_events(inspection_id,actor_id,version,snapshot) values(new.id,auth.uid(),new.version,to_jsonb(new)); return new;
end $$;
revoke all on function public.audit_condition_inspection() from public, anon, authenticated;
drop trigger if exists audit_condition_inspection on public.condition_inspections;
create trigger audit_condition_inspection after insert or update on public.condition_inspections for each row execute function public.audit_condition_inspection();

create or replace function public.guard_condition_media() returns trigger
language plpgsql security definer set search_path='' as $$
declare m public.condition_media; i public.condition_inspections;
begin
  if tg_op='DELETE' then m=old; else m=new; end if;
  select * into i from public.condition_inspections where id=m.inspection_id for update;
  if not found or auth.uid() is null or i.owner_id<>auth.uid() or m.owner_id<>auth.uid() or m.property_id<>i.property_id or i.status<>'draft' then raise exception 'Media can only change in an owned draft'; end if;
  if tg_op='DELETE' then
    if exists(select 1 from storage.objects o where o.bucket_id='condition-record-media' and o.name=m.storage_path) then raise exception 'Remove the stored file before its reference'; end if;
    return old;
  end if;
  if not exists(select 1 from jsonb_array_elements(i.rooms) r where r->>'id'=m.room_id) then raise exception 'Choose a saved room'; end if;
  if new.storage_path<>new.owner_id::text||'/'||i.property_id::text||'/'||new.inspection_id::text||'/'||new.id::text then raise exception 'Invalid media path'; end if;
  if tg_op='UPDATE' and ((old.status in ('ready','removing') and new.status<>'removing') or (new.id,new.owner_id,new.property_id,new.inspection_id,new.room_id,new.storage_path,new.original_name,new.mime_type,new.size_bytes,new.captured_on,new.created_at) is distinct from (old.id,old.owner_id,old.property_id,old.inspection_id,old.room_id,old.storage_path,old.original_name,old.mime_type,old.size_bytes,old.captured_on,old.created_at)) then raise exception 'Media metadata is immutable; remove a draft upload to replace it'; end if;
  if tg_op='INSERT' then new.created_at=clock_timestamp(); if new.status<>'pending' then raise exception 'Reserve an upload before attaching bytes'; end if; end if;
  if new.status='ready' and not exists(select 1 from storage.objects o where o.bucket_id='condition-record-media' and o.name=m.storage_path and (o.metadata->>'size')::bigint=m.size_bytes and o.metadata->>'mimetype'=m.mime_type) then raise exception 'Uploaded file metadata does not match'; end if;
  return new;
end $$;
revoke all on function public.guard_condition_media() from public, anon, authenticated;
drop trigger if exists guard_condition_media on public.condition_media;
create trigger guard_condition_media before insert or update or delete on public.condition_media for each row execute function public.guard_condition_media();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('condition-record-media','condition-record-media',false,52428800,array['image/jpeg','image/png','image/webp','image/heic','image/heif','video/mp4','video/quicktime','video/webm']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists condition_files_read on storage.objects;
create policy condition_files_read on storage.objects for select to authenticated using(bucket_id='condition-record-media' and exists(select 1 from public.condition_media m where m.storage_path=name and m.owner_id=(select auth.uid())));
drop policy if exists condition_files_insert on storage.objects;
create policy condition_files_insert on storage.objects for insert to authenticated with check(bucket_id='condition-record-media' and exists(select 1 from public.condition_media m join public.condition_inspections i on i.id=m.inspection_id where m.storage_path=name and m.owner_id=(select auth.uid()) and m.status='pending' and i.status='draft'));
drop policy if exists condition_files_delete on storage.objects;
create policy condition_files_delete on storage.objects for delete to authenticated using(bucket_id='condition-record-media' and exists(select 1 from public.condition_media m join public.condition_inspections i on i.id=m.inspection_id where m.storage_path=name and m.owner_id=(select auth.uid()) and m.status='removing' and i.status='draft'));
-- Lock only our public inspection row during Storage API deletion. This
-- serializes deletion with finalization without altering Storage's tables.
create or replace function public.can_remove_condition_file(p_name text) returns boolean
language plpgsql volatile security definer set search_path='' as $$
declare i public.condition_inspections;
begin
  if auth.uid() is null then return false; end if;
  select r.* into i from public.condition_inspections r join public.condition_media m on m.inspection_id=r.id where m.storage_path=p_name and m.owner_id=auth.uid() and m.status='removing' for update of r;
  return found and i.owner_id=auth.uid() and i.status='draft';
end $$;
revoke all on function public.can_remove_condition_file(text) from public, anon, authenticated;
grant execute on function public.can_remove_condition_file(text) to authenticated;
-- Restrictive guards also protect this bucket from unrelated permissive
-- policies that may already exist on the project's Storage objects table.
drop policy if exists condition_private_read_guard on storage.objects;
create policy condition_private_read_guard on storage.objects as restrictive for select to authenticated using(bucket_id<>'condition-record-media' or exists(select 1 from public.condition_media m where m.storage_path=name and m.owner_id=(select auth.uid())));
drop policy if exists condition_private_insert_guard on storage.objects;
create policy condition_private_insert_guard on storage.objects as restrictive for insert to authenticated with check(bucket_id<>'condition-record-media' or exists(select 1 from public.condition_media m join public.condition_inspections i on i.id=m.inspection_id where m.storage_path=name and m.owner_id=(select auth.uid()) and m.status='pending' and i.status='draft'));
drop policy if exists condition_private_delete_guard on storage.objects;
create policy condition_private_delete_guard on storage.objects as restrictive for delete to authenticated using(bucket_id<>'condition-record-media' or public.can_remove_condition_file(name));
drop policy if exists condition_no_overwrite_guard on storage.objects;
create policy condition_no_overwrite_guard on storage.objects as restrictive for update to authenticated using(bucket_id<>'condition-record-media') with check(bucket_id<>'condition-record-media');
-- No authenticated UPDATE of this bucket: bytes are never overwritten. Trusted service administrators retain maintenance access.
commit;
