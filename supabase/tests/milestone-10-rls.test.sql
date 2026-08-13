-- PropRoster Milestone 10 — Tenant Connect RLS + security regression test.
--
-- This is NOT run by `npm test` (there's no Postgres in the Node/vitest
-- pipeline) and is not required for the app to work. It exists so the
-- tenant/owner relational RLS in milestone-10-tenant-connect.sql can be
-- re-verified with a single command whenever it changes — run it by hand
-- (or from CI with a scratch Postgres) against a database that already has
-- PropRoster's schema loaded and the Supabase `auth`/`storage` schemas
-- available (any Supabase project, or a local Postgres with those schemas
-- stubbed — see the note at the bottom of milestone-9-rls.test.sql for the
-- stub pattern). Milestone 10 additionally needs an `auth.jwt()` stub
-- returning the `request.jwt.claims` GUC as jsonb (earlier milestones'
-- tests only ever needed `auth.uid()` / `request.jwt.claim.sub`, since
-- accept_tenant_invite()'s and the Invited-row SELECT policy's email match
-- is the first thing in this codebase to read the JWT's email claim).
--
-- Every block below either RAISEs "REGRESSION" (something is broken, fix
-- it before shipping) or NOTICEs "PASS" (the security property held). Run
-- with `psql -v ON_ERROR_STOP=0` and grep the output for "REGRESSION" — a
-- clean run has zero matches.
--
-- If your stub database (not real Supabase) doesn't already have RLS
-- enabled on storage.objects, run `alter table storage.objects enable
-- row level security;` before this file — real Supabase always has it
-- enabled, but a bare local stub table does not by default, and without
-- it the storage-policy assertions below would silently pass for the
-- wrong reason (no policy is enforced at all, rather than the policy
-- correctly evaluating true/false).
--
-- Production-hardening pass (entitlement enforcement): the second half
-- of this file, after the original 11 scenarios + 2 bonus cases, adds
-- coverage for owner_has_tenant_connect() — the plan/status gate now
-- required on every Tenant Connect CREATE (tenant_property_access,
-- property_conversations, property_messages, both attachment insert
-- paths) — plus a deeper invite-security pass (atomic accept, hijack,
-- re-acceptance, enumeration) and a revoked-tenant storage-upload check.
--
-- Uses six throwaway users/one throwaway maintenance request created
-- inside a transaction that is rolled back at the end, so this never
-- leaves test data behind. Covers exactly the 11 Tenant Connect scenarios
-- from the Milestone 10 completion report's Part 8, plus two bonus
-- coverage cases for accept_tenant_invite().

begin;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'owner1@example.com'),      -- owns property 1 (with two tenants)
  ('a0000000-0000-0000-0000-000000000002', 'owner2@example.com'),      -- owns property 2 (cross-owner isolation)
  ('a0000000-0000-0000-0000-000000000003', 'tenant1@example.com'),     -- active tenant on property 1
  ('a0000000-0000-0000-0000-000000000004', 'tenant2@example.com'),     -- second active tenant on property 1 (cross-tenant isolation)
  ('a0000000-0000-0000-0000-000000000005', 'tenant3-revoked@example.com'), -- revoked tenant on property 1
  ('a0000000-0000-0000-0000-000000000006', 'newtenant@example.com');   -- accepts a fresh invite (bonus test)

insert into public.properties (id, owner_id, address, city) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', '1 Owner1 St', 'Town'),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', '1 Owner2 St', 'Town');

insert into public.tenant_property_access (id, property_id, owner_id, tenant_user_id, tenant_email, status, accepted_at) values
  ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'tenant1@example.com', 'Active', now()),
  ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 'tenant2@example.com', 'Active', now()),
  ('c0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000005', 'tenant3-revoked@example.com', 'Revoked', now()),
  ('c0000000-0000-0000-0000-000000000009', 'b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000004', 'tenant2@example.com', 'Active', now());

insert into public.maintenance_requests (id, property_id, owner_id, tenant_name, title, description) values
  ('d0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Tenant One', 'Leaky faucet', 'Kitchen faucet leaking');

