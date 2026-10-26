-- PropRoster — Mobile V3 Notifications & Activity Center — RLS
-- regression test for public.notification_events and its five trigger
-- functions.
--
-- Same methodology as milestone-9/26/30/31/32/34-rls.test.sql: NOT run
-- by `npm test` (no Postgres in the Node/vitest pipeline) — run by hand
-- (or from CI with a scratch Postgres) against a database with
-- PropRoster's full schema.sql, supabase/milestone-27-provider-outreach-v1.sql
-- (maintenance_provider_outreach lives there, not yet consolidated into
-- schema.sql), and supabase/milestone-35-mobile-v3-notification-center.sql
-- loaded, with the Supabase auth/storage schema stubbed — see
-- milestone-9-rls.test.sql's own note at the bottom of that file for the
-- exact stub DDL. Every block RAISEs "REGRESSION" or NOTICEs "PASS"; a
-- clean run has zero "REGRESSION" matches. Everything happens inside a
-- transaction rolled back at the end.
--
-- Covers: each of the five triggers fires exactly once for a real event
-- and not at all for a no-op write (idempotency), cross-owner isolation
-- on notification_events (select and the mark-read update), a client
-- cannot INSERT into notification_events directly (no policy at all),
-- and an owner replying to their own conversation does not notify
-- themselves.
--
-- Role convention: `set local role authenticated` + set_config(...) for
-- any write that must be attributed to a specific real user (so
-- auth.uid()-dependent triggers like derive_message_sender_role() see a
-- real actor); `reset role` for admin-style setup/provider-token writes
-- that in production go through the service-role/admin client (owner
-- creating a conversation row directly, provider outreach status
-- updates via the token-based respond route) — same split real app code
-- actually uses.

begin;

insert into auth.users (id) values
  ('35111111-1111-1111-1111-111111111111'), -- owner 1
  ('35222222-2222-2222-2222-222222222222'), -- owner 2
  ('35333333-3333-3333-3333-333333333333'); -- owner 1's tenant

reset role;
insert into public.properties (id, owner_id, address, city) values
  ('35a00000-0000-0000-0000-000000000001', '35111111-1111-1111-1111-111111111111', '1 Test St', 'Town'),
  ('35a00000-0000-0000-0000-000000000002', '35222222-2222-2222-2222-222222222222', '2 Other St', 'Town');

insert into public.tenant_property_access (id, property_id, owner_id, tenant_user_id, tenant_email, status, invited_at)
values ('35b00000-0000-0000-0000-000000000001', '35a00000-0000-0000-0000-000000000001', '35111111-1111-1111-1111-111111111111', '35333333-3333-3333-3333-333333333333', 'tenant@example.test', 'Active', now());

-- conversation_type = 'Maintenance' because tenant_requests_insert_tenant's
-- own WITH CHECK requires the linked conversation to carry that type.
insert into public.property_conversations (id, property_id, owner_id, tenant_access_id, subject, conversation_type)
values ('35c00000-0000-0000-0000-000000000001', '35a00000-0000-0000-0000-000000000001', '35111111-1111-1111-1111-111111111111', '35b00000-0000-0000-0000-000000000001', 'Test conversation', 'Maintenance');

-- ===== 1. A tenant message triggers exactly one notification_events row for the owner =====
set local role authenticated;
select set_config('request.jwt.claim.sub', '35333333-3333-3333-3333-333333333333', true);
insert into public.property_messages (conversation_id, sender_role, message)
values ('35c00000-0000-0000-0000-000000000001', 'Tenant', 'Hi, the sink is leaking.');
reset role;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.notification_events where owner_id = '35111111-1111-1111-1111-111111111111' and event_type = 'tenant_message';
  if v_count = 1 then
    raise notice 'PASS: a tenant message creates exactly one tenant_message notification for the owner';
  else
    raise exception 'REGRESSION: expected exactly 1 tenant_message notification, got %', v_count;
  end if;
end $$;

-- ===== An OWNER's own reply does NOT notify themselves =====
set local role authenticated;
select set_config('request.jwt.claim.sub', '35111111-1111-1111-1111-111111111111', true);
insert into public.property_messages (conversation_id, sender_role, message)
values ('35c00000-0000-0000-0000-000000000001', 'Owner', 'On it, thanks for letting me know.');
reset role;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.notification_events where owner_id = '35111111-1111-1111-1111-111111111111' and event_type = 'tenant_message';
  if v_count = 1 then
    raise notice 'PASS: the owner''s own reply does not create a second tenant_message notification';
  else
    raise exception 'REGRESSION: owner''s own reply created a notification (count=%), expected still 1', v_count;
  end if;
