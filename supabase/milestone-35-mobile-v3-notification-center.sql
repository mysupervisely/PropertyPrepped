-- PropRoster — Mobile V3: Notifications & Activity Center.
--
-- Adds ONE new table, public.notification_events, and five small
-- trigger functions that populate it. Nothing else in the schema
-- changes. See the Mobile V3 audit (session report) for why this is
-- the smallest safe design:
--
-- * No existing table can answer "what happened and have I seen it" for
--   every event type this milestone needs. property_conversation_reads
--   already does this for conversations; the same idea extended here,
--   but simpler — a notification always belongs to exactly ONE owner
--   (never shared with a tenant the way a conversation is), so read
--   state lives directly on the row (read_at) instead of a separate
--   per-user join table.
-- * Two of the five event types (new tenant message, new tenant
--   maintenance request) are written by the TENANT's own RLS-scoped
--   client, which the landlord's browser never touches — a client-side
--   "insert a notification after I act" approach cannot see those at
--   all. Triggers are the only mechanism that sees every write
--   regardless of which role made it.
-- * Idempotency is structural, not a defensive unique index: an INSERT
--   trigger fires exactly once per row insert (the row can't be
--   inserted twice by definition), and every UPDATE trigger below
--   carries a WHEN clause so a write that doesn't actually change the
--   field in question never fires at all (e.g. re-saving the same
--   status). There is no way for one real event to produce two rows.
-- * No historical backfill — this table starts empty and only ever
--   receives rows for events that happen after it's created. Avoids
--   needing to reconstruct a plausible "when did this happen" for
--   years of existing data (which would be fabricating timestamps, not
--   reading them).
--
-- RLS: owner can SELECT their own rows and UPDATE only read_at on their
-- own rows. There is no INSERT policy for 'authenticated' at all —
-- every row is created exclusively by the SECURITY DEFINER trigger
-- functions below (same precedent as
-- tenant_requests_create_maintenance_case() in this file's own
-- schema.sql), so a client can never fabricate or backdate a
-- notification. No DELETE policy — a notification is retired by being
-- read, never removed, same convention property_conversations' status
-- column already uses.

create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  -- Final-gate audit fix: a strictly monotonic, insertion-order
  -- identity column. created_at (below) defaults to now(), which is
  -- transaction_timestamp() in Postgres — frozen for the whole
  -- transaction, not per-statement. Two notification_events rows
  -- created moments apart (e.g. a tenant sends two messages back to
  -- back before a request is ever filed) can legitimately get the
  -- EXACT SAME created_at if they land in the same transaction or the
  -- same wall-clock tick, which makes "order by created_at asc limit 1"
  -- an undefined tiebreak — not a hypothetical, reproduced live against
  -- Postgres during review. `seq` has none of that ambiguity: a
  -- GENERATED ... AS IDENTITY column is assigned from a sequence at the
  -- exact moment each row is inserted, strictly increasing, regardless
  -- of transaction boundaries or clock resolution. It is the
  -- authoritative "which of these came first" answer everywhere that
  -- actually matters (notify_on_tenant_request()'s upgrade-in-place
  -- logic below) and the app's own chronological feed ordering uses it
  -- too, for the same reason — created_at stays purely for display.
  seq bigint generated always as identity,
  owner_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in (
    'tenant_message',
    'tenant_maintenance_request',
    'maintenance_status_change',
    'propcrew_outreach_response',
    'tenant_invite_accepted'
  )),
  -- Nullable FKs to whichever existing row actually caused this event —
  -- never a copy of that row's own data (no duplicated message text,
  -- no duplicated tenant name). The UI re-reads the real row through
  -- its own existing RLS-scoped query when it needs more than this
  -- table carries.
  property_id uuid references public.properties(id) on delete cascade,
  conversation_id uuid references public.property_conversations(id) on delete cascade,
  maintenance_request_id uuid references public.maintenance_requests(id) on delete cascade,
  tenant_access_id uuid references public.tenant_property_access(id) on delete cascade,
  outreach_id uuid references public.maintenance_provider_outreach(id) on delete cascade,
  -- Small, trigger-derived detail that would otherwise require an extra
  -- join just to label the feed row (e.g. {"status": "In Progress"}).
  -- Always copied verbatim from NEW at the moment of the real write —
  -- never computed or guessed afterward.
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notification_events_owner_idx on public.notification_events(owner_id, seq desc);
create index if not exists notification_events_owner_unread_idx on public.notification_events(owner_id) where read_at is null;