-- Both owners in THIS section are entitled (Portfolio) — the point of
-- scenarios 1-11 below is testing relational ownership/tenant-access
-- RLS in isolation, not the entitlement gate (that gets its own
-- dedicated coverage further down, with owners on every plan tier).
insert into public.user_subscriptions (owner_id, plan, status) values
  ('a0000000-0000-0000-0000-000000000001', 'portfolio', 'active'),
  ('a0000000-0000-0000-0000-000000000002', 'portfolio', 'active');

set local role authenticated;

-- ===== 1. Owner can access conversation on owned property =====
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","email":"owner1@example.com"}', true);
do $$
declare
  v_conv_id uuid;
begin
  insert into public.property_conversations (property_id, owner_id, tenant_access_id, subject, conversation_type)
  values ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Welcome', 'General')
  returning id into v_conv_id;
  perform 1 from public.property_conversations where id = v_conv_id;
  if not found then raise exception 'REGRESSION: owner cannot see conversation they just created'; end if;
  raise notice 'PASS 1: owner can access conversation on their own property';
end $$;

do $$ begin perform set_config('pgtest.conv1', (select id::text from public.property_conversations where tenant_access_id = 'c0000000-0000-0000-0000-000000000001' limit 1), false); end $$;

-- ===== 2. Owner cannot access another owner's conversation =====
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000002","email":"owner2@example.com"}', true);
do $$
begin
  perform 1 from public.property_conversations where id = current_setting('pgtest.conv1')::uuid;
  if found then raise exception 'REGRESSION: owner2 can see owner1''s conversation'; end if;
  raise notice 'PASS 2: owner cannot access another owner''s conversation';
end $$;

-- ===== 3. Tenant can access their active conversation =====
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000003","email":"tenant1@example.com"}', true);
do $$
begin
  perform 1 from public.property_conversations where id = current_setting('pgtest.conv1')::uuid;
  if not found then raise exception 'REGRESSION: active tenant cannot see their own conversation'; end if;
  raise notice 'PASS 3: tenant can access their active conversation';
end $$;

-- ===== 4. Tenant cannot access another tenant's conversation =====
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000004","email":"tenant2@example.com"}', true);
do $$
begin
  perform 1 from public.property_conversations where id = current_setting('pgtest.conv1')::uuid;
  if found then raise exception 'REGRESSION: tenant2 can see tenant1''s conversation'; end if;
  raise notice 'PASS 4: tenant cannot access another tenant''s conversation';
end $$;

-- ===== 5. Revoked tenant cannot access conversation =====
reset role;
insert into public.property_conversations (id, property_id, owner_id, tenant_access_id, subject, conversation_type)
values ('e0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003', 'Old thread', 'General');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000005', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000005","email":"tenant3-revoked@example.com"}', true);
do $$
begin
  perform 1 from public.property_conversations where id = 'e0000000-0000-0000-0000-000000000005';
  if found then raise exception 'REGRESSION: revoked tenant can still see their old conversation'; end if;
  raise notice 'PASS 5: revoked tenant cannot access conversation';
end $$;

