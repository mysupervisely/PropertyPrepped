import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Mobile V2 — Quick Actions persistence wiring regression guard.
//
// lib/dashboard/quick-actions.test.ts already covers the pure catalog/
// validation logic in isolation. This file is the source-read
// counterpart (same no-jsdom convention as every other app/page.tsx
// wiring test in this repo) for the actual Supabase read/write wiring:
// that it reads from and writes to public.quick_action_preferences (not
// user_profiles — Mobile V2's own "do not overwrite existing profile
// settings" requirement), that it's owner-scoped, that a load never
// renders anything but normalizeQuickActionSelection()'s own output,
// that a save requires exactly 4 before it's even attempted, that a
// failed save surfaces an error instead of silently reverting, and that
// per-account state is reset on sign-out the same way every other piece
// of this page's per-account state already is.

const ROOT = join(__dirname, '..', '..')
const pageSource = readFileSync(join(ROOT, 'app/page.tsx'), 'utf8')
const migrationSource = readFileSync(join(ROOT, 'supabase/milestone-34-mobile-quick-action-preferences.sql'), 'utf8')

describe('Mobile V2 — Quick Actions: load wiring', () => {
  it('loadPortfolio() reads selected_actions from quick_action_preferences, scoped to the signed-in owner, as part of the same Promise.all as every other table', () => {
    expect(pageSource).toContain("client.from('quick_action_preferences').select('selected_actions').eq('owner_id', user.id).maybeSingle()")
  })

  it('a loaded row is never rendered directly — it always passes through normalizeQuickActionSelection() first (the one safe-fallback-to-defaults boundary)', () => {
    expect(pageSource).toContain('setQuickActions(normalizeQuickActionSelection((quickActionPreferencesRow as { selected_actions: unknown } | null)?.selected_actions))')
  })

  it('a missing/errored quick_action_preferences query is excluded from firstError — its absence (e.g. before the migration is applied) must never block the rest of the Dashboard from loading', () => {
    const firstErrorLine = pageSource.slice(pageSource.indexOf('const firstError ='), pageSource.indexOf('const firstError =') + 400)
    expect(firstErrorLine).not.toMatch(/quickAction/i)
  })

  it('quickActions resets to the product defaults on sign-out, the same as every other piece of this page\'s per-account state', () => {
    const signOutBlock = pageSource.slice(pageSource.indexOf('setUserProfile(null)'), pageSource.indexOf('setUserProfile(null)') + 400)
    expect(signOutBlock).toContain('setQuickActions(DEFAULT_QUICK_ACTIONS)')
  })
})

describe('Mobile V2 — Quick Actions: save wiring', () => {
  it('saveQuickActions() upserts into quick_action_preferences by owner_id — never into user_profiles', () => {
    expect(pageSource).toContain(".from('quick_action_preferences')\n      .upsert({ owner_id: user.id, selected_actions: next, updated_at: new Date().toISOString() })")
  })

  it('a save is refused before it ever reaches Supabase unless the selection is exactly 4 valid, unique ids', () => {
    const saveFn = pageSource.slice(pageSource.indexOf('async function saveQuickActions'), pageSource.indexOf('async function saveQuickActions') + 600)
    expect(saveFn).toContain('if (!isValidQuickActionSelection(next)) return')
  })

  it('the rendered Quick Actions row (quickActions) is only ever updated AFTER a save succeeds — a failed save leaves it exactly as it was, with an inline error instead', () => {
    const saveFn = pageSource.slice(pageSource.indexOf('async function saveQuickActions'), pageSource.indexOf('async function saveQuickActions') + 900)
    expect(saveFn).toContain("setQuickActionsError('Unable to save your Quick Actions right now. Please try again.')")
    // The error branch's own "return" comes before setQuickActions(next)
    // is ever reached — a failed save short-circuits out of the
    // function, so the rendered selection is never touched.
    expect(saveFn.indexOf("setQuickActionsError('Unable")).toBeLessThan(saveFn.indexOf('setQuickActions(next)'))
    const returnAfterError = saveFn.indexOf('return', saveFn.indexOf("setQuickActionsError('Unable"))
    expect(returnAfterError).toBeGreaterThan(-1)
    expect(returnAfterError).toBeLessThan(saveFn.indexOf('setQuickActions(next)'))
  })

  it('"Save" itself is disabled unless the draft selection is exactly QUICK_ACTION_SELECTION_SIZE — the UI can never submit a partial selection', () => {
    expect(pageSource).toContain('disabled={quickActionsSaving || quickActionsDraft.length !== QUICK_ACTION_SELECTION_SIZE}')
  })

  it('"Restore Defaults" goes through the exact same saveQuickActions() path as any other change, writing DEFAULT_QUICK_ACTIONS — not a row delete', () => {
    expect(pageSource).toContain('function restoreDefaultQuickActions() {\n    void saveQuickActions(DEFAULT_QUICK_ACTIONS)\n  }')
  })

  it('the Customize sheet opens by seeding its draft from the CURRENTLY SAVED selection, never from the catalog default or a stale draft', () => {
    expect(pageSource).toContain('function openQuickActionsCustomize() {\n    setQuickActionsDraft(quickActions)')
  })
})

describe('Mobile V2 — Quick Actions: migration (account isolation)', () => {
  it('supabase/milestone-34-mobile-quick-action-preferences.sql is NOT marked applied to production — same convention as every other not-yet-applied milestone file', () => {
    expect(migrationSource).toContain('NOT YET APPLIED TO PRODUCTION. Review before running.')
  })

  it('RLS is enabled, and select/insert/update are all scoped to (select auth.uid()) = owner_id — a landlord can only ever reach their own row', () => {
    expect(migrationSource).toContain('alter table public.quick_action_preferences enable row level security;')
    expect(migrationSource).toMatch(/create policy "quick_action_preferences_select_own"[^;]*using \(\(select auth\.uid\(\)\) = owner_id\)/)
    expect(migrationSource).toMatch(/create policy "quick_action_preferences_insert_own"[^;]*with check \(\(select auth\.uid\(\)\) = owner_id\)/)
    expect(migrationSource).toMatch(/create policy "quick_action_preferences_update_own"[^;]*using \(\(select auth\.uid\(\)\) = owner_id\) with check \(\(select auth\.uid\(\)\) = owner_id\)/)
  })

  it('owner_id is a foreign key into auth.users with on delete cascade — a deleted account\'s preference row is cleaned up automatically, never orphaned', () => {
    expect(migrationSource).toContain('owner_id uuid primary key references auth.users(id) on delete cascade')
  })
})
