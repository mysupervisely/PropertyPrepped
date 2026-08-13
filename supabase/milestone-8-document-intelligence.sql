-- PropPrepped Milestone 8 upgrade
-- Run once in the Supabase SQL Editor. Additive only — does not drop or
-- rewrite any existing table, column, policy, or document data from earlier
-- milestones. Existing property_documents rows keep working exactly as
-- before; the new columns simply default to "not yet analyzed."

-- Extend property_documents with AI classification + analysis status.
alter table public.property_documents
  add column if not exists document_type text,
  add column if not exists classification_confidence text check (classification_confidence in ('High', 'Medium', 'Low')),
  add column if not exists classification_source text check (classification_source in ('User', 'AI')),
  add column if not exists analysis_status text not null default 'Not Analyzed'
    check (analysis_status in ('Not Analyzed', 'Queued', 'Processing', 'Completed', 'Failed')),
  add column if not exists analysis_requested_at timestamptz,
  add column if not exists analysis_completed_at timestamptz,
  add column if not exists analysis_error text;

create index if not exists property_documents_analysis_status_idx on public.property_documents(analysis_status);

-- Hardening (pre-production review): the original property_documents
-- insert/update policies (from Milestone 3) only checked
-- `owner_id = auth.uid()` — they never confirmed that `property_id` also
-- belongs to that same owner. The M8 API route relies on an RLS-scoped
-- lookup of property_documents to prove "this document belongs to the
-- caller," and everything above (document_analyses, ai_usage_events) in
-- turn relies on property_documents.property_id being trustworthy — so a
-- document whose property_id could be pointed at another user's property
-- would undermine that whole chain. Replace both policies (select/delete
-- are unchanged and already correct) so property_id ownership is verified
-- the same way as everywhere else in this migration.
drop policy if exists "documents_insert_own" on public.property_documents;
create policy "documents_insert_own" on public.property_documents for insert to authenticated with check (
  (select auth.uid()) = owner_id
  and exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid()))
);

drop policy if exists "documents_update_own" on public.property_documents;
create policy "documents_update_own" on public.property_documents for update to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid()))
);

-- Each row is one AI analysis run. Re-analyzing a document INSERTs a new
-- row (never updates an old one) so prior analyses stay intact for audit —
-- see analysis_version. The UI defaults to showing the latest version.
create table if not exists public.document_analyses (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.property_documents(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,

  document_type text not null,
  summary text not null default '',

  -- Full structured extraction (groups/fields/itemsToReview/etc. — see
  -- lib/document-intelligence/schemas.ts). This is the minimum necessary
  -- data to render the intelligence view and drive Apply-to-Property; the
  -- raw AI prompt/response text is intentionally NOT stored here.
  structured_data jsonb not null default '{}'::jsonb,
  -- Flattened {group, label, page, snippet, confidence} list for the
  -- "Source References" section, derived from structured_data at save time.
  source_references jsonb not null default '[]'::jsonb,

  model_provider text not null,
  model_name text not null,
  analysis_version integer not null default 1,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists document_analyses_document_idx on public.document_analyses(document_id, analysis_version desc);
create index if not exists document_analyses_property_idx on public.document_analyses(property_id);
create index if not exists document_analyses_owner_idx on public.document_analyses(owner_id);

alter table public.document_analyses enable row level security;
drop policy if exists "document_analyses_select_own" on public.document_analyses;
create policy "document_analyses_select_own" on public.document_analyses for select to authenticated using ((select auth.uid()) = owner_id);

-- INSERT/UPDATE are intentionally stricter than a bare owner_id check: a
-- malicious authenticated client could otherwise set owner_id = their own
-- uid while pointing document_id/property_id at another user's rows (if
-- those UUIDs were ever discovered — e.g. leaked in a log, guessed, shared
-- accidentally). Every write must prove, inside the database, that:
--   1. owner_id is the caller
--   2. document_id is a property_documents row the caller owns
--   3. property_id is a properties row the caller owns
--   4. that document's own property_id matches the property_id on this row
-- All four checks resolve via primary-key lookups (property_documents.id,
-- properties.id) so they stay O(1) regardless of table size — no new
-- indexes are needed beyond the existing primary keys.
drop policy if exists "document_analyses_insert_own" on public.document_analyses;
create policy "document_analyses_insert_own" on public.document_analyses for insert to authenticated with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.property_documents pd
    where pd.id = document_id
      and pd.owner_id = (select auth.uid())
      and pd.property_id = property_id
  )
  and exists (
    select 1 from public.properties p
    where p.id = property_id
      and p.owner_id = (select auth.uid())
  )
);

