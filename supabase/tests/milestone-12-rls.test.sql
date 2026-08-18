-- PropRoster Milestone 12 — Smart Upload Foundation RLS + security
-- regression test.
--
-- Same methodology as supabase/tests/milestone-8/9/10/11-rls.test.sql:
-- run by hand against a database with PropRoster's full schema.sql
-- loaded and the Supabase auth/storage schemas available (real Supabase,
-- or a local Postgres stubbed per the note at the bottom of
-- milestone-9-rls.test.sql, extended with the auth.jwt() stub Milestone
-- 10 needs). Every block RAISEs "REGRESSION" (broken, fix before
-- shipping) or NOTICEs "PASS". Run with `psql -v ON_ERROR_STOP=0` and
-- grep for "REGRESSION" — a clean run has zero matches. Two throwaway
-- owners and a throwaway tenant, and their properties/records, are
-- created inside a transaction that is rolled back at the end — no data
-- is left behind.

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

-- Baseline records, seeded with RLS bypassed, that the impersonation
-- blocks below try to read/forge against.
insert into public.property_contacts (id, property_id, owner_id, name, role) values
  ('e0000000-0000-0000-0000-00000000e001', 'b0000000-0000-0000-0000-00000000b001', 'a0000000-0000-0000-0000-00000000a001', 'A''s HVAC Guy', 'HVAC'),
  ('e0000000-0000-0000-0000-00000000e002', 'b0000000-0000-0000-0000-00000000b002', 'a0000000-0000-0000-0000-00000000a002', 'B''s Plumber', 'Plumbing');

insert into public.property_documents (id, property_id, owner_id, name, storage_path) values
  ('11100000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000b001', 'a0000000-0000-0000-0000-00000000a001', 'A doc', 'a0000000-0000-0000-0000-00000000a001/doc1'),
  ('11100000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-00000000b002', 'a0000000-0000-0000-0000-00000000a002', 'B doc', 'a0000000-0000-0000-0000-00000000a002/doc1');

insert into public.financial_transactions (id, property_id, owner_id, transaction_type, description, amount) values
  ('55500000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000b001', 'a0000000-0000-0000-0000-00000000a001', 'Expense', 'A''s expense', 100),
  ('55500000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-00000000b002', 'a0000000-0000-0000-0000-00000000a002', 'Expense', 'B''s expense', 50);

insert into public.maintenance_records (id, property_id, owner_id, service_date, category, description, cost) values
  ('33300000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000b001', 'a0000000-0000-0000-0000-00000000a001', current_date, 'Repair', 'A''s repair', 100),
  ('33300000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-00000000b002', 'a0000000-0000-0000-0000-00000000a002', current_date, 'Repair', 'B''s repair', 75);

insert into public.leases (id, property_id, owner_id, tenant_name, start_date, end_date) values
  ('77700000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000b001', 'a0000000-0000-0000-0000-00000000a001', 'A''s Tenant', current_date, current_date + interval '1 year');

insert into public.insurance_policies (id, property_id, owner_id, carrier) values
  ('88800000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000b001', 'a0000000-0000-0000-0000-00000000a001', 'A''s Insurer');

-- A pre-existing smart_upload_items row for Owner A, used by the tenant
-- read-isolation check below.
insert into public.smart_upload_items (id, owner_id, document_id) values
  ('66600000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000a001', '11100000-0000-0000-0000-000000000001');

set local role authenticated;

-- ===== 1. property_documents: Owner A can INSERT with property_id NULL =====
-- (Part 1: analyze before the property is known.)
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000a001', true);
do $$
declare new_id uuid;
begin
  insert into public.property_documents (owner_id, property_id, name, storage_path)
  values ('a0000000-0000-0000-0000-00000000a001', null, 'Smart Upload item', 'a0000000-0000-0000-0000-00000000a001/smart-upload/x')
  returning id into new_id;
  if new_id is null then raise exception 'REGRESSION: property_documents INSERT with property_id null did not return a row'; end if;
  raise notice 'PASS: property_documents INSERT with property_id null (pre-property-confirmation) succeeded for the owner';
end $$;

