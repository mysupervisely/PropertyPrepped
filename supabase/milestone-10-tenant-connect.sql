-- PropRoster Milestone 10 upgrade — Tenant Connect foundation.
-- Run once in the Supabase SQL Editor. Additive only — does not drop or
-- rewrite any existing table, column, policy, or property data from
-- earlier milestones.
--
-- Scope (per the Milestone 10 completion report): a landlord and tenant
-- communicating inside PropRoster, in conversations organized by
-- property, optionally linked to a maintenance record. No SMS, no rent
-- collection, no vendor integration (Twilio/SendGrid/Resend) — none of
-- that is wired up here, only the schema/RLS foundation for it.
--
-- Threat model, same rigor as every prior milestone in this file:
-- - A tenant can read/write ONLY conversations tied to their own ACTIVE
--   tenant_property_access row — never another tenant's, never a
--   revoked one, never an owner's private data outside Tenant Connect.
-- - An owner can read/write ONLY conversations for properties they own.
-- - sender_role on property_messages is NEVER trusted from the client —
--   a BEFORE INSERT trigger derives it (and forces sender_user_id) from
--   auth.uid() and the conversation's real owner/tenant relationship,
--   exactly like enforce_property_limit() already derives plan
--   enforcement server-side rather than trusting the client.
-- - Every RLS check below is relational (EXISTS against the owning
--   property/access row), never a bare owner_id-on-the-row check alone —
--   this is what stops a tenant from ever reaching another tenant's
--   conversation by guessing/forging a foreign key value.

-- ==================================================================
-- owner_has_tenant_connect(uuid) — the ONE place the tenantConnect plan
-- check lives (production-hardening pass). Mirrors
-- lib/billing/entitlements.ts's resolveEffectivePlan()/TENANT_CONNECT_ENABLED
-- exactly: a plan only counts if the subscription status is currently
-- entitled ('active', 'trialing', 'past_due' — same set as
-- ENTITLED_STATUSES), and only 'portfolio', 'portfolio_pro', and the
-- internal 'owner' plan grant Tenant Connect. No row at all (a brand-new
-- Free account that has never touched Stripe) correctly evaluates to
-- false, same as every other plan check in this codebase.
--
-- SECURITY DEFINER is required here for a real reason, not convenience:
-- this function is called from tenant-side policies too (a tenant
-- replying needs the OWNER's plan checked, not their own — see the
-- completion report), and user_subscriptions' own RLS only lets a caller
-- see their OWN row (owner_id = auth.uid()). Without SECURITY DEFINER, a
-- tenant's query would never be able to evaluate their landlord's plan at
-- all. The function only ever returns a boolean — never a row, a plan
-- name, or a status — so this elevated read can't leak anything beyond
-- "does this specific owner_id currently have Tenant Connect."
--
-- This is the single reusable helper referenced by every Tenant Connect
-- CREATE policy below, rather than duplicating this plan/status logic
-- five separate times.
create or replace function public.owner_has_tenant_connect(p_owner_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_subscriptions us
    where us.owner_id = p_owner_id
      and us.status in ('active', 'trialing', 'past_due')
      and us.plan in ('portfolio', 'portfolio_pro', 'owner')
  );
$$;