-- ===== 6. Tenant cannot change property_id (forge it away from their own access row's property) =====
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000003","email":"tenant1@example.com"}', true);
do $$
begin
  begin
    insert into public.property_conversations (property_id, owner_id, tenant_access_id, subject)
    values ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Hijack attempt');
    raise exception 'REGRESSION: tenant inserted a conversation with a forged property_id';
  exception
    when others then
      if SQLERRM like 'REGRESSION%' then raise; end if;
      raise notice 'PASS 6: tenant cannot change/forge property_id away from their own access row''s property';
  end;
end $$;

-- ===== 7. Tenant cannot impersonate Owner sender role =====
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000003","email":"tenant1@example.com"}', true);
do $$
declare
  v_role text;
begin
  insert into public.property_messages (conversation_id, sender_user_id, sender_role, message)
  values (current_setting('pgtest.conv1')::uuid, 'a0000000-0000-0000-0000-000000000001', 'Owner', 'pretending to be the owner')
  returning sender_role into v_role;
  if v_role <> 'Tenant' then raise exception 'REGRESSION: tenant''s forged sender_role/sender_user_id was honored (got %)', v_role; end if;
  raise notice 'PASS 7: tenant cannot impersonate Owner sender role (server-derived role: %)', v_role;
end $$;

-- ===== 8. Owner can reply =====
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","email":"owner1@example.com"}', true);
do $$
declare
  v_role text;
begin
  insert into public.property_messages (conversation_id, sender_user_id, sender_role, message)
  values (current_setting('pgtest.conv1')::uuid, 'a0000000-0000-0000-0000-000000000001', 'Tenant', 'owner reply, ignore the forged role above')
  returning sender_role into v_role;
  if v_role <> 'Owner' then raise exception 'REGRESSION: owner reply got wrong sender_role %', v_role; end if;
  raise notice 'PASS 8: owner can reply (server-derived role: %)', v_role;
end $$;

-- ===== 9. Tenant can reply =====
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000003","email":"tenant1@example.com"}', true);
do $$
declare
  v_id uuid;
begin
  insert into public.property_messages (conversation_id, sender_user_id, sender_role, message)
  values (current_setting('pgtest.conv1')::uuid, 'a0000000-0000-0000-0000-000000000003', 'Tenant', 'Thanks, will take a look')
  returning id into v_id;
  raise notice 'PASS 9: tenant can reply';
end $$;

-- ===== 10. Maintenance-linked conversation works =====
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","email":"owner1@example.com"}', true);
do $$
declare
  v_conv_id uuid;
begin
  insert into public.property_conversations (property_id, owner_id, tenant_access_id, subject, conversation_type, maintenance_request_id)
  values ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'Leaky faucet', 'Maintenance', 'd0000000-0000-0000-0000-000000000001')
  returning id into v_conv_id;
  perform 1 from public.property_conversations where id = v_conv_id and maintenance_request_id = 'd0000000-0000-0000-0000-000000000001';
  if not found then raise exception 'REGRESSION: maintenance_request_id link did not persist'; end if;
  raise notice 'PASS 10: maintenance-linked conversation works';
end $$;

-- ===== 11. Attachment authorization works =====
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000003","email":"tenant1@example.com"}', true);
do $$
declare
  v_msg_id uuid;
begin
  insert into public.property_messages (conversation_id, sender_user_id, sender_role, message)
  values (current_setting('pgtest.conv1')::uuid, 'a0000000-0000-0000-0000-000000000003', 'Tenant', 'photo attached')
  returning id into v_msg_id;
  insert into public.property_message_attachments (message_id, storage_path, mime_type, size_bytes)
  values (v_msg_id, current_setting('pgtest.conv1') || '/photo.jpg', 'image/jpeg', 123456);
  raise notice 'PASS 11a: tenant can attach a photo to their own message';
end $$;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000001","email":"owner1@example.com"}', true);
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.property_message_attachments pma join public.property_messages pm on pm.id = pma.message_id where pm.conversation_id = current_setting('pgtest.conv1')::uuid;
  if v_count = 0 then raise exception 'REGRESSION: owner cannot see the attachment in their own conversation'; end if;
  raise notice 'PASS 11b: owner (conversation member) can see the attachment';
end $$;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000004","email":"tenant2@example.com"}', true);
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.property_message_attachments pma join public.property_messages pm on pm.id = pma.message_id where pm.conversation_id = current_setting('pgtest.conv1')::uuid;
  if v_count > 0 then raise exception 'REGRESSION: unrelated tenant2 can see tenant1''s attachment'; end if;
  raise notice 'PASS 11c: unrelated tenant cannot see another tenant''s attachment';
end $$;

-- ===== Bonus: accept_tenant_invite() end-to-end =====
reset role;
insert into public.tenant_property_access (id, property_id, owner_id, tenant_email, status)
values ('c0000000-0000-0000-0000-000000000099', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'newtenant@example.com', 'Invited');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000006', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000006","email":"newtenant@example.com"}', true);
do $$
declare
  v_status text;
begin
  perform public.accept_tenant_invite('c0000000-0000-0000-0000-000000000099');
  select status into v_status from public.tenant_property_access where id = 'c0000000-0000-0000-0000-000000000099';
  if v_status <> 'Active' then raise exception 'REGRESSION: accept_tenant_invite did not activate the row'; end if;
  raise notice 'PASS BONUS 1: accept_tenant_invite() activates an invite addressed to the caller''s own email';