-- ===== 2. property_documents: Owner A cannot INSERT with Owner B's property_id =====
do $$
begin
  begin
    insert into public.property_documents (owner_id, property_id, name, storage_path)
    values ('a0000000-0000-0000-0000-00000000a001', 'b0000000-0000-0000-0000-00000000b002', 'Forged', 'a0000000-0000-0000-0000-00000000a001/x');
    raise exception 'REGRESSION: Owner A created a property_documents row against Owner B''s property';
  exception
    when insufficient_privilege then raise notice 'PASS: property_documents INSERT against another owner''s property correctly rejected';
  end;
end $$;

-- ===== 3. property_documents: Owner A cannot UPDATE their own document's
-- property_id to point at Owner B's property. Unlike "someone else's row"
-- (excluded by USING, so a no-op UPDATE affects 0 rows silently), this is
-- Owner A's OWN row (passes USING) with a new value that fails WITH
-- CHECK — Postgres raises a hard RLS violation for that case, not a
-- silent 0-row update. =====
do $$
begin
  begin
    update public.property_documents set property_id = 'b0000000-0000-0000-0000-00000000b002' where id = '11100000-0000-0000-0000-000000000001';
    raise exception 'REGRESSION: Owner A UPDATEd their own document''s property_id to Owner B''s property';
  exception
    when insufficient_privilege then raise notice 'PASS: property_documents UPDATE of property_id to another owner''s property correctly rejected';
  end;
end $$;

-- ===== 4. document_analyses: Owner A can INSERT with property_id NULL matching a null-property document =====
do $$
declare doc_id uuid; new_id uuid;
begin
  insert into public.property_documents (owner_id, property_id, name, storage_path)
  values ('a0000000-0000-0000-0000-00000000a001', null, 'Analyzed item', 'a0000000-0000-0000-0000-00000000a001/smart-upload/y')
  returning id into doc_id;
  insert into public.document_analyses (document_id, property_id, owner_id, document_type, model_provider, model_name)
  values (doc_id, null, 'a0000000-0000-0000-0000-00000000a001', 'Other', 'anthropic', 'test-model')
  returning id into new_id;
  if new_id is null then raise exception 'REGRESSION: document_analyses INSERT with property_id null (matching its document) did not succeed'; end if;
  raise notice 'PASS: document_analyses INSERT with property_id null, matching a null-property document, succeeded';
end $$;

-- ===== 5. document_analyses: Owner A cannot INSERT with a property_id that does not match the document's own property_id =====
do $$
declare doc_id uuid;
begin
  select id into doc_id from public.property_documents where id = '11100000-0000-0000-0000-000000000001'; -- property_id = b001
  begin
    insert into public.document_analyses (document_id, property_id, owner_id, document_type, model_provider, model_name)
    values (doc_id, null, 'a0000000-0000-0000-0000-00000000a001', 'Other', 'anthropic', 'test-model'); -- doc's real property_id is b001, not null
    raise exception 'REGRESSION: document_analyses INSERT with a property_id mismatched from its document''s property_id succeeded';
  exception
    when insufficient_privilege then raise notice 'PASS: document_analyses INSERT with a property_id mismatched from its document correctly rejected';
  end;
end $$;

-- ===== 6. document_analyses: Owner A cannot INSERT against Owner B's property =====
do $$
begin
  begin
    insert into public.document_analyses (document_id, property_id, owner_id, document_type, model_provider, model_name)
    values ('11100000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-00000000b002', 'a0000000-0000-0000-0000-00000000a001', 'Other', 'anthropic', 'test-model');
    raise exception 'REGRESSION: Owner A created a document_analyses row against Owner B''s property/document';
  exception
    when insufficient_privilege then raise notice 'PASS: document_analyses INSERT against another owner''s property/document correctly rejected';
  end;
end $$;

-- ===== 7. smart_upload_items: Owner A can INSERT against their own document =====
do $$
declare new_id uuid;
begin
  insert into public.smart_upload_items (owner_id, document_id)
  values ('a0000000-0000-0000-0000-00000000a001', '11100000-0000-0000-0000-000000000001')
  returning id into new_id;
  if new_id is null then raise exception 'REGRESSION: smart_upload_items INSERT for the owner''s own document did not succeed'; end if;
  raise notice 'PASS: smart_upload_items INSERT for the owner''s own document succeeded';
end $$;

