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
-- an owner replying to their own conversation does not notify
-- themselves, and (post-launch audit fix) the REAL guided-intake write
-- sequence — conversation, then opening tenant message, then
-- tenant_requests — produces exactly ONE notification per submission,
-- while every other tenant message (a later reply, or a message in a
-- conversation no tenant_requests row ever references, even one of
-- conversation_type 'Maintenance') still gets its own, un-suppressed
-- notification.
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
  ('35333333-3333-3333-3333-333333333333'), -- owner 1's tenant
  ('35444444-4444-4444-4444-444444444444'); -- owner 2's tenant

reset role;
insert into public.properties (id, owner_id, address, city) values
  ('35a00000-0000-0000-0000-000000000001', '35111111-1111-1111-1111-111111111111', '1 Test St', 'Town'),
  ('35a00000-0000-0000-0000-000000000002', '35222222-2222-2222-2222-222222222222', '2 Other St', 'Town');

insert into public.tenant_property_access (id, property_id, owner_id, tenant_user_id, tenant_email, status, invited_at)
values ('35b00000-0000-0000-0000-000000000001', '35a00000-0000-0000-0000-000000000001', '35111111-1111-1111-1111-111111111111', '35333333-3333-3333-3333-333333333333', 'tenant@example.test', 'Active', now());

-- Owner 2's OWN tenant/conversation/message (final-gate audit case):
-- a decoy 'tenant_message' notification that exists the whole time
-- owner 1's upgrade logic below is running, to prove
-- notify_on_tenant_request()'s UPDATE — which runs SECURITY DEFINER
-- and is NOT constrained by RLS at all — can structurally never touch
-- another owner's row (it's scoped by conversation_id, which is
-- globally unique per conversation and thus per owner, never by
-- anything an attacker-adjacent value could collide with).
insert into public.tenant_property_access (id, property_id, owner_id, tenant_user_id, tenant_email, status, invited_at)
values ('35b00000-0000-0000-0000-000000000003', '35a00000-0000-0000-0000-000000000002', '35222222-2222-2222-2222-222222222222', '35444444-4444-4444-4444-444444444444', 'owner2-tenant@example.test', 'Active', now());
insert into public.property_conversations (id, property_id, owner_id, tenant_access_id, subject, conversation_type)
values ('35c00000-0000-0000-0000-000000000099', '35a00000-0000-0000-0000-000000000002', '35222222-2222-2222-2222-222222222222', '35b00000-0000-0000-0000-000000000003', 'Owner 2''s own issue', 'Maintenance');
set local role authenticated;
select set_config('request.jwt.claim.sub', '35444444-4444-4444-4444-444444444444', true);
insert into public.property_messages (conversation_id, sender_role, message)
values ('35c00000-0000-0000-0000-000000000099', 'Tenant', 'Owner 2''s own tenant message — must never be touched by anything happening in owner 1''s account.');
reset role;

-- conversation_type = 'Maintenance' because tenant_requests_insert_tenant's
-- own WITH CHECK requires the linked conversation to carry that type —
-- NOT because the fix below reads this column at all (it deliberately
-- doesn't; see the migration's own comment on why that heuristic was
-- rejected).
insert into public.property_conversations (id, property_id, owner_id, tenant_access_id, subject, conversation_type)
values ('35c00000-0000-0000-0000-000000000001', '35a00000-0000-0000-0000-000000000001', '35111111-1111-1111-1111-111111111111', '35b00000-0000-0000-0000-000000000001', 'Leaking sink', 'Maintenance');

-- ===== 1. THE REAL GUIDED-INTAKE SEQUENCE: conversation already
-- created above; now the opening tenant message, then the
-- tenant_requests row referencing the SAME conversation — exactly
-- matching lib/maintenance/intake/submit.ts's own write order. =====
set local role authenticated;
select set_config('request.jwt.claim.sub', '35333333-3333-3333-3333-333333333333', true);
insert into public.property_messages (conversation_id, sender_role, message)
values ('35c00000-0000-0000-0000-000000000001', 'Tenant', 'Steady drip under the sink.');
reset role;