alter table public.notification_events enable row level security;

drop policy if exists "notification_events_select_own" on public.notification_events;
create policy "notification_events_select_own" on public.notification_events for select to authenticated using ((select auth.uid()) = owner_id);

-- UPDATE exists only so the owner can set read_at (mark-as-read /
-- mark-all-as-read). The WITH CHECK is identical to USING — this does
-- not additionally restrict which columns can change (Postgres RLS has
-- no column-level grain), but the application only ever sends
-- { read_at } in its update calls; there is nothing else on this row a
-- client could usefully corrupt (event_type/FKs/metadata are
-- immutable in practice since nothing in the app ever writes them
-- after the trigger that created the row).
drop policy if exists "notification_events_update_own" on public.notification_events;
create policy "notification_events_update_own" on public.notification_events for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

-- No INSERT policy for 'authenticated' — see header comment. No DELETE policy.

-- ===================================================================
-- 1. New tenant message. Only the TENANT side of a conversation is
--    notification-worthy here — an owner replying doesn't need to be
--    told about their own reply. Unconditional for every tenant
--    message, including the opening message of a guided-intake
--    submission — see notify_on_tenant_request() below for how that
--    specific row gets upgraded in place rather than duplicated, once
--    (and only if) a tenant_requests row turns out to reference the
--    same conversation a moment later. This function itself never
--    needs to know or guess that in advance.
-- ===================================================================
create or replace function public.notify_on_tenant_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_property_id uuid;
begin
  if new.sender_role <> 'Tenant' then
    return new;
  end if;

  select pc.owner_id, pc.property_id into v_owner_id, v_property_id
  from public.property_conversations pc
  where pc.id = new.conversation_id;

  if v_owner_id is null then
    return new;
  end if;

  insert into public.notification_events (owner_id, event_type, property_id, conversation_id)
  values (v_owner_id, 'tenant_message', v_property_id, new.conversation_id);

  return new;
end;
$$;

drop trigger if exists notify_on_tenant_message on public.property_messages;
create trigger notify_on_tenant_message
  after insert on public.property_messages
  for each row
  execute function public.notify_on_tenant_message();

-- ===================================================================
-- 2. New tenant maintenance request. Every tenant_requests row is
--    tenant-initiated by construction (see
--    tenant_requests_create_maintenance_case()'s own header above) —
--    no WHEN clause needed to filter by actor.
--
--    De-duplication against notify_on_tenant_message (post-launch
--    audit fix): the real guided-intake flow
--    (lib/maintenance/intake/submit.ts) always inserts the tenant's
--    opening property_messages row BEFORE this tenant_requests row, in
--    the SAME conversation — which already fired
--    notify_on_tenant_message() and created a 'tenant_message'
--    notification moments earlier. Left alone, one tenant submission
--    would produce two notifications for one action.
--
--    Rejected fix: suppress notify_on_tenant_message() for "the first
--    message in a conversation_type = 'Maintenance' conversation."
--    That's an inference from a string convention set by the CALLER,
--    not from the real causal relationship, and the opening message
--    doesn't yet know (can't know, as a cause-before-effect matter of
--    sequence) whether a tenant_requests row is about to be created in
--    the conversation it belongs to.
--
--    Actual fix: UPDATE the earlier 'tenant_message' notification for
--    this exact conversation_id in place, turning it into the
--    'tenant_maintenance_request' notification, keyed off the real FK
--    (tenant_requests.conversation_id is even unique — see
--    tenant_requests_conversation_unique below) rather than a type
--    string. This is deterministic and timing-independent in the sense
--    that matters: it never guesses about a write that hasn't happened
--    yet, it only reacts to one that has already committed in this
--    exact, always-sequential flow (message, then request — never the
--    reverse, never concurrent, in the one real code path that creates
--    tenant_requests rows). If no matching opening-message notification
--    is found (any other flow that creates a tenant_requests row
--    without a preceding message), it falls back to inserting a fresh
--    one, so this is strictly additive safety, never a silent drop.
--    Every OTHER tenant message — replies in the same conversation, or
--    any message in a conversation no tenant_requests row ever
--    references — is completely unaffected: this function only ever
--    touches the one earliest 'tenant_message' row for the exact
--    conversation_id the new tenant_requests row itself points at.
--
--    "Earliest" is determined by `seq`, not `created_at` (final-gate
--    audit fix) — reproduced live: a tenant sending two messages before
--    ever filing a request can get two notification_events rows with
--    the IDENTICAL created_at (transaction_timestamp() is frozen per
--    transaction), which makes created_at ordering an undefined
--    tiebreak. `seq` can't tie — see its own column comment above.
-- ===================================================================
create or replace function public.notify_on_tenant_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated_count int;
begin
  update public.notification_events
  set event_type = 'tenant_maintenance_request',
      maintenance_request_id = new.maintenance_request_id,
      metadata = jsonb_build_object('category', new.category)
  where id = (
    select id from public.notification_events
    where conversation_id = new.conversation_id
      and event_type = 'tenant_message'
    order by seq asc
    limit 1
  );
  get diagnostics v_updated_count = row_count;

  if v_updated_count = 0 then
    insert into public.notification_events (owner_id, event_type, property_id, conversation_id, maintenance_request_id, metadata)
    values (new.owner_id, 'tenant_maintenance_request', new.property_id, new.conversation_id, new.maintenance_request_id, jsonb_build_object('category', new.category));
  end if;

  return new;
