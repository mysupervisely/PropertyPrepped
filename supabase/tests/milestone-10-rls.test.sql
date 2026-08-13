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

rollback;