end $$;

-- A different signed-in user cannot accept someone else's invite.
reset role;
insert into public.tenant_property_access (id, property_id, owner_id, tenant_email, status)
values ('c0000000-0000-0000-0000-000000000098', 'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'someone-else@example.com', 'Invited');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000003","email":"tenant1@example.com"}', true);
do $$
begin
  begin
    perform public.accept_tenant_invite('c0000000-0000-0000-0000-000000000098');
    raise exception 'REGRESSION: tenant1 accepted an invite addressed to a different email';
  exception
    when others then
      if SQLERRM like 'REGRESSION%' then raise; end if;
      raise notice 'PASS BONUS 2: cannot accept an invite addressed to a different email';
  end;
end $$;

-- ================================================================
-- Production-hardening pass: database-level tenantConnect entitlement
-- enforcement (owner_has_tenant_connect()), deeper invite-security
-- coverage, and revoked-tenant storage-upload verification.
-- ================================================================
reset role;
insert into auth.users (id, email) values
  ('f0000000-0000-0000-0000-000000000001', 'free-owner@example.com'),
  ('f0000000-0000-0000-0000-000000000002', 'investor-owner@example.com'),
  ('f0000000-0000-0000-0000-000000000003', 'portfolio-owner@example.com'),
  ('f0000000-0000-0000-0000-000000000004', 'portfolio-pro-owner@example.com'),
  ('f0000000-0000-0000-0000-000000000005', 'internal-owner@example.com'),
  ('f0000000-0000-0000-0000-000000000006', 'entitlement-tenant-a@example.com'),
  ('f0000000-0000-0000-0000-000000000007', 'entitlement-tenant-b@example.com'),
  ('f0000000-0000-0000-0000-000000000009', 'entitlement-attacker@example.com');

insert into public.properties (id, owner_id, address, city) values
  ('f1000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', '1 Free St', 'Town'),
  ('f1000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000002', '1 Investor St', 'Town'),
  ('f1000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000003', '1 Portfolio St', 'Town'),
  ('f1000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000004', '1 Portfolio Pro St', 'Town'),
  ('f1000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0000-000000000005', '1 Internal Owner St', 'Town');

-- free-owner intentionally has NO user_subscriptions row at all (a
-- brand-new account) — owner_has_tenant_connect() must still resolve
-- that to false, same as an explicit plan='free' row would.
insert into public.user_subscriptions (owner_id, plan, status) values
  ('f0000000-0000-0000-0000-000000000002', 'investor', 'active'),
  ('f0000000-0000-0000-0000-000000000003', 'portfolio', 'active'),
  ('f0000000-0000-0000-0000-000000000004', 'portfolio_pro', 'active'),
  ('f0000000-0000-0000-0000-000000000005', 'owner', 'active');

set local role authenticated;

do $$
begin
  if public.owner_has_tenant_connect('f0000000-0000-0000-0000-000000000001') then raise exception 'REGRESSION: free (no subscription row) resolves tenantConnect=true'; end if;
  if public.owner_has_tenant_connect('f0000000-0000-0000-0000-000000000002') then raise exception 'REGRESSION: investor resolves tenantConnect=true'; end if;
  if not public.owner_has_tenant_connect('f0000000-0000-0000-0000-000000000003') then raise exception 'REGRESSION: portfolio resolves tenantConnect=false'; end if;
  if not public.owner_has_tenant_connect('f0000000-0000-0000-0000-000000000004') then raise exception 'REGRESSION: portfolio_pro resolves tenantConnect=false'; end if;
  if not public.owner_has_tenant_connect('f0000000-0000-0000-0000-000000000005') then raise exception 'REGRESSION: internal owner plan resolves tenantConnect=false'; end if;
  raise notice 'PASS: owner_has_tenant_connect() matches launch intent for all five tiers';
end $$;

