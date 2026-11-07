-- Bank-free tenant reporting. Reported payments never count toward rent until
-- the owner explicitly confirms them through one atomic, retry-safe function.
begin;
create table if not exists public.rent_payment_reports (
 id uuid primary key default gen_random_uuid(),
 lease_id uuid not null references public.leases(id) on delete cascade,
 reported_by uuid not null references auth.users(id),
 rent_period date not null check (extract(day from rent_period)=1),
 paid_on date not null,
 amount numeric(14,2) not null check(amount > 0 and amount <= 10000000),
 payment_method text not null check(payment_method in ('ACH / Bank Transfer','Check','Cash','Zelle','Venmo','Cash App','Other')),
 reference_number text check(length(reference_number)<=200),
 status text not null default 'Reported' check(status in ('Reported','Confirmed','Dismissed')),
 payment_id uuid references public.rent_payments(id) on delete set null,
 evidence_path text,
 created_at timestamptz not null default now(),
 check(evidence_path is null or evidence_path like reported_by::text || '/' || lease_id::text || '/' || id::text || '/%')
);
create unique index if not exists rent_payment_report_one_pending on public.rent_payment_reports(lease_id,reported_by,rent_period) where status='Reported';
alter table public.rent_payment_reports enable row level security;
revoke all on public.rent_payment_reports from anon,authenticated;
grant select on public.rent_payment_reports to authenticated;
grant insert(id,lease_id,reported_by,rent_period,paid_on,amount,payment_method,reference_number) on public.rent_payment_reports to authenticated;
grant update(status,payment_id,evidence_path) on public.rent_payment_reports to authenticated;
drop policy if exists reports_read on public.rent_payment_reports;
create policy reports_read on public.rent_payment_reports for select to authenticated using (
 (reported_by=(select auth.uid()) and public.is_active_tenant_of_lease(lease_id)) or exists(select 1 from public.leases l where l.id=lease_id and l.owner_id=(select auth.uid()))
);
drop policy if exists reports_tenant_insert on public.rent_payment_reports;
create policy reports_tenant_insert on public.rent_payment_reports for insert to authenticated with check (
 reported_by=(select auth.uid()) and public.is_active_tenant_of_lease(lease_id) and status='Reported' and payment_id is null
);
drop policy if exists reports_tenant_evidence on public.rent_payment_reports;
create policy reports_tenant_evidence on public.rent_payment_reports for update to authenticated using (
 reported_by=(select auth.uid()) and public.is_active_tenant_of_lease(lease_id) and status='Reported'
) with check (reported_by=(select auth.uid()) and public.is_active_tenant_of_lease(lease_id) and status='Reported' and payment_id is null);
drop policy if exists reports_owner_update on public.rent_payment_reports;
create policy reports_owner_update on public.rent_payment_reports for update to authenticated using (
 exists(select 1 from public.leases l where l.id=lease_id and l.owner_id=(select auth.uid()))
) with check (exists(select 1 from public.leases l where l.id=lease_id and l.owner_id=(select auth.uid())));

create or replace function public.confirm_rent_payment_report(p_report_id uuid,p_record_income boolean default true) returns uuid
language plpgsql security invoker set search_path=public as $$
declare r public.rent_payment_reports; l public.leases; tx uuid; payment uuid;
begin
 select * into r from public.rent_payment_reports where id=p_report_id for update;
 if not found then raise exception 'Report unavailable'; end if;
 select * into l from public.leases where id=r.lease_id and owner_id=auth.uid() for update;
 if not found then raise exception 'Only the property owner can confirm rent'; end if;
 if r.status='Confirmed' and r.payment_id is not null then return r.payment_id; end if;
 if r.status<>'Reported' then raise exception 'Report already reviewed'; end if;
 if p_record_income then
  insert into public.financial_transactions(owner_id,property_id,transaction_type,category,description,amount,transaction_date,vendor)
  values(auth.uid(),l.property_id,'Income','Rent','Confirmed rent report ' || r.rent_period,r.amount,r.paid_on,l.tenant_name) returning id into tx;
 end if;
 insert into public.rent_payments(owner_id,property_id,lease_id,rent_period,date_received,amount,payment_method,reference_number,financial_transaction_id,created_linked_transaction)
 values(auth.uid(),l.property_id,l.id,r.rent_period,r.paid_on,r.amount,r.payment_method,r.reference_number,tx,tx is not null) returning id into payment;
 update public.rent_payment_reports set status='Confirmed',payment_id=payment where id=r.id;
 return payment;
