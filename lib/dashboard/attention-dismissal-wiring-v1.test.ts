import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Property + Attention Usability V1, Part 3-B/C/D — dismissal wiring
// tests. Pure key-construction logic is covered by attention-dismissal
// .test.ts; this file covers how app/page.tsx and components/
// DismissibleAttentionRow.tsx actually wire it together — same no-
// jsdom, source-read convention as every other app/page.tsx test in
// this repo (no React Testing Library, no simulated touch events; these
// assert the real source, not a rendered DOM).

const ROOT = join(__dirname, '..', '..')
function readFile(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), 'utf8')
}

const pageSource = readFile('app/page.tsx')
const rowSource = readFile('components/DismissibleAttentionRow.tsx')

function sliceFunction(name: string, nextFnMarker: string): string {
  const fnStart = pageSource.indexOf(name)
  expect(fnStart, `expected to find ${name} in app/page.tsx`).toBeGreaterThan(-1)
  const fnEnd = pageSource.indexOf(nextFnMarker, fnStart)
  expect(fnEnd).toBeGreaterThan(fnStart)
  return pageSource.slice(fnStart, fnEnd)
}

describe('Persistence: refresh/navigation/login survives via loadPortfolio()', () => {
  const loadPortfolioBody = sliceFunction('async function loadPortfolio()', 'function openAddProperty()')

  it('fetches the owner\'s own dismissal keys on every portfolio load, scoped by RLS (no explicit owner_id filter needed client-side)', () => {
    expect(loadPortfolioBody).toContain("client.from('attention_dismissals').select('dismissal_key')")
  })

  it('is excluded from firstError, so a not-yet-migrated environment never blocks the rest of the Dashboard from loading', () => {
    const firstErrorLine = loadPortfolioBody.match(/const firstError = [^\n]+/)?.[0] || ''
    expect(firstErrorLine).not.toContain('dismissal')
  })

  it('sets dismissedAttentionKeys from the fetched rows', () => {
    expect(loadPortfolioBody).toContain('setDismissedAttentionKeys(new Set(')
    expect(loadPortfolioBody).toContain('dismissalRows')
  })
})

describe('Clear persists a dismissal and never touches canonical business state', () => {
  const clearBody = sliceFunction('async function clearAttentionItem(', 'async function loadPortfolio()')

  it('writes only to attention_dismissals — no other table appears in this function', () => {
    const tableWrites = clearBody.match(/supabase\.from\('(\w+)'\)/g) || []
    expect(tableWrites).toEqual(["supabase.from('attention_dismissals')"])
  })

  it('inserts owner_id from the authenticated user, never a client-suppliable value', () => {
    expect(clearBody).toMatch(/owner_id:\s*user\.id/)
  })

  it('is optimistic: adds the key to dismissedAttentionKeys immediately, before the insert resolves', () => {
    const optimisticIdx = clearBody.indexOf('setDismissedAttentionKeys((prev) => new Set(prev).add(key))')
    const insertIdx = clearBody.indexOf("supabase.from('attention_dismissals').insert")
    expect(optimisticIdx).toBeGreaterThan(-1)
    expect(insertIdx).toBeGreaterThan(optimisticIdx)
  })

  it('rolls the optimistic hide back on a genuine failure, but not on a duplicate (23505)', () => {
    expect(clearBody).toContain("dismissError.code !== '23505'")
    expect(clearBody).toContain('next.delete(key)')
  })
})