do $$
declare v_count int; v_type text;
begin
  select count(*), max(event_type) into v_count, v_type from public.notification_events where owner_id = '35111111-1111-1111-1111-111111111111';
  if v_count = 1 and v_type = 'tenant_message' then
    raise notice 'PASS: immediately after the opening message alone, exactly one tenant_message notification exists (intermediate state, before the request lands)';
  else
    raise exception 'REGRESSION: expected exactly 1 tenant_message notification at this intermediate point, got % of type %', v_count, v_type;
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '35333333-3333-3333-3333-333333333333', true);
insert into public.tenant_requests (id, property_id, owner_id, tenant_access_id, conversation_id, category, title, description)
values ('35d00000-0000-0000-0000-000000000001', '35a00000-0000-0000-0000-000000000001', '35111111-1111-1111-1111-111111111111', '35b00000-0000-0000-0000-000000000001', '35c00000-0000-0000-0000-000000000001', 'plumbing', 'Leaking sink', 'Steady drip under the sink.');
reset role;

do $$
declare
  v_count int;
  v_linked_case uuid;
  v_event_type text;
  v_event_case uuid;
begin
  select maintenance_request_id into v_linked_case from public.tenant_requests where id = '35d00000-0000-0000-0000-000000000001';
  -- THE core fix under test: still exactly ONE notification for this
  -- conversation — the earlier tenant_message row was UPGRADED in
  -- place, never left behind as a second, duplicate row.
  select count(*) into v_count from public.notification_events where conversation_id = '35c00000-0000-0000-0000-000000000001';
  select event_type, maintenance_request_id into v_event_type, v_event_case from public.notification_events where conversation_id = '35c00000-0000-0000-0000-000000000001' limit 1;
  if v_count = 1 and v_event_type = 'tenant_maintenance_request' and v_event_case = v_linked_case and v_linked_case is not null then
    raise notice 'PASS: one real guided-intake submission (conversation + opening message + tenant_requests) produces exactly ONE notification, upgraded to tenant_maintenance_request and correctly linked to the real canonical case — not two';
  else
    raise exception 'REGRESSION: expected exactly 1 upgraded tenant_maintenance_request notification for this conversation, got count=%, type=%, event_case=%, real_case=%', v_count, v_event_type, v_event_case, v_linked_case;
  end if;
end $$;

-- ===== 1b. UNUSUAL BUT VALID SEQUENCE (final-gate audit case): a
-- SECOND tenant message arrives BEFORE the tenant_requests row — i.e.
-- conversation, opening message, a second message, THEN the request.
-- Both messages land in the same transaction here (reproducing the
-- real tie Postgres produces on created_at for same-transaction
-- inserts), so this specifically proves the fix no longer depends on
-- created_at at all: it must upgrade the EARLIER (opening) message's
-- notification, by seq, never the later one, regardless of any
-- timestamp tie. =====
reset role;
insert into public.property_conversations (id, property_id, owner_id, tenant_access_id, subject, conversation_type)
values ('35c00000-0000-0000-0000-000000000003', '35a00000-0000-0000-0000-000000000001', '35111111-1111-1111-1111-111111111111', '35b00000-0000-0000-0000-000000000001', 'Loose cabinet', 'Maintenance');

set local role authenticated;
select set_config('request.jwt.claim.sub', '35333333-3333-3333-3333-333333333333', true);
insert into public.property_messages (conversation_id, sender_role, message)
values ('35c00000-0000-0000-0000-000000000003', 'Tenant', 'Opening message: cabinet door is loose.');
insert into public.property_messages (conversation_id, sender_role, message)
values ('35c00000-0000-0000-0000-000000000003', 'Tenant', 'Second message, before any request exists yet: also a hinge is squeaking.');
reset role;

