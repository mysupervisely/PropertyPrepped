import { describe, expect, it } from 'vitest'
import { buildCategoryBreakdown, computeCategoryValue, emptyManualFields, emptyMileageFields, TAX_CATEGORIES, MANUAL_ONLY_CATEGORY_KEYS, categoriesInGroup, OPERATING_EXPENSE_LIKE_GROUPS } from './manual-entry'
import { OPERATING_EXPENSE_CATEGORIES } from './categories'

describe('computeCategoryValue — the override rule', () => {
  it('uses the tracked value when no manual value was entered (null)', () => {
    expect(computeCategoryValue(500, null)).toEqual({ tracked: 500, manual: null, effective: 500, source: 'tracked' })
  })

  it('uses the tracked value when manual is undefined (field never set)', () => {
    expect(computeCategoryValue(500, undefined)).toEqual({ tracked: 500, manual: null, effective: 500, source: 'tracked' })
  })

  it('replaces the tracked value with the manual value when entered — never adds them together', () => {
    expect(computeCategoryValue(500, 6400)).toEqual({ tracked: 500, manual: 6400, effective: 6400, source: 'manual' })
  })

  it('a manual value of exactly 0 still counts as "entered" (an explicit override), not "blank"', () => {
    expect(computeCategoryValue(500, 0)).toEqual({ tracked: 500, manual: 0, effective: 0, source: 'manual' })
  })

  it('reports source "none" when there is neither a tracked nor a manual value', () => {
    expect(computeCategoryValue(0, null)).toEqual({ tracked: 0, manual: null, effective: 0, source: 'none' })
  })
})

describe('buildCategoryBreakdown', () => {
  it('looks up each category\'s tracked amount from its mapped financial_transactions category', () => {
    const breakdown = buildCategoryBreakdown({ Taxes: 1200, Insurance: 900 }, null)
    expect(breakdown.propertyTaxes).toEqual({ tracked: 1200, manual: null, effective: 1200, source: 'tracked' })
    expect(breakdown.insurance).toEqual({ tracked: 900, manual: null, effective: 900, source: 'tracked' })
  })

  it('manual-only categories (no tracked mapping) always report tracked: 0, regardless of ledger contents', () => {
    const breakdown = buildCategoryBreakdown({ Cleaning: 999 }, null) // 'Cleaning' isn't even a real ledger category, but even if it somehow were —
    expect(breakdown.cleaning.tracked).toBe(0)
  })

  it('a manual tax record overrides tracked amounts per-category', () => {
    const taxRecord = { ...emptyManualFields(), property_taxes: 6400, mortgage_interest: 4800 }
    const breakdown = buildCategoryBreakdown({ Taxes: 1200 }, taxRecord)
    expect(breakdown.propertyTaxes).toEqual({ tracked: 1200, manual: 6400, effective: 6400, source: 'manual' })
    expect(breakdown.mortgageInterest).toEqual({ tracked: 0, manual: 4800, effective: 4800, source: 'manual' })
  })

  it('mortgage interest is always manual-only — never populated from a tracked category', () => {
    const def = TAX_CATEGORIES.find((c) => c.key === 'mortgageInterest')
    expect(def?.trackedCategory).toBeNull()
  })

  it('capital improvements read a tracked value from CapEx, with a manual override available', () => {
    const tracked = buildCategoryBreakdown({ CapEx: 5000 }, null)
    expect(tracked.capitalImprovements).toEqual({ tracked: 5000, manual: null, effective: 5000, source: 'tracked' })
    const overridden = buildCategoryBreakdown({ CapEx: 5000 }, { ...emptyManualFields(), capital_improvements: 12000 })
    expect(overridden.capitalImprovements.effective).toBe(12000)
  })

  it('blank manual fields are never treated as $0 — they fall back to tracked, not to zero', () => {
    const breakdown = buildCategoryBreakdown({ Repairs: 300 }, emptyManualFields())
    expect(breakdown.repairs.effective).toBe(300)
  })

  it('every category key from TAX_CATEGORIES appears in the breakdown', () => {
    const breakdown = buildCategoryBreakdown({}, null)
    for (const def of TAX_CATEGORIES) {
      expect(breakdown[def.key]).toBeDefined()
    }
  })
})