end $$;
revoke all on function public.confirm_rent_payment_report(uuid,boolean) from public,anon;
grant execute on function public.confirm_rent_payment_report(uuid,boolean) to authenticated;

-- Immutable receipt details are snapshots of a confirmed payment, not a tenant
-- assertion. Access is limited to the owner and the active tenant of its lease.
create table if not exists public.rent_payment_receipts (
 payment_id uuid primary key references public.rent_payments(id) on delete cascade,
 owner_id uuid not null references auth.users(id),
 lease_id uuid not null references public.leases(id) on delete cascade,
 tenant_name text not null,
 property_address text not null,
 amount numeric(14,2) not null,
 rent_period date not null,
 date_received date not null,
 payment_method text not null,
 created_at timestamptz not null default now(),
 emailed_at timestamptz
);
alter table public.rent_payment_receipts enable row level security;
revoke all on public.rent_payment_receipts from anon,authenticated;
grant select,insert on public.rent_payment_receipts to authenticated;
grant update(emailed_at) on public.rent_payment_receipts to authenticated;
drop policy if exists receipts_read on public.rent_payment_receipts;
create policy receipts_read on public.rent_payment_receipts for select to authenticated using (
 owner_id=(select auth.uid()) or public.is_active_tenant_of_lease(lease_id)
);
drop policy if exists receipts_owner_create on public.rent_payment_receipts;
create policy receipts_owner_create on public.rent_payment_receipts for insert to authenticated with check (
 owner_id=(select auth.uid()) and exists(select 1 from public.rent_payments p where p.id=payment_id and p.owner_id=(select auth.uid()) and p.lease_id=rent_payment_receipts.lease_id and p.amount=rent_payment_receipts.amount and p.rent_period=rent_payment_receipts.rent_period and p.date_received=rent_payment_receipts.date_received and p.payment_method=rent_payment_receipts.payment_method)
);
drop policy if exists receipts_owner_email on public.rent_payment_receipts;
create policy receipts_owner_email on public.rent_payment_receipts for update to authenticated using (owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create or replace function public.prepare_rent_payment_receipt(p_payment_id uuid) returns public.rent_payment_receipts
language plpgsql security invoker set search_path=public as $$
declare p public.rent_payments; result public.rent_payment_receipts;
begin
 select * into p from public.rent_payments where id=p_payment_id and owner_id=auth.uid();
 if not found then raise exception 'Confirmed payment unavailable'; end if;
 insert into public.rent_payment_receipts(payment_id,owner_id,lease_id,tenant_name,property_address,amount,rent_period,date_received,payment_method)
 select p.id,p.owner_id,p.lease_id,l.tenant_name,pr.address || ', ' || pr.city,p.amount,p.rent_period,p.date_received,p.payment_method
 from public.leases l join public.properties pr on pr.id=l.property_id where l.id=p.lease_id
 on conflict(payment_id) do nothing;
 select * into result from public.rent_payment_receipts where payment_id=p.id;
 return result;
end $$;
revoke all on function public.prepare_rent_payment_receipt(uuid) from public,anon;
grant execute on function public.prepare_rent_payment_receipt(uuid) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values ('rent-payment-evidence','rent-payment-evidence',false,8388608,array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']) on conflict(id) do nothing;
drop policy if exists payment_evidence_read on storage.objects;
create policy payment_evidence_read on storage.objects for select to authenticated using (
 bucket_id='rent-payment-evidence' and exists(select 1 from public.rent_payment_reports r where name like r.reported_by::text || '/' || r.lease_id::text || '/' || r.id::text || '/%')
);
drop policy if exists payment_evidence_upload on storage.objects;
create policy payment_evidence_upload on storage.objects for insert to authenticated with check (
 bucket_id='rent-payment-evidence' and exists(select 1 from public.rent_payment_reports r where r.reported_by=(select auth.uid()) and r.status='Reported' and public.is_active_tenant_of_lease(r.lease_id) and name like r.reported_by::text || '/' || r.lease_id::text || '/' || r.id::text || '/%')
);
commit;