describe('Filtering wiring: dismissed items are excluded from the SAME canonical lists, count included', () => {
  const memoBody = sliceFunction(
    'const { attentionItems, upcomingItems, openMaintenanceItems, recentActivity, vacancyItems, attentionCountByProperty, rentStatusByProperty } = useMemo(',
    'function goToNav(',
  )

  it('filters the canonical needsAttention/vacancy lists with filterDismissedAttentionItems/buildVacancyDismissalKey, never recomputing eligibility itself', () => {
    expect(memoBody).toContain('filterDismissedAttentionItems(needsAttention, dismissedAttentionKeys)')
    expect(memoBody).toContain('buildVacancyDismissalKey(property, leasesByProperty.get(v.propertyId) || [])')
  })

  it('the returned attentionItems/vacancyItems are built from the FILTERED lists, not the raw canonical ones', () => {
    expect(memoBody).toContain('sortByDaysUntilAscending(visibleNeedsAttention)')
    expect(memoBody).toContain('vacancyItems: visibleVacancy')
    expect(memoBody).not.toMatch(/attentionItems: limitItems\(sortByDaysUntilAscending\(needsAttention\)/)
    expect(memoBody).not.toMatch(/vacancyItems: vacancy,/)
  })

  it('attentionCountByProperty (the property-card "N alerts" badge) is also computed from the filtered list, so a cleared alert never lingers on the card either', () => {
    expect(memoBody).toContain('for (const item of visibleNeedsAttention) attentionCounts.set(')
  })

  it('dismissedAttentionKeys is a dependency of the useMemo, so clearing an item immediately recomputes the visible lists', () => {
    const depsLine = memoBody.match(/\}, \[[^\]]+\]\)/)?.[0] || pageSource.slice(pageSource.indexOf(memoBody) + memoBody.length, pageSource.indexOf(memoBody) + memoBody.length + 400).match(/\}, \[[^\]]+\]\)/)?.[0] || ''
    expect(depsLine).toContain('dismissedAttentionKeys')
  })

  it('openMaintenanceItems IS filtered by dismissal too (approved follow-up correction — see attention-dismissal.ts\'s own header comment for why the original exclusion was overly cautious)', () => {
    expect(memoBody).toContain('filterDismissedOpenMaintenanceItems(')
    const returnLine = memoBody.match(/openMaintenanceItems: [^\n]+/)?.[0] || ''
    expect(returnLine).toContain('visibleOpenMaintenanceItems')
  })
})

describe('"View all" cannot bring back a dismissed instance', () => {
  it('attentionRows (what View all expands) is built from attentionItems/vacancyItems/openMaintenanceItems — the already-filtered lists — never a separate unfiltered source', () => {
    const attentionRowsIdx = pageSource.indexOf('const attentionRows = [')
    const nearby = pageSource.slice(attentionRowsIdx, attentionRowsIdx + 3000)
    expect(nearby).toContain('attentionItems.map(')
    expect(nearby).toContain('vacancyItems.map(')
    expect(nearby).toContain('openMaintenanceItems.map(')
  })
})

describe('Open Maintenance rows: each request is independently clearable, keyed by its own canonical id', () => {
  const attentionRowsIdx = pageSource.indexOf('const attentionRows = [')
  const openMaintenanceBlock = pageSource.slice(pageSource.indexOf('openMaintenanceItems.map(', attentionRowsIdx), pageSource.indexOf('\n  ]', attentionRowsIdx))

  it('the dismissal key comes from buildOpenMaintenanceDismissalKey(item) — the canonical maintenance_requests id + date — never item.description (the visible title)', () => {
    expect(openMaintenanceBlock).toContain('const key = buildOpenMaintenanceDismissalKey(item)')
    expect(openMaintenanceBlock).not.toMatch(/clearAttentionItem\([^)]*item\.description/)
  })

  it('onClear persists via clearAttentionItem with attentionType \'open-maintenance\' — a distinct kind from the maintenance_records-sourced \'maintenance\' type', () => {
    expect(openMaintenanceBlock).toContain("void clearAttentionItem(key, item.propertyId, 'open-maintenance')")
  })

  it('each row\'s key is derived per-item (from that item\'s own id/date), so three separate requests for the same property never share a key', () => {
    // The key is computed INSIDE the .map() callback, from `item` — not
    // hoisted/memoized against a single shared value outside the loop.
    const mapIdx = openMaintenanceBlock.indexOf('.map((item) => {')
    const keyIdx = openMaintenanceBlock.indexOf('const key = buildOpenMaintenanceDismissalKey(item)')
    expect(mapIdx).toBeGreaterThan(-1)
    expect(keyIdx).toBeGreaterThan(mapIdx)
  })
})

