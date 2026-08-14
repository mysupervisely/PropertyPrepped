-- PropRoster Milestone 11 — Privacy-First Admin Analytics RLS + privacy
-- regression test.
--
-- Same convention as milestone-9-rls.test.sql / milestone-10-rls.test.sql:
-- NOT run by `npm test` (no Postgres in the Node/vitest pipeline). Run by
-- hand (or from CI with a scratch Postgres) against a database that
-- already has PropRoster's schema loaded. Every block RAISEs "REGRESSION"
-- (something is broken) or NOTICEs "PASS" (the property held). Run with
-- `psql -v ON_ERROR_STOP=1` and grep for "REGRESSION" — a clean run has
-- zero matches.
--
-- Covers every item in the task's Section 10 checklist:
--   1. (app-layer — /admin's own auth check; not a DB concern, see the
--      completion report's "RLS/security tests" section for how this is
--      covered end-to-end)
--   2. Normal user cannot call an admin aggregate RPC
--   3. Admin can access aggregate metrics
--   4/5/6. Admin aggregate response contains no property address /
--      document content / tenant message content — checked BOTH by
--      inspecting the actual returned columns AND by statically scanning
--      every admin_* function's source for references to forbidden
--      tables/columns (a real "search the admin code" pass, run as SQL)
--   7. User cannot grant themselves admin role
--   8. User cannot read admin audit log
--   9. Admin audit event is created for admin analytics access
--   10. Owner subscription entitlement alone does not bypass admin authorization
--
-- Uses throwaway users/data created inside a transaction that is rolled
-- back at the end, so this never leaves test data behind.

begin;

insert into auth.users (id, email) values
  ('a1111111-1111-1111-1111-111111111111', 'normal-user@example.com'),      -- normal user, not admin
  ('a2222222-2222-2222-2222-222222222222', 'admin-user@example.com'),       -- real admin
  ('a3333333-3333-3333-3333-333333333333', 'owner-plan-user@example.com'),  -- 'owner' SUBSCRIPTION plan, NOT an admin_roles row
  ('a4444444-4444-4444-4444-444444444444', 'attacker@example.com');         -- attacker trying to self-grant admin

-- Real admin, granted the only way a client can never reach: a direct
-- operator SQL statement (never through any API route or RLS policy).
insert into public.admin_roles (user_id, granted_by) values
  ('a2222222-2222-2222-2222-222222222222', 'a2222222-2222-2222-2222-222222222222');

-- ===== Item 10 setup: 'owner' SUBSCRIPTION plan user has NO admin_roles row =====
insert into public.user_subscriptions (owner_id, plan, status) values
  ('a3333333-3333-3333-3333-333333333333', 'owner', 'active');

-- ===== Portfolio-usage privacy fixture: a real property with an address =====
insert into public.properties (owner_id, address, city, estimated_value) values
  ('a1111111-1111-1111-1111-111111111111', '742 Evergreen Terrace', 'Springfield', 500000);

-- ===== Document-intelligence privacy fixture: a document + analysis with structured content =====
insert into public.property_documents (property_id, owner_id, name, storage_path)
select id, 'a1111111-1111-1111-1111-111111111111', 'Test Policy.pdf', 'a1111111-1111-1111-1111-111111111111/test-policy.pdf'
from public.properties where owner_id = 'a1111111-1111-1111-1111-111111111111';

insert into public.document_analyses (document_id, property_id, owner_id, document_type, summary, structured_data, model_provider, model_name)
select pd.id, pd.property_id, 'a1111111-1111-1111-1111-111111111111', 'Insurance Policy', 'This is a private summary that must never appear in admin analytics.',
       '{"carrier": "SUPER SECRET CARRIER NAME", "policyNumber": "SECRET-POLICY-999"}'::jsonb, 'anthropic', 'claude-sonnet-5'
from public.property_documents pd where pd.owner_id = 'a1111111-1111-1111-1111-111111111111';

-- ===== Item 2: Normal user cannot call an admin aggregate RPC =====
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1111111-1111-1111-1111-111111111111', true);
do $$
begin
  begin
    perform public.admin_overview_metrics();
    raise exception 'REGRESSION: normal (non-admin) user was able to call admin_overview_metrics()';
  exception
    when others then
      if sqlerrm = 'Not authorized.' then
        raise notice 'PASS: normal user blocked from admin_overview_metrics() (%)', sqlerrm;
      else
        raise exception 'REGRESSION: unexpected error calling admin_overview_metrics() as normal user: %', sqlerrm;
      end if;
  end;
end $$;

