-- PropRoster Milestone 12: Smart Upload Foundation
-- Run once if upgrading an existing project (after Milestone 11).
--
-- Turns the header's "Smart Upload" button (currently a disabled
-- placeholder) into a real ingestion workflow: upload -> AI analysis ->
-- user confirms property -> user reviews extracted fields -> save.
-- Deliberately reuses every existing table/pipeline instead of
-- duplicating any of them (property_documents, document_analyses,
-- financial_transactions, maintenance_records, property_contacts/
-- PropCrew, property_systems) — see the completion report for the full
-- audit. Only two things are genuinely new:
--
-- 1. property_documents.property_id and document_analyses.property_id
--    become NULLABLE. Every existing upload flow always already knew
--    which property a file belonged to (it's opened from inside that
--    property's own Documents tab) — Smart Upload's whole premise is the
--    opposite order: upload and analyze FIRST, then confirm/choose the
--    property. That only requires loosening these two columns, nothing
--    about the rest of the financial/maintenance/lease/insurance schema
--    changes — those are only ever written AFTER the property is known,
--    exactly like every existing flow, so their NOT NULL property_id is
--    untouched.
--
--    Explicitly NOT done here: "General / Portfolio Expense" (an item
--    with NO property at all, ever) is not supported in this milestone —
--    that would additionally require loosening financial_transactions'
--    OWN NOT NULL property_id, a materially bigger, more consequential
--    change (the Financials tab, Property Timeline, and Investment
--    calculations all assume every transaction belongs to exactly one
--    property). See the completion report for the options this needs a
--    real decision on before it's built.
--
-- 2. smart_upload_items: a thin, owner-scoped workflow-state table. NOT a
--    second document store or a second AI pipeline — every row points at
--    exactly one already-canonical property_documents row (the file
--    itself is stored/classified/analyzed exactly like any other
--    document) and exists only to track this ONE workflow's own state:
--    which batch a multi-file upload belongs to, which property the user
--    confirmed, and which downstream records (expense, maintenance
--    record, PropCrew contact) this item has already created — the
--    idempotency guard that stops a double Save from creating duplicates.

-- ============================================================
-- Section 1: let a document exist before its property is known
-- ============================================================
alter table public.property_documents alter column property_id drop not null;
alter table public.document_analyses alter column property_id drop not null;

-- The existing property_documents write policies (Milestone 8 hardening)
-- required property_id to already reference one of the caller's own
-- properties. A NULL property_id must remain allowed (Smart Upload's
-- pre-confirmation state) without opening a hole for a forged one.
drop policy if exists "documents_insert_own" on public.property_documents;
create policy "documents_insert_own" on public.property_documents for insert to authenticated with check (
  (select auth.uid()) = owner_id
  and (property_id is null or exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid())))
);
drop policy if exists "documents_update_own" on public.property_documents;
create policy "documents_update_own" on public.property_documents for update to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and (property_id is null or exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid())))
);

-- Same idea for document_analyses, which additionally requires its own
-- property_id to match the document's property_id — "= " must become
-- "is not distinct from" so two NULLs (Smart Upload analyzing before a
-- property is chosen) still count as matching instead of vacuously
-- failing (NULL = NULL is NULL, not true, in SQL). The outer reference
-- MUST be qualified as document_analyses.property_id, not bare
-- property_id — inside the EXISTS subquery, an unqualified property_id
-- resolves to the subquery's own pd.property_id (its innermost scope),
-- not the row being inserted/updated, which would silently compare
-- pd.property_id to itself (always true) instead of to the real target.
-- Caught by supabase/tests/milestone-12-rls.test.sql actually running
-- against a database, not by reading the policy text.
drop policy if exists "document_analyses_insert_own" on public.document_analyses;
create policy "document_analyses_insert_own" on public.document_analyses for insert to authenticated with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.property_documents pd
    where pd.id = document_id
      and pd.owner_id = (select auth.uid())
      and pd.property_id is not distinct from document_analyses.property_id
  )
  and (property_id is null or exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid())))
);
drop policy if exists "document_analyses_update_own" on public.document_analyses;
create policy "document_analyses_update_own" on public.document_analyses for update to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.property_documents pd
    where pd.id = document_id
      and pd.owner_id = (select auth.uid())
      and pd.property_id is not distinct from document_analyses.property_id
  )
  and (property_id is null or exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid())))
);