describe('DismissibleAttentionRow — swipe and the desktop/accessible fallback both call the SAME onClear', () => {
  it('the swipe-reveal Clear button calls onClear', () => {
    const clearButtonIdx = rowSource.indexOf('dismissibleAttentionClear')
    const nearby = rowSource.slice(clearButtonIdx, clearButtonIdx + 200)
    expect(nearby).toContain('onClear()')
  })

  it('the trailing kebab (desktop/keyboard fallback) calls the SAME onClear, with its own aria-label and stopPropagation so it never also triggers the row\'s onOpen', () => {
    const kebabIdx = rowSource.indexOf('dismissibleAttentionKebab')
    const nearby = rowSource.slice(kebabIdx - 200, kebabIdx + 300)
    expect(nearby).toContain('aria-label={clearLabel}')
    expect(nearby).toContain('e.stopPropagation()')
    expect(nearby).toContain('onClear()')
  })

  it('the kebab is a real <button>, not a styled <div> — natively keyboard-focusable and activatable with no custom key handling needed', () => {
    const kebabIdx = rowSource.indexOf('dismissibleAttentionKebab')
    expect(rowSource.slice(kebabIdx - 40, kebabIdx)).toContain('<button')
  })

  it('a tap (no drag) calls onOpen — the existing deep-link behavior — not onClear', () => {
    const clickHandlerBody = rowSource.slice(rowSource.indexOf('function handleRowClick'), rowSource.indexOf('return ('))
    expect(clickHandlerBody).toContain('onOpen()')
  })

  it('a drag suppresses the click that follows (draggedRef), so swiping never also navigates', () => {
    expect(rowSource).toContain('draggedRef.current = true')
    const clickHandlerBody = rowSource.slice(rowSource.indexOf('function handleRowClick'), rowSource.indexOf('return ('))
    expect(clickHandlerBody).toContain('if (draggedRef.current)')
  })

  it('vertical movement is never intercepted: preventDefault is only called after the gesture is classified as the x-axis, and a y-axis classification returns before it', () => {
    const moveBody = rowSource.slice(rowSource.indexOf('function handleTouchMove'), rowSource.indexOf('function handleTouchEnd'))
    const yReturnIdx = moveBody.indexOf("if (g.axis === 'y') return")
    const preventDefaultIdx = moveBody.indexOf('e.preventDefault()')
    expect(yReturnIdx).toBeGreaterThan(-1)
    expect(preventDefaultIdx).toBeGreaterThan(yReturnIdx)
  })

  it('the reveal offset is clamped to REVEAL_WIDTH via the shared, independently-tested clampRevealOffset() — a swipe can never drag the row further than the Clear panel\'s own width (see lib/dashboard/attention-swipe-gesture.test.ts for the clamping behavior itself)', () => {
    expect(rowSource).toContain('setOffset(clampRevealOffset(g.startOffset + dx, REVEAL_WIDTH))')
  })

  // Round 3 real-iPhone regression fix (see this component's own header
  // comment): the axis classification now requires dx to clearly
  // DOMINATE dy, not just barely exceed it — a bare majority was proven
  // to misclassify ordinary diagonal scrolling as a horizontal swipe.
  // See lib/dashboard/attention-swipe-gesture.test.ts for the actual
  // behavioral proof (both of the old bug and this fix); this just
  // locks in that the component actually uses that shared function
  // rather than reintroducing an inline, untested comparison.
  it('axis classification is delegated to the shared, independently-tested classifyGestureAxis() — not an inline dx/dy comparison', () => {
    const moveBody = rowSource.slice(rowSource.indexOf('function handleTouchMove'), rowSource.indexOf('function handleTouchEnd'))
    expect(moveBody).toContain('classifyGestureAxis(dx, dy, DRAG_DEADZONE, HORIZONTAL_DOMINANCE_RATIO)')
    expect(moveBody).not.toMatch(/Math\.abs\(dx\) > Math\.abs\(dy\)/)
  })

  it('imports the shared gesture-decision functions from lib/dashboard/attention-swipe-gesture, the same module its own tests exercise directly', () => {
    expect(rowSource).toContain("from '../lib/dashboard/attention-swipe-gesture'")
    expect(rowSource).toContain('classifyGestureAxis')
    expect(rowSource).toContain('clampRevealOffset')
    expect(rowSource).toContain('shouldSnapOpen')
  })
})

