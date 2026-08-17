-- PropRoster Milestone 11 — Property Profile 2.0 RLS + security regression test.
--
-- Same methodology as supabase/tests/milestone-8/9/10-rls.test.sql: run by
-- hand against a database with PropRoster's full schema.sql loaded and the
-- Supabase auth/storage schemas available (real Supabase, or a local
-- Postgres stubbed per the note at the bottom of milestone-9-rls.test.sql —
-- Milestone 10's tables also need the auth.jwt() stub noted in that file's
-- own header). Every block RAISEs "REGRESSION" (broken, fix before
-- shipping) or NOTICEs "PASS". Run with `psql -v ON_ERROR_STOP=0` and grep
-- for "REGRESSION" — a clean run has zero matches. Two throwaway owners, a
-- throwaway tenant, and their properties/records are created inside a
-- transaction that is rolled back at the end — no data is left behind.

begin;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000a001', 'ownerA@example.com'),
  ('a0000000-0000-0000-0000-00000000a002', 'ownerB@example.com'),
  ('a0000000-0000-0000-0000-00000000a003', 'tenant1@example.com');

insert into public.properties (id, owner_id, address, city) values
  ('b0000000-0000-0000-0000-00000000b001', 'a0000000-0000-0000-0000-00000000a001', '1 Owner A St', 'Town'),
  ('b0000000-0000-0000-0000-00000000b002', 'a0000000-0000-0000-0000-00000000a002', '1 Owner B St', 'Town');

insert into public.tenant_property_access (id, property_id, owner_id, tenant_user_id, tenant_email, status, accepted_at) values
  ('c0000000-0000-0000-0000-00000000c001', 'b0000000-0000-0000-0000-00000000b001', 'a0000000-0000-0000-0000-00000000a001', 'a0000000-0000-0000-0000-00000000a003', 'tenant1@example.com', 'Active', now());

-- Baseline records, inserted with RLS bypassed (superuser/table-owner
-- context, matching how the other milestone test files seed data), that
-- the impersonation blocks below try to read/forge against.
insert into public.property_contacts (id, property_id, owner_id, name, role, would_use_again, experience_note) values
  ('e0000000-0000-0000-0000-00000000e001', 'b0000000-0000-0000-0000-00000000b001', 'a0000000-0000-0000-0000-00000000a001', 'A''s HVAC Guy', 'HVAC', 'YES', 'Ask for Mike — private note.'),
  ('e0000000-0000-0000-0000-00000000e002', 'b0000000-0000-0000-0000-00000000b002', 'a0000000-0000-0000-0000-00000000a002', 'B''s Plumber', 'Plumbing', 'NO', 'Would not use again — private note.');

insert into public.property_systems (id, property_id, owner_id, system_type, propcrew_contact_id) values
  ('f0000000-0000-0000-0000-00000000f001', 'b0000000-0000-0000-0000-00000000b001', 'a0000000-0000-0000-0000-00000000a001', 'HVAC', 'e0000000-0000-0000-0000-00000000e001');

insert into public.property_documents (id, property_id, owner_id, name, storage_path) values
  ('11100000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000b001', 'a0000000-0000-0000-0000-00000000a001', 'A doc', 'a0000000-0000-0000-0000-00000000a001/doc1'),
  ('11100000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-00000000b002', 'a0000000-0000-0000-0000-00000000a002', 'B doc', 'a0000000-0000-0000-0000-00000000a002/doc1');

insert into public.property_notes (id, property_id, owner_id, body, is_pinned) values
  ('22200000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000b001', 'a0000000-0000-0000-0000-00000000a001', 'A''s private gate code note', false);

insert into public.maintenance_records (id, property_id, owner_id, service_date, category, description, cost) values
  ('33300000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000b001', 'a0000000-0000-0000-0000-00000000a001', current_date, 'Repair', 'A''s repair', 100);

insert into public.maintenance_requests (id, property_id, owner_id, tenant_name, title) values
  ('44400000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000b001', 'a0000000-0000-0000-0000-00000000a001', 'Tenant One', 'Leaky faucet');

set local role authenticated;

-- ===== 1. user_profiles: Owner A sees only their own row =====
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000a001', true);
do $$
declare cnt integer;
begin
  select count(*) into cnt from public.user_profiles;
  if cnt <> 1 then raise exception 'REGRESSION: Owner A sees % user_profiles rows, expected exactly 1 (their own, backfilled by the trigger)', cnt; end if;
  raise notice 'PASS: user_profiles SELECT isolation — Owner A sees only their own row';