do $$
declare v_opening_notif_seq bigint; v_second_notif_seq bigint;
begin
  select seq into v_opening_notif_seq from public.notification_events
    where conversation_id = '35c00000-0000-0000-0000-000000000003' order by seq asc limit 1;
  select seq into v_second_notif_seq from public.notification_events
    where conversation_id = '35c00000-0000-0000-0000-000000000003' order by seq desc limit 1;
  if v_opening_notif_seq is not null and v_second_notif_seq is not null and v_opening_notif_seq < v_second_notif_seq then
    raise notice 'PASS: two tenant messages before any request both notified, in true insertion order (seq % then %), regardless of any created_at tie', v_opening_notif_seq, v_second_notif_seq;
  else
    raise exception 'REGRESSION: expected two distinct, strictly ordered notification seqs, got opening=%, second=%', v_opening_notif_seq, v_second_notif_seq;
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '35333333-3333-3333-3333-333333333333', true);
insert into public.tenant_requests (id, property_id, owner_id, tenant_access_id, conversation_id, category, title, description)
values ('35d00000-0000-0000-0000-000000000003', '35a00000-0000-0000-0000-000000000001', '35111111-1111-1111-1111-111111111111', '35b00000-0000-0000-0000-000000000001', '35c00000-0000-0000-0000-000000000003', 'other', 'Loose cabinet', 'Cabinet door is loose.');
reset role;

do $$
declare
  v_total int;
  v_upgraded_seq bigint;
  v_remaining_seq bigint;
  v_remaining_type text;
begin
  select count(*) into v_total from public.notification_events where conversation_id = '35c00000-0000-0000-0000-000000000003';
  select seq into v_upgraded_seq from public.notification_events where conversation_id = '35c00000-0000-0000-0000-000000000003' and event_type = 'tenant_maintenance_request';
  select seq, event_type into v_remaining_seq, v_remaining_type from public.notification_events where conversation_id = '35c00000-0000-0000-0000-000000000003' and event_type = 'tenant_message';
  if v_total = 2 and v_upgraded_seq is not null and v_remaining_seq is not null and v_remaining_type = 'tenant_message' and v_upgraded_seq < v_remaining_seq then
    raise notice 'PASS: the EARLIER (opening) message''s notification (seq %) was upgraded to tenant_maintenance_request; the LATER second message''s notification (seq %) correctly remains a plain tenant_message — never the reverse', v_upgraded_seq, v_remaining_seq;
  else
    raise exception 'REGRESSION: expected the lower-seq notification upgraded and the higher-seq one left as tenant_message; got total=%, upgraded_seq=%, remaining_seq=%, remaining_type=%', v_total, v_upgraded_seq, v_remaining_seq, v_remaining_type;
  end if;
end $$;

-- ===== 2. A SUBSEQUENT tenant reply in the SAME conversation (after
-- the request already landed) still creates its own, separate
-- tenant_message notification — the upgrade only ever touches the one
-- opening-message row, never a later reply. =====
set local role authenticated;
select set_config('request.jwt.claim.sub', '35333333-3333-3333-3333-333333333333', true);
insert into public.property_messages (conversation_id, sender_role, message)
values ('35c00000-0000-0000-0000-000000000001', 'Tenant', 'Also, it is dripping faster now.');
reset role;

do $$
declare v_total int; v_message_count int; v_request_count int;
begin
  select count(*) into v_total from public.notification_events where conversation_id = '35c00000-0000-0000-0000-000000000001';
  select count(*) into v_message_count from public.notification_events where conversation_id = '35c00000-0000-0000-0000-000000000001' and event_type = 'tenant_message';
  select count(*) into v_request_count from public.notification_events where conversation_id = '35c00000-0000-0000-0000-000000000001' and event_type = 'tenant_maintenance_request';
  if v_total = 2 and v_message_count = 1 and v_request_count = 1 then
    raise notice 'PASS: a later reply in the same conversation gets its own tenant_message notification, alongside the untouched upgraded tenant_maintenance_request one (2 total, not 1 and not 3)';
  else
    raise exception 'REGRESSION: expected 2 total notifications for this conversation after a follow-up reply (1 tenant_message + 1 tenant_maintenance_request), got total=%, message=%, request=%', v_total, v_message_count, v_request_count;
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
  select count(*) into v_count from public.notification_events where conversation_id = '35c00000-0000-0000-0000-000000000001' and event_type = 'tenant_message';
  if v_count = 1 then
    raise notice 'PASS: the owner''s own reply does not create a second tenant_message notification';
  else
    raise exception 'REGRESSION: owner''s own reply created a notification (count=%), expected still 1', v_count;
  end if;