-- ===== 8. smart_upload_items: Owner A cannot INSERT against Owner B's document =====
do $$
begin
  begin
    insert into public.smart_upload_items (owner_id, document_id) values ('a0000000-0000-0000-0000-00000000a001', '11100000-0000-0000-0000-000000000002');
    raise exception 'REGRESSION: Owner A created a smart_upload_items row against Owner B''s document';
  exception
    when insufficient_privilege then raise notice 'PASS: smart_upload_items INSERT against another owner''s document correctly rejected';
  end;
end $$;

-- ===== 9. smart_upload_items: Owner A cannot set confirmed_property_id to Owner B's property =====
do $$
begin
  begin
    insert into public.smart_upload_items (owner_id, document_id, confirmed_property_id) values ('a0000000-0000-0000-0000-00000000a001', '11100000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-00000000b002');
    raise exception 'REGRESSION: Owner A set smart_upload_items.confirmed_property_id to Owner B''s property';
  exception
    when insufficient_privilege then raise notice 'PASS: smart_upload_items confirmed_property_id against another owner''s property correctly rejected';
  end;
end $$;

-- ===== 10. smart_upload_items: Owner A cannot set created_contact_id to Owner B's PropCrew contact =====
do $$
begin
  begin
    insert into public.smart_upload_items (owner_id, document_id, created_contact_id) values ('a0000000-0000-0000-0000-00000000a001', '11100000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-00000000e002');
    raise exception 'REGRESSION: Owner A linked smart_upload_items.created_contact_id to Owner B''s PropCrew contact';
  exception
    when insufficient_privilege then raise notice 'PASS: smart_upload_items created_contact_id against another owner''s PropCrew contact correctly rejected';
  end;
end $$;

