-- PropRoster Milestone 23 — Tax Center V3 RLS test.
--
-- Same methodology as milestone-22-rls.test.sql: run by hand against a
-- database with PropRoster's full schema.sql (+ this milestone's
-- migration) loaded and the Supabase auth/storage schemas stubbed (see
-- milestone-9/10-rls.test.sql's notes). Every block RAISEs "REGRESSION"
-- or NOTICEs "PASS". Run with `psql -v ON_ERROR_STOP=0` and grep for
-- "REGRESSION" — a clean run has zero matches. Users/rows are created
-- inside a transaction rolled back at the end.
--
-- Covers two things: (1) the new expanded numeric columns on the
-- existing property_tax_records table are protected by the SEPARATE
-- property_tax_records_non_negative_v3 constraint without disturbing the
-- existing V2 constraint/rows, and (2) the full RLS suite for the new
-- property_tax_custom_items table.

begin;

insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-00000000a230', 'owner-a@example.com'),
  ('a0000000-0000-0000-0000-00000000a231', 'owner-b@example.com');

insert into public.properties (id, owner_id, address, city, property_type) values
  ('b0000000-0000-0000-0000-00000000b230', 'a0000000-0000-0000-0000-00000000a230', '1 Owner A St', 'Tampa', 'Rental Property'),
  ('b0000000-0000-0000-0000-00000000b231', 'a0000000-0000-0000-0000-00000000a231', '2 Owner B Ave', 'Tampa', 'Rental Property');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000a230', true);

-- ===== 1. Owner A can insert a property_tax_records row using several
-- brand-new V3 columns across every new group, including mileage =====
do $$
begin
  insert into public.property_tax_records (
    property_id, owner_id, tax_year,
    permits_licenses, bank_fees, prof_legal_fees, prof_accounting_fees, prof_tax_prep_fees,
    prof_bookkeeping, prof_software_subscriptions, prof_office_expenses, prof_phone_internet,
    prof_memberships, prof_education, prof_other,
    travel_parking, travel_tolls, travel_airfare, travel_rental_car, travel_lodging, travel_other,
    business_mileage, business_mileage_notes, meals_business,
    financing_points, financing_other,
    capital_appliances, capital_furniture, capital_equipment, capital_major_renovations, capital_roof, capital_hvac, capital_other
  ) values (
    'b0000000-0000-0000-0000-00000000b230', 'a0000000-0000-0000-0000-00000000a230', 2026,
    150.00, 25.00, 400.00, 600.00, 350.00,
    200.00, 120.00, 75.00, 90.00,
    60.00, 30.00, 10.00,
    45.00, 12.50, 320.00, 210.00, 180.00, 20.00,
    842.5, 'Round trips to inspect the property and meet contractors', 65.00,
    900.00, 40.00,
    1200.00, 800.00, 500.00, 15000.00, 9000.00, 6500.00, 200.00
  );
  raise notice 'PASS: Owner A inserted a property_tax_records row using every new V3 column';
end $$;

-- ===== 2. A negative amount in any new V3 column is rejected by the new non-negative constraint =====
do $$
begin
  begin
    insert into public.property_tax_records (property_id, owner_id, tax_year, prof_legal_fees)
    values ('b0000000-0000-0000-0000-00000000b230', 'a0000000-0000-0000-0000-00000000a230', 2027, -50.00);
    raise exception 'REGRESSION: a negative prof_legal_fees amount was accepted';
  exception
    when check_violation then raise notice 'PASS: negative amount in a new V3 column correctly rejected';
  end;
end $$;

-- ===== 2b. Negative mileage is rejected too (a quantity, not a dollar amount, but still non-negative) =====
do $$
begin
  begin
    insert into public.property_tax_records (property_id, owner_id, tax_year, business_mileage)
    values ('b0000000-0000-0000-0000-00000000b230', 'a0000000-0000-0000-0000-00000000a230', 2029, -10.0);
    raise exception 'REGRESSION: negative business_mileage was accepted';
  exception
    when check_violation then raise notice 'PASS: negative business_mileage correctly rejected';
  end;
end $$;

-- ===== 3. The pre-existing V2 non-negative constraint is untouched — a
-- negative EXISTING column (e.g. insurance) is still rejected exactly as
-- before this migration =====
do $$
begin
  begin
    insert into public.property_tax_records (property_id, owner_id, tax_year, insurance)
    values ('b0000000-0000-0000-0000-00000000b230', 'a0000000-0000-0000-0000-00000000a230', 2030, -1.00);
    raise exception 'REGRESSION: the pre-existing V2 non-negative constraint no longer rejects a negative insurance amount';
  exception
    when check_violation then raise notice 'PASS: the existing V2 non-negative constraint is untouched and still enforced';
  end;
end $$;

-- ===== 4. property_tax_custom_items: Owner A can insert a custom item
-- for their own property =====
do $$
begin
  insert into public.property_tax_custom_items (property_id, owner_id, tax_year, description, amount, category_group, notes)
  values ('b0000000-0000-0000-0000-00000000b230', 'a0000000-0000-0000-0000-00000000a230', 2026, 'New water heater', 950.00, 'capital', 'Replaced after the old one failed');
  raise notice 'PASS: Owner A inserted a property_tax_custom_items row for their own property';
end $$;

-- ===== 5. Custom item insert against Owner B's property (forged property_id) is rejected =====
do $$
begin
  begin
    insert into public.property_tax_custom_items (property_id, owner_id, tax_year, description, amount, category_group)
    values ('b0000000-0000-0000-0000-00000000b231', 'a0000000-0000-0000-0000-00000000a230', 2026, 'Forged item', 100.00, 'other');
    raise exception 'REGRESSION: Owner A created a custom tax item against Owner B''s property';
  exception
    when insufficient_privilege then raise notice 'PASS: custom item INSERT against another owner''s property correctly rejected';
  end;
end $$;

-- ===== 6. Custom item insert claiming owner_id = Owner B is rejected =====
do $$
begin
  begin
    insert into public.property_tax_custom_items (property_id, owner_id, tax_year, description, amount, category_group)
    values ('b0000000-0000-0000-0000-00000000b230', 'a0000000-0000-0000-0000-00000000a231', 2026, 'Forged owner', 100.00, 'other');
    raise exception 'REGRESSION: Owner A inserted a custom item claiming owner_id = Owner B';
  exception
    when insufficient_privilege then raise notice 'PASS: custom item INSERT with a forged owner_id correctly rejected';
  end;
end $$;

-- ===== 7. An invalid category_group is rejected =====
do $$
begin
  begin
    insert into public.property_tax_custom_items (property_id, owner_id, tax_year, description, amount, category_group)
    values ('b0000000-0000-0000-0000-00000000b230', 'a0000000-0000-0000-0000-00000000a230', 2026, 'Mystery item', 50.00, 'notARealGroup');
    raise exception 'REGRESSION: an invalid category_group value was accepted';
  exception
    when check_violation then raise notice 'PASS: invalid category_group correctly rejected';
  end;
end $$;

-- ===== 8. A blank description is rejected =====
do $$
begin
  begin
    insert into public.property_tax_custom_items (property_id, owner_id, tax_year, description, amount, category_group)
    values ('b0000000-0000-0000-0000-00000000b230', 'a0000000-0000-0000-0000-00000000a230', 2026, '   ', 50.00, 'other');
    raise exception 'REGRESSION: a blank/whitespace-only description was accepted';
  exception
    when check_violation then raise notice 'PASS: blank description correctly rejected';
  end;
end $$;

-- ===== 9. A negative amount is rejected =====
do $$
begin
  begin
    insert into public.property_tax_custom_items (property_id, owner_id, tax_year, description, amount, category_group)
    values ('b0000000-0000-0000-0000-00000000b230', 'a0000000-0000-0000-0000-00000000a230', 2026, 'Negative item', -25.00, 'other');
    raise exception 'REGRESSION: a negative custom item amount was accepted';
  exception
    when check_violation then raise notice 'PASS: negative custom item amount correctly rejected';
  end;
end $$;

-- ===== 10. Owner B cannot SELECT Owner A's custom items =====
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000a231', true);
do $$
declare cnt integer;
begin
  select count(*) into cnt from public.property_tax_custom_items where property_id = 'b0000000-0000-0000-0000-00000000b230';
  if cnt <> 0 then raise exception 'REGRESSION: Owner B can see Owner A''s property_tax_custom_items rows'; end if;
  raise notice 'PASS: property_tax_custom_items SELECT isolation — Owner B cannot see Owner A''s rows';
end $$;

-- ===== 11. Owner B cannot UPDATE Owner A's custom item =====
do $$
declare affected integer;
begin
  update public.property_tax_custom_items set amount = 1.00 where property_id = 'b0000000-0000-0000-0000-00000000b230';
  get diagnostics affected = row_count;
  if affected > 0 then raise exception 'REGRESSION: Owner B updated Owner A''s custom tax item'; end if;
  raise notice 'PASS: property_tax_custom_items UPDATE by Owner B correctly affected 0 rows';
end $$;

-- ===== 12. Owner B cannot DELETE Owner A's custom item =====
do $$
declare affected integer;
begin
  delete from public.property_tax_custom_items where property_id = 'b0000000-0000-0000-0000-00000000b230';
  get diagnostics affected = row_count;
  if affected > 0 then raise exception 'REGRESSION: Owner B deleted Owner A''s custom tax item'; end if;
  raise notice 'PASS: property_tax_custom_items DELETE by Owner B correctly affected 0 rows';
end $$;

-- ===== 13. Owner A can update and then delete their own custom item;
-- the updated_at trigger is installed and enabled (same pg_trigger
-- catalog check as milestone-22 — now() is frozen for this whole
-- transaction, so a timestamp-delta assertion would be meaningless). =====
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000a230', true);
do $$
begin
  update public.property_tax_custom_items set amount = 999.00 where property_id = 'b0000000-0000-0000-0000-00000000b230';
  if not found then raise exception 'REGRESSION: Owner A could not update their own custom tax item'; end if;
  raise notice 'PASS: Owner A can update their own custom tax item';
end $$;
reset role;
do $$
declare trigger_enabled text;
begin
  select tgenabled into trigger_enabled from pg_trigger where tgname = 'property_tax_custom_items_touch_updated_at' and not tgisinternal;
  if trigger_enabled is null then raise exception 'REGRESSION: property_tax_custom_items_touch_updated_at trigger is not installed'; end if;
  if trigger_enabled <> 'O' then raise exception 'REGRESSION: property_tax_custom_items_touch_updated_at trigger is installed but not enabled (tgenabled=%)', trigger_enabled; end if;
  raise notice 'PASS: property_tax_custom_items_touch_updated_at trigger is installed and enabled';
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-00000000a230', true);

do $$
declare affected integer;
begin
  delete from public.property_tax_custom_items where property_id = 'b0000000-0000-0000-0000-00000000b230';
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'REGRESSION: Owner A could not delete their own custom tax item (affected=%)', affected; end if;
  raise notice 'PASS: Owner A can delete their own custom tax item';
end $$;

-- ===== 14. tax_year range check on custom items (mirrors property_tax_records) =====
do $$
begin
  begin
    insert into public.property_tax_custom_items (property_id, owner_id, tax_year, description, amount, category_group)
    values ('b0000000-0000-0000-0000-00000000b230', 'a0000000-0000-0000-0000-00000000a230', 1899, 'Too old', 10.00, 'other');
    raise exception 'REGRESSION: an out-of-range tax_year was accepted on a custom item';
  exception
    when check_violation then raise notice 'PASS: out-of-range tax_year on a custom item correctly rejected';
  end;
end $$;

rollback;
