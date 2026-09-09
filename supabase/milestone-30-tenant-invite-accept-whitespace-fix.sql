-- PropRoster — Tenant Invite Acceptance Whitespace Hardening.
--
-- NOT YET APPLIED TO PRODUCTION. Review before running. Migration 28
-- (Scheduling Coordination V1) and Migration 29 (Tenant-Facing
-- Experience V1) are both already applied in production per the
-- reporter; this migration is fully independent of both — it only
-- touches tenant_property_access's existing SELECT policy and
-- accept_tenant_invite(), neither of which either of those migrations
-- created or altered (see milestone-10-tenant-connect.sql — the sole
-- origin of both objects — and milestone-25's own header, which states
-- explicitly it does not touch tenant_property_access).
--
-- ===================================================================
-- Root cause (traced end to end, not guessed):
--
-- Reported sequence: a tenant lease record was originally saved with a
-- placeholder tenant email ("NA"), tenant_property_access was created
-- from that value, the landlord later corrected the lease's tenant
-- email, PR #60's Resend Invitation fix re-synced the stale invited
-- tenant_property_access.tenant_email to the corrected address, the
-- invite email was delivered to the corrected address, a PropRoster
-- account was created/signed in with that exact address, /tenant
-- correctly recognizes and displays the pending invite (proving the
-- tenant_access_select policy's Invited-branch predicate DOES match),
-- but supabase.rpc('accept_tenant_invite', ...) still fails with "This
-- invite is not available to accept."
--
-- Every write path in the app to tenant_property_access.tenant_email
-- already normalizes with BOTH .trim() and .toLowerCase() before the
-- write (components/tenant-connect/TenantConnectStatusCard.tsx's
-- invite() and resend()'s sync, via
-- lib/tenant-connect/helpers.ts's normalizeTenantEmail()) — so the
-- access row's own tenant_email column can be trusted to already be
-- trimmed and lowercased. The one asymmetric write is the lease
-- record's own tenant_email (app/page.tsx, leaseDraft save), which is
-- only .trim()'d, never .toLowerCase()'d — but that column is never
-- read by accept_tenant_invite() or by either RLS policy, so casing
-- there cannot by itself explain this.
--
-- The one input to this comparison NOT under this app's direct control
-- is v_email := auth.jwt() ->> 'email' — the authenticated user's own
-- email claim, populated by Supabase Auth from whatever the client
-- passed to signUp()/signInWithPassword(), which in turn reflects
-- whatever the device's on-screen keyboard, autofill, or password
-- manager put in the email field. Unlike every application-side write
-- to tenant_email, this schema's SQL comparisons only ever apply
-- lower() to v_email — never btrim() — so a leading/trailing space or
-- non-breaking space captured by mobile autofill on the JWT's own email
-- claim survives into v_email untrimmed, while the stored
-- tenant_email never carries one. lower(tenant_email) = lower(v_email)
-- then legitimately evaluates to false, the UPDATE affects zero rows,
-- and accept_tenant_invite() raises exactly the observed generic
-- message — while the SELECT policy's identical-shaped predicate can
-- still separately fail to protect against the same gap (a tenant
-- whose invite could still show if their client-side session/query
-- happens not to re-send a trailing space at read time, or simply
-- because the visibility check and the acceptance check are two
-- separate round trips and any one of several mobile-only sources of
-- whitespace could affect one request and not the next).
--
-- btrim() is already an established, idiomatic function in this exact
-- schema (see the non-empty-string CHECK constraints on
-- tenant_requests.title/.description and property_messages.description
-- in supabase/schema.sql) — this migration extends that same idiom to
-- an equality comparison used for auth matching, rather than
-- introducing a new pattern.
--
-- This is a defensive hardening of the comparison itself. It does not
-- claim certainty that mobile-autofill whitespace is the only possible
-- cause of a "This invite is not available to accept." failure in
-- general (a genuinely revoked/already-accepted/wrong-email invite
-- would correctly still fail after this fix, as it must) — but it is
-- the one concrete, code-verifiable asymmetry found between this
-- comparison and every other write path in the app, and closing it is
-- strictly a widening of what's accepted as "the same email", never a
-- weakening of who is allowed to accept what.
--
-- ===================================================================
-- Security posture — unchanged, still fully enforced:
--   * Still requires an authenticated caller (auth.jwt()->>'email' must
--     be non-null; unauthenticated calls still raise 'Not authenticated.').
--   * Still requires the authenticated caller's own email to match the
--     invited tenant_email — only now compared with whitespace ignored
--     on both sides, in addition to the case-insensitivity already
--     present. No other user's invite becomes acceptable by this
--     change; two emails that differ by more than surrounding
--     whitespace still never match.
--   * Still requires the row to be status = 'Invited' (an already-
--     Active or Revoked row is still never re-acceptable).
--   * Still grants access to exactly the one invited row (p_access_id)
--     — an invite id alone is still never sufficient; the WHERE clause
--     still re-verifies identity and status before writing anything.
--   * No landlord-only column or table is newly exposed. Error message
--     text is unchanged (still generic, still never echoes email/
--     owner_id/property_id).
-- ===================================================================

drop policy if exists "tenant_access_select" on public.tenant_property_access;
create policy "tenant_access_select" on public.tenant_property_access for select to authenticated using (
  (select auth.uid()) = owner_id
  or (status = 'Active' and tenant_user_id = (select auth.uid()))
  or (status = 'Invited' and lower(btrim(tenant_email)) = lower(btrim((select auth.jwt() ->> 'email'))))
);

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
    and lower(btrim(tenant_email)) = lower(btrim(v_email))
  returning * into v_row;

  if v_row.id is null then
    raise exception 'This invite is not available to accept.';
  end if;

  return v_row;
end;
$$;