-- ==================================================================
-- tenant_property_access — the tenant/property relationship.
-- ==================================================================
create table if not exists public.tenant_property_access (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  -- Null until the tenant accepts the invite (see accept_tenant_invite()
  -- below) — there is no auth.users row to reference yet at invite time.
  tenant_user_id uuid references auth.users(id) on delete cascade,
  tenant_email text not null,
  lease_id uuid references public.leases(id) on delete set null,
  status text not null default 'Invited' check (status in ('Invited', 'Active', 'Revoked')),
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists tenant_property_access_property_idx on public.tenant_property_access(property_id);
create index if not exists tenant_property_access_owner_idx on public.tenant_property_access(owner_id);
create index if not exists tenant_property_access_tenant_idx on public.tenant_property_access(tenant_user_id);
-- One non-revoked relationship per (property, email) — re-inviting the
-- same tenant to the same property after a genuine revoke is fine (that
-- old row stays status='Revoked' and simply isn't counted here), but two
-- simultaneously live invites/active relationships for the same email on
-- the same property would just be confusing, not a security issue.
create unique index if not exists tenant_property_access_live_unique
  on public.tenant_property_access(property_id, lower(tenant_email))
  where status <> 'Revoked';

alter table public.tenant_property_access enable row level security;

-- SELECT: owner sees every relationship on their own properties. A
-- tenant sees their own row once it's Active (steady state — "tenants
-- can read only their own active relationship"), OR while it's still
-- Invited and addressed to their own signed-in email (the one-time
-- bootstrap step needed to discover and accept an invite at all, since
-- tenant_user_id is null until acceptance so it can't be matched yet).
drop policy if exists "tenant_access_select" on public.tenant_property_access;
create policy "tenant_access_select" on public.tenant_property_access for select to authenticated using (
  (select auth.uid()) = owner_id
  or (status = 'Active' and tenant_user_id = (select auth.uid()))
  or (status = 'Invited' and lower(tenant_email) = lower((select auth.jwt() ->> 'email')))
);

-- INSERT: only an owner, only for a property they own, only as a fresh
-- Invited row (tenant_user_id must be null — the only path to Active is
-- accept_tenant_invite() below, never a direct client insert), and only
-- when the OWNER's own current plan includes Tenant Connect
-- (production-hardening pass — see owner_has_tenant_connect() above).
-- This is a Free/Investor owner's only Tenant Connect touchpoint (they
-- can never even create the access row), so gating it here is enough to
-- keep them out of the feature entirely — everything downstream
-- (conversations, messages) additionally re-checks the same plan anyway.
drop policy if exists "tenant_access_insert_owner" on public.tenant_property_access;
create policy "tenant_access_insert_owner" on public.tenant_property_access for insert to authenticated with check (
  (select auth.uid()) = owner_id
  and exists (select 1 from public.properties p where p.id = property_id and p.owner_id = (select auth.uid()))
  and status = 'Invited'
  and tenant_user_id is null
  and public.owner_has_tenant_connect(owner_id)
);

-- UPDATE: owner only (e.g. revoking access: status='Revoked', revoked_at
-- set). Tenants never get an UPDATE policy — acceptance is handled by
-- the SECURITY DEFINER function below, not a client-side UPDATE, which
-- is what makes "a tenant cannot self-activate/self-assign another
-- tenant_user_id" true by construction rather than by convention.
drop policy if exists "tenant_access_update_owner" on public.tenant_property_access;
create policy "tenant_access_update_owner" on public.tenant_property_access for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);
-- No DELETE policy — access is retired via status='Revoked', never removed.

-- Lets a signed-in user accept an invite addressed to their own email.
-- SECURITY DEFINER only to perform the tenant_user_id/status/accepted_at
-- write (which no client-facing UPDATE policy allows, deliberately —
-- see above); it still fully re-checks identity itself before writing
-- anything, so the elevated privilege never becomes a bypass.
--
-- Production-hardening pass: the acceptance write is now a SINGLE atomic
-- `update ... where id = ... and status = 'Invited' and lower(email) =
-- lower(...)`, not a separate SELECT-then-UPDATE. The original two-step
-- version had a real (if narrow) TOCTOU race: two concurrent calls could
-- both pass the initial SELECT-based check before either committed its
-- UPDATE, and since that UPDATE's WHERE clause didn't re-verify status,
-- a second, already-superseded call could silently overwrite
-- tenant_user_id right after a legitimate first acceptance. Baking the
-- status/email condition directly into the UPDATE's WHERE clause closes
-- that gap the same way M8's duplicate-analysis protection does
-- (property_documents.analysis_status conditional UPDATE) — only one
-- concurrent caller can ever match and win the row lock.
--
-- Error messages are deliberately generic and never echo back
-- tenant_email, owner_id, or property_id — calling this with someone
-- else's access id, a revoked id, or a bogus id all fail the same way a
-- legitimate-but-already-claimed id does ("not available to accept"),
-- so no response here distinguishes "this id exists but isn't yours"
-- from "this id doesn't exist" from "this id was already claimed" in any
-- way that discloses another user's email address. Access ids are
-- random v4 UUIDs (122 bits), never sequential or guessable, and this
-- function only ever accepts an id — never a raw email — so there is no
-- path through it to test "does tenant X have a pending invite."
create or replace function public.accept_tenant_invite(p_access_id uuid)
returns public.tenant_property_access
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.tenant_property_access;
  v_email text;
begin
  v_email := auth.jwt() ->> 'email';
  if v_email is null then
    raise exception 'Not authenticated.';
  end if;

  update public.tenant_property_access
  set tenant_user_id = auth.uid(), status = 'Active', accepted_at = now()
  where id = p_access_id
    and status = 'Invited'
    and lower(tenant_email) = lower(v_email)
  returning * into v_row;

  if v_row.id is null then
    raise exception 'This invite is not available to accept.';
  end if;

  return v_row;
end;
$$;

-- ==================================================================
-- property_conversations — property-scoped conversations between the
-- owner and one tenant relationship.
-- ==================================================================
create table if not exists public.property_conversations (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  tenant_access_id uuid not null references public.tenant_property_access(id) on delete cascade,
  -- Optional link to a real Maintenance record (Section C: "reuse the
  -- existing maintenance-request architecture where practical" without
  -- duplicating it) — set by the owner once/if they formalize a
  -- conversation into a tracked maintenance item. Never set by a tenant.
  maintenance_request_id uuid references public.maintenance_requests(id) on delete set null,
  subject text not null,
  conversation_type text not null default 'General' check (conversation_type in ('General', 'Maintenance', 'Lease', 'Question', 'Other')),
  status text not null default 'Open' check (status in ('Open', 'Closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists property_conversations_property_idx on public.property_conversations(property_id);
create index if not exists property_conversations_owner_idx on public.property_conversations(owner_id);
create index if not exists property_conversations_tenant_access_idx on public.property_conversations(tenant_access_id);
create index if not exists property_conversations_maintenance_idx on public.property_conversations(maintenance_request_id);

alter table public.property_conversations enable row level security;

-- SELECT: owner of the property, or the active tenant on the specific
-- access row this conversation belongs to. Relational (EXISTS through
-- tenant_property_access), never a bare owner_id check alone — this is
-- what stops Tenant A from ever reading Tenant B's conversation even if
-- they somehow learned its id, and what makes a Revoked tenant lose
-- access immediately (the EXISTS stops matching the moment status flips).
drop policy if exists "property_conversations_select" on public.property_conversations;
create policy "property_conversations_select" on public.property_conversations for select to authenticated using (
  (select auth.uid()) = owner_id
  or exists (
    select 1 from public.tenant_property_access tpa
    where tpa.id = tenant_access_id and tpa.status = 'Active' and tpa.tenant_user_id = (select auth.uid())
  )
);

-- INSERT: either the owner (for their own property, referencing one of
-- their own tenant_property_access rows on that same property), or the
-- active tenant on that access row (starting a conversation themselves —
-- Section D: "tenant can submit issue"). Either way owner_id must equal
-- the access row's real owner_id, never a value the caller invents, AND
-- (production-hardening pass) the OWNER's own current plan must include
-- Tenant Connect — checked identically whether the OWNER or the TENANT
-- is the one creating the conversation. This is the "entitlement belongs
-- to the landlord account, not the tenant" rule from the completion
-- report: a tenant's own plan is never consulted (tenants don't have a
-- Tenant Connect plan of their own to check), only the property owner's.
drop policy if exists "property_conversations_insert" on public.property_conversations;
create policy "property_conversations_insert" on public.property_conversations for insert to authenticated with check (
  owner_id = (select tpa.owner_id from public.tenant_property_access tpa where tpa.id = tenant_access_id)
  and property_id = (select tpa.property_id from public.tenant_property_access tpa where tpa.id = tenant_access_id)
  and public.owner_has_tenant_connect(owner_id)
  and (
    (select auth.uid()) = owner_id
    or exists (
      select 1 from public.tenant_property_access tpa
      where tpa.id = tenant_access_id and tpa.status = 'Active' and tpa.tenant_user_id = (select auth.uid())
    )
  )
);

-- UPDATE: owner only (subject/status/maintenance_request_id). Tenants
-- never update conversation-level fields, only post messages into it.
drop policy if exists "property_conversations_update_owner" on public.property_conversations;
create policy "property_conversations_update_owner" on public.property_conversations for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);
-- No DELETE policy — conversations are retired via status='Closed', never removed.

create or replace function public.property_conversations_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists property_conversations_touch_updated_at on public.property_conversations;
create trigger property_conversations_touch_updated_at
  before update on public.property_conversations
  for each row
  execute function public.property_conversations_set_updated_at();

-- ==================================================================
-- property_messages — the actual thread. sender_role/sender_user_id are
-- NEVER trusted from the client; a BEFORE INSERT trigger derives both
-- from auth.uid() and the conversation's real owner/tenant relationship.
-- ==================================================================
create table if not exists public.property_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.property_conversations(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  sender_role text not null check (sender_role in ('Owner', 'Tenant')),
  message text not null,
  created_at timestamptz not null default now()
);
create index if not exists property_messages_conversation_idx on public.property_messages(conversation_id, created_at);

alter table public.property_messages enable row level security;

-- SELECT/INSERT membership check is identical: same conversation
-- membership rule as property_conversations_select above.
drop policy if exists "property_messages_select" on public.property_messages;
create policy "property_messages_select" on public.property_messages for select to authenticated using (
  exists (
    select 1 from public.property_conversations pc
    where pc.id = conversation_id
      and (
        pc.owner_id = (select auth.uid())
        or exists (
          select 1 from public.tenant_property_access tpa
          where tpa.id = pc.tenant_access_id and tpa.status = 'Active' and tpa.tenant_user_id = (select auth.uid())
        )
      )
  )
);

-- INSERT: any conversation member (owner or active tenant) may post —
-- the trigger below (which runs BEFORE this check, since it's a BEFORE
-- INSERT trigger) has already forced sender_user_id/sender_role to the
-- correct, non-spoofable values by the time this with-check evaluates,
-- so this is only re-verifying the caller belongs to the conversation at
-- all, same rule as the select policy — PLUS (production-hardening pass)
-- that the conversation's OWNER still currently has Tenant Connect. This
-- is deliberately checked on every message, not just at conversation
-- creation time: if an owner's plan is later downgraded, new messages
-- (from either side) stop being creatable in their existing
-- conversations too, even though those conversations/messages remain
-- readable (this policy only gates INSERT, never SELECT — existing data
-- is never hidden by a downgrade, same convention as every other plan
-- check in this codebase). A tenant's OWN plan is never consulted here —
-- exactly the "entitlement belongs to the landlord account" rule.
drop policy if exists "property_messages_insert" on public.property_messages;
create policy "property_messages_insert" on public.property_messages for insert to authenticated with check (
  exists (
    select 1 from public.property_conversations pc
    where pc.id = conversation_id
      and public.owner_has_tenant_connect(pc.owner_id)
      and (
        pc.owner_id = (select auth.uid())
        or exists (
          select 1 from public.tenant_property_access tpa
          where tpa.id = pc.tenant_access_id and tpa.status = 'Active' and tpa.tenant_user_id = (select auth.uid())
        )
      )
  )
);
-- No UPDATE/DELETE policy — messages are immutable once posted.

create or replace function public.derive_message_sender_role()
returns trigger
language plpgsql
as $$
declare
  v_owner_id uuid;
  v_tenant_user_id uuid;
  v_tenant_status text;
begin
  -- Force the sender to whoever is actually making this request — never
  -- whatever the client happened to send in the insert payload.
  new.sender_user_id := auth.uid();
  if new.sender_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  select pc.owner_id into v_owner_id
  from public.property_conversations pc
  where pc.id = new.conversation_id;

  if v_owner_id is null then
    raise exception 'Conversation not found.';
  end if;

  if v_owner_id = new.sender_user_id then
    new.sender_role := 'Owner';
    return new;
  end if;

  select tpa.tenant_user_id, tpa.status into v_tenant_user_id, v_tenant_status
  from public.property_conversations pc
  join public.tenant_property_access tpa on tpa.id = pc.tenant_access_id
  where pc.id = new.conversation_id;

  if v_tenant_user_id = new.sender_user_id and v_tenant_status = 'Active' then
    new.sender_role := 'Tenant';
    return new;
  end if;

  raise exception 'Not authorized to post in this conversation.';
end;
$$;

drop trigger if exists property_messages_derive_sender on public.property_messages;
create trigger property_messages_derive_sender
  before insert on public.property_messages
  for each row
  execute function public.derive_message_sender_role();

-- ==================================================================
-- property_message_attachments — image attachments for a message
-- (Section F). Storage object itself lives in the private
-- tenant-connect-attachments bucket, below; this row is the DB-side
-- record tying a storage path to the message/conversation for
-- authorization and listing.
-- ==================================================================
create table if not exists public.property_message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.property_messages(id) on delete cascade,
  storage_path text not null unique,
  mime_type text,
  size_bytes bigint not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists property_message_attachments_message_idx on public.property_message_attachments(message_id);

alter table public.property_message_attachments enable row level security;

drop policy if exists "property_message_attachments_select" on public.property_message_attachments;
create policy "property_message_attachments_select" on public.property_message_attachments for select to authenticated using (
  exists (
    select 1 from public.property_messages pm
    join public.property_conversations pc on pc.id = pm.conversation_id
    where pm.id = message_id
      and (
        pc.owner_id = (select auth.uid())
        or exists (
          select 1 from public.tenant_property_access tpa
          where tpa.id = pc.tenant_access_id and tpa.status = 'Active' and tpa.tenant_user_id = (select auth.uid())
        )
      )
  )
);

-- INSERT additionally requires the attaching message to actually belong
-- to the caller (sender_user_id = auth.uid()) — you can only attach a
-- file to a message you yourself just sent, not retroactively attach to
-- someone else's message in a conversation you're a member of. Also
-- requires (production-hardening pass) the message's conversation's
-- owner to currently have Tenant Connect — since sender_user_id already
-- proves the caller is a legitimate member (the message row could only
-- have been created under property_messages_insert's own entitlement
-- check above), this is mostly defense-in-depth against a plan
-- downgrade landing between the message insert and the attachment
-- insert in the same request.
drop policy if exists "property_message_attachments_insert" on public.property_message_attachments;
create policy "property_message_attachments_insert" on public.property_message_attachments for insert to authenticated with check (
  exists (
    select 1 from public.property_messages pm
    join public.property_conversations pc on pc.id = pm.conversation_id
    where pm.id = message_id
      and pm.sender_user_id = (select auth.uid())
      and public.owner_has_tenant_connect(pc.owner_id)
  )
);
-- No UPDATE/DELETE policy — attachments are immutable once posted, same as messages.

-- ==================================================================
-- property_conversation_reads — minimal per-user "last read" marker so
-- the owner-side Tenant Connect list can show an unread indicator
-- (Section E: "if implemented safely") without guessing at anything —
-- a conversation is unread for a user when its latest message's
-- created_at is newer than that user's own last_read_at row (or no row
-- exists yet at all).
-- ==================================================================
create table if not exists public.property_conversation_reads (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.property_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  unique (conversation_id, user_id)
);
create index if not exists property_conversation_reads_user_idx on public.property_conversation_reads(user_id);

alter table public.property_conversation_reads enable row level security;

-- A user may only ever read/write their OWN read-marker row, and only
-- for a conversation they're actually a member of (same membership rule
-- as property_conversations_select) — this table can't be used to probe
-- who else is in a conversation or to mark it read/unread for anyone else.
drop policy if exists "property_conversation_reads_select" on public.property_conversation_reads;
create policy "property_conversation_reads_select" on public.property_conversation_reads for select to authenticated using (
  user_id = (select auth.uid())
);