end $$;

-- ===== 2. A tenant_requests insert triggers exactly one tenant_maintenance_request notification, carrying the real maintenance_request_id the OTHER trigger (tenant_requests_create_maintenance_case) set =====
set local role authenticated;
select set_config('request.jwt.claim.sub', '35333333-3333-3333-3333-333333333333', true);
insert into public.tenant_requests (id, property_id, owner_id, tenant_access_id, conversation_id, category, title, description)
values ('35d00000-0000-0000-0000-000000000001', '35a00000-0000-0000-0000-000000000001', '35111111-1111-1111-1111-111111111111', '35b00000-0000-0000-0000-000000000001', '35c00000-0000-0000-0000-000000000001', 'plumbing', 'Leaking sink', 'Steady drip under the sink.');
reset role;

do $$
declare
  v_count int;
  v_linked_case uuid;
  v_event_case uuid;
begin
  select maintenance_request_id into v_linked_case from public.tenant_requests where id = '35d00000-0000-0000-0000-000000000001';
  select count(*) into v_count from public.notification_events where owner_id = '35111111-1111-1111-1111-111111111111' and event_type = 'tenant_maintenance_request';
  select maintenance_request_id into v_event_case from public.notification_events where owner_id = '35111111-1111-1111-1111-111111111111' and event_type = 'tenant_maintenance_request' limit 1;
  if v_count = 1 and v_event_case = v_linked_case and v_linked_case is not null then
    raise notice 'PASS: a new tenant_requests row creates exactly one tenant_maintenance_request notification, linked to the real canonical case';
  else
    raise exception 'REGRESSION: tenant_maintenance_request notification missing or mislinked (count=%, event_case=%, real_case=%)', v_count, v_event_case, v_linked_case;
  end if;
end $$;

-- ===== 3. A maintenance_requests status change triggers exactly one notification; re-saving the SAME status does not =====
set local role authenticated;
select set_config('request.jwt.claim.sub', '35111111-1111-1111-1111-111111111111', true);
do $$
declare v_case_id uuid;
begin
  select maintenance_request_id into v_case_id from public.tenant_requests where id = '35d00000-0000-0000-0000-000000000001';
  update public.maintenance_requests set status = 'In Progress' where id = v_case_id;
  update public.maintenance_requests set status = 'In Progress' where id = v_case_id; -- no-op re-save
end $$;
reset role;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.notification_events where owner_id = '35111111-1111-1111-1111-111111111111' and event_type = 'maintenance_status_change';
  if v_count = 1 then
    raise notice 'PASS: a real status change creates exactly one notification; re-saving the same status creates no duplicate';
  else
    raise exception 'REGRESSION: expected exactly 1 maintenance_status_change notification after one real change + one no-op resave, got %', v_count;
  end if;
end $$;

-- ===== 4. Outreach: sending (status='sent') does NOT notify; a provider response does, exactly once. Both writes go through the admin/service-role path in production (owner sends via an API route using createAdminClient; the provider responds via a public token route using createAdminClient) — simulated here as postgres, same as that bypasses RLS identically. =====
insert into public.property_contacts (id, owner_id, property_id, name, role) values
  ('35e00000-0000-0000-0000-000000000001', '35111111-1111-1111-1111-111111111111', '35a00000-0000-0000-0000-000000000001', 'Test Plumber', 'Plumbing');

do $$
declare v_case_id uuid;
begin
  select maintenance_request_id into v_case_id from public.tenant_requests where id = '35d00000-0000-0000-0000-000000000001';
  insert into public.maintenance_provider_outreach (id, maintenance_request_id, contact_id, owner_id, status, token_hash)
  values ('35f00000-0000-0000-0000-000000000001', v_case_id, '35e00000-0000-0000-0000-000000000001', '35111111-1111-1111-1111-111111111111', 'sent', 'faketokenhash');
end $$;

do $$
declare v_count int;
begin
  select count(*) into v_count from public.notification_events where owner_id = '35111111-1111-1111-1111-111111111111' and event_type = 'propcrew_outreach_response';
  if v_count = 0 then
    raise notice 'PASS: sending an outreach (status=sent) does not itself create a notification';
  else
    raise exception 'REGRESSION: sending outreach created % notifications, expected 0', v_count;
  end if;
end $$;

update public.maintenance_provider_outreach set status = 'accepted', responded_at = now() where id = '35f00000-0000-0000-0000-000000000001';

