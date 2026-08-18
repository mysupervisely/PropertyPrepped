-- PropRoster Milestone 14: Smart Import V1
-- Run once if upgrading an existing project (after Milestone 13).
--
-- Smart Import reuses Smart Upload's entire pipeline as-is — the SAME
-- property_documents rows, the SAME private storage bucket, the SAME
-- document_analyses/analyze endpoint, and the SAME smart_upload_items
-- workflow table (supabase/milestone-12-smart-upload.sql). Nothing here
-- creates a second document store, a second AI pipeline, or a second
-- ingestion table.
--
-- Exactly ONE column is added, to make "durable import session" (leaving
-- and resuming a large batch) actually distinguishable per surface:
-- smart_upload_items rows created from the header's "+ Smart Upload"
-- modal and rows created from the standalone /smart-import review queue
-- are functionally identical in every other way (same tables, same
-- analysis, same downstream saves) — `source` only lets each surface's
-- own "what's still unfinished" query (Smart Upload's existing
-- leave-and-return; Smart Import's new "Continue Smart Import" prompt)
-- find its own batches without mixing in the other surface's stray
-- items. It never changes RLS, ownership, or which pipeline a row goes
-- through.
--
-- Idempotent: safe to run multiple times, safe on a database that
-- already has this column — same "add column if not exists" +
-- "drop constraint if exists / add constraint" idiom already used
-- elsewhere in this schema.

alter table public.smart_upload_items add column if not exists source text not null default 'SmartUpload';

alter table public.smart_upload_items drop constraint if exists smart_upload_items_source_check;
alter table public.smart_upload_items add constraint smart_upload_items_source_check
  check (source in ('SmartUpload', 'SmartImport'));

-- No RLS changes needed — `source` is a plain non-FK column on
-- smart_upload_items, already fully covered by the existing owner-scoped
-- smart_upload_items_select_own / insert_own / update_own / delete_own
-- policies (supabase/milestone-12-smart-upload.sql), which check
-- owner_id, not source. A resumed-batch query is just another
-- owner-scoped SELECT through those same policies.