-- UPDATE: `using` gates which existing rows the caller may touch at all
-- (must already be theirs); `with check` re-validates the resulting row
-- with the same four-part proof as INSERT, so an update can never
-- reassign document_id/property_id/owner_id onto another user's resources.
drop policy if exists "document_analyses_update_own" on public.document_analyses;
create policy "document_analyses_update_own" on public.document_analyses for update to authenticated
using ((select auth.uid()) = owner_id)
with check (
  (select auth.uid()) = owner_id
  and exists (
    select 1 from public.property_documents pd
    where pd.id = document_id
      and pd.owner_id = (select auth.uid())
      and pd.property_id = property_id
  )
  and exists (
    select 1 from public.properties p
    where p.id = property_id
      and p.owner_id = (select auth.uid())
  )
);

drop policy if exists "document_analyses_delete_own" on public.document_analyses;
create policy "document_analyses_delete_own" on public.document_analyses for delete to authenticated using ((select auth.uid()) = owner_id);

create or replace function public.document_analyses_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists document_analyses_touch_updated_at on public.document_analyses;
create trigger document_analyses_touch_updated_at
  before update on public.document_analyses
  for each row
  execute function public.document_analyses_set_updated_at();

-- Minimal usage/cost tracking (Section S) — one row per completed analysis
-- call, enough to enforce future plan limits ("N analyses per month") with a
-- simple count/sum query. No Stripe or enforcement logic yet.
create table if not exists public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid references public.property_documents(id) on delete set null,
  analysis_id uuid references public.document_analyses(id) on delete set null,
  provider text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists ai_usage_events_owner_created_idx on public.ai_usage_events(owner_id, created_at desc);

alter table public.ai_usage_events enable row level security;
drop policy if exists "ai_usage_events_select_own" on public.ai_usage_events;
create policy "ai_usage_events_select_own" on public.ai_usage_events for select to authenticated using ((select auth.uid()) = owner_id);

-- document_id/analysis_id are nullable (both are `on delete set null`), so
-- each is only checked when present — but when present, it must belong to
-- the caller, closing the same "reference someone else's row while owner_id
-- = me" gap as document_analyses above.
drop policy if exists "ai_usage_events_insert_own" on public.ai_usage_events;
create policy "ai_usage_events_insert_own" on public.ai_usage_events for insert to authenticated with check (
  (select auth.uid()) = owner_id
  and (
    document_id is null
    or exists (select 1 from public.property_documents pd where pd.id = document_id and pd.owner_id = (select auth.uid()))
  )
  and (
    analysis_id is null
    or exists (select 1 from public.document_analyses da where da.id = analysis_id and da.owner_id = (select auth.uid()))
  )
);

-- No UPDATE policy: usage events are an append-only audit trail (this was
-- already true before this hardening pass — there was never an UPDATE
-- policy here). No DELETE policy either, by deliberate decision: these rows
-- exist to support future plan-limit enforcement ("N analyses per month"),
-- and letting a client delete its own usage history would let it hide
-- consumption from that future check. There is no product feature today
-- that deletes a usage event, so RLS denies DELETE entirely for the
-- `authenticated` role (the safe default once no DELETE policy exists).
drop policy if exists "ai_usage_events_delete_own" on public.ai_usage_events;
