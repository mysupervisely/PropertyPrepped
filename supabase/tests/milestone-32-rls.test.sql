-- PropRoster — Property + Attention Usability V1, Part 3 — RLS
-- regression test for public.attention_dismissals.
--
-- Same methodology as milestone-9/26/30/31-rls.test.sql: NOT run by
-- `npm test` (no Postgres in the Node/vitest pipeline) — run by hand (or
-- from CI with a scratch Postgres) against a database with PropRoster's
-- full schema.sql plus supabase/milestone-32-attention-dismissals.sql
-- loaded, and the Supabase auth schema stubbed (create schema auth;
-- create table auth.users; create function auth.uid(); create role
-- authenticated/anon; etc — see milestone-9-rls.test.sql's own note).
-- Every block RAISEs "REGRESSION" or NOTICEs "PASS"; a clean run has
-- zero "REGRESSION" matches. Everything happens inside a transaction
-- rolled back at the end.
--
-- Covers: owner-scoped insert/select/delete, owner_id spoofing refused,
-- attaching a dismissal to another owner's property refused, cross-
-- owner isolation (select and delete both), and duplicate (owner_id,
-- dismissal_key) handling.

begin;

insert into auth.users (id) values
  ('32111111-1111-1111-1111-111111111111'), -- owner 1
  ('32222222-2222-2222-2222-222222222222'); -- owner 2

insert into public.properties (id, owner_id, address, city, property_type) values
  ('32aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '32111111-1111-1111-1111-111111111111', '123 Main St', 'Springfield', 'Rental Property'),
  ('32bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '32222222-2222-2222-2222-222222222222', '456 Oak Ave', 'Shelbyville', 'Rental Property');

set local role authenticated;
select set_config('request.jwt.claim.sub', '32111111-1111-1111-1111-111111111111', true);

-- Owner 1 can insert a dismissal for their own property.
insert into public.attention_dismissals (owner_id, property_id, attention_type, dismissal_key)
values ('32111111-1111-1111-1111-111111111111', '32aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'lease', 'lease:lease-1:2026-09-20');

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.attention_dismissals where owner_id = '32111111-1111-1111-1111-111111111111';
  if v_count = 1 then
    raise notice 'PASS: owner 1 can insert and then select their own dismissal';
  else
    raise exception 'REGRESSION: owner 1''s own insert did not take effect (got % rows)', v_count;
  end if;
end $$;

-- Owner 1 cannot spoof owner_id on insert (attribute a dismissal to owner 2).
do $$
begin
  begin
    insert into public.attention_dismissals (owner_id, property_id, attention_type, dismissal_key)
    values ('32222222-2222-2222-2222-222222222222', '32aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'lease', 'lease:lease-spoof:2026-09-20');
    raise exception 'REGRESSION: owner 1 was able to insert a dismissal with owner_id spoofed to owner 2';
  exception
    when insufficient_privilege or others then
      raise notice 'PASS: owner 1 cannot insert a dismissal with owner_id spoofed to another owner';
  end;
end $$;

-- Owner 1 cannot attach a dismissal to owner 2's property, even using their OWN owner_id.
do $$
begin
  begin
    insert into public.attention_dismissals (owner_id, property_id, attention_type, dismissal_key)
    values ('32111111-1111-1111-1111-111111111111', '32bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'lease', 'lease:lease-cross:2026-09-20');
    raise exception 'REGRESSION: owner 1 was able to attach a dismissal to owner 2''s property';
  exception
    when insufficient_privilege or others then
      raise notice 'PASS: owner 1 cannot attach a dismissal to another owner''s property';
  end;
end $$;

-- A dismissal with no property_id at all is allowed (the schema's own
-- nullable property_id) — not currently written by the app, but the
-- policy must not accidentally require it.
insert into public.attention_dismissals (owner_id, property_id, attention_type, dismissal_key)
values ('32111111-1111-1111-1111-111111111111', null, 'lease', 'lease:lease-no-property:2026-09-20');

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.attention_dismissals where owner_id = '32111111-1111-1111-1111-111111111111' and property_id is null;
  if v_count = 1 then
    raise notice 'PASS: a dismissal with no property_id is allowed for the owner''s own row';
  else
    raise exception 'REGRESSION: a null-property_id dismissal insert did not take effect';
  end if;
end $$;

-- Duplicate (owner_id, dismissal_key) is rejected by the unique constraint.
do $$
begin
  begin
    insert into public.attention_dismissals (owner_id, property_id, attention_type, dismissal_key)
    values ('32111111-1111-1111-1111-111111111111', '32aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'lease', 'lease:lease-1:2026-09-20');
    raise exception 'REGRESSION: a duplicate (owner_id, dismissal_key) insert was allowed to succeed';
  exception
    when unique_violation then
      raise notice 'PASS: a duplicate (owner_id, dismissal_key) insert is rejected by the unique constraint';
  end;
end $$;

-- The same duplicate, handled idempotently via on conflict do nothing
-- (the pattern the app itself uses) succeeds without error and without
-- creating a second row.
insert into public.attention_dismissals (owner_id, property_id, attention_type, dismissal_key)
values ('32111111-1111-1111-1111-111111111111', '32aaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'lease', 'lease:lease-1:2026-09-20')
on conflict (owner_id, dismissal_key) do nothing;

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.attention_dismissals where owner_id = '32111111-1111-1111-1111-111111111111' and dismissal_key = 'lease:lease-1:2026-09-20';
  if v_count = 1 then
    raise notice 'PASS: on conflict do nothing handles a duplicate dismissal idempotently (no error, no second row)';
  else
    raise exception 'REGRESSION: on conflict do nothing did not behave idempotently (got % rows)', v_count;
  end if;
end $$;

-- CROSS-OWNER ISOLATION — owner 1 must see ZERO of owner 2's rows.
set local role authenticated;
select set_config('request.jwt.claim.sub', '32222222-2222-2222-2222-222222222222', true);

insert into public.attention_dismissals (owner_id, property_id, attention_type, dismissal_key)
values ('32222222-2222-2222-2222-222222222222', '32bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'vacancy', 'vacancy:32bbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb:never-leased:2024-01-01T00:00:00Z');

set local role authenticated;
select set_config('request.jwt.claim.sub', '32111111-1111-1111-1111-111111111111', true);

do $$
declare
  v_count int;
begin
  select count(*) into v_count from public.attention_dismissals where owner_id = '32222222-2222-2222-2222-222222222222';
  if v_count = 0 then
    raise notice 'PASS: owner 1 cannot see owner 2''s dismissal rows';
  else
    raise exception 'REGRESSION: owner 1 could see owner 2''s dismissal row — cross-owner data leak';
  end if;
end $$;

-- Owner 1 cannot delete owner 2's dismissal.
delete from public.attention_dismissals where owner_id = '32222222-2222-2222-2222-222222222222';

do $$
declare
  v_count int;
begin
  reset role;
  select count(*) into v_count from public.attention_dismissals where owner_id = '32222222-2222-2222-2222-222222222222';
  if v_count = 1 then
    raise notice 'PASS: owner 1''s delete against owner 2''s dismissal affected nothing (RLS-filtered to zero rows)';
  else
    raise exception 'REGRESSION: owner 1''s delete removed owner 2''s dismissal row';
  end if;
end $$;

-- Owner 1 CAN delete their own dismissal.
set local role authenticated;
select set_config('request.jwt.claim.sub', '32111111-1111-1111-1111-111111111111', true);

delete from public.attention_dismissals where owner_id = '32111111-1111-1111-1111-111111111111' and dismissal_key = 'lease:lease-1:2026-09-20';

do $$
declare
  v_count int;
begin
  reset role;
  select count(*) into v_count from public.attention_dismissals where owner_id = '32111111-1111-1111-1111-111111111111' and dismissal_key = 'lease:lease-1:2026-09-20';
  if v_count = 0 then
    raise notice 'PASS: owner 1 can delete their own dismissal';
  else
    raise exception 'REGRESSION: owner 1''s delete of their own dismissal did not take effect';
  end if;
end $$;

rollback;