drop policy if exists "property_conversation_reads_upsert" on public.property_conversation_reads;
create policy "property_conversation_reads_upsert" on public.property_conversation_reads for insert to authenticated with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.property_conversations pc
    where pc.id = conversation_id
      and (
        pc.owner_id = (select auth.uid())
        or exists (
          select 1 from public.tenant_property_access tpa
          where tpa.id = pc.tenant_access_id and tpa.status = 'Active' and tpa.tenant_user_id = (select auth.uid())
        )
      )
  )
);

drop policy if exists "property_conversation_reads_update" on public.property_conversation_reads;
create policy "property_conversation_reads_update" on public.property_conversation_reads for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- ==================================================================
-- Private storage bucket for message attachments (Section F). Folder
-- convention: <conversation_id>/<file>. Unlike property-documents/
-- property-photos (folder-scoped to the uploader's own UID, since those
-- are strictly owner-exclusive), attachments here must be readable by
-- BOTH conversation participants, so the policy below checks real
-- conversation membership instead of a bare foldername-equals-uid check.
-- ==================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tenant-connect-attachments',
  'tenant-connect-attachments',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "tenant_connect_attachments_select" on storage.objects;
create policy "tenant_connect_attachments_select" on storage.objects for select to authenticated
using (
  bucket_id = 'tenant-connect-attachments'
  and exists (
    select 1 from public.property_conversations pc
    where pc.id::text = (storage.foldername(name))[1]
      and (
        pc.owner_id = (select auth.uid())
        or exists (
          select 1 from public.tenant_property_access tpa
          where tpa.id = pc.tenant_access_id and tpa.status = 'Active' and tpa.tenant_user_id = (select auth.uid())
        )
      )
  )
);

-- Upload additionally requires (production-hardening pass) the target
-- conversation's owner to currently have Tenant Connect — this is the
-- actual upload gate (the DB row insert above is necessary but the
-- browser talks to Storage directly for the file bytes, so the same
-- check must be re-enforced here, not just on property_message_attachments).
drop policy if exists "tenant_connect_attachments_insert" on storage.objects;
create policy "tenant_connect_attachments_insert" on storage.objects for insert to authenticated
with check (
  bucket_id = 'tenant-connect-attachments'
  and exists (
    select 1 from public.property_conversations pc
    where pc.id::text = (storage.foldername(name))[1]
      and public.owner_has_tenant_connect(pc.owner_id)
      and (
        pc.owner_id = (select auth.uid())
        or exists (
          select 1 from public.tenant_property_access tpa
          where tpa.id = pc.tenant_access_id and tpa.status = 'Active' and tpa.tenant_user_id = (select auth.uid())
        )
      )
  )
);
-- No UPDATE/DELETE storage policy — attachments are immutable once posted, same as the DB row above.
