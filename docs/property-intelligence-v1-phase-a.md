# Property Intelligence V1 — Phase A: Data, Calculation, and UX Architecture Audit

Audit only. No product code, schema, calculation, or UI changes in this phase.

Baseline: `main` @ `e75acf89d14b38f70e51ed3eb62200fd951f5fd0` (PR #61 merged).

---

## 1. Existing Financial Architecture

PropRoster's financial data is spread across several independently-writable tables, all owner-scoped by RLS, all children of `properties`:

| Table | Purpose | Written from |
|---|---|---|
| `properties` | Property record itself, plus several **flat, manually-entered** financial fields | Add/Edit Property form only |
| `leases` | Lease terms per tenancy, including the lease's own `monthly_rent` | Rent > Lease tab |
| `rent_payments` | Actual cash received per lease per month | Rent > Ledger tab |
| `financial_transactions` | General income/expense ledger, one row per event, `category` + `transaction_type` | Financials tab; also written indirectly by rent payments and maintenance records (see below) |
| `mortgages` | Loan terms, **insert-only, no edit path** | Details > Mortgage |
| `insurance_policies` | Policy terms | Details > Insurance |
| `maintenance_records` | Landlord's own service history, optional link to a ledger transaction | Details > Maintenance (property-level, historical) |
| `maintenance_requests` | Tenant Connect / Maintenance Workspace's canonical case table (separate from `maintenance_records` — different milestone, different purpose: active-case workflow, not a financial ledger) | Maintenance Workspace |
| `property_tax_records` | One row per property per tax year, landlord-entered **annual totals**, used only by Tax Center | Tax Center |
| `property_tax_custom_items` | Ad-hoc Tax Center line items (per year, categorized) | Tax Center |
| `property_systems` | Equipment registry (HVAC, roof, etc.), has its own `cost` field | Details > Systems |
| `investment_analyses` | Saved Property Evaluator "what-if" scenarios, **fully self-contained inputs**, optionally tagged to a `property_id` for organization only | Investment Tools |

The one already-existing calculation engine is `lib/investment-calculations.ts` — pure, framework-free, already unit-tested, and already implements NOI, cap rate, equity, cash flow, cash-on-cash return, DSCR, GRM, break-even occupancy, and a mortgage amortization schedule. **It is used exclusively by the Investment Tools Property Evaluator today**, fed by manually-typed "what-if" inputs (`investment_analyses` rows), never by a property's own live data.

Two module-scope, non-shared, ad-hoc calculations already exist directly inside `app/page.tsx`'s property Overview panel:
- `equity = estimated_value - mortgage_balance` (inline, not calling `lib/investment-calculations.ts`'s `equity()`)
- `appreciationFor(estimatedValue, purchasePrice)` (a local function, correctly guards `$0`/unset inputs, correctly excludes rent/expenses — but is a second, independent implementation)

Tax Center (`lib/tax-center/`) has its own, separately-evolved aggregation and override-resolution engine (`aggregate.ts`, `manual-entry.ts`), described in detail in Section 10.

---

## 2. Source-of-Truth Matrix

| Metric | Current source(s) | Fields | Calculation today | Current UI usage | Reliable today? | Missing data? | Double-count risk? | Recommended V1 behavior |
|---|---|---|---|---|---|---|---|---|
| **Value** | `properties.estimated_value` | single manual field | none (raw value) | Property hero, dashboard snapshot, property card | Landlord-entered snapshot; no timestamp on when it was last updated; a separate external comps tool (Investment Tools > Property Value & Comps) exists but never writes back to this field | No external valuation ever auto-populates it | Low (single field) | Keep as the only Value source; label it "Value" (owner-entered), not "Estimated Value" from a model; consider surfacing "last updated" |
| **Purchase Price** | `properties.purchase_price` | single manual field | none | Overview, appreciation calc | Reliable as entered; never changes after purchase | N/A | None | Keep as-is |
| **Mortgage Balance** | `properties.mortgage_balance` (synced once from `mortgages.current_balance` at insert time) OR typed directly on Add/Edit Property | two independent write paths, no ongoing sync | none | Overview hero, dashboard totals | **Point-in-time snapshot only** — `mortgages` has no edit path at all (insert/select/delete only), so `current_balance` is never updated by amortization or landlord correction except delete-and-re-add | Balance goes stale the day after entry (real mortgages amortize monthly) | Low — two ways to set the same field with no reconciliation | Document staleness explicitly; treat as "as of [not tracked]" until an edit path exists |
| **Equity** | Inline calc in `app/page.tsx`: `estimated_value - mortgage_balance` | n/a | `Value − Mortgage Balance` | Overview hero | As reliable as its two inputs (Value is a snapshot, Mortgage Balance can be stale) | Inherits both inputs' gaps | None (single calc site) but **duplicated logic** — `lib/investment-calculations.ts` already has an `equity()` function this doesn't call | Canonicalize on `lib/investment-calculations.ts`'s `equity()` |
| **Monthly Rent** | THREE independent sources: (1) `properties.monthly_rent` (manual, set at Add/Edit Property, never synced), (2) `leases.monthly_rent` (current lease's contracted rent), (3) `rent_payments.amount` (actual cash received) | | Dashboard/Portfolio Snapshot reads (1) only; Rent Ledger reads (2) as "expected" and (3) as "collected" | (1): dashboard totals, property card, Overview hero. (2)+(3): Rent Ledger, PropWatch rent-status items | (1) is the least reliable — a static estimate that never updates when a lease changes; (2) is live/authoritative when a lease exists; (3) is the true cash figure | Vacant property: (1) may still show a stale non-zero number | **Real risk**: dashboard "Monthly Income" and Rent Ledger's "Expected" can silently disagree | Canonical "Monthly Rent" = current active lease's `monthly_rent` when a lease exists, else `properties.monthly_rent` as a last-resort fallback (this exact fallback hierarchy already exists in `rental-analyzer/page.tsx`'s prefill logic — reuse it) |
| **Monthly Expenses** | `properties.monthly_expenses`, a single manual field, set at Add/Edit Property only | | none | Dashboard/Portfolio Snapshot only | Pure landlord guess at add-time; never reconciled against `financial_transactions` | Frequently stale/unset | None directly, but disconnected from the actual ledger | Recommend replacing with a live sum of the current month's operating-category `financial_transactions` (see Section 6) |
| **Property Tax (annual)** | THREE independent sources: `properties.property_tax_annual` (manual), `financial_transactions` rows categorized `Taxes`, `property_tax_records.property_taxes` (Tax Center manual override) | | Each read independently in its own surface; none aggregate the others | Overview hero (1); Tax Center (2)+(3) via override rule | Tax Center already solved this internally (manual replaces tracked, see Section 10) but `properties.property_tax_annual` is a **fourth, entirely disconnected number** shown on Overview | Possible for all three to disagree | **Real risk** — a landlord could see three different "property tax" figures across three screens | Property Intelligence should read Tax Center's *effective* value (post-override) as the single figure, not `properties.property_tax_annual` |
| **HOA (monthly)** | `properties.hoa_monthly` (manual) vs. `financial_transactions` "HOA" category vs. `property_tax_records.hoa` (annual) | | independent | Overview hero only reads the property field | Same triple-source pattern as property tax | Same | Same | Same resolution as property tax |
| **Insurance** | `insurance_policies.annual_premium` (structured) vs. `financial_transactions` "Insurance" category vs. `property_tax_records.insurance` | | independent | Details > Insurance (1); Tax Center (2)+(3) | `insurance_policies` has no edit path either (insert/select/delete only) — same staleness pattern as mortgages | Possible for the "current" premium to be an old, since-renewed policy | **Real risk** | Prefer the most recent `insurance_policies` row for "current premium" context; use Tax Center's effective annual figure for expense totals |
| **Maintenance cost** | `maintenance_records.cost`, optionally mirrored into `financial_transactions` (category `Maintenance`) via an opt-in "Add to Financials" checkbox (defaults ON) | `maintenance_records.financial_transaction_id` links the two rows 1:1 when linked | Tax Center reads `financial_transactions` for the dollar amount; `maintenance_records` is used only for a data-quality cross-check (readiness), never dollar-summed | Property Details > Maintenance (record list); Tax Center readiness | **This is the one place PropRoster already got the pattern right** — see Section 5 | If a landlord unchecks "Add to Financials," the cost is recorded but invisible to every dollar total that reads only `financial_transactions` | No double-count risk today; there IS an under-count risk when the checkbox is off | Reuse this exact link pattern for any future structured expense source |
| **YTD Income / YTD Expenses** | Not computed anywhere today as a named metric | | Tax Center computes a full *tax-year* summary (`computePropertyTaxSummary`), which is effectively YTD once the selected year is the current year | Tax Center | Reliable to the extent `financial_transactions` + Tax Center overrides are reliable | Same gaps as their category inputs | None new | Reuse Tax Center's `computePropertyTaxSummary` for the current year rather than building a second YTD aggregator |
| **NOI** | Exists only inside `lib/investment-calculations.ts`'s `calculateNOI()`, fed by Investment Tools' manual "what-if" inputs | | `annualGrossIncome − annualOperatingExpenses` (mortgage excluded) | Investment Tools Property Evaluator only | Correct definition, reliable for its own inputs; never fed live property data | Never computed for a real, existing property | None (single implementation) | Feed the existing `calculateNOI()` with live-derived income/expense totals (Section 6) rather than writing a second NOI function |
| **Cap Rate** | Exists only inside `lib/investment-calculations.ts`'s `capRate()` | | `NOI / propertyValue × 100`, financing correctly excluded | Investment Tools Property Evaluator only | Correct, conventional definition already matches what this milestone wants | Never shown for a real property | None | Reuse `capRate()` directly; do not reimplement |
| **Net Cash Flow (owner)** | Exists only inside `buildAnalysis()`'s `monthlyCashFlow = noiAnnual/12 − monthlyPI` | | NOI minus mortgage P&I | Investment Tools only | Correct concept (financing affects cash flow, not NOI) | Never computed for a real property | None | Reuse this formula shape; the only new work is sourcing live NOI and a live monthly P&I figure |
| **Appreciation** | `appreciationFor()`, a local function in `app/page.tsx` | | `estimatedValue − purchasePrice`, and `%` | Property Overview only | Correctly excludes income/expenses/paydown/costs; correctly guards `$0` | Requires both value and purchase price to be entered | None (single call site) but not in the shared lib | Move into `lib/investment-calculations.ts` for reuse (dashboard, future trends) |

---

## 3. Existing Calculation Definitions (Verbatim, From Code)

```
NOI            = annualGrossIncome − annualOperatingExpenses      (financing excluded)
Cap Rate       = NOI / propertyValue × 100                        (financing excluded — matches this milestone's required definition exactly)
Monthly Cash Flow = NOI / 12 − monthly mortgage P&I                (financing INCLUDED — owner-level, correct separation from NOI)
Equity         = propertyValue − outstandingLoanBalance
Appreciation   = currentValue − purchasePrice  (and the % of purchasePrice)
Cash-on-Cash   = annualCashFlow / totalCashInvested × 100
DSCR           = NOI / annualDebtService
GRM            = purchasePrice / annualGrossIncome
```

All of the above already exist, are already unit tested, and already match the conventions this milestone specifies. **No existing financial definition needs to be changed.** The work is almost entirely about *sourcing live data into calculations that already exist*, not inventing new formulas.

The one place PropRoster has a **second, independently-evolved** definition system is Tax Center, which is deliberately scoped to tax-year annual totals with its own manual-override resolution (Section 10) — this is a different question ("what should I tell my accountant") from Property Intelligence ("how is this property performing right now"), and the two should stay conceptually separate even while sharing the same underlying category totals where they overlap (operating expenses).

---

## 4. Data Reliability Assessment

| Input | Reliability | Why |
|---|---|---|
| `properties.estimated_value` | Landlord-entered snapshot | No timestamp of last update visible to the calculation layer; could be years stale |
| `properties.purchase_price` | High | Set once, essentially immutable |
| `properties.mortgage_balance` / `mortgages.current_balance` | **Low over time** | No edit path exists in the app at all; only insert/delete. A landlord who wants to update a balance must delete and re-add the entire mortgage record |
| `insurance_policies.annual_premium` | **Low over time** | Same insert/delete-only limitation |
| Active lease `monthly_rent` | High | Directly tied to `leases`, which does have an active-lease concept (`selectCurrentLease`) |
| `rent_payments` | High | Real transactional data, one row per actual payment |
| `financial_transactions` | High, but incomplete by construction | Only contains what a landlord chose to log; a category with zero rows is indistinguishable from "genuinely zero" and "never logged" |
| `property_tax_records` (Tax Center manual fields) | High when present | Explicitly landlord-attested annual figures |
| `maintenance_records.cost` | High for the record itself; **conditionally** reflected in the ledger | Only flows into `financial_transactions` when "Add to Financials" was checked at save time |

**Overall**: PropRoster can reliably calculate NOI/Cap Rate/Cash Flow **only for properties where the landlord has been disciplined about (a) an active lease with a real `monthly_rent`, and (b) logging operating expenses through the ledger or Tax Center**. For a newly added property, or one where the landlord only filled in the Add Property form and never touched Financials/Tax Center, none of these metrics have real data to work from — this must degrade to "Not enough data," never a fabricated number (see Section 7).

---

## 5. Double-Counting Audit

**The good news: PropRoster already has a working canonical pattern**, applied inconsistently:

1. **Rent payments → ledger**: `rent_payments.financial_transaction_id` + `created_linked_transaction` (a boolean that is only ever true when *that* payment created the transaction) — this is the most rigorous version in the codebase. A rent payment's cash is counted in `financial_transactions` at most once, and deleting the payment only cascades the transaction it created.
2. **Maintenance → ledger**: `maintenance_records.financial_transaction_id`, created opt-in ("Add to Financials," default checked) at save time. Same 1:1 shape, slightly less rigorous (no "did I create this" boolean, but there is only ever one writer of this link today).
3. **Tax Center's tracked-vs-manual categories**: `computeCategoryValue()` — manual **replaces** tracked, never adds to it. This is the single place in the app that already had to solve "what if two sources disagree," and it solved it correctly and generically (`lib/tax-center/manual-entry.ts`).

**The risk is not inside any one of these flows — it is in mixing them without going through the same resolution layer.** Concretely:

- If Property Intelligence sums `financial_transactions` directly for "Monthly Expenses" *and separately* reads `property_tax_records`/`properties.property_tax_annual`/`properties.hoa_monthly` as additional expense inputs, the same real-world property tax or HOA payment could be counted twice (once from the ledger, once from a flat property field or Tax Center override).
- `maintenance_records.cost` and `property_systems.cost` are **not cross-referenced at all**. A landlord who logs "new HVAC unit, $6,000" in Property Systems and *also* logs it as a Maintenance record with "Add to Financials" checked has recorded the real-world $6,000 event in two unlinked places (only the Maintenance record's optional ledger link is ever summed anywhere, so this is a **latent** risk, not an active one today, but worth flagging before Property Intelligence adds equipment-cost-aware calculations).
- `investment_analyses` is entirely walled off from real property data (self-contained inputs) — **zero double-count risk today**, precisely because it doesn't touch the live tables at all. This isolation must be preserved when Investment Tools is later asked to consolidate onto shared functions (Section 13): consolidating the *math* is safe; blending the *data sources* is not, unless done deliberately.

**Recommended canonical strategy (not implemented in Phase A):** Property Intelligence should compute every expense category through the exact same "effective value" resolution Tax Center already uses (`computeCategoryValue`: manual override replaces tracked, never adds), reusing Tax Center's own resolved totals for the current year rather than re-deriving from `financial_transactions` a second time. This means Property Intelligence and Tax Center will always agree on operating expenses for a given property/year, by construction, because they'd be reading the same computed number. `properties.property_tax_annual` / `properties.hoa_monthly` should be treated as **display-only fallbacks for a property with no Tax Center data yet**, never summed alongside a Tax Center or ledger figure for the same category.

---

## 6. Recommended Canonical Definitions

These do not change any existing formula — they specify what feeds each existing formula with real data.

### NOI (annual)
```
grossIncome     = (current lease monthly_rent × 12) + any Tax Center "Other rental-related income" for the year
operatingExpenses = Tax Center's effective operating-expense total for the year
                    (property taxes, insurance, HOA, repairs, maintenance, utilities,
                     management, supplies, and the V3 professional/travel/meals groups —
                     i.e. exactly OPERATING_EXPENSE_LIKE_GROUPS from lib/tax-center/manual-entry.ts)
NOI             = grossIncome − operatingExpenses     [existing calculateNOI(), unchanged]
```
Mortgage principal/interest is never part of either side, matching this milestone's requirement.

### Cap Rate
```
Cap Rate = NOI / Value × 100     [existing capRate(), unchanged]
```

### Net Cash Flow (owner-level, new "live" consumer of an existing formula)
```
Net Cash Flow (monthly) = NOI / 12 − monthly mortgage P&I
```
Monthly P&I should come from `mortgages.monthly_payment` when a mortgage row exists (a field already stored, not derived), rather than recomputing amortization — `mortgagePayment()` exists for cases with no stored payment amount but a rate/term/balance.

### Equity
```
Equity = Value − Mortgage Balance     [existing equity(), unchanged — just call it instead of the ad-hoc inline version]
```

### Appreciation
```
Appreciation ($) = Value − Purchase Price
Appreciation (%) = Appreciation ($) / Purchase Price × 100
```
Move `appreciationFor()` from `app/page.tsx` into `lib/investment-calculations.ts` verbatim (its guard logic is already correct).

---

## 7. Missing-Data Behavior

Never show a precise number built on materially incomplete inputs. Recommended rules, all presentation-only (no schema needed):

| Situation | Behavior |
|---|---|
| No `estimated_value` (or `$0`) | Cap Rate: "Not enough data." Equity: "Not enough data." (Value itself shows "Not entered.") |
| No active lease and no rent history | Income-dependent metrics ("Not enough data" — a vacant property is a fact, not an error) |
| No operating-expense data logged at all (zero `financial_transactions`, no Tax Center record) | Show NOI/Cap Rate as "Not enough data," never "$0 expenses" (a true zero-expense property is implausible and almost always means "nothing logged yet," not "no costs") |
| Partial-year ownership | Do not annualize a partial year silently — label the period covered (e.g. "Since [purchase date], not a full year") rather than presenting a misleadingly precise annual figure |
| Newly added property (created this session) | Same "Not enough data" treatment; do not treat `$0` defaults as real data |
| Negative NOI | Show it as computed — a real negative NOI is a legitimate, important fact, not an error state |
| Unusual one-time expense (e.g. a single large capital item miscategorized as operating) | Out of scope to detect automatically in V1; Tax Center's `readiness.ts` already flags "Renovation logged as regular expense" as a nudge — Property Intelligence can surface the same signal rather than inventing a new one |
| Property has no mortgage | Equity = Value (mortgage balance = 0, a real, correct state — distinct from "mortgage balance unknown") |
| Incomplete Tax Center information | Cap Rate could still show, qualified: `6.4%*` with a small "Some expense categories may be missing" note, when some but not all operating categories have any data; full "Not enough data" only when essentially nothing has been logged |

Recommendation: two visible states, not three — a clean number, or "Not enough data" — plus an **optional** asterisk-and-footnote qualifier for the "some but not all inputs present" middle case described above. Never a bare, unqualified precise-looking percentage built on zero real expense data.

---

## 8. Property-Level UX Proposal

Matches the established simplification direction (fewer boxes, strong hierarchy, progressive disclosure) already shipped for the dashboard.

**Snapshot (always visible, in the existing hero metrics area):**
```
Value        Equity        Rent
Net Cash Flow      Cap Rate
```
Cap Rate is explicitly requested to be visible at the property level — it belongs in the primary snapshot, not behind disclosure.

**Then a single quiet link:** `View performance ›` — expands or navigates to a secondary view containing:
- NOI (annual)
- YTD Income / YTD Expenses
- Appreciation
- Mortgage Balance
- (Later) expense trend / category breakdown

This mirrors the exact pattern already shipped for the dashboard's Needs Your Attention section (a compact preview + quiet "View all" expansion) — no new interaction pattern needs to be invented.

---

## 9. Portfolio-Level UX Proposal

Current Portfolio Snapshot: `Property count · Estimated Value · Monthly Income · Monthly Expenses`.

Recommended V1 addition: **Net Cash Flow**, since it's the one number that answers "am I ahead or behind, in total, right now" — the most decision-useful net-new metric, and cheap to compute once Monthly Income/Expenses are sourced live (Section 6).

**Portfolio Cap Rate is not recommended for V1's primary snapshot.** A blended cap rate across properties of very different types/ages is easy to misread as more meaningful than it is, and it isn't a metric a landlord acts on the same way property-level cap rate is. Keep it available on a secondary/detail view later if there's real demand, not in the primary five-number snapshot.

```
Properties   Est. Value   Monthly Income   Monthly Expenses   Net Cash Flow
```
Five numbers, same visual treatment as today — no new boxes, no chart.

---

## 10. Tax Center Integration Boundary

Tax Center already owns:
- The canonical **operating expense category list** and manual-override resolution (`lib/tax-center/manual-entry.ts`'s `TAX_CATEGORIES` + `computeCategoryValue`).
- A working, tested **per-property, per-year summary** (`computePropertyTaxSummary`) that already computes gross income, operating expenses, and "net operating result" (income − operating expenses, i.e. **the same shape as NOI**, just annual/tax-year framed rather than trailing-12-months framed).

**Boundary recommendation:** Property Intelligence should treat `computePropertyTaxSummary`'s `grossIncome`/`operatingExpenses` for the current tax year as its NOI inputs, rather than re-deriving from `financial_transactions`. This is the single biggest guarantee against Property Intelligence and Tax Center ever disagreeing about the same property's numbers. Tax Center itself does not need to change to support this — it already exports everything needed.

One real gap: Tax Center is tax-year-shaped (calendar year); Property Intelligence's "trailing 12 months" or "YTD" framing may not always line up with a tax year cleanly (e.g. viewing performance in March needs "this tax year so far," which Tax Center already naturally provides by filtering to the current year — no new work needed there either).

---

## 11. Maintenance Expense Integration Boundary

`maintenance_records` (the historical, property-level cost log) is the correct source for "maintenance spend" as a dollar figure — through its optional `financial_transaction_id` link, never by separately summing `maintenance_records.cost` directly (that would double-count against the ledger for any record that was also added to Financials, and would include records that were deliberately kept OFF the ledger for the opposite reason).

`maintenance_requests` (the Tenant Connect / Maintenance Workspace canonical case table) is a **workflow** table — status, priority, tenant/provider coordination — and has no cost field at all today. It is out of scope for financial calculations entirely; no integration needed for V1.

---

## 12. Smart Upload Future Integration

Not implemented here. Architecturally, once Smart Upload can extract structured data from a mortgage statement, insurance policy, tax bill, or repair invoice, the **landlord-reviewed result should write into the exact same tables this audit already maps** — a reviewed mortgage statement updates `mortgages` (once an edit path exists — see Section 17), a reviewed insurance renewal creates a new `insurance_policies` row, a reviewed tax bill becomes a `property_tax_records` manual entry, a reviewed repair invoice becomes a `maintenance_records` row (with the existing "Add to Financials" link). No new tables are implied by Smart Upload specifically — it's a new *writer* to tables that already exist and are already the correct source of truth.

---

## 13. Investment Tools Consolidation Opportunities

`lib/investment-calculations.ts` is already the right shared engine — Property Overview, Portfolio Snapshot, and Investment Tools should all import from it rather than each maintaining their own math. Concrete consolidation targets found in this audit:

- Replace `app/page.tsx`'s inline `equity` calc with `equity()`.
- Move `appreciationFor()` into `lib/investment-calculations.ts`.
- New, small additions to the same file (Phase B): a "live" NOI/Cap Rate/Cash Flow builder that takes a property + its current lease + Tax Center's resolved category totals + its mortgage, and returns the same `AnalysisResult`-shaped metrics `buildAnalysis()` already returns for manual scenarios — so a property's live snapshot and a saved "what-if" analysis are visually/numerically comparable using one formula set.

Investment Tools' own visual simplification (already requested separately — "less wordy, calculations behind optional disclosure") is compatible with this: the calculation engine doesn't change, only which inputs feed it (typed vs. live) and how results are displayed.

---

## 14. Future Trend Architecture (Not Built Now)

None of the current tables retain historical snapshots of a computed metric — `properties.estimated_value`, `mortgage_balance`, etc. are always overwritten in place, and `financial_transactions` is transactional (good for trends) but the *computed* metrics (NOI, Cap Rate, Equity) are never persisted anywhere.

**If/when trend history is built**, the cleanest approach observed from this codebase's own conventions (matching how `investment_analyses` already stores a `results jsonb` blob alongside its inputs) is a new, append-only snapshot table — e.g. `property_performance_snapshots` — written periodically (monthly, or on-demand when the landlord views performance) capturing `{ property_id, snapshot_date, value, mortgage_balance, equity, noi, cap_rate, monthly_cash_flow }`. This is additive and never mutates existing tables. **Not created in Phase A** — noted only so Phase C/D's live calculations are shaped in a way that would make snapshotting them trivial later (i.e., return one flat, serializable metrics object per property).

---

## 15. Future PropWatch Intelligence (Not Built Now)

PropWatch's existing "Needs Your Attention" architecture (per-item `{ type, propertyId, label, description, date, nav }`, folded into one flat list — see the recently shipped dashboard simplification) is already shaped to accept new item types. Once trend snapshots exist (Section 14), PropWatch could add purely factual comparison items such as:

- "Cash flow decreased" (this month vs. last)
- "Insurance increased" (new policy premium vs. prior)
- "Cap rate declined" (vs. last snapshot)
- "Operating expenses increased"
- "Property taxes increased"
- "Equity increased"
- "Expense spike detected" (one category well above its trailing average)
- "Missing information is preventing an accurate performance calculation" (surfacing Section 7's "Not enough data" state as an actionable item, not just a UI dead-end)

All of these are **factual, comparative observations**, never recommendations ("sell," "raise rent," "bad investment" are explicitly out of scope, matching this milestone's own instruction and PropRoster's existing PropWatch tone, e.g. `readiness.ts`'s own "never a vague/scary warning" convention).

---

## 16. Security / RLS Implications

None of this audit's findings require any RLS change. Every table involved (`properties`, `leases`, `rent_payments`, `financial_transactions`, `mortgages`, `insurance_policies`, `maintenance_records`, `property_tax_records`, `property_tax_custom_items`, `investment_analyses`) already has a consistent, owner-scoped `select/insert/update/delete` policy set, all following the same `(select auth.uid()) = owner_id` pattern, with insert/update policies additionally verifying `property_id` belongs to the caller. Any future shared calculation function is a **pure function operating on already-RLS-fetched data**, exactly like `lib/investment-calculations.ts` and `lib/tax-center/*` are today — no service-role client, no new elevated access, anywhere in this design.

---

## 17. Schema Changes, If Eventually Needed

**None required for Phase B/C** (a live Property Snapshot using existing tables + the existing calculation engine). Two schema gaps are worth flagging for a **future, separate** milestone decision (not Phase A, not committed to):

1. **No edit path for `mortgages` or `insurance_policies`.** Both are insert/select/delete only. This is the single biggest reliability gap this audit found — "Equity" and "Insurance expense" both degrade in accuracy the longer a mortgage/policy goes unedited. Adding an update policy + edit UI (no new columns needed) would directly improve Equity's most important input.
2. **Future trend history** (Section 14) would need one new, additive, append-only table. Not needed until trends are actually being built.

Neither is proposed for implementation now.

---

## 18. Recommended Implementation Phases

Repository evidence supports the originally proposed sequence, with one adjustment: Tax Center integration (Section 10) should happen *before or alongside* the shared calculation engine work, not after, since it's the actual source of truth the engine needs to consume for expenses.

- **Phase B — Shared financial calculation engine + tests.** Consolidate `equity()`/`appreciationFor()` into `lib/investment-calculations.ts`; add a "live" NOI/Cap Rate/Cash Flow builder that takes a property + current lease + Tax Center's resolved totals + mortgage, mirroring `AnalysisResult`'s shape. Pure functions, fully unit tested, no UI changes.
- **Phase C — Property Intelligence snapshot.** Wire Phase B's engine into the property Overview hero (Value/Equity/Rent/Net Cash Flow/Cap Rate + "View performance ›" disclosure), per Section 8. Includes the missing-data states from Section 7.
- **Phase D — Portfolio Snapshot integration.** Add Net Cash Flow to the dashboard snapshot per Section 9. Small, since Phase C already produces the per-property numbers to sum.
- **Phase E — Investment Tools calculation consolidation / visual simplification.** Point the Property Evaluator's manual analysis and the new live snapshot at the same underlying functions (already true after Phase B); apply the separately-requested visual cleanup (less text, calculations behind disclosure).
- **Phase F — Missing-data / completeness indicators.** Surface "Not enough data" and the partial-data qualifier consistently across property and portfolio views; likely also the point at which Tax Center readiness signals (already built) get a property-performance-flavored twin.

**Later, separate milestones** (not sequenced here): Tax Center V2 visual redesign, Smart Upload structured data, historical trend snapshots (Section 14), PropWatch financial intelligence (Section 15).