end $$;

-- ===== 2. user_profiles: Owner A cannot INSERT a profile row for Owner B =====
do $$
begin
  begin
    insert into public.user_profiles (id, display_name) values ('a0000000-0000-0000-0000-00000000a002', 'Forged');
    raise exception 'REGRESSION: Owner A was able to INSERT a user_profiles row for Owner B''s id';
  exception
    when insufficient_privilege then raise notice 'PASS: user_profiles INSERT for another user''s id correctly rejected';
  end;
end $$;

-- ===== 3. user_profiles: Owner A cannot UPDATE Owner B's profile =====
do $$
declare affected integer;
begin
  update public.user_profiles set display_name = 'Forged' where id = 'a0000000-0000-0000-0000-00000000a002';
  get diagnostics affected = row_count;
  if affected > 0 then raise exception 'REGRESSION: Owner A UPDATEd Owner B''s user_profiles row'; end if;
  raise notice 'PASS: user_profiles UPDATE of another user''s row correctly affected 0 rows';
end $$;

-- ===== 4. property_ownership: Owner A cannot create for Owner B's property =====
do $$
begin
  begin
    insert into public.property_ownership (property_id, owner_id, entity_name) values ('b0000000-0000-0000-0000-00000000b002', 'a0000000-0000-0000-0000-00000000a001', 'Forged Entity');
    raise exception 'REGRESSION: Owner A created a property_ownership row for Owner B''s property';
  exception
    when insufficient_privilege then raise notice 'PASS: property_ownership INSERT against another owner''s property correctly rejected';
  end;
end $$;

-- ===== 5. property_systems: Owner A cannot create for Owner B's property =====
do $$
begin
  begin
    insert into public.property_systems (property_id, owner_id, system_type) values ('b0000000-0000-0000-0000-00000000b002', 'a0000000-0000-0000-0000-00000000a001', 'HVAC');
    raise exception 'REGRESSION: Owner A created a property_systems row for Owner B''s property';
  exception
    when insufficient_privilege then raise notice 'PASS: property_systems INSERT against another owner''s property correctly rejected';
  end;
end $$;

-- ===== 6. property_systems: Owner A cannot set propcrew_contact_id to Owner B's contact =====
do $$
begin
  begin
    insert into public.property_systems (property_id, owner_id, system_type, propcrew_contact_id) values ('b0000000-0000-0000-0000-00000000b001', 'a0000000-0000-0000-0000-00000000a001', 'Roof', 'e0000000-0000-0000-0000-00000000e002');
    raise exception 'REGRESSION: Owner A created a property_systems row pointing propcrew_contact_id at Owner B''s contact';
  exception
    when insufficient_privilege then raise notice 'PASS: property_systems.propcrew_contact_id forged to another owner''s contact correctly rejected';
  end;
end $$;

-- ===== 6b. ...nor via UPDATE of Owner A's own existing system =====
do $$
declare affected integer;
begin
  begin
    update public.property_systems set propcrew_contact_id = 'e0000000-0000-0000-0000-00000000e002' where id = 'f0000000-0000-0000-0000-00000000f001';
    get diagnostics affected = row_count;
    if affected > 0 then raise exception 'REGRESSION: Owner A UPDATEd their own system to point propcrew_contact_id at Owner B''s contact'; end if;
    raise notice 'PASS: property_systems.propcrew_contact_id UPDATE-forging correctly affected 0 rows';
  exception
    when insufficient_privilege then raise notice 'PASS: property_systems.propcrew_contact_id UPDATE-forging correctly rejected';
  end;
end $$;

-- ===== 7. property_system_documents: cannot forge a cross-owner system/document link =====
do $$
begin
  begin
    insert into public.property_system_documents (system_id, document_id, owner_id) values ('f0000000-0000-0000-0000-00000000f001', '11100000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000a001');
    raise exception 'REGRESSION: Owner A linked Owner B''s document to Owner A''s system';
  exception
    when insufficient_privilege then raise notice 'PASS: property_system_documents cross-owner document link correctly rejected';
  end;
end $$;