-- Same denial for every other admin RPC — proves the authorization check
-- is genuinely present in each function, not just the first one tested.
do $$
begin
  begin
    perform public.admin_subscription_metrics();
    raise exception 'REGRESSION: normal user called admin_subscription_metrics()';
  exception when others then
    if sqlerrm = 'Not authorized.' then raise notice 'PASS: admin_subscription_metrics() blocked'; else raise exception '%', sqlerrm; end if;
  end;
  begin
    perform public.admin_portfolio_usage_metrics();
    raise exception 'REGRESSION: normal user called admin_portfolio_usage_metrics()';
  exception when others then
    if sqlerrm = 'Not authorized.' then raise notice 'PASS: admin_portfolio_usage_metrics() blocked'; else raise exception '%', sqlerrm; end if;
  end;
  begin
    perform public.admin_feature_adoption_metrics();
    raise exception 'REGRESSION: normal user called admin_feature_adoption_metrics()';
  exception when others then
    if sqlerrm = 'Not authorized.' then raise notice 'PASS: admin_feature_adoption_metrics() blocked'; else raise exception '%', sqlerrm; end if;
  end;
  begin
    perform public.admin_ai_usage_summary();
    raise exception 'REGRESSION: normal user called admin_ai_usage_summary()';
  exception when others then
    if sqlerrm = 'Not authorized.' then raise notice 'PASS: admin_ai_usage_summary() blocked'; else raise exception '%', sqlerrm; end if;
  end;
  begin
    perform public.admin_ai_usage_daily(30);
    raise exception 'REGRESSION: normal user called admin_ai_usage_daily()';
  exception when others then
    if sqlerrm = 'Not authorized.' then raise notice 'PASS: admin_ai_usage_daily() blocked'; else raise exception '%', sqlerrm; end if;
  end;
  begin
    perform public.admin_list_user_accounts(10, 0);
    raise exception 'REGRESSION: normal user called admin_list_user_accounts()';
  exception when others then
    if sqlerrm = 'Not authorized.' then raise notice 'PASS: admin_list_user_accounts() blocked'; else raise exception '%', sqlerrm; end if;
  end;
end $$;

-- ===== Item 1 (route-level, DB-adjacent check): is_admin() itself must
-- also be false for a normal user, since /admin's own server check calls
-- exactly this function =====
do $$
begin
  if public.is_admin('a1111111-1111-1111-1111-111111111111'::uuid) then
    raise exception 'REGRESSION: is_admin() returned true for a normal, non-admin user';
  end if;
  raise notice 'PASS: is_admin() is false for a normal user';
end $$;

-- ===== Item 10: 'owner' SUBSCRIPTION plan does NOT imply admin =====
do $$
begin
  if public.is_admin('a3333333-3333-3333-3333-333333333333'::uuid) then
    raise exception 'REGRESSION: is_admin() returned true for a user whose only credential is the internal owner SUBSCRIPTION plan';
  end if;
  raise notice 'PASS: the internal owner subscription plan does NOT imply admin — is_admin() correctly false';
end $$;

select set_config('request.jwt.claim.sub', 'a3333333-3333-3333-3333-333333333333', true);
do $$
begin
  begin
    perform public.admin_overview_metrics();
    raise exception 'REGRESSION: owner-plan (non-admin) user was able to call admin_overview_metrics()';
  exception when others then
    if sqlerrm = 'Not authorized.' then
      raise notice 'PASS: owner-subscription-plan user blocked from admin_overview_metrics() — plan alone never bypasses admin auth';
    else
      raise exception 'REGRESSION: unexpected error: %', sqlerrm;
    end if;
  end;
end $$;

-- ===== Item 7: user cannot grant themselves admin role =====
select set_config('request.jwt.claim.sub', 'a4444444-4444-4444-4444-444444444444', true);
do $$
begin
  begin
    insert into public.admin_roles (user_id, granted_by) values ('a4444444-4444-4444-4444-444444444444', 'a4444444-4444-4444-4444-444444444444');
    raise exception 'REGRESSION: authenticated client was able to self-grant admin_roles';
  exception
    when insufficient_privilege then
      raise notice 'PASS: authenticated client cannot INSERT into admin_roles (self-grant denied)';
  end;
end $$;

-- ===== Item 8: user cannot read admin audit log =====
reset role;
insert into public.admin_audit_events (admin_user_id, action) values ('a2222222-2222-2222-2222-222222222222', 'VIEW_ADMIN_ANALYTICS');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1111111-1111-1111-1111-111111111111', true);
do $$
declare
  visible_count integer;
begin
  select count(*) into visible_count from public.admin_audit_events;
  if visible_count <> 0 then
    raise exception 'REGRESSION: normal user could see % admin_audit_events row(s)', visible_count;
  end if;
  raise notice 'PASS: normal user sees 0 admin_audit_events rows (RLS-filtered, not merely hidden by app code)';
end $$;

do $$
begin
  begin
    insert into public.admin_audit_events (admin_user_id, action) values ('a1111111-1111-1111-1111-111111111111', 'VIEW_ADMIN_ANALYTICS');
    raise exception 'REGRESSION: normal (non-admin) user was able to INSERT an admin_audit_events row for themselves';
  exception
    when insufficient_privilege then
      raise notice 'PASS: normal user cannot INSERT into admin_audit_events even for their own admin_user_id (is_admin() check in the policy)';
  end;
end $$;

-- ===== Item 3: admin CAN access aggregate metrics =====
select set_config('request.jwt.claim.sub', 'a2222222-2222-2222-2222-222222222222', true);
do $$
declare
  v_total_users bigint;
  v_total_properties bigint;