select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"f0000000-0000-0000-0000-000000000001","email":"free-owner@example.com"}', true);
do $$
begin
  begin
    insert into public.tenant_property_access (property_id, owner_id, tenant_email) values ('f1000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', 'x@example.com');
    raise exception 'REGRESSION: Free owner created tenant_property_access';
  exception when others then
    if SQLERRM like 'REGRESSION%' then raise; end if;
    raise notice 'PASS: Free owner cannot create Tenant Connect access';
  end;
end $$;

select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"f0000000-0000-0000-0000-000000000002","email":"investor-owner@example.com"}', true);
do $$
begin
  begin
    insert into public.tenant_property_access (property_id, owner_id, tenant_email) values ('f1000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000002', 'x@example.com');
    raise exception 'REGRESSION: Investor owner created tenant_property_access';
  exception when others then
    if SQLERRM like 'REGRESSION%' then raise; end if;
    raise notice 'PASS: Investor owner cannot create Tenant Connect access (not sold as an add-on yet)';
  end;
end $$;

select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"f0000000-0000-0000-0000-000000000003","email":"portfolio-owner@example.com"}', true);
do $$
declare
  v_access_id uuid;
  v_conv_id uuid;
begin
  insert into public.tenant_property_access (property_id, owner_id, tenant_email) values ('f1000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000003', 'entitlement-tenant-a@example.com') returning id into v_access_id;
  perform set_config('pgtest.ent_access', v_access_id::text, false);
  insert into public.property_conversations (property_id, owner_id, tenant_access_id, subject) values ('f1000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000003', v_access_id, 'Welcome') returning id into v_conv_id;
  perform set_config('pgtest.ent_conv', v_conv_id::text, false);
  raise notice 'PASS: Portfolio owner can create Tenant Connect access and conversations';
end $$;

select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claims', '{"sub":"f0000000-0000-0000-0000-000000000004","email":"portfolio-pro-owner@example.com"}', true);
do $$
begin
  insert into public.tenant_property_access (property_id, owner_id, tenant_email) values ('f1000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000004', 'x@example.com');
  raise notice 'PASS: Portfolio Pro owner can create Tenant Connect access';
end $$;

select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000005', true);
select set_config('request.jwt.claims', '{"sub":"f0000000-0000-0000-0000-000000000005","email":"internal-owner@example.com"}', true);
do $$
begin
  insert into public.tenant_property_access (property_id, owner_id, tenant_email) values ('f1000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0000-000000000005', 'x@example.com');
  raise notice 'PASS: internal Owner plan can create Tenant Connect access';
end $$;

-- Tenant under an ENTITLED (Portfolio) owner can reply.
reset role;
update auth.users set email = 'entitlement-tenant-a@example.com' where id = 'f0000000-0000-0000-0000-000000000006';
update public.tenant_property_access set tenant_user_id = 'f0000000-0000-0000-0000-000000000006', status = 'Active', accepted_at = now() where id = current_setting('pgtest.ent_access')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000006', true);
select set_config('request.jwt.claims', '{"sub":"f0000000-0000-0000-0000-000000000006","email":"entitlement-tenant-a@example.com"}', true);
do $$
begin
  insert into public.property_messages (conversation_id, sender_user_id, sender_role, message) values (current_setting('pgtest.ent_conv')::uuid, 'f0000000-0000-0000-0000-000000000006', 'Tenant', 'Hi, checking in');
  raise notice 'PASS: tenant under an entitled (Portfolio) owner can reply';
end $$;

-- Owner downgrades to Investor -> the SAME legitimately-active tenant can
-- no longer create new messages, but pre-downgrade history stays readable.
reset role;
update public.user_subscriptions set plan = 'investor' where owner_id = 'f0000000-0000-0000-0000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000006', true);
select set_config('request.jwt.claims', '{"sub":"f0000000-0000-0000-0000-000000000006","email":"entitlement-tenant-a@example.com"}', true);
do $$
begin
  begin
    insert into public.property_messages (conversation_id, sender_user_id, sender_role, message) values (current_setting('pgtest.ent_conv')::uuid, 'f0000000-0000-0000-0000-000000000006', 'Tenant', 'still there?');
    raise exception 'REGRESSION: tenant posted a new message under a now-non-entitled (downgraded) owner';
  exception when others then
    if SQLERRM like 'REGRESSION%' then raise; end if;
    raise notice 'PASS: tenant under a non-entitled (downgraded) owner cannot create a new message — entitlement belongs to the landlord account';
  end;
