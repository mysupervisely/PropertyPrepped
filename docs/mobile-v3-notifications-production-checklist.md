# Mobile V3: Notifications & Activity Center — production application checklist

This migration was **not** executed against production. It was verified against a local, stubbed Postgres instance with RLS fully enforced (`supabase/tests/milestone-35-rls.test.sql`, 11/11 checks passing, zero regressions). Apply it manually, in this order, and verify with the read-only SQL below before moving on.

## What this migration does

Adds exactly one new table, `public.notification_events`, and five `SECURITY DEFINER` trigger functions that populate it from existing writes. It does not alter any existing table's columns, drop anything, or touch any existing RLS policy.

## 1. Apply the migration

Run the full contents of `supabase/milestone-35-mobile-v3-notification-center.sql` in the Supabase SQL Editor, exactly as committed in this PR. Do not edit it in the editor — if a change is needed, make it in the PR and re-review.

## 2. Read-only verification (run after applying, before telling the landlord-facing app to use it)

```sql
-- Table and RLS exist
select relrowsecurity from pg_class where relname = 'notification_events';
-- expect: t

select policyname, cmd from pg_policies where tablename = 'notification_events' order by policyname;
-- expect exactly two rows:
--   notification_events_select_own | SELECT
--   notification_events_update_own | UPDATE
-- (no INSERT or DELETE policy — this is intentional, see the migration's own header)

-- All five triggers exist and are enabled
select event_object_table, trigger_name
from information_schema.triggers
where trigger_name like 'notify_on_%'
order by event_object_table;
-- expect 5 rows: property_messages, tenant_requests, maintenance_requests,
-- maintenance_provider_outreach, tenant_property_access

-- Confirm the table starts empty (no backfill, by design)
select count(*) from public.notification_events;
-- expect: 0
```

## 3. Smoke-test with real (not fabricated) activity — optional, read-only

If you want to confirm triggers fire in production before relying on them, the safest check is to **wait for one real, already-happening event** (e.g. the next time a tenant sends a message, or a landlord changes a maintenance case's status) and then run:

```sql
select event_type, created_at, read_at from public.notification_events order by created_at desc limit 5;
```

**Expected count for a tenant's guided-intake maintenance submission: exactly ONE row, `event_type = 'tenant_maintenance_request'`.** That single submission is actually three separate writes under the hood (a conversation, the tenant's opening message, then the `tenant_requests` row) — the opening message's own `'tenant_message'` notification is upgraded in place into the `'tenant_maintenance_request'` one once the request lands, rather than left behind as a second row. Seeing two rows for one submission would be a regression (this was a real, found-and-fixed bug during review — see `notify_on_tenant_request()`'s own comment in the migration). A tenant's *later reply* in that same conversation correctly still produces its own separate `'tenant_message'` row.

Do not manually `insert`/`update` real `property_messages`, `maintenance_requests`, `tenant_requests`, `maintenance_provider_outreach`, or `tenant_property_access` rows purely to test this — those are real landlord/tenant records. The local RLS test already proves each trigger fires correctly in isolation; production verification should be passive (observe real traffic), not synthetic.

## 4. Deployment order

No sequencing constraints beyond the usual one: apply the SQL migration **before** merging/deploying the application code in this PR, same as every prior milestone in this repo. The reverse order is harmless but pointless — the new page/bell would just show zero notifications until the table exists (`.from('notification_events')` calls fail gracefully the same defensive way every other "may not exist yet" table read in this codebase already does, since the code paths use `.select(...)` without throwing on a missing-relation error being surfaced to the user as a blocking failure — but there's no reason to rely on that; apply the SQL first).

## 5. Rollback considerations

If this needs to be rolled back after being applied:

```sql
drop trigger if exists notify_on_tenant_message on public.property_messages;
drop trigger if exists notify_on_tenant_request on public.tenant_requests;
drop trigger if exists notify_on_maintenance_status_change on public.maintenance_requests;
drop trigger if exists notify_on_outreach_response on public.maintenance_provider_outreach;
drop trigger if exists notify_on_tenant_invite_accepted on public.tenant_property_access;

drop function if exists public.notify_on_tenant_message();
drop function if exists public.notify_on_tenant_request();
drop function if exists public.notify_on_maintenance_status_change();
drop function if exists public.notify_on_outreach_response();
drop function if exists public.notify_on_tenant_invite_accepted();

drop table if exists public.notification_events;
```

This is safe at any time: the five trigger functions only ever write to `notification_events`, never to any other table, so dropping them cannot affect `property_messages`, `tenant_requests`, `maintenance_requests`, `maintenance_provider_outreach`, or `tenant_property_access` in any way. If only the triggers are dropped (table kept), the app's bell/Activity Center simply stops receiving new rows — existing ones remain readable.

## 6. What NOT to do

- Do not add an INSERT policy for `authenticated` on `notification_events` "to make testing easier" — this is the one thing that keeps a client from fabricating or backdating a notification. If a real gap is found later, fix the trigger, don't open the table.
- Do not backfill historical events. The table is deliberately forward-only.