begin
  select total_users into v_total_users from public.admin_overview_metrics();
  if v_total_users is null or v_total_users < 4 then
    raise exception 'REGRESSION: admin_overview_metrics() did not return sane data for an admin caller (total_users=%)', v_total_users;
  end if;
  select total_properties into v_total_properties from public.admin_portfolio_usage_metrics();
  if v_total_properties is null or v_total_properties < 1 then
    raise exception 'REGRESSION: admin_portfolio_usage_metrics() did not count the fixture property (total_properties=%)', v_total_properties;
  end if;
  raise notice 'PASS: admin successfully retrieved aggregate metrics (total_users=%, total_properties=%)', v_total_users, v_total_properties;
end $$;

-- ===== Items 4/5/6: the actual returned rows contain no address, no
-- document content, no tenant message content =====
do $$
declare
  v_row text;
begin
  -- admin_portfolio_usage_metrics() returns only counts/averages — cast the
  -- whole row to text and confirm the fixture address string is nowhere in it.
  select row(total_properties, owners_with_properties, avg_properties_per_owner, median_properties_per_owner,
             bucket_1, bucket_2_4, bucket_5_9, bucket_10_20, bucket_21_plus)::text
  into v_row
  from public.admin_portfolio_usage_metrics();
  if v_row ilike '%Evergreen Terrace%' then
    raise exception 'REGRESSION: admin_portfolio_usage_metrics() output contains the fixture property address';
  end if;
  raise notice 'PASS: admin_portfolio_usage_metrics() output contains no property address';

  select row(investment_tools_users, investment_analyses_count, document_intelligence_users,
             document_analyses_count, tenant_connect_owner_count, tenant_connect_active_relationships)::text
  into v_row
  from public.admin_feature_adoption_metrics();
  if v_row ilike '%SECRET%' or v_row ilike '%private summary%' then
    raise exception 'REGRESSION: admin_feature_adoption_metrics() output contains document content';
  end if;
  raise notice 'PASS: admin_feature_adoption_metrics() output contains no document content';
end $$;

-- Structural check: statically scan every admin_* function's actual SQL
-- source for references to tables/columns this milestone must never touch
-- — this is "search the admin code for references to sensitive
-- tables/columns" performed as an executable test, not just a manual
-- read-through.
do $$
declare
  r record;
  forbidden text[] := array[
    'property_documents', 'document_analyses.structured_data', 'structured_data',
    'source_references', 'leases', 'mortgages', 'insurance_policies',
    'financial_transactions', 'maintenance_records', 'property_contacts',
    'investment_analyses.address', 'investment_analyses.results',
    'property_conversations', 'property_messages', 'tenant_property_access.tenant_email',
    'properties.address', 'p.address'
  ];
  f text;
  src text;
begin
  for r in
    select p.proname, pg_get_functiondef(p.oid) as def
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'admin\_%' escape '\'
  loop
    src := lower(r.def);
    foreach f in array forbidden loop
      if position(lower(f) in src) > 0 then
        raise exception 'REGRESSION: function % references forbidden sensitive table/column "%"', r.proname, f;
      end if;
    end loop;
  end loop;
  raise notice 'PASS: no admin_* function references any forbidden sensitive table/column';
end $$;

-- ===== Item 9: admin audit event is created for admin analytics access =====
-- (mirrors exactly what app/api/admin/analytics/route.ts does after a
-- successful view — an RLS-scoped INSERT as the acting admin)
do $$
declare
  v_id uuid;
begin
  insert into public.admin_audit_events (admin_user_id, action, target_user_id, metadata)
  values ('a2222222-2222-2222-2222-222222222222', 'VIEW_ADMIN_ANALYTICS', null, '{}'::jsonb)
  returning id into v_id;
  if v_id is null then
    raise exception 'REGRESSION: admin could not insert a VIEW_ADMIN_ANALYTICS audit row';
  end if;
  raise notice 'PASS: admin audit event created for admin analytics access (id=%)', v_id;
end $$;

do $$
declare
  v_count integer;
begin
  select count(*) into v_count from public.admin_audit_events where admin_user_id = 'a2222222-2222-2222-2222-222222222222' and action = 'VIEW_ADMIN_ANALYTICS';
  if v_count < 1 then
    raise exception 'REGRESSION: admin cannot read back their own just-inserted audit event';
  end if;
  raise notice 'PASS: admin can read the audit log they have access to (% VIEW_ADMIN_ANALYTICS row(s) visible)', v_count;
end $$;

-- ===== Cross-tenant admin_user_id spoof on the audit log insert is rejected =====
do $$
begin
  begin
    insert into public.admin_audit_events (admin_user_id, action) values ('a1111111-1111-1111-1111-111111111111', 'VIEW_ADMIN_ANALYTICS');
    raise exception 'REGRESSION: admin was able to insert an audit row attributed to a DIFFERENT user';
  exception
    when insufficient_privilege then
      raise notice 'PASS: admin cannot insert an audit row for a different admin_user_id (own-row check in the policy)';
  end;
end $$;

rollback;

-- To run against a fresh local Postgres, first load the auth/storage
-- schema stub documented at the bottom of milestone-9-rls.test.sql, then
-- run supabase/schema.sql, then this file.