-- ============================================================
-- Section 2: Smart Upload workflow state
-- ============================================================
create table if not exists public.smart_upload_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  -- The ONE canonical source document ("save once, use throughout
  -- PropRoster") — a normal property_documents row, analyzed through the
  -- normal document_analyses pipeline. This table never stores a copy of
  -- the file or the analysis, only a pointer plus this workflow's own
  -- progress against it.
  document_id uuid not null references public.property_documents(id) on delete cascade,
  -- Groups files selected together via "Upload Multiple" into one queue
  -- (Section 20) — a single upload still gets a batch_id, just one of
  -- one. Not a foreign key to anything; a shared client-generated value.
  batch_id uuid not null default gen_random_uuid(),
  -- The user's actual confirmed choice (Section 9: "no silent property
  -- guessing" — AI's suggested match is derived at render time from the
  -- stored analysis's extracted address text plus the caller's own
  -- properties, never persisted as a separate "suggested" value that
  -- could drift from that source of truth). Null until confirmed.
  confirmed_property_id uuid references public.properties(id) on delete set null,
  -- Idempotency guards: once set, Save is a no-op for that record type —
  -- see Section 25. Each points at the exact row this item created, so a
  -- retried/double-clicked Save can detect "already done" instead of
  -- inserting a second time.
  created_financial_transaction_id uuid references public.financial_transactions(id) on delete set null,
  created_maintenance_record_id uuid references public.maintenance_records(id) on delete set null,
  created_contact_id uuid references public.property_contacts(id) on delete set null,
  -- Null while still in the entry/analyzing/review flow; set once the
  -- user finishes this item (saved something, or explicitly kept it as a
  -- Documents-only file). Lets a closed/reopened Smart Upload session
  -- show "still needs review" vs "done" per item (Section 21's
  -- leave-and-return foundation).
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists smart_upload_items_owner_idx on public.smart_upload_items(owner_id);
create index if not exists smart_upload_items_batch_idx on public.smart_upload_items(batch_id);
create index if not exists smart_upload_items_document_idx on public.smart_upload_items(document_id);
alter table public.smart_upload_items enable row level security;

drop policy if exists "smart_upload_items_select_own" on public.smart_upload_items;
create policy "smart_upload_items_select_own" on public.smart_upload_items for select to authenticated using ((select auth.uid()) = owner_id);

-- SECURITY: every nullable FK column here points at another owner-scoped
-- table — a plain foreign key only proves the referenced row EXISTS, not
-- that it belongs to the same owner (the FK-forging lesson from Milestone
-- 11's review, applied from the start this time). "is null or exists(...
-- owner_id = caller)" on every one of them.
drop policy if exists "smart_upload_items_insert_own" on public.smart_upload_items;
create policy "smart_upload_items_insert_own" on public.smart_upload_items for insert to authenticated with check (
  (select auth.uid()) = owner_id
  and exists (select 1 from public.property_documents d where d.id = document_id and d.owner_id = (select auth.uid()))
  and (confirmed_property_id is null or exists (select 1 from public.properties p where p.id = confirmed_property_id and p.owner_id = (select auth.uid())))
  and (created_financial_transaction_id is null or exists (select 1 from public.financial_transactions t where t.id = created_financial_transaction_id and t.owner_id = (select auth.uid())))
  and (created_maintenance_record_id is null or exists (select 1 from public.maintenance_records m where m.id = created_maintenance_record_id and m.owner_id = (select auth.uid())))
  and (created_contact_id is null or exists (select 1 from public.property_contacts c where c.id = created_contact_id and c.owner_id = (select auth.uid())))
);
drop policy if exists "smart_upload_items_update_own" on public.smart_upload_items;
create policy "smart_upload_items_update_own" on public.smart_upload_items for update to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and exists (select 1 from public.property_documents d where d.id = document_id and d.owner_id = (select auth.uid()))
  and (confirmed_property_id is null or exists (select 1 from public.properties p where p.id = confirmed_property_id and p.owner_id = (select auth.uid())))
  and (created_financial_transaction_id is null or exists (select 1 from public.financial_transactions t where t.id = created_financial_transaction_id and t.owner_id = (select auth.uid())))
  and (created_maintenance_record_id is null or exists (select 1 from public.maintenance_records m where m.id = created_maintenance_record_id and m.owner_id = (select auth.uid())))
  and (created_contact_id is null or exists (select 1 from public.property_contacts c where c.id = created_contact_id and c.owner_id = (select auth.uid())))
);
drop policy if exists "smart_upload_items_delete_own" on public.smart_upload_items;
create policy "smart_upload_items_delete_own" on public.smart_upload_items for delete to authenticated using ((select auth.uid()) = owner_id);