describe('Canonical business state is never touched by any part of dismissal', () => {
  for (const [label, path] of [
    ['lib/dashboard/attention.ts', 'lib/dashboard/attention.ts'],
    ['lib/rent-ledger/ledger.ts', 'lib/rent-ledger/ledger.ts'],
    ['lib/tenant-connect/requests.ts', 'lib/tenant-connect/requests.ts'],
    ['lib/leases/status.ts', 'lib/leases/status.ts'],
  ] as const) {
    it(`${label} carries no dismissal marker — canonical status/urgency logic is untouched`, () => {
      expect(readFile(path)).not.toMatch(/dismiss/i)
    })
  }

  it('clearAttentionItem never calls update()/delete() against rent_payments, maintenance_requests, maintenance_records, leases, insurance_policies, mortgages, or property_systems', () => {
    const clearBody = sliceFunction('async function clearAttentionItem(', 'async function loadPortfolio()')
    for (const table of ['rent_payments', 'maintenance_requests', 'maintenance_records', 'leases', 'insurance_policies', 'mortgages', 'property_systems']) {
      expect(clearBody).not.toContain(`from('${table}')`)
    }
  })
})

describe('Migration content matches the approved shape', () => {
  const migration = readFile('supabase/milestone-32-attention-dismissals.sql')

  it('is additive only — one new table, its own RLS/policies/index, no changes to any other table', () => {
    expect(migration).toContain('create table if not exists public.attention_dismissals')
    expect(migration).not.toMatch(/alter table public\.(?!attention_dismissals)/)
    expect(migration).not.toMatch(/drop table|drop column/i)
  })

  it('matches the approved column shape', () => {
    expect(migration).toContain('owner_id uuid not null references auth.users(id) on delete cascade')
    expect(migration).toContain('property_id uuid references public.properties(id) on delete cascade')
    expect(migration).toContain('attention_type text not null')
    expect(migration).toContain('dismissal_key text not null')
    expect(migration).toContain('unique (owner_id, dismissal_key)')
  })

  it('RLS: select/insert/delete scoped to auth.uid() = owner_id, insert also verifies property_id ownership, no update policy', () => {
    expect(migration).toContain('create policy "attention_dismissals_select_own" on public.attention_dismissals for select to authenticated using ((select auth.uid()) = owner_id);')
    expect(migration).toMatch(/create policy "attention_dismissals_insert_own"[\s\S]*?with check \(\s*\(select auth\.uid\(\)\) = owner_id\s*and \(property_id is null or exists \(select 1 from public\.properties p where p\.id = property_id and p\.owner_id = \(select auth\.uid\(\)\)\)\)\s*\);/)
    expect(migration).toContain('create policy "attention_dismissals_delete_own" on public.attention_dismissals for delete to authenticated using ((select auth.uid()) = owner_id);')
    expect(migration).not.toMatch(/for update/i)
  })

  it('has not been applied to production — explicitly marked for review', () => {
    expect(migration).toContain('NOT YET APPLIED TO PRODUCTION')
  })
})