-- ===== 11. smart_upload_items: Owner A cannot set created_financial_transaction_id to Owner B's transaction =====
-- (Owner B's transaction was seeded at the top of this file, with RLS
-- bypassed, alongside every other cross-owner baseline row — NOT
-- inserted here, since we're impersonating Owner A at this point and an
-- insert with owner_id = B would itself be correctly rejected by
-- financial_transactions' own RLS, which is not what this block tests.)
do $$
begin
  begin
    insert into public.smart_upload_items (owner_id, document_id, created_financial_transaction_id) values ('a0000000-0000-0000-0000-00000000a001', '11100000-0000-0000-0000-000000000001', '55500000-0000-0000-0000-000000000002');
    raise exception 'REGRESSION: Owner A linked smart_upload_items.created_financial_transaction_id to Owner B''s transaction';
  exception
    when insufficient_privilege then raise notice 'PASS: smart_upload_items created_financial_transaction_id against another owner''s transaction correctly rejected';
  end;
end $$;

-- ===== 12. smart_upload_items: Owner A cannot set created_maintenance_record_id to Owner B's maintenance record =====
do $$
begin
  begin
    insert into public.smart_upload_items (owner_id, document_id, created_maintenance_record_id) values ('a0000000-0000-0000-0000-00000000a001', '11100000-0000-0000-0000-000000000001', '33300000-0000-0000-0000-000000000002');
    raise exception 'REGRESSION: Owner A linked smart_upload_items.created_maintenance_record_id to Owner B''s maintenance record';
  exception
    when insufficient_privilege then raise notice 'PASS: smart_upload_items created_maintenance_record_id against another owner''s maintenance record correctly rejected';
  end;
end $$;

-- ============================================================
-- RLS hardening: financial_transactions / maintenance_records / leases
-- / insurance_policies property_id ownership (still impersonating
-- Owner A from the blocks above). Three checks per table: own property
-- accepted, another owner's property rejected, UPDATE cannot switch to
-- another owner's property.
-- ============================================================

-- ===== 13. financial_transactions: Owner A can INSERT against their own property =====
do $$
declare new_id uuid;
begin
  insert into public.financial_transactions (property_id, owner_id, transaction_type, description, amount)
  values ('b0000000-0000-0000-0000-00000000b001', 'a0000000-0000-0000-0000-00000000a001', 'Expense', 'A''s new expense', 25)
  returning id into new_id;
  if new_id is null then raise exception 'REGRESSION: financial_transactions INSERT against the owner''s own property did not succeed'; end if;
  raise notice 'PASS: financial_transactions INSERT against the owner''s own property succeeded';
end $$;

-- ===== 14. financial_transactions: Owner A cannot INSERT against Owner B's property =====
do $$
begin
  begin
    insert into public.financial_transactions (property_id, owner_id, transaction_type, description, amount)
    values ('b0000000-0000-0000-0000-00000000b002', 'a0000000-0000-0000-0000-00000000a001', 'Expense', 'Forged', 25);
    raise exception 'REGRESSION: Owner A created a financial_transactions row against Owner B''s property';
  exception
    when insufficient_privilege then raise notice 'PASS: financial_transactions INSERT against another owner''s property correctly rejected';
  end;
end $$;

-- ===== 15. financial_transactions: Owner A cannot UPDATE their own transaction's property_id to Owner B's property =====
do $$
begin
  begin
    update public.financial_transactions set property_id = 'b0000000-0000-0000-0000-00000000b002' where id = '55500000-0000-0000-0000-000000000001';
    raise exception 'REGRESSION: Owner A UPDATEd their own financial_transactions row''s property_id to Owner B''s property';
  exception
    when insufficient_privilege then raise notice 'PASS: financial_transactions UPDATE of property_id to another owner''s property correctly rejected';
  end;
end $$;

-- ===== 16. maintenance_records: Owner A can INSERT against their own property =====
do $$
declare new_id uuid;
begin
  insert into public.maintenance_records (property_id, owner_id, service_date, category, description, cost)
  values ('b0000000-0000-0000-0000-00000000b001', 'a0000000-0000-0000-0000-00000000a001', current_date, 'Repair', 'A''s new repair', 25)
  returning id into new_id;
  if new_id is null then raise exception 'REGRESSION: maintenance_records INSERT against the owner''s own property did not succeed'; end if;
  raise notice 'PASS: maintenance_records INSERT against the owner''s own property succeeded';
end $$;

-- ===== 17. maintenance_records: Owner A cannot INSERT against Owner B's property =====
do $$
begin
  begin
    insert into public.maintenance_records (property_id, owner_id, service_date, category, description, cost)
    values ('b0000000-0000-0000-0000-00000000b002', 'a0000000-0000-0000-0000-00000000a001', current_date, 'Repair', 'Forged', 25);
    raise exception 'REGRESSION: Owner A created a maintenance_records row against Owner B''s property';
  exception
    when insufficient_privilege then raise notice 'PASS: maintenance_records INSERT against another owner''s property correctly rejected';
  end;
end $$;

-- ===== 18. maintenance_records: Owner A cannot UPDATE their own record's property_id to Owner B's property =====
do $$
begin
  begin
    update public.maintenance_records set property_id = 'b0000000-0000-0000-0000-00000000b002' where id = '33300000-0000-0000-0000-000000000001';
    raise exception 'REGRESSION: Owner A UPDATEd their own maintenance_records row''s property_id to Owner B''s property';
  exception
    when insufficient_privilege then raise notice 'PASS: maintenance_records UPDATE of property_id to another owner''s property correctly rejected';
  end;
end $$;

-- ===== 19. leases: Owner A can INSERT against their own property =====
do $$
declare new_id uuid;
begin
  insert into public.leases (property_id, owner_id, tenant_name, start_date, end_date)
  values ('b0000000-0000-0000-0000-00000000b001', 'a0000000-0000-0000-0000-00000000a001', 'A''s New Tenant', current_date, current_date + interval '1 year')
  returning id into new_id;
  if new_id is null then raise exception 'REGRESSION: leases INSERT against the owner''s own property did not succeed'; end if;
  raise notice 'PASS: leases INSERT against the owner''s own property succeeded';
end $$;

-- ===== 20. leases: Owner A cannot INSERT against Owner B's property =====
do $$
begin
  begin
    insert into public.leases (property_id, owner_id, tenant_name, start_date, end_date)
    values ('b0000000-0000-0000-0000-00000000b002', 'a0000000-0000-0000-0000-00000000a001', 'Forged', current_date, current_date + interval '1 year');
    raise exception 'REGRESSION: Owner A created a leases row against Owner B''s property';
  exception
    when insufficient_privilege then raise notice 'PASS: leases INSERT against another owner''s property correctly rejected';
  end;
end $$;

-- ===== 21. leases: Owner A cannot UPDATE their own lease's property_id to Owner B's property =====
do $$
begin
  begin
    update public.leases set property_id = 'b0000000-0000-0000-0000-00000000b002' where id = '77700000-0000-0000-0000-000000000001';
    raise exception 'REGRESSION: Owner A UPDATEd their own leases row''s property_id to Owner B''s property';
  exception
    when insufficient_privilege then raise notice 'PASS: leases UPDATE of property_id to another owner''s property correctly rejected';
  end;
end $$;

-- ===== 22. insurance_policies: Owner A can INSERT against their own property =====
do $$
declare new_id uuid;
begin
  insert into public.insurance_policies (property_id, owner_id, carrier)
  values ('b0000000-0000-0000-0000-00000000b001', 'a0000000-0000-0000-0000-00000000a001', 'A''s New Insurer')
  returning id into new_id;
  if new_id is null then raise exception 'REGRESSION: insurance_policies INSERT against the owner''s own property did not succeed'; end if;
  raise notice 'PASS: insurance_policies INSERT against the owner''s own property succeeded';
end $$;

-- ===== 23. insurance_policies: Owner A cannot INSERT against Owner B's property =====
do $$
begin
  begin
    insert into public.insurance_policies (property_id, owner_id, carrier)
    values ('b0000000-0000-0000-0000-00000000b002', 'a0000000-0000-0000-0000-00000000a001', 'Forged');
    raise exception 'REGRESSION: Owner A created an insurance_policies row against Owner B''s property';
  exception
    when insufficient_privilege then raise notice 'PASS: insurance_policies INSERT against another owner''s property correctly rejected';
  end;
end $$;

-- ===== 24. insurance_policies: Owner A cannot UPDATE their own policy's property_id to Owner B's property =====
do $$
begin
  begin
    update public.insurance_policies set property_id = 'b0000000-0000-0000-0000-00000000b002' where id = '88800000-0000-0000-0000-000000000001';
    raise exception 'REGRESSION: Owner A UPDATEd their own insurance_policies row''s property_id to Owner B''s property';
  exception
    when insufficient_privilege then raise notice 'PASS: insurance_policies UPDATE of property_id to another owner''s property correctly rejected';
  end;
end $$;

-- ===== 25. smart_upload_items: Owner B cannot see Owner A's smart_upload_items row =====
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000a002', true);
do $$
declare cnt integer;
begin
  select count(*) into cnt from public.smart_upload_items where id = '66600000-0000-0000-0000-000000000001';
  if cnt <> 0 then raise exception 'REGRESSION: Owner B can see Owner A''s smart_upload_items row'; end if;
  raise notice 'PASS: smart_upload_items SELECT isolation — Owner B cannot see Owner A''s row';
end $$;

-- ===== 26. Tenant cannot access owner Smart Upload staging/review data =====
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000a003', true);
select set_config('request.jwt.claims', '{"email":"tenant1@example.com"}', true);
do $$
declare cnt integer;
begin
  select count(*) into cnt from public.smart_upload_items;
  if cnt <> 0 then raise exception 'REGRESSION: tenant can see % smart_upload_items row(s) — Smart Upload staging/review data must be owner-only', cnt; end if;
  raise notice 'PASS: tenant has zero visibility into smart_upload_items, even for a property they have accepted access to';
end $$;
do $$
begin
  begin
    insert into public.smart_upload_items (owner_id, document_id) values ('a0000000-0000-0000-0000-00000000a003', '11100000-0000-0000-0000-000000000001');
    raise exception 'REGRESSION: tenant was able to INSERT a smart_upload_items row';
  exception
    when insufficient_privilege then raise notice 'PASS: tenant INSERT into smart_upload_items correctly rejected';
  end;
end $$;

-- ===== 27. Tenant cannot see the owner's property_documents rows either (pre-existing guarantee, still true after Part 1's nullability change) =====
do $$
declare cnt integer;
begin
  select count(*) into cnt from public.property_documents where property_id = 'b0000000-0000-0000-0000-00000000b001';
  if cnt <> 0 then raise exception 'REGRESSION: tenant can see % property_documents row(s) for a property they have accepted access to', cnt; end if;
  raise notice 'PASS: tenant has zero visibility into property_documents, unchanged by the nullable property_id migration';
end $$;

rollback;
