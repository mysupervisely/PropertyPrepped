import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Tax Center V3 correction — "Fix Custom Item Group Totals": a landlord
// must never see a different subtotal inside the property's Tax section
// than the amount Tax Center ultimately uses, simply because some
// expenses were entered as custom items.
//
// PropertyTaxPanel.tsx's own group-total logic can't run through vitest
// directly (this repo has no jsdom/React Testing Library — see
// lib/dashboard/dashboard-navigation.test.ts's own note on this same
// limitation), so this is the same established source-read regression
// technique: it locks in that the component (a) computes each group's
// displayed total from the SAME shared, already-unit-tested
// customItemsForPanelGroup() function (custom-items.test.ts) rather
// than a second, drifting reimplementation, and (b) never folds mileage
// into that (or any) dollar total.

const ROOT = join(__dirname, '..', '..')
const PANEL_SOURCE = readFileSync(join(ROOT, 'components/property-profile/PropertyTaxPanel.tsx'), 'utf8')

function extractFunctionBody(source: string, signature: string): string {
  const start = source.indexOf(signature)
  expect(start, `expected to find "${signature}" in PropertyTaxPanel.tsx`).toBeGreaterThan(-1)
  const braceStart = source.indexOf('{', start)
  let depth = 0
  for (let i = braceStart; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') {
      depth--
      if (depth === 0) return source.slice(braceStart, i + 1)
    }
  }
  throw new Error(`unbalanced braces reading ${signature}`)
}

describe('PropertyTaxPanel — group totals include custom items exactly once', () => {
  it('imports customItemsForPanelGroup from the shared lib module rather than reimplementing the rule locally', () => {
    expect(PANEL_SOURCE).toContain("customItemsForPanelGroup, type CustomTaxItem, type CustomTaxItemGroup } from '../../lib/tax-center/custom-items'")
  })

  it('groupTotal() adds the SAME customItemsForPanelGroup(yearCustomItemsMapped, group) result used by the read-only group list below it', () => {
    const groupTotalBody = extractFunctionBody(PANEL_SOURCE, 'function groupTotal(group: TaxCategoryGroup): number {')
    expect(groupTotalBody).toContain('customItemsForPanelGroup(yearCustomItemsMapped, group)')
    expect(groupTotalBody).toContain('categoriesInGroup(group)') // fixed categories are still included
    // exactly one custom-items call in this function — not summed twice
    const occurrences = groupTotalBody.split('customItemsForPanelGroup(yearCustomItemsMapped, group)').length - 1
    expect(occurrences).toBe(1)
  })

  it('groupTotal() never references mileage — a quantity can never be added into a dollar subtotal', () => {
    const groupTotalBody = extractFunctionBody(PANEL_SOURCE, 'function groupTotal(group: TaxCategoryGroup): number {')
    expect(groupTotalBody.toLowerCase()).not.toContain('mileage')
  })

  it('the read-only per-group custom-item list and groupTotal() both read the identical yearCustomItemsMapped array (single source, never re-derived per group)', () => {
    expect(PANEL_SOURCE).toContain('const yearCustomItemsMapped: CustomTaxItem[] = useMemo(')
    // groupTotal and the JSX list both call customItemsForPanelGroup with this exact same array — confirmed above and via the JSX block:
    expect(PANEL_SOURCE).toContain('{customItemsForPanelGroup(yearCustomItemsMapped, group).length > 0 && (')
    expect(PANEL_SOURCE).toContain('{customItemsForPanelGroup(yearCustomItemsMapped, group).map((item) => (')
  })

  it('the "Other Tax Items" management section (add/edit/remove) is still the only place that writes to property_tax_custom_items', () => {
    expect(PANEL_SOURCE).toContain("supabase.from('property_tax_custom_items').insert(payload)")
    expect(PANEL_SOURCE).toContain("supabase.from('property_tax_custom_items').update(payload)")
    expect(PANEL_SOURCE).toContain("supabase.from('property_tax_custom_items').delete()")
    // only one insert/update/delete call site each — the read-only per-group list has none
    expect(PANEL_SOURCE.split("supabase.from('property_tax_custom_items').insert(").length - 1).toBe(1)
    expect(PANEL_SOURCE.split("supabase.from('property_tax_custom_items').update(").length - 1).toBe(1)
    expect(PANEL_SOURCE.split("supabase.from('property_tax_custom_items').delete(").length - 1).toBe(1)
  })
})