end;
$$;

drop trigger if exists notify_on_tenant_request on public.tenant_requests;
create trigger notify_on_tenant_request
  after insert on public.tenant_requests
  for each row
  execute function public.notify_on_tenant_request();

-- ===================================================================
-- 3. Maintenance status change. Every write path that changes this
--    column is landlord-initiated (direct edits in app/page.tsx /
--    app/maintenance/page.tsx, or the landlord confirming a proposed
--    appointment — see app/api/maintenance/appointments/confirm's own
--    header) — there is no tenant- or provider-authored path to this
--    column today. This is deliberately still a real, useful event: a
--    cross-device/cross-session activity record ("you changed this to
--    Resolved on Tuesday"), not a claim that someone else did it.
-- ===================================================================
create or replace function public.notify_on_maintenance_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  insert into public.notification_events (owner_id, event_type, property_id, maintenance_request_id, metadata)
  values (new.owner_id, 'maintenance_status_change', new.property_id, new.id, jsonb_build_object('status', new.status, 'previous_status', old.status));

  return new;
end;
$$;

drop trigger if exists notify_on_maintenance_status_change on public.maintenance_requests;
create trigger notify_on_maintenance_status_change
  after update on public.maintenance_requests
  for each row
  execute function public.notify_on_maintenance_status_change();

-- ===================================================================
-- 4. PropCrew outreach response. Fires only on the PROVIDER's response
--    (accepted/declined/needs_information) — never on the initial
--    'sent' state, since sending is the owner's own action and
--    notifying them about it would be noise.
-- ===================================================================
create or replace function public.notify_on_outreach_response()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_property_id uuid;
begin
  if new.status = 'sent' or old.status is not distinct from new.status then
    return new;
  end if;

  select mr.property_id into v_property_id
  from public.maintenance_requests mr
  where mr.id = new.maintenance_request_id;

  insert into public.notification_events (owner_id, event_type, property_id, maintenance_request_id, outreach_id, metadata)
  values (new.owner_id, 'propcrew_outreach_response', v_property_id, new.maintenance_request_id, new.id, jsonb_build_object('status', new.status));

  return new;
end;
$$;

drop trigger if exists notify_on_outreach_response on public.maintenance_provider_outreach;
create trigger notify_on_outreach_response
  after update on public.maintenance_provider_outreach
  for each row
  execute function public.notify_on_outreach_response();

-- ===================================================================
-- 5. Tenant invitation accepted. accepted_at transitions null -> a
--    timestamp exactly once per access row (accept_tenant_invite()'s
--    own atomic conditional UPDATE already guarantees this), so the
--    WHEN-equivalent guard below can never double-fire for one accept.
-- ===================================================================
create or replace function public.notify_on_tenant_invite_accepted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.accepted_at is not null or new.accepted_at is null then
    return new;
  end if;

  insert into public.notification_events (owner_id, event_type, property_id, tenant_access_id)
  values (new.owner_id, 'tenant_invite_accepted', new.property_id, new.id);

  return new;
end;
$$;

drop trigger if exists notify_on_tenant_invite_accepted on public.tenant_property_access;
create trigger notify_on_tenant_invite_accepted
  after update on public.tenant_property_access
  for each row
  execute function public.notify_on_tenant_invite_accepted();