-- ===== 8. property_notes: Owner A cannot read Owner B's notes =====
do $$
declare cnt integer;
begin
  select count(*) into cnt from public.property_notes where property_id = 'b0000000-0000-0000-0000-00000000b002';
  if cnt <> 0 then raise exception 'REGRESSION: Owner A can see % of Owner B''s property_notes rows', cnt; end if;
  raise notice 'PASS: property_notes SELECT isolation — Owner A sees none of Owner B''s notes';
end $$;

-- ===== 9. property_notes: Owner A cannot create a note on Owner B's property =====
do $$
begin
  begin
    insert into public.property_notes (property_id, owner_id, body) values ('b0000000-0000-0000-0000-00000000b002', 'a0000000-0000-0000-0000-00000000a001', 'Forged note');
    raise exception 'REGRESSION: Owner A created a property_notes row on Owner B''s property';
  exception
    when insufficient_privilege then raise notice 'PASS: property_notes INSERT against another owner''s property correctly rejected';
  end;
end $$;

-- ===== 10. property_contacts (PropCrew): Owner A cannot read Owner B's would_use_again/experience_note =====
do $$
declare cnt integer;
begin
  select count(*) into cnt from public.property_contacts where id = 'e0000000-0000-0000-0000-00000000e002';
  if cnt <> 0 then raise exception 'REGRESSION: Owner A can see Owner B''s property_contacts row (including would_use_again/experience_note)'; end if;
  raise notice 'PASS: property_contacts SELECT isolation — Owner A cannot read Owner B''s PropCrew contact at all';
end $$;

-- ===== 11. property_contacts: Owner A cannot create a contact with property_id on Owner B's property =====
do $$
begin
  begin
    insert into public.property_contacts (property_id, owner_id, name, role) values ('b0000000-0000-0000-0000-00000000b002', 'a0000000-0000-0000-0000-00000000a001', 'Forged Contact', 'Other');
    raise exception 'REGRESSION: Owner A created a property_contacts row with property_id on Owner B''s property';
  exception
    when insufficient_privilege then raise notice 'PASS: property_contacts.property_id forged to another owner''s property correctly rejected';
  end;
end $$;

-- ===== 12. property_contact_links: Owner A cannot link Owner A's contact to Owner B's property =====
do $$
begin
  begin
    insert into public.property_contact_links (contact_id, property_id, owner_id) values ('e0000000-0000-0000-0000-00000000e001', 'b0000000-0000-0000-0000-00000000b002', 'a0000000-0000-0000-0000-00000000a001');
    raise exception 'REGRESSION: Owner A linked their own PropCrew contact to Owner B''s property';
  exception
    when insufficient_privilege then raise notice 'PASS: property_contact_links (own contact -> another owner''s property) correctly rejected';
  end;
end $$;

-- ===== 13. property_contact_links: Owner A cannot link Owner B's contact to Owner A's property =====
do $$
begin
  begin
    insert into public.property_contact_links (contact_id, property_id, owner_id) values ('e0000000-0000-0000-0000-00000000e002', 'b0000000-0000-0000-0000-00000000b001', 'a0000000-0000-0000-0000-00000000a001');
    raise exception 'REGRESSION: Owner A linked Owner B''s PropCrew contact to Owner A''s property';
  exception
    when insufficient_privilege then raise notice 'PASS: property_contact_links (another owner''s contact -> own property) correctly rejected';
  end;
end $$;

-- ===== 14. maintenance_records: Owner A cannot set propcrew_contact_id to Owner B's contact =====
do $$
begin
  begin
    insert into public.maintenance_records (property_id, owner_id, service_date, category, description, cost, propcrew_contact_id) values ('b0000000-0000-0000-0000-00000000b001', 'a0000000-0000-0000-0000-00000000a001', current_date, 'Repair', 'Forged', 50, 'e0000000-0000-0000-0000-00000000e002');
    raise exception 'REGRESSION: Owner A created a maintenance_records row pointing propcrew_contact_id at Owner B''s contact';
  exception
    when insufficient_privilege then raise notice 'PASS: maintenance_records.propcrew_contact_id forged to another owner''s contact correctly rejected';
  end;
end $$;