end $$;
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.property_messages where conversation_id = current_setting('pgtest.ent_conv')::uuid;
  if v_count = 0 then raise exception 'REGRESSION: pre-downgrade message became unreadable after owner downgrade'; end if;
  raise notice 'PASS: pre-existing messages remain readable after an owner downgrade (only new creation is blocked)';
end $$;
reset role;
update public.user_subscriptions set plan = 'portfolio' where owner_id = 'f0000000-0000-0000-0000-000000000003';
set local role authenticated;

-- Revoked tenant cannot read, reply, OR upload.
reset role;
update public.tenant_property_access set status = 'Revoked', revoked_at = now() where id = current_setting('pgtest.ent_access')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000006', true);
select set_config('request.jwt.claims', '{"sub":"f0000000-0000-0000-0000-000000000006","email":"entitlement-tenant-a@example.com"}', true);
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.property_conversations where id = current_setting('pgtest.ent_conv')::uuid;
  if v_count > 0 then raise exception 'REGRESSION: revoked tenant can still read the conversation'; end if;
  raise notice 'PASS: revoked tenant cannot read the conversation';
end $$;
do $$
begin
  begin
    insert into public.property_messages (conversation_id, sender_user_id, sender_role, message) values (current_setting('pgtest.ent_conv')::uuid, 'f0000000-0000-0000-0000-000000000006', 'Tenant', 'trying anyway');
    raise exception 'REGRESSION: revoked tenant can still reply';
  exception when others then
    if SQLERRM like 'REGRESSION%' then raise; end if;
    raise notice 'PASS: revoked tenant cannot reply';
  end;
end $$;
do $$
begin
  begin
    insert into storage.objects (bucket_id, name, owner) values ('tenant-connect-attachments', current_setting('pgtest.ent_conv') || '/photo.jpg', 'f0000000-0000-0000-0000-000000000006');
    raise exception 'REGRESSION: revoked tenant can still upload an attachment';
  exception when others then
    if SQLERRM like 'REGRESSION%' then raise; end if;
    raise notice 'PASS: revoked tenant cannot upload an attachment (storage RLS)';
  end;
end $$;
reset role;
update public.tenant_property_access set status = 'Active', revoked_at = null where id = current_setting('pgtest.ent_access')::uuid;
set local role authenticated;

-- Forged sender_role AND forged sender_user_id both overridden server-side.
select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000006', true);
select set_config('request.jwt.claims', '{"sub":"f0000000-0000-0000-0000-000000000006","email":"entitlement-tenant-a@example.com"}', true);
do $$
declare v_role text; v_sender uuid;
begin
  insert into public.property_messages (conversation_id, sender_user_id, sender_role, message)
  values (current_setting('pgtest.ent_conv')::uuid, 'f0000000-0000-0000-0000-000000000003', 'Owner', 'forged')
  returning sender_role, sender_user_id into v_role, v_sender;
  if v_role <> 'Tenant' or v_sender <> 'f0000000-0000-0000-0000-000000000006' then
    raise exception 'REGRESSION: forged sender_role/sender_user_id survived (role=%, sender=%)', v_role, v_sender;
  end if;
  raise notice 'PASS: forged sender_role AND forged sender_user_id both overridden server-side';
end $$;

-- A caller who is neither the owner nor an active tenant is fully rejected.
select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000009', true);
select set_config('request.jwt.claims', '{"sub":"f0000000-0000-0000-0000-000000000009","email":"entitlement-attacker@example.com"}', true);
do $$
begin
  begin
    insert into public.property_messages (conversation_id, sender_user_id, sender_role, message)
    values (current_setting('pgtest.ent_conv')::uuid, 'f0000000-0000-0000-0000-000000000009', 'Owner', 'i am the owner now');
    raise exception 'REGRESSION: a non-member (neither owner nor tenant) posted a message';
  exception when others then
    if SQLERRM like 'REGRESSION%' then raise; end if;
    raise notice 'PASS: caller who is neither owner nor active tenant is rejected';
  end;
