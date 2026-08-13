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