-- ===== 15. maintenance_records: Owner A cannot set system_id to Owner B's system =====
-- Seed Owner B's own system directly (bypassing RLS, matching the
-- pattern used above for baseline data) so this scenario has a real
-- cross-owner system id to attempt to forge against.
reset role;
insert into public.property_systems (id, property_id, owner_id, system_type) values ('f0000000-0000-0000-0000-00000000f003', 'b0000000-0000-0000-0000-00000000b002', 'a0000000-0000-0000-0000-00000000a002', 'Roof') on conflict (id) do nothing;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000a001', true);
do $$
begin
  begin
    insert into public.maintenance_records (property_id, owner_id, service_date, category, description, cost, system_id) values ('b0000000-0000-0000-0000-00000000b001', 'a0000000-0000-0000-0000-00000000a001', current_date, 'Repair', 'Forged', 50, 'f0000000-0000-0000-0000-00000000f003');
    raise exception 'REGRESSION: Owner A created a maintenance_records row pointing system_id at Owner B''s system';
  exception
    when insufficient_privilege then raise notice 'PASS: maintenance_records.system_id forged to another owner''s system correctly rejected';
  end;
end $$;

-- ===== 16. maintenance_requests: Owner A cannot set assigned_contact_id to Owner B's contact =====
do $$
begin
  begin
    insert into public.maintenance_requests (property_id, owner_id, tenant_name, title, assigned_contact_id) values ('b0000000-0000-0000-0000-00000000b001', 'a0000000-0000-0000-0000-00000000a001', 'Tenant', 'Forged', 'e0000000-0000-0000-0000-00000000e002');
    raise exception 'REGRESSION: Owner A created a maintenance_requests row pointing assigned_contact_id at Owner B''s contact';
  exception
    when insufficient_privilege then raise notice 'PASS: maintenance_requests.assigned_contact_id forged to another owner''s contact correctly rejected';
  end;
end $$;

-- ===== 16b. ...nor via UPDATE of Owner A's own existing request =====
do $$
declare affected integer;
begin
  begin
    update public.maintenance_requests set assigned_contact_id = 'e0000000-0000-0000-0000-00000000e002' where id = '44400000-0000-0000-0000-000000000001';
    get diagnostics affected = row_count;
    if affected > 0 then raise exception 'REGRESSION: Owner A UPDATEd their own maintenance request to point assigned_contact_id at Owner B''s contact'; end if;
    raise notice 'PASS: maintenance_requests.assigned_contact_id UPDATE-forging correctly affected 0 rows';
  exception
    when insufficient_privilege then raise notice 'PASS: maintenance_requests.assigned_contact_id UPDATE-forging correctly rejected';
  end;
end $$;

-- ===== 17. Tenant cannot read any PropCrew/Systems/Notes/Ownership/Profile data =====
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000a003', true);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000a003","email":"tenant1@example.com"}', true);
do $$
declare cnt integer;
begin
  select count(*) into cnt from public.property_contacts; if cnt <> 0 then raise exception 'REGRESSION: tenant can see % property_contacts (PropCrew) rows', cnt; end if;
  select count(*) into cnt from public.property_contact_links; if cnt <> 0 then raise exception 'REGRESSION: tenant can see % property_contact_links rows', cnt; end if;
  select count(*) into cnt from public.property_systems; if cnt <> 0 then raise exception 'REGRESSION: tenant can see % property_systems rows', cnt; end if;
  select count(*) into cnt from public.property_system_documents; if cnt <> 0 then raise exception 'REGRESSION: tenant can see % property_system_documents rows', cnt; end if;
  select count(*) into cnt from public.property_notes; if cnt <> 0 then raise exception 'REGRESSION: tenant can see % property_notes rows', cnt; end if;
  select count(*) into cnt from public.property_ownership; if cnt <> 0 then raise exception 'REGRESSION: tenant can see % property_ownership rows', cnt; end if;
  select count(*) into cnt from public.user_profiles where id <> 'a0000000-0000-0000-0000-00000000a003'; if cnt <> 0 then raise exception 'REGRESSION: tenant can see % other users'' user_profiles rows', cnt; end if;
  raise notice 'PASS: tenant has ZERO read access to PropCrew, Systems, Notes, Ownership, and other users'' profiles — despite active tenant_property_access on the owner''s property';
end $$;

-- ===== 18. Tenant cannot see the owner-only assigned_contact_id/propcrew_contact_id fields via the tables they DO have access to (maintenance_requests) =====
do $$
declare cnt integer;
begin
  select count(*) into cnt from public.maintenance_requests;
  if cnt <> 0 then raise exception 'REGRESSION: tenant can see % maintenance_requests rows directly (owner-only table)', cnt; end if;
  raise notice 'PASS: maintenance_requests remains fully owner-only — tenant has no read path to assigned_contact_id either';
end $$;

reset role;
rollback;