describe('category list consistency', () => {
  it('every tracked mapping in TAX_CATEGORIES points at a real OPERATING_EXPENSE_CATEGORIES or income value', () => {
    const validTracked = new Set([...OPERATING_EXPENSE_CATEGORIES, 'Rent', 'Other Income', 'CapEx'])
    for (const def of TAX_CATEGORIES) {
      if (def.trackedCategory) expect(validTracked.has(def.trackedCategory)).toBe(true)
    }
  })

  it('lists exactly the V2 categories with no ledger equivalent, plus every V3 category (all of which are manual-only too), as manual-only', () => {
    const v2ManualOnly = ['advertising', 'cleaning', 'landscaping', 'mortgageInterest', 'pestControl']
    const v3ManualOnly = [
      'permitsLicenses', 'bankFees',
      'profLegalFees', 'profAccountingFees', 'profTaxPrepFees', 'profBookkeeping', 'profSoftwareSubscriptions',
      'profOfficeExpenses', 'profPhoneInternet', 'profMemberships', 'profEducation', 'profOther',
      'travelParking', 'travelTolls', 'travelAirfare', 'travelRentalCar', 'travelLodging', 'travelOther',
      'mealsBusiness',
      'financingPoints', 'financingOther',
      'capitalAppliances', 'capitalFurniture', 'capitalEquipment', 'capitalMajorRenovations', 'capitalRoof', 'capitalHvac', 'capitalOther',
    ]
    expect(MANUAL_ONLY_CATEGORY_KEYS.sort()).toEqual([...v2ManualOnly, ...v3ManualOnly].sort())
  })
})

describe('V3 expanded categories — groups', () => {
  it('every new group (professional/travel/meals) contains only manual-only categories — no invented tracked amounts', () => {
    for (const group of ['professional', 'travel', 'meals'] as const) {
      for (const def of categoriesInGroup(group)) {
        expect(def.trackedCategory).toBeNull()
      }
    }
  })

  it('OPERATING_EXPENSE_LIKE_GROUPS is exactly operatingExpense/professional/travel/meals — financing and capital are excluded', () => {
    expect(OPERATING_EXPENSE_LIKE_GROUPS.sort()).toEqual(['meals', 'operatingExpense', 'professional', 'travel'].sort())
  })

  it('mortgageInterest is the only "financing" category with no tracked source and is never grouped with the new financing categories for its own field (verified in aggregate.test.ts) — here we just confirm all three financing categories exist and are manual-only', () => {
    const financing = categoriesInGroup('financing').map((c) => c.key).sort()
    expect(financing).toEqual(['financingOther', 'financingPoints', 'mortgageInterest'].sort())
    for (const def of categoriesInGroup('financing')) expect(def.trackedCategory).toBeNull()
  })

  it('capital keeps capitalImprovements tracked from CapEx, but every new capital category is manual-only', () => {
    const capital = categoriesInGroup('capital')
    const improvements = capital.find((c) => c.key === 'capitalImprovements')
    expect(improvements?.trackedCategory).toBe('CapEx')
    for (const def of capital) {
      if (def.key !== 'capitalImprovements') expect(def.trackedCategory).toBeNull()
    }
  })
})

describe('mileage fields — a quantity, never a dollar amount', () => {
  it('emptyMileageFields() starts blank (null), never zero', () => {
    expect(emptyMileageFields()).toEqual({ business_mileage: null, business_mileage_notes: null })
  })

  it('mileage is not one of the dollar-category manual fields', () => {
    const manualFieldNames = TAX_CATEGORIES.map((c) => c.manualField)
    expect(manualFieldNames).not.toContain('business_mileage')
    expect(manualFieldNames).not.toContain('business_mileage_notes')
  })
})
