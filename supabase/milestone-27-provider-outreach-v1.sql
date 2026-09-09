-- PropRoster — Tenant Connect: Provider Outreach V1.
--
-- NOT YET APPLIED TO PRODUCTION. Review before running.
--
-- Audited M0-M3 schema first (supabase/schema.sql,
-- milestone-24/25/26-*.sql): no existing table already models
-- "landlord emailed an assigned PropCrew provider about one specific
-- maintenance request, and got a response back." maintenance_requests
-- already has assigned_contact_id (M3) — that only records WHO the
-- landlord picked, never whether/that they were actually contacted.
-- tenant_property_access's invite flow is NOT reused here: it emails a
-- known app user to sign in, never issues a secure standalone link —
-- exactly the opposite of what an account-less provider needs.
--
-- One new table. Provider outreach state is kept entirely separate
-- from maintenance_requests.status (still only Submitted/Scheduled/
-- In Progress/Completed) — a provider accepting/declining/asking a
-- question never touches that column, per this milestone's own
-- explicit "must remain distinct" instruction.
--
-- Access model (deliberately no client INSERT/UPDATE policy):
--   - Landlord SEND (app/api/maintenance/provider-outreach/send):
--     server route only. Re-fetches the request/contact via the
--     LANDLORD'S OWN RLS-scoped client first (createRequestClient) —
--     that re-fetch IS the authorization check, exactly the
--     lib/tenant-connect/notify.ts pattern. Only after that succeeds
--     does it use the admin client to insert the outreach row (a
--     high-entropy token must be generated and only its hash stored;
--     that logic lives server-side either way) and send the email.
--   - Provider RESPOND (app/api/provider-outreach/respond): the
--     provider has no Supabase session at all — cannot exist under
--     RLS by construction. The route validates the raw token
--     server-side (hash + expiry + not-already-responded) via the
--     admin client before writing anything. Never trusts a client-
--     supplied maintenance_request_id/contact_id/outreach id — only
--     the token identifies the one row.
--   - Landlord READ (Command Center / case detail): a normal RLS-
--     scoped SELECT, same as every other maintenance-related read in
--     this app — this is the ONE policy below.
--
-- token_hash, never the raw token, is persisted — the raw token exists
-- only in the emailed link and the provider's own browser.

create table if not exists public.maintenance_provider_outreach (
  id uuid primary key default gen_random_uuid(),
  maintenance_request_id uuid not null references public.maintenance_requests(id) on delete cascade,
  contact_id uuid not null references public.property_contacts(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'sent' check (status in ('sent', 'accepted', 'declined', 'needs_information')),
  provider_message text,
  token_hash text not null unique,
  token_expires_at timestamptz not null default (now() + interval '14 days'),
  sent_at timestamptz not null default now(),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists maintenance_provider_outreach_request_idx on public.maintenance_provider_outreach(maintenance_request_id, created_at desc);
create index if not exists maintenance_provider_outreach_owner_idx on public.maintenance_provider_outreach(owner_id);
-- token_hash already has a UNIQUE constraint (and its implicit index) —
-- this is the lookup path app/provider/[token]/page.tsx and the
-- respond route both use.

alter table public.maintenance_provider_outreach enable row level security;

-- The only client-facing policy: the landlord reads their own outreach
-- rows directly (Command Center / case detail display), exactly like
-- every other maintenance-adjacent table in this app. No insert/
-- update/delete policy exists for any authenticated role — every write
-- goes through the two server routes above, using the admin client,
-- specifically because (a) the provider has no session to be RLS-
-- scoped under, and (b) the landlord-initiated send needs to generate
-- and hash a token server-side regardless. This mirrors the ONE
-- existing precedent for admin-client-only writes in this app (the
-- Stripe webhook, lib/supabase-server.ts) — narrowly scoped, not a
-- general RLS weakening.
drop policy if exists "maintenance_provider_outreach_select_own" on public.maintenance_provider_outreach;
create policy "maintenance_provider_outreach_select_own" on public.maintenance_provider_outreach
  for select to authenticated using ((select auth.uid()) = owner_id);

-- updated_at bookkeeping, same convention as every other table in this
-- app that tracks it (see property_contact_links-adjacent tables).
create or replace function public.maintenance_provider_outreach_set_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists maintenance_provider_outreach_updated_at on public.maintenance_provider_outreach;
create trigger maintenance_provider_outreach_updated_at
  before update on public.maintenance_provider_outreach
  for each row execute function public.maintenance_provider_outreach_set_updated_at();