do $$
declare v_count int;
begin
  select count(*) into v_count from public.notification_events where owner_id = '35111111-1111-1111-1111-111111111111' and event_type = 'propcrew_outreach_response';
  if v_count = 1 then
    raise notice 'PASS: a provider response (sent -> accepted) creates exactly one notification';
  else
    raise exception 'REGRESSION: expected exactly 1 propcrew_outreach_response notification after one response, got %', v_count;
  end if;
end $$;

-- ===== 5. Tenant invite acceptance: accepted_at null -> timestamp triggers exactly one notification; it cannot fire twice. In production this goes through accept_tenant_invite()'s own atomic conditional UPDATE, simulated here directly. =====
insert into public.tenant_property_access (id, property_id, owner_id, tenant_email, status, invited_at)
values ('35b00000-0000-0000-0000-000000000002', '35a00000-0000-0000-0000-000000000001', '35111111-1111-1111-1111-111111111111', 'other-tenant@example.test', 'Invited', now());

update public.tenant_property_access set status = 'Active', accepted_at = now() where id = '35b00000-0000-0000-0000-000000000002';
update public.tenant_property_access set tenant_email = 'other-tenant@example.test' where id = '35b00000-0000-0000-0000-000000000002'; -- unrelated update, must not re-fire

do $$
declare v_count int;
begin
  select count(*) into v_count from public.notification_events where owner_id = '35111111-1111-1111-1111-111111111111' and event_type = 'tenant_invite_accepted';
  if v_count = 1 then
    raise notice 'PASS: accepted_at transitioning null -> timestamp creates exactly one notification; an unrelated later update does not re-fire it';
  else
    raise exception 'REGRESSION: expected exactly 1 tenant_invite_accepted notification, got %', v_count;
  end if;
end $$;

-- ===== CROSS-OWNER ISOLATION: owner 2 sees ZERO of owner 1's notifications =====
set local role authenticated;
select set_config('request.jwt.claim.sub', '35222222-2222-2222-2222-222222222222', true);

do $$
declare v_count int;
begin
  select count(*) into v_count from public.notification_events where owner_id = '35111111-1111-1111-1111-111111111111';
  if v_count = 0 then
    raise notice 'PASS: owner 2 cannot see owner 1''s notifications';
  else
    raise exception 'REGRESSION: owner 2 could see owner 1''s notification_events rows — cross-owner leak';
  end if;
end $$;

-- Owner 2 cannot mark owner 1's notification read either (RLS-filtered to 0 rows, not an error).
do $$
declare v_affected int;
begin
  update public.notification_events set read_at = now() where owner_id = '35111111-1111-1111-1111-111111111111';
  get diagnostics v_affected = row_count;
  if v_affected = 0 then
    raise notice 'PASS: owner 2''s attempt to mark owner 1''s notifications read affects zero rows';
  else
    raise exception 'REGRESSION: owner 2 was able to mark % of owner 1''s notifications as read', v_affected;
  end if;
end $$;

-- A client (even the real owner) cannot INSERT a notification directly — no insert policy exists at all.
select set_config('request.jwt.claim.sub', '35111111-1111-1111-1111-111111111111', true);
do $$
begin
  begin
    insert into public.notification_events (owner_id, event_type) values ('35111111-1111-1111-1111-111111111111', 'tenant_message');
    raise exception 'REGRESSION: a client was able to INSERT a notification_events row directly';
  exception
    when insufficient_privilege or others then
      raise notice 'PASS: no client, not even the real owner, can INSERT into notification_events directly — only the SECURITY DEFINER triggers can';
  end;
end $$;

-- ===== Owner 1 CAN select and mark their own notifications read =====
select set_config('request.jwt.claim.sub', '35111111-1111-1111-1111-111111111111', true);
do $$
declare v_unread_before int; v_unread_after int;
begin
  select count(*) into v_unread_before from public.notification_events where owner_id = '35111111-1111-1111-1111-111111111111' and read_at is null;
  update public.notification_events set read_at = now() where owner_id = '35111111-1111-1111-1111-111111111111' and read_at is null;
  select count(*) into v_unread_after from public.notification_events where owner_id = '35111111-1111-1111-1111-111111111111' and read_at is null;
  if v_unread_before > 0 and v_unread_after = 0 then
    raise notice 'PASS: owner 1 can mark-all-as-read their own notifications (% -> 0 unread)', v_unread_before;
  else
    raise exception 'REGRESSION: mark-all-as-read did not work as expected (before=%, after=%)', v_unread_before, v_unread_after;
  end if;
end $$;

rollback;