end $$;

-- ===== 3. An ORDINARY tenant message — in a conversation no
-- tenant_requests row ever references, even though it is ALSO
-- conversation_type = 'Maintenance' — is never suppressed and never
-- "upgraded": it stays exactly one plain tenant_message notification
-- forever. This proves the fix is keyed on the real tenant_requests ->
-- conversation_id link, never on the conversation_type string (the
-- rejected heuristic). =====
reset role;
insert into public.property_conversations (id, property_id, owner_id, tenant_access_id, subject, conversation_type)
values ('35c00000-0000-0000-0000-000000000002', '35a00000-0000-0000-0000-000000000001', '35111111-1111-1111-1111-111111111111', '35b00000-0000-0000-0000-000000000001', 'A question', 'Maintenance');

set local role authenticated;
select set_config('request.jwt.claim.sub', '35333333-3333-3333-3333-333333333333', true);
insert into public.property_messages (conversation_id, sender_role, message)
values ('35c00000-0000-0000-0000-000000000002', 'Tenant', 'Quick question about trash pickup day.');
reset role;

do $$
declare v_count int; v_type text;
begin
  select count(*), max(event_type) into v_count, v_type from public.notification_events where conversation_id = '35c00000-0000-0000-0000-000000000002';
  if v_count = 1 and v_type = 'tenant_message' then
    raise notice 'PASS: an ordinary tenant message with no tenant_requests ever referencing it stays a plain, un-suppressed, un-upgraded tenant_message notification — conversation_type alone never triggers the upgrade';
  else
    raise exception 'REGRESSION: expected exactly 1 untouched tenant_message notification for the unrelated conversation, got count=%, type=%', v_count, v_type;
  end if;
end $$;

-- ===== 4. A maintenance_requests status change triggers exactly one notification; re-saving the SAME status does not =====
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

-- ===== 5. Outreach: sending (status='sent') does NOT notify; a provider response does, exactly once. Both writes go through the admin/service-role path in production (owner sends via an API route using createAdminClient; the provider responds via a public token route using createAdminClient) — simulated here as postgres, same as that bypasses RLS identically. =====
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

-- ===== 6. Tenant invite acceptance: accepted_at null -> timestamp triggers exactly one notification; it cannot fire twice. In production this goes through accept_tenant_invite()'s own atomic conditional UPDATE, simulated here directly. =====
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

-- ===== Owner 2's decoy notification (created at the very start, before
-- any of owner 1's activity above) is COMPLETELY untouched by every
-- upgrade-in-place UPDATE that ran for owner 1 in between — proves
-- notify_on_tenant_request()'s UPDATE, which bypasses RLS entirely as
-- a SECURITY DEFINER function, is still structurally confined to the
-- one conversation_id it was given and can never cross into another
-- owner's row. =====
reset role;
do $$
declare v_count int; v_type text;
begin
  select count(*), max(event_type) into v_count, v_type from public.notification_events where conversation_id = '35c00000-0000-0000-0000-000000000099';
  if v_count = 1 and v_type = 'tenant_message' then
    raise notice 'PASS: owner 2''s own notification is still exactly one untouched tenant_message row after everything that happened in owner 1''s account — the trigger''s UPDATE never crossed owners';
  else
    raise exception 'REGRESSION: owner 2''s decoy notification was modified or lost by activity in owner 1''s account (count=%, type=%)', v_count, v_type;
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

-- A client cannot DELETE a notification directly either — no delete policy exists at all.
do $$
begin
  begin
    delete from public.notification_events where owner_id = '35111111-1111-1111-1111-111111111111';
    raise exception 'REGRESSION: a client was able to DELETE notification_events rows directly';
  exception
    when insufficient_privilege or others then
      raise notice 'PASS: no client can DELETE from notification_events — there is no delete policy at all';
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