end $$;

-- Invite hijack blocked: a different real user cannot accept someone
-- else's invite.
reset role;
insert into public.tenant_property_access (id, property_id, owner_id, tenant_email, status)
values ('f2000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-000000000003', 'entitlement-tenant-b@example.com', 'Invited');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000009', true);
select set_config('request.jwt.claims', '{"sub":"f0000000-0000-0000-0000-000000000009","email":"entitlement-attacker@example.com"}', true);
do $$
begin
  begin
    perform public.accept_tenant_invite('f2000000-0000-0000-0000-000000000001');
    raise exception 'REGRESSION: attacker hijacked an invite addressed to a different email';
  exception when others then
    if SQLERRM like 'REGRESSION%' then raise; end if;
    raise notice 'PASS: invite hijack blocked';
  end;
end $$;

-- Already-accepted invite cannot be reassigned — not by a different
-- caller, and not even by the rightful tenant calling accept again.
select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000007', true);
select set_config('request.jwt.claims', '{"sub":"f0000000-0000-0000-0000-000000000007","email":"entitlement-tenant-b@example.com"}', true);
do $$
declare v_tenant_user uuid;
begin
  perform public.accept_tenant_invite('f2000000-0000-0000-0000-000000000001');
  select tenant_user_id into v_tenant_user from public.tenant_property_access where id = 'f2000000-0000-0000-0000-000000000001';
  if v_tenant_user <> 'f0000000-0000-0000-0000-000000000007' then raise exception 'REGRESSION: acceptance did not assign the right tenant_user_id'; end if;
  raise notice 'PASS: legitimate acceptance assigns tenant_user_id correctly';
end $$;
select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000009', true);
select set_config('request.jwt.claims', '{"sub":"f0000000-0000-0000-0000-000000000009","email":"entitlement-attacker@example.com"}', true);
do $$
begin
  begin
    perform public.accept_tenant_invite('f2000000-0000-0000-0000-000000000001');
    raise exception 'REGRESSION: attacker reassigned an already-accepted invite';
  exception when others then
    if SQLERRM like 'REGRESSION%' then raise; end if;
    raise notice 'PASS: already-accepted invite cannot be reassigned by a different caller';
  end;
end $$;
select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000007', true);
select set_config('request.jwt.claims', '{"sub":"f0000000-0000-0000-0000-000000000007","email":"entitlement-tenant-b@example.com"}', true);
do $$
begin
  begin
    perform public.accept_tenant_invite('f2000000-0000-0000-0000-000000000001');
    raise exception 'REGRESSION: re-accepting an already-Active invite should fail, not silently succeed';
  exception when others then
    if SQLERRM like 'REGRESSION%' then raise; end if;
    raise notice 'PASS: re-accepting an already-Active invite is rejected, not silently re-applied (closes the original SELECT-then-UPDATE race)';
  end;
end $$;

-- No email enumeration: querying for another user's invite email reveals nothing.
select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000009', true);
select set_config('request.jwt.claims', '{"sub":"f0000000-0000-0000-0000-000000000009","email":"entitlement-attacker@example.com"}', true);
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.tenant_property_access where lower(tenant_email) = lower('entitlement-tenant-b@example.com');
  if v_count > 0 then raise exception 'REGRESSION: attacker can enumerate another user''s invite by email (count=%)', v_count; end if;
  raise notice 'PASS: no email enumeration — querying for another user''s invite email returns nothing';
end $$;

-- Owner cannot see another owner's invites (relational check, re-verified
-- here against the new five-tier owner set).
select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claims', '{"sub":"f0000000-0000-0000-0000-000000000001","email":"free-owner@example.com"}', true);
do $$
declare v_count integer;
begin
  select count(*) into v_count from public.tenant_property_access where property_id = 'f1000000-0000-0000-0000-000000000003';
  if v_count > 0 then raise exception 'REGRESSION: unrelated owner can see another owner''s tenant invites'; end if;
  raise notice 'PASS: owner cannot see another owner''s property invites';
end $$;

rollback;
