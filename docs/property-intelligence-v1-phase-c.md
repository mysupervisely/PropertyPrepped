# Property Intelligence V1 — Phase C: Property Overview Snapshot

Companion to `docs/property-intelligence-v1-phase-a.md` (audit) and `docs/property-intelligence-v1-phase-b.md` (the calculation engine, corrected by Phase B.1). This phase surfaces that engine on the property page — no new calculations, no schema changes, no portfolio/dashboard/homepage changes.

## Where it appears

`app/page.tsx`, the property Overview tab (`activeTab === 'Overview'`) — the same "at a glance" surface that already shows property facts, financial details, and rent/tenant context. The new **Property Snapshot** card is the first thing in that tab, above the pre-existing "Financial details"/"Property facts" panels. It does not touch the property hero (Value/Mortgage/Equity/Rent/Tax, visible on every tab) or any other tab.

## Primary metrics (always visible when Overview is open)

**Property Snapshot**: Estimated Value, Estimated Equity, Monthly Rent — three `.financialStat` cards, one row.

**YTD Performance** (labeled with the tax year, e.g. "2026", in small muted text — never visually dominant): Income, Expenses, NOI — the same card pattern, a second row.

## Progressive disclosure — "View performance"

A native `<details>/<summary>` (collapsed by default, zero new JS — the same pattern already used for the dashboard's Recent Activity), revealing: YTD NOI, Cap Rate, Net Cash Flow, Mortgage Balance, Contract Annual Rent. Quiet, conditional one-line notes appear only when relevant:

- Cap Rate unavailable → "Available after a complete year of income and expense data."
- Net Cash Flow unavailable → "Available when complete annual performance and debt-service data are available."
- Mortgage Balance present → "Based on the mortgage balance saved in PropRoster." (always shown when a balance is available — both its possible sources are permanently flagged `potentiallyStale` by the engine)
- Monthly Rent came from the property-level fallback, not an active lease → "Based on the property's saved rent estimate — no active lease on file."
- Equity unavailable → "Add a property value and mortgage balance to estimate equity."

## Empty/missing metric behavior

Every number on this card passes through one of two tiny, presentation-only helpers in `app/page.tsx`:

```ts
function metricMoney(metric: Metric, suffix = ''): string {
  if (metric.status !== 'available' || metric.value === null) return '—'
  return `${money(metric.value)}${suffix}`
}
function metricPercent(metric: Metric): string {
  if (metric.status !== 'available' || metric.value === null) return '—'
  return `${metric.value.toFixed(1)}%`
}
```

`incomplete` renders the same as `unavailable` — a quiet `—`, never a qualified number with an asterisk. This is a deliberate Phase C simplification: only `operatingExpensesYtd` can realistically be `incomplete` on this card (a suspicious `$0` with other data present), and it doesn't warrant a second visual treatment for one case. No developer-facing word (`available`/`incomplete`/`unavailable`/`estimated`/`potentiallyStale`) is ever shown to the user — each is translated into either silence (a clean number, no caption) or one of the quiet notes above. Negative NOI/Net Cash Flow use the pre-existing, subtle `.metricTone-bad` class (the same one Appreciation already uses) — a muted red-brown, never an alarming banner.

## How the Phase B.1 engine is consumed

No formula is written in `app/page.tsx`. The property Overview already loads everything the engine needs — `selectedLeases`, `selectedMortgages` (already queried `.order('created_at', {ascending: false})`, so `[0]` is the exact same "current mortgage" the Mortgage tab already treats as authoritative), `selectedTransactions`, `selectedMaintenance`, `selectedTaxRecords`, `selectedTaxCustomItems` — filtered to the current calendar year and passed straight into:

```ts
const performance = computePropertyPerformance(buildPropertyPerformanceInput({
  property: selected,
  leases: selectedLeases,
  currentMortgage: selectedMortgages[0] || null,
  yearTransactions: selectedTransactions.filter((tx) => tx.transaction_date.startsWith(performanceYear)),
  yearMaintenanceRecords: selectedMaintenance.filter((m) => m.service_date.startsWith(performanceYear)),
  taxRecord: performanceYearTaxRecord,
  yearCustomItems: performanceYearCustomItems,
  year: performanceYear,
}))
```

No new Supabase query. `lib/property-intelligence/resolve.ts` and `calculate.ts` do 100% of the source resolution and math; `app/page.tsx` only assembles their input and renders their output. `calculateNOI`/`capRate`/`equity` (`lib/investment-calculations.ts`) are never imported into `app/page.tsx` — enforced by a dedicated test (see Tests below).

## Mobile

`.performanceStats.financialStats` (the reused `.financialStats` card pattern, restyled to 3-across) collapses to a single stacked column at `≤560px` — 3 items don't divide evenly into 2, so a full stack reads more cleanly than an awkward 2+1 wrap. Verified with real headless-Chromium screenshots at 320/390/430/1280px across all 5 representative data states (see Visual QA) — no horizontal overflow at any width.

## Known UX/data limitation surfaced by this phase

**Annual NOI, Cap Rate, and Net Cash Flow will rarely appear in practice**, because this Overview snapshot always builds the engine's input for the *current* calendar year — and per Phase B.1, those three metrics only become available once their underlying tax year is fully elapsed. A landlord will see YTD NOI year-round, but Cap Rate/Net Cash Flow/annual NOI stay `—` until PropRoster has a genuinely complete prior tax year of data for that property. This is intended, correct behavior (the entire point of Phase B.1), not a bug — but it does mean this phase's own Scenario D (a property with a complete year of data) cannot be demonstrated live today without a real property that has crossed a calendar year boundary in PropRoster; it was verified by computing the engine directly with a completed prior-year input (see Visual QA).

**A newly-discovered opportunity, not acted on in this phase**: `properties.financing_status` (`'Active Mortgage' | 'Paid Off' | 'No Mortgage' | 'Unknown'`, added by an earlier milestone) is not read by the Phase B.1 engine at all. If a landlord has explicitly marked a property `'Paid Off'` or `'No Mortgage'`, the engine could in principle treat mortgage balance as a confirmed `$0` instead of `unavailable` — resolving the "no mortgage vs. never entered" ambiguity documented as a known limitation in Phase B.1, for a real, existing subset of properties. This would be an engine change (Phase B.2-style), not a UI one, and is out of scope here — flagged for a future phase to evaluate.

## Tests

`lib/dashboard/property-intelligence-v1-phase-c-wiring.test.ts` (18 tests, new) — source-read guards (the same no-jsdom convention every other `app/page.tsx` test in this repo uses) covering: primary metrics render with correct labels; Monthly Rent uses `contractMonthlyRent` (never actual income, never a raw property field); missing metrics never render as `$0`/`0%`; YTD labels are never confused with "Annual"; Cap Rate/Net Cash Flow are read verbatim from the engine, never hardcoded; Estimated Equity's explanation is quiet and conditional; the disclosure is a plain `<details>`, no new JS state; no formula is written in the Property Snapshot section; `app/page.tsx` never imports the raw calculation primitives; no new Supabase query was added; the mobile breakpoint exists; the design system's existing classes are reused, never new ones invented.

`lib/dashboard/property-profile-mobile-polish-v3.test.ts` — one pre-existing guard ("no cap-rate formula was ever written in this file") rescoped from file-wide to the pre-existing Financial Details card specifically, since Phase C now legitimately *displays* a Cap Rate figure elsewhere (read from the engine, not calculated).

Targeted run: `lib/dashboard/`, `lib/property-intelligence/` — **398 tests pass**. `npx tsc --noEmit` and `npm run build` are both clean.

## Visual QA

Representative data states (A: full current-year data; B: value+rent only, no lease/mortgage/financials; C: lease + YTD data, no mortgage; D: a complete prior tax year, unlocking Cap Rate/Net Cash Flow; E: negative YTD NOI) were computed with the real engine (`computePropertyPerformance`) and rendered in a static HTML mirror of the exact JSX/CSS classes, screenshotted via headless Chromium at 320/390/430/1280px. No horizontal overflow at any width or scenario. One real spacing issue was found and fixed during this pass: two quiet notes landing back-to-back (a fallback-rent note immediately followed by the equity-explanation note, Scenario B) read as one run-on caption — `.propertyPerformanceNote + .propertyPerformanceNote { margin-top: 8px; }` now separates them.

## Phase C.1 — Unified Property Snapshot

A pass over the actual production property page on mobile found that Phase C's own Property Snapshot had landed as a FOURTH place showing financial numbers, alongside the pre-existing hero metric strip (Value/Mortgage/Equity/Rent/Tax, on every tab), the pre-existing "Financial details" card, and the Investment Analysis button — several of them overlapping or, in one case, outright contradicting each other. Phase C.1 consolidates all of that into ONE authoritative snapshot and fixes the contradiction at its root. No prior-year/full-year Annual NOI work, no `financing_status` integration, and no Phase D scope was started — those remain exactly as scoped below.

### The hero is now identity-only

The five-metric `.heroMetrics` row (Value/Mortgage/Equity/Rent/Tax) is removed from the property hero entirely. The hero now shows only photo, address, city, occupancy/rent status, and the Edit/Investment Analysis actions — every financial number lives in exactly one place, the Property Snapshot on the Overview tab. The naive `equity` local (`estimated_value − mortgage_balance`, no unavailable handling) that fed the old hero strip is deleted; nothing replaced it, because the hero no longer shows equity at all — the Property Snapshot's `performance.equity` is the only equity figure on the page now.

### The unified Property Snapshot — final hierarchy

One card, four tiers, in this order:

1. **Primary** — Estimated Value, Estimated Equity, Monthly Rent (unchanged from Phase C).
2. **YTD Performance** — Income, Expenses, NOI, labeled with the tax year (unchanged from Phase C).
3. **Secondary/contextual** (new) — Mortgage Balance and Purchase Price + Appreciation, in a quiet `.detailRows` list (the same plain label/value pattern used elsewhere on the page) rather than another `.financialStat` grid, so it visibly reads as supporting context, not more headline numbers. Mortgage Balance moved here from inside "View performance" (no longer buried behind a click); Purchase Price and Appreciation moved here from the old Financial Details card, using the exact same `appreciationFor()` calculation, unchanged — just relabeled "Appreciation (est.)" so it's never mistaken for an appraisal.
4. **"View performance"** (refined) — Cap Rate, Net Cash Flow, Contract Annual Rent. YTD NOI and Mortgage Balance were removed from this disclosure since Phase C.1 now shows both above it — the disclosure only ever holds figures that aren't shown anywhere else on the card.

### What happened to the old "Financial details" card (field-by-field)

- **Monthly property expenses, Annual property tax, HOA** — editable property-level inputs, not performance figures. Kept, unchanged, under a card renamed **"Expenses & tax"** (same CSS class, `financialDetailsCard`, just relabeled) to make that distinction clear.
- **Purchase price, Appreciation** — moved into the Property Snapshot's secondary row (see above). Same calculation, not duplicated, not recreated.
- **"Estimated cash flow"** (`selected.monthly_rent − selected.monthly_expenses`) — **retired from presentation entirely.** It was a second, non-engine "cash flow" concept sitting next to the Phase B.1 engine's period-safe Net Cash Flow and YTD NOI, and would have kept contradicting them indefinitely. The `monthlyCashFlow` local was deleted. The underlying `monthly_rent`/`monthly_expenses` data and Edit capability are untouched — only this one competing display is gone.
- **Property facts** (beds/baths/sqft/year built/lot size/purchase date) — untouched, stays in its own separate card, never folded into the financial metric grid.

### The "Rent Unknown" contradiction — root cause and fix

The production screenshot showed "Occupied / Rent Unknown" status pills next to a separately-displayed "Rent $2,350/mo" figure — a real contradiction. Root cause, confirmed by reading `lib/rent-ledger/status.ts` in full: `RentStatus.Unknown` means the payment **due date** can't be determined (`lease.rent_due_day` missing) — it has nothing to do with whether the rent **amount** is known (`expectedAmount`, from `lease.monthly_rent`, is populated correctly even when status is `'Unknown'`). That function is correct for its own purpose (payment tracking, used elsewhere in the app too) and was **not modified**.

The fix is presentation-only: a single `rentAmountKnown = performance.contractMonthlyRent.status === 'available'` const, computed once, gates the pill at both places it appears — the hero's status pills and the "Rent & tenant" panel's rent row. `Rent {status}` never renders when `status === 'Unknown'` AND the canonical rent amount is known; it still renders normally for every other status (Due/Paid/Partial/Overdue/Upcoming), and for a genuinely unknown rent amount too. This reuses Property Intelligence's existing canonical rent resolution rather than inventing a second, competing rule — exactly as required.

### Investment Analysis — de-emphasized, not rebuilt

The hero's Investment Analysis link changed from a bordered `.secondary` button (equal visual weight with Edit) to a quiet brand-color text link (`.heroInvestmentLink`), reusing the exact same treatment as the dashboard's existing `.needsAttentionViewAll` "View all" pattern (border: 0, transparent background, brand-color text, small trailing chevron). Destination and functionality are byte-for-byte unchanged — still the one `/investment-tools/property-evaluator` link on the page.

### Missing-data behavior

Unchanged from Phase C: every metric on the card renders through `metricMoney`/`metricPercent`, which return a quiet "—" for anything not `available`, never a fabricated `$0`. The new secondary row follows the same rule (`metricMoney(performance.mortgageBalance)`).

### PWA install banner vs. bottom nav

Investigated per the user's report of a mobile collision. `body.hasBottomNav .installHint { bottom: calc(64px + env(safe-area-inset-bottom) + 12px); }` already exists in `app/globals.css` (added earlier, in Maintenance Workspace V2 Phase D.1) and `AuthHeader` — which mounts on the property page — mounts `MobileBottomNav`, which sets `body.hasBottomNav`. A headless-Chromium check at 320/390/430px (real viewport screenshots, not full-page composites, since Playwright's full-page capture doesn't correctly represent `position: fixed` elements) confirmed a clean ~19px gap between the install hint's bottom edge and the bottom nav's top edge at every width — no overlap with the nav or with page content. No code change was made; this reads as a deploy-lag mismatch between production and this branch rather than a current bug. If the user can reproduce a collision on a build that includes this commit, that would need a fresh screenshot to diagnose further — flagged, not fixed blind.

### Mobile

Verified at 320/390/430/1280px with a static HTML mirror reproducing the exact production scenario (Estimated Value $350,000, Purchase Price $150,000, Monthly Rent $2,350, Monthly property expenses $100, Occupied, no reliable tax-year data, no mortgage entered) plus the existing Phase C scenarios. No horizontal overflow at any width. The card no longer reads as "snapshot + another snapshot + another financial card" — one coherent block, then two small reference cards (Expenses & tax, Property facts), then Rent & tenant, Notes/Timeline, Quick Actions.

### Tests

`lib/dashboard/property-intelligence-v1-phase-c-wiring.test.ts` — updated in place for the new internal shape (secondary row, refined disclosure); still 22 tests, all Phase-C invariants preserved.

`lib/dashboard/property-intelligence-v1-phase-c1-unified-snapshot.test.ts` (new, 22 tests) — hero is identity-only; Investment Analysis de-emphasis; the rent-status fix at both locations, with `lib/rent-ledger/status.ts` confirmed untouched; the retired Estimated cash flow; the renamed/slimmed Expenses & tax card; Property Facts stays separate; tabs/Edit/Notes/Timeline/Quick Actions all intact.

`lib/dashboard/property-profile-mobile-polish-v3.test.ts`, `property-profile-mobile-redesign-v2.test.ts`, `financial-details-cta-removal.test.ts` — rescoped in place (the repo's established convention: protect the same underlying invariant with updated literals, never leave a test silently broken) since all three contained literal assertions about the now-removed `.heroMetrics` strip and the old Financial Details card content.

Targeted run (`lib/dashboard/`, `lib/property-intelligence/`, plus the other `app/page.tsx`-reading suites checked for collateral breakage): all passing. `npx tsc --noEmit` and `npm run build` both clean.

### Remaining duplication / limitations

None identified within this phase's scope. The known Phase C limitation (Annual NOI/Cap Rate/Net Cash Flow rarely populate mid-year, by Phase B.1 design) is unchanged and still applies. `financing_status` integration and prior-year/full-year Annual NOI work remain explicitly out of scope, as does Phase D (dashboard Portfolio Snapshot).

## Phase C.2 — full-year performance, financing status, and the real install-banner fix

Closes the two limitations Phase C.1 flagged as out of scope, plus a confirmed real-device mobile bug. No portfolio/dashboard work (still Phase D), no schema changes.

### Current-year YTD behavior

Unchanged from Phase C. `performance` (the current-year `computePropertyPerformance()` call) is untouched — still built from `performanceYear` only, still never annualized, still never substitutes contract rent for actual income.

### Prior completed-year selection

The engine (`lib/property-intelligence/calculate.ts`'s new `selectPriorYearPerformance()`) is the one place that decides which prior year — if any — is "full-year performance." It takes a caller-supplied, already-year-tagged list of `PropertyPerformanceInput`s and returns the first one (in list order) whose `noiAnnual.status === 'available'`, reusing `computePropertyPerformance()`'s own existing gate rather than inventing a second, parallel "is this year good enough" rule. It defensively re-checks `isYearComplete` itself, so it can never be misused to select the current, in-progress year even if a caller's list is wrong. Returns `null` — never a fabricated number — when nothing qualifies.

**Lookback: the 3 calendar years before the current one.** `app/page.tsx` builds one candidate input per year via the exact same `buildPropertyPerformanceInput()` the current year already uses, filtering `selectedTransactions`/`selectedMaintenance`/`selectedTaxRecords`/`selectedTaxCustomItems` to each candidate year in memory — **no new Supabase query**: those arrays already hold this property's entire history (`loadPortfolio()`'s own `financial_transactions`/`maintenance_records`/`property_tax_records`/`property_tax_custom_items` queries have no date filter at all, confirmed before writing this). 3 was chosen as a small, clearly bounded window — enough to skip one genuinely empty year (a landlord who started using PropRoster mid-year, say) and still find real data, without loading or scanning unbounded history.

### Full-year performance ("View performance")

When a qualifying year is selected, "View performance" gains a **Full-Year Performance** sub-section, labeled with that year (`priorYearPerformance.period.taxYear`) — Annual NOI, Cap Rate, Net Cash Flow, all read verbatim from `priorYearPerformance`, never combined with the current year's figures. When no year qualifies, a single quiet note replaces the section: "No completed prior tax year has enough data on file yet for full-year performance." Contract Annual Rent (unaffected by year selection — it's a contractual rate, not a transaction total) still reads from the current-year `performance`, unchanged.

### Financing status

`properties.financing_status` (`'Active Mortgage' | 'Paid Off' | 'No Mortgage' | 'Unknown'`, `supabase/schema.sql`'s existing check constraint — the same values `FINANCING_STATUS_OPTIONS` already offers in the edit form, not a new system) now flows into the engine via a new `FinancingStatus` type and `normalizeFinancingStatus()` (`lib/property-intelligence/types.ts`) — any value outside the known 4 (including null/undefined) collapses to `'Unknown'`, never silently read as "no mortgage."

`resolveMortgageBalance()`/`resolveMonthlyDebtService()` (`calculate.ts`) check `financingStatus` FIRST: `'Paid Off'`/`'No Mortgage'` produce a **confirmed** `available(0, 'financing_status_confirmed', ...)` — a new `DataSource` value that lets a future UI (or a test) distinguish a landlord-confirmed zero from every other source, none of which can resolve to a confirmed zero on their own. This takes precedence even over a leftover/stale mortgage row, since an explicit landlord confirmation is more trustworthy than data that should have been cleaned up. `'Active Mortgage'` and `'Unknown'` change nothing — the pre-Phase-C.2 behavior (real mortgage row, else fallback balance, else `unavailable`) applies exactly as before, never assuming a zero.

**Equity and Net Cash Flow needed zero new logic.** Because `resolveEquity()` and `resolveNetCashFlow()` already just consume whatever `mortgageBalance`/`monthlyDebtService` Metrics they're given, a confirmed `$0` mortgage balance makes `resolveEquity()` naturally return `estimatedValue` unchanged, and a confirmed `$0` debt service makes `resolveNetCashFlow()` naturally return `noiAnnual / 12` unchanged — both "fall out" of the existing formulas rather than needing a special case. This is the same "the engine decides, React only renders" principle applied one level deeper: even the decision of *how* Paid Off/No Mortgage should affect equity and cash flow lives in one place (the two resolvers above), not duplicated at every metric that depends on them.

React never checks `financing_status` itself — `app/page.tsx` reads `performance.equity`/`performance.mortgageBalance` exactly as it did before Phase C.2; only what those metrics resolve to changed. The one new UI touch is a note, read verbatim from the engine's own `metric.notes[0]` (never a hardcoded "Paid Off" string in React), shown next to Mortgage Balance whenever `source === 'financing_status_confirmed'`.

### What happens to the unified Property Snapshot

Extended, not rebuilt. Primary/YTD Performance/the secondary context row are byte-for-byte the same JSX as Phase C.1 (their underlying VALUES now correctly reflect financing_status, with no JSX change required). "View performance" gained the Full-Year Performance sub-section described above; everything else in it (Cap Rate/Net Cash Flow now sourced from `priorYearPerformance` instead of the current year's always-unavailable fields, Contract Annual Rent, the equity/fallback-rent notes) is otherwise unchanged in structure.

### Install banner — real fix (not a bigger magic number)

A real iPhone/Safari session proved the Phase C.1 fix (a hardcoded `64px`/`70px` bottom-nav-height assumption) wrong — Dynamic Type/font-size settings can wrap either the bottom nav's labels or the install hint's own text taller than any fixed constant assumes, letting the hint cover real content above it.

Fixed at the root: `components/MobileBottomNav.tsx` and `components/InstallPrompt.tsx` each now measure their OWN real rendered height with a `ResizeObserver` (`getBoundingClientRect().height`, border-box — the actual space each bar occupies) and publish it as a CSS custom property (`--bottom-nav-height` / `--install-hint-height`) on `document.documentElement`. `InstallPrompt` also gained a `hasInstallHint` body class, the exact same "toggle only while mounted" pattern `MobileBottomNav`'s existing `hasBottomNav` already used. `app/globals.css`'s clearance rules (`.shell`'s bottom padding, and the install hint's own `bottom` offset above the nav) now read these measured values via `var(--x, fallback)`, with generous pixel fallbacks used only for the brief instant before the first measurement lands. Both components clean up their class/CSS var on unmount/dismiss, so no clearance lingers once the hint is gone. Dismiss/install functionality, copy, and the bottom nav's 4 destinations are completely unchanged — this was a layout-robustness fix only, not a redesign of either component. Verified with a static mockup that mirrors the real ResizeObserver logic exactly, including a simulated "Dynamic Type" case (nav labels + hint text wrapping onto extra lines, taller than the old fixed constants) — no overlap between the hint, the nav, or real page content in either case.

### Tests

`lib/property-intelligence/financing-status.test.ts` (new, 19 tests) and `lib/property-intelligence/prior-year-performance.test.ts` (new, 15 tests) — engine-level coverage for every financing-status/prior-year-selection invariant (Paid Off/No Mortgage confirmed zeros, Active Mortgage/Unknown never assuming zero, missing vs. known-zero, year selection/skipping/qualification, period metadata, defensive re-checking of `isYearComplete`).

`lib/dashboard/property-intelligence-v1-phase-c2-wiring.test.ts` (new, 27 tests) — `app/page.tsx` wiring: the bounded lookback, no formulas duplicated in React, the Full-Year Performance section's sourcing/labeling/quiet-omission, financing_status decided only by the engine, the unified snapshot's continuity, and the install-banner measurement mechanism.

`lib/property-intelligence/calculate.test.ts` — updated in place for the new `financingStatus` parameter on `resolveMortgageBalance`/`resolveMonthlyDebtService`/`PropertyPerformanceInput` (every existing call site passes `'Unknown'`, preserving the exact pre-Phase-C.2 behavior it already tested — no existing assertion changed).

`lib/dashboard/property-intelligence-v1-phase-c-wiring.test.ts`, `financial-details-cta-removal.test.ts` — rescoped in place for the Cap Rate/Net Cash Flow/Annual NOI sourcing move from `performance` to `priorYearPerformance`, and a widened slice window around the new financing-status note.

Targeted run (`lib/property-intelligence/`, `lib/dashboard/`, plus the previously-affected suites): all passing. `npx tsc --noEmit` and `npm run build` both clean. Full suite run once at the end: 2118 tests, 123 files, all passing.

### Visual QA

Five scenarios (A: Paid Off with valid current + prior year data — Equity = Value, Mortgage Balance a confirmed `$0` with its note, Full-Year Performance visible; B: Active Mortgage with complete mortgage data — valid Equity/Net Cash Flow, including a correctly-toned negative Net Cash Flow; C: Active Mortgage with missing mortgage data — Equity/Mortgage Balance/Net Cash Flow all quietly unavailable, Annual NOI/Cap Rate still shown since they don't depend on debt data; D: Unknown financing status — identical conservative behavior to C; E: no qualifying prior year — a quiet note, zero fabricated numbers), all computed through the real engine (`computePropertyPerformance`/`selectPriorYearPerformance`, via `tsx`, not hand-typed numbers) and rendered in a static HTML mirror of the exact JSX/CSS, screenshotted at 320/390/430/1280px. No horizontal overflow at any width or scenario. The install-banner fix was verified separately with real `getBoundingClientRect()`/`ResizeObserver` measurements in two scenarios (normal text, and a simulated Dynamic-Type/wrapped-text case) — no overlap between the install hint, the bottom nav, or real page content (Quick Actions) in either case.

### Remaining duplication / UX limitations

None identified. The 3-year lookback is a deliberate, documented bound — a property with 4+ consecutive empty/insufficient years still correctly shows no full-year performance rather than reaching further back; this was judged acceptable (a landlord in that situation has a data-entry problem Full-Year Performance can't paper over) rather than in-scope to fix here. `financing_status` is still only read, never written, by anything in `lib/property-intelligence/` — the edit form (`app/page.tsx`) is unchanged.

## Phase C.3 — Compact Property Snapshot (production polish)

The Property Intelligence data and architecture were approved after C.1/C.2 shipped to production, but a real iPhone/Safari review of the live property page found the Property Snapshot's PRESENTATION visually poor: every metric lived in its own bordered box (`.financialStat`), reading "more like a form than a snapshot" and causing excessive vertical scrolling. This phase is presentation-only — **no financial logic changed**: every figure still comes from the exact same `computePropertyPerformance()`/`selectPriorYearPerformance()` call, reading the exact same `Metric` fields as Phase C.1/C.2. Only the markup and CSS changed.

### What changed

- **No bordered box per metric.** The old `.financialStats.performanceStats`/`.financialStat` grid (and the boxed `.propertySnapshotContext` secondary-row panel) are gone from this card entirely. The outer `.overviewPanel.propertySnapshotCard` is the only container; typography, spacing, and a plain `<hr class="propertySnapshotDivider">` establish hierarchy instead.
- **Value-first, label-second.** Every metric now renders as `<strong>{value}</strong><span>{label}</span>` (the opposite order from the old `.financialStat` pattern) — the number a landlord scans for comes first, its label confirms it.
- **Mortgage joined the primary grid.** Value/Equity/Rent/Mortgage now render together as a compact 2×2 grid (`.propertySnapshotPrimaryGrid`), matching "what do I own" as one glance instead of splitting Mortgage into a separate boxed section. When `performance.mortgageBalance.source === 'financing_status_confirmed'` (Paid Off/No Mortgage), the primary figure shows the financing-status word itself ("Paid Off"/"No Mortgage") instead of a redundant "$0" — a presentation choice only, reading `selected.financing_status` (already-loaded) purely for display text; the underlying `Metric`/decision is unchanged and still made entirely by the engine.
- **Large headline figures abbreviate.** Estimated Value, Estimated Equity, Purchase Price, and Appreciation now render through `metricCompactMoney()`/`compactMoney()` ("$350K" instead of "$350,000") — reusing the **exact pre-existing `compactMoney()` helper** the Dashboard's Portfolio Snapshot already introduced ("Homepage snapshot cleanup"), not a second, differently-tuned abbreviation rule. Monthly Rent, Mortgage Balance (when not financing-status-confirmed), Income, Expenses, NOI, Annual NOI, Net Cash Flow, and Contract Annual Rent all keep their exact, unabbreviated figures — precision matters for those, never for a home's ballpark value.
- **YTD Performance** — same 3 metrics, same `.propertySnapshotMetric` pattern, sized a step down from the primary grid via CSS only.
- **Purchase Price + Appreciation collapsed into one quiet inline sentence** ("Purchase $150K · +$200K appreciation", `.propertySnapshotContextLine`) instead of two boxed detail rows. Same `appreciationFor()` calculation, called once, unchanged. Purchase Price stays unconditional — this pass didn't add a new "hide when not entered" rule.
- **"View performance" is untouched** — same `<details>`, same `priorYearPerformance`/Cap Rate/Net Cash Flow/Contract Annual Rent sourcing Phase C.2 already established.
- **Mobile**: a single `@media (max-width: 360px)` rule trims type size a step (never collapses the grid to 1 column — that would reintroduce the scroll-heavy card this phase exists to fix). 2 and 3 columns of compact figures already fit comfortably down to 320px.

### What did NOT change

The Dashboard's own Portfolio Snapshot (`.portfolioSnapshot`/`.snapshotMetrics`/bare `.snapshotMetric`) — a separate, pre-existing, unrelated surface that happens to share the word "snapshot" — was not touched. All new CSS classes are `.propertySnapshot*`-prefixed specifically so nothing here can collide with or override that out-of-scope pattern (confirmed no naming collision remained via `tsc`/build). No Phase D portfolio aggregation was started. No schema changes. No calculation, resolver, or engine file was touched.

### Tests

`lib/dashboard/property-snapshot-compact-v1-wiring.test.ts` (new, 21 tests) — the presentation invariants above: no bordered-box classes survive, value-first ordering, the 4-metric primary grid, the financing-status display-text rule, `compactMoney()` reuse (not redefinition), the collapsed context line, "View performance" untouched, and — critically — that the Dashboard's Portfolio Snapshot classes/behavior are completely unchanged.

`lib/dashboard/property-intelligence-v1-phase-c-wiring.test.ts`, `property-intelligence-v1-phase-c2-wiring.test.ts`, `financial-details-cta-removal.test.ts` — rescoped in place (repo convention: protect the same invariant with updated literals) for the new value-first markup, the `metricCompactMoney` presentation helper, and the inline context line.

Targeted run (`lib/property-intelligence/`, `lib/dashboard/`): all passing. Full suite: 2141/2141 tests passing (124 files). `npx tsc --noEmit` and `npm run build` both clean.

### Visual QA

Four scenarios (A: Paid Off, reproducing the exact production data the user reviewed on a real iPhone — Estimated Value $350,000, Purchase Price $150,000, Monthly Rent $2,350; B: Active Mortgage with complete data, including a correctly-toned negative Net Cash Flow; C: Unknown financing status with no qualifying prior year — quiet "—"/omission, zero fabricated numbers; D: large headline figures / a wrapping "No Mortgage" label, to stress-test the abbreviation and wrapping rules), computed through the real engine (`tsx`, not hand-typed numbers) and rendered in a static HTML mirror of the exact JSX/CSS, screenshotted at 320/390/430/1280px. No horizontal overflow at any width or scenario. The card is dramatically shorter than the Phase C.1/C.2 bordered-box version at every width — confirmed visually, not just by absence-of-overflow.

### Remaining duplication / UX limitations

None identified. This was a presentation-only pass; every data/calculation limitation already documented in Phase C.1/C.2 is unchanged.

## Recommended Phase D scope

Per Phase A Section 9/18: add Net Cash Flow to the dashboard's Portfolio Snapshot (`Properties · Estimated Value · Monthly Income · Monthly Expenses · Net Cash Flow`), aggregating each property's already-computed `PropertyPerformance` — summing only `available` values, never averaging Cap Rate across properties (portfolio Cap Rate, if ever built, is `total portfolio NOI / total portfolio value`, not an average — and is explicitly not required for V1 per Phase A). No new per-property calculation work; Phase C already produces the numbers to sum.
