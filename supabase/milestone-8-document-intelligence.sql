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
drop policy if exists "document_analyses_insert_own" on public.document_analyses;
create policy "document_analyses_insert_own" on public.document_analyses for insert to authenticated with check ((select auth.uid()) = owner_id);
drop policy if exists "document_analyses_update_own" on public.document_analyses;
create policy "document_analyses_update_own" on public.document_analyses for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
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
drop policy if exists "ai_usage_events_insert_own" on public.ai_usage_events;
create policy "ai_usage_events_insert_own" on public.ai_usage_events for insert to authenticated with check ((select auth.uid()) = owner_id);
drop policy if exists "ai_usage_events_delete_own" on public.ai_usage_events;
create policy "ai_usage_events_delete_own" on public.ai_usage_events for delete to authenticated using ((select auth.uid()) = owner_id);
