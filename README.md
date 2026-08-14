# PropRoster — Milestone 5

PropRoster is a private property organization workspace for photos, documents, finances, leases, maintenance, mortgage and insurance records.

## What Milestone 5 includes

Everything from Milestones 3–4, plus four persistent property-record modules:

- **Lease:** tenant name/email, monthly rent, security deposit, start/end dates, status, notes and signed-lease attachment.
- **Mortgage:** lender, loan number, original/current balance, interest rate, monthly payment, escrow, term, maturity and loan-document attachment. Saving a mortgage also syncs the property's displayed mortgage balance.
- **Insurance:** carrier, policy number, annual premium, deductible, effective/expiration dates and policy attachment, with a renew-soon/expired indicator.
- **Maintenance:** service date, status, category, vendor, description, cost and receipt/invoice attachment.
- Maintenance can create a linked **Financials** expense automatically so the repair cost is entered once.
- Removing a linked maintenance record also removes the financial transaction created by that record.
- The property Overview now shows the real maintenance-record count.

## 1. Supabase setup

Create `.env.local` in the project root:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
```

Do not put a Supabase service-role/secret key in this frontend project.

## 2. Database setup

### Fresh PropRoster project

Run the entire file in Supabase SQL Editor:

```text
supabase/schema.sql
```

It creates the complete schema through Milestone 5.

### Upgrading from Milestone 4

Keep your current data and run only:

```text
supabase/milestone-5-property-records.sql
```

This adds:

- `leases`
- `mortgages`
- `insurance_policies`
- `maintenance_records`
- per-user RLS policies and indexes for each new table

## 3. Run PropRoster

```bash
npm install
npm run dev
```

Open `http://localhost:3000`, sign in, select a property, and use the Lease, Maintenance, Mortgage and Insurance tabs.

## Existing persistent features

- Supabase email/password authentication
- Per-user Row Level Security
- Persistent properties
- Private document storage and category filing
- Private photo storage, gallery and cover photos
- Short-lived signed file URLs
- Spreadsheet-style Financials ledger
- CSV financial import/export
- Receipt/document links on financial transactions
- YTD income, expenses, NOI and cash-flow summaries

## Security model

The frontend uses only the public publishable/anon key. Supabase Auth + Postgres RLS protect rows. Property files remain in private Storage buckets and file paths are scoped to the authenticated user's UUID.

## Suggested next milestone

Milestone 6 should focus on portfolio intelligence and SaaS readiness: upcoming lease/insurance deadlines, maintenance reminders, dashboard alerts, recurring obligations, multi-property reports, subscription tiers and account/organization structure.

## Privacy (Milestone 11: Admin Analytics)

**Customer portfolio contents are private by default and are not exposed in
PropRoster's admin analytics.** Property addresses, property values,
mortgages, leases, tenants, private documents, financial transactions,
maintenance details, insurance details, and Tenant Connect messages are
never readable through the internal `/admin` analytics page or its
supporting API (`/api/admin/analytics`) — that surface returns only
platform-level aggregates (counts, sums, averages) needed to operate the
SaaS business: user growth, subscription mix, feature adoption, AI usage
and estimated cost, and basic platform activity. It is intentionally not a
customer-support or portfolio-browsing tool — there is no "view user
portfolio" action, no document viewer, no tenant-message viewer, and no
impersonation of any kind.

Accurate language, not overclaiming:

- Access to admin analytics is **restricted by authorization** — a
  server/database-controlled `admin_roles` table, checked on every request
  via a `SECURITY DEFINER` `is_admin()` function — never a client-supplied
  flag, an email domain, or the internal `owner` subscription entitlement
  (which is a separate, purely billing concept and never implies admin
  access on its own). Normal users have no path to grant themselves this
  role.
- **Portfolio data is not exposed in admin analytics** — every aggregate
  RPC behind `/admin` re-authorizes its own caller and returns only
  pre-aggregated numbers, never a raw customer row.
- **Aggregate usage analytics may be collected to operate and improve the
  service** — platform-level metrics (not individual customer data) help
  PropRoster staff run the business responsibly.
- Every admin action that views this data is recorded in an append-only
  `admin_audit_events` log (who, what, when — never portfolio contents),
  itself only readable by other admins.

See `supabase/milestone-11-admin-analytics.sql` for the full database
design and `lib/admin/` for the aggregation logic.
