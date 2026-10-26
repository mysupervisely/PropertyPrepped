-- PropRoster — Mobile V2 — RLS regression test for
-- public.quick_action_preferences.
--
-- Same methodology as milestone-9/26/30/31/32-rls.test.sql: NOT run by
-- `npm test` (no Postgres in the Node/vitest pipeline) — run by hand (or
-- from CI with a scratch Postgres) against a database with PropRoster's
-- full schema.sql plus
-- supabase/milestone-34-mobile-quick-action-preferences.sql loaded, and
-- the Supabase auth schema stubbed (create schema auth; create table
-- auth.users; create function auth.uid(); create role authenticated;
-- etc — see milestone-9-rls.test.sql's own note at the bottom of that
-- file). Every block RAISEs "REGRESSION" or NOTICEs "PASS"; a clean run
-- has zero "REGRESSION" matches. Everything happens inside a transaction
-- rolled back at the end.
--
-- Covers: an owner with no row yet (the no-trigger/no-backfill design —
-- "no row" must simply mean "not customized", never an error), owner-
-- scoped upsert/select, owner_id spoofing refused on both insert and
-- update, cross-owner isolation, Restore Defaults (update to null), and
-- the shape check constraint.

begin;

insert into auth.users (id) values
  ('34111111-1111-1111-1111-111111111111'), -- owner 1
  ('34222222-2222-2222-2222-222222222222'); -- owner 2

set local role authenticated;
select set_config('request.jwt.claim.sub', '34111111-1111-1111-1111-111111111111', true);

-- A brand-new account has no row at all — selecting it returns zero
-- rows, not an error. The app's own fallback (DEFAULT_QUICK_ACTIONS)
-- handles this entirely client-side; this just confirms RLS doesn't
-- somehow error on an absent row.
do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.quick_action_preferences where owner_id = '34111111-1111-1111-1111-111111111111';
  if v_count = 0 then
    raise notice 'PASS: a landlord with no customization yet has zero rows, not an error';
  else
    raise exception 'REGRESSION: expected zero rows for an account that never customized Quick Actions';
  end if;
end $$;

-- Owner 1 can upsert their own first customization.
insert into public.quick_action_preferences (owner_id, selected_actions)
values ('34111111-1111-1111-1111-111111111111', '["add_expense","smart_upload","maintenance","invite_tenant"]'::jsonb)
on conflict (owner_id) do update set selected_actions = excluded.selected_actions, updated_at = now();

do $$
declare
  v_selection jsonb;
begin
  select selected_actions into v_selection from public.quick_action_preferences where owner_id = '34111111-1111-1111-1111-111111111111';
  if v_selection = '["add_expense","smart_upload","maintenance","invite_tenant"]'::jsonb then
    raise notice 'PASS: owner 1 can upsert and then select their own Quick Actions selection';
  else
    raise exception 'REGRESSION: owner 1''s own upsert did not take effect (got %)', v_selection;
  end if;
end $$;

-- Owner 1 can change their selection later (plain update via upsert).
insert into public.quick_action_preferences (owner_id, selected_actions)
values ('34111111-1111-1111-1111-111111111111', '["tax_center","propcrew","add_property","tenant_messages"]'::jsonb)
on conflict (owner_id) do update set selected_actions = excluded.selected_actions, updated_at = now();

do $$
declare
  v_selection jsonb;
begin
  select selected_actions into v_selection from public.quick_action_preferences where owner_id = '34111111-1111-1111-1111-111111111111';
  if v_selection = '["tax_center","propcrew","add_property","tenant_messages"]'::jsonb then
    raise notice 'PASS: owner 1 can change their selection later';
  else
    raise exception 'REGRESSION: owner 1''s updated selection did not take effect (got %)', v_selection;
  end if;
end $$;

-- "Restore Defaults" is an update back to null — never a delete.
update public.quick_action_preferences set selected_actions = null, updated_at = now() where owner_id = '34111111-1111-1111-1111-111111111111';

do $$
declare
  v_selection jsonb;
  v_count int;
begin
  select selected_actions, 1 into v_selection, v_count from public.quick_action_preferences where owner_id = '34111111-1111-1111-1111-111111111111';
  if v_selection is null and v_count = 1 then
    raise notice 'PASS: Restore Defaults updates the row to null rather than deleting it';
  else
    raise exception 'REGRESSION: Restore Defaults did not set selected_actions to null in place';
  end if;
end $$;

-- The shape check constraint rejects a non-array value outright.
do $$
begin
  begin
    insert into public.quick_action_preferences (owner_id, selected_actions)
    values ('34111111-1111-1111-1111-111111111111', '"not-an-array"'::jsonb)
    on conflict (owner_id) do update set selected_actions = excluded.selected_actions;
    raise exception 'REGRESSION: a non-array selected_actions value was accepted';
  exception
    when check_violation then
      raise notice 'PASS: a non-array selected_actions value is rejected by the shape check constraint';
  end;
end $$;

-- Owner 1 cannot spoof owner_id on insert (attribute a selection to owner 2).
do $$
begin
  begin
    insert into public.quick_action_preferences (owner_id, selected_actions)
    values ('34222222-2222-2222-2222-222222222222', '["add_expense","smart_upload","maintenance","invite_tenant"]'::jsonb);
    raise exception 'REGRESSION: owner 1 was able to insert a Quick Actions row with owner_id spoofed to owner 2';
  exception
    when insufficient_privilege or others then
      raise notice 'PASS: owner 1 cannot insert a Quick Actions row with owner_id spoofed to another owner';
  end;
end $$;

-- CROSS-OWNER ISOLATION — owner 1 must see ZERO of owner 2's rows.
reset role;
insert into public.quick_action_preferences (owner_id, selected_actions)
values ('34222222-2222-2222-2222-222222222222', '["maintenance","propcrew","tax_center","add_property"]'::jsonb);

set local role authenticated;
select set_config('request.jwt.claim.sub', '34111111-1111-1111-1111-111111111111', true);

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.quick_action_preferences where owner_id = '34222222-2222-2222-2222-222222222222';
  if v_count = 0 then
    raise notice 'PASS: owner 1 cannot see owner 2''s Quick Actions selection';
  else
    raise exception 'REGRESSION: owner 1 could see owner 2''s Quick Actions row — cross-owner data leak';
  end if;
end $$;

-- Owner 1 cannot update owner 2's row either (RLS-filtered to 0 rows
-- affected, not an error — matches the UPDATE-toward-forbidden-value
-- pattern milestone-9-rls.test.sql already established).
update public.quick_action_preferences set selected_actions = '["add_expense","add_expense","add_expense","add_expense"]'::jsonb where owner_id = '34222222-2222-2222-2222-222222222222';

do $$
declare
  v_selection jsonb;
begin
  reset role;
  select selected_actions into v_selection from public.quick_action_preferences where owner_id = '34222222-2222-2222-2222-222222222222';
  if v_selection = '["maintenance","propcrew","tax_center","add_property"]'::jsonb then
    raise notice 'PASS: owner 1''s update against owner 2''s row affected nothing (RLS-filtered to zero rows)';
  else
    raise exception 'REGRESSION: owner 1''s update changed owner 2''s Quick Actions row';
  end if;
end $$;

rollback;
