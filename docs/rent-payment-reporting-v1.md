# Bank-free rent reports and receipts

Tenants use Rent > I paid to report the month, amount, date and method. An optional confirmation photo/PDF is private, limited to 8 MB, and stored in rent-payment-evidence. A report is not a payment and never enters rent or tax totals until the owner confirms receipt.

Owners see pending reports on the dashboard, property Rent tab and Rent Ledger. Confirm received atomically creates a rent_payments row and, by default, its linked Income/Rent transaction. Uncheck the income option if that income was already logged. Dismiss reports that were already recorded or were not received. The confirmation locks the report and lease and returns the same payment ID on retries.

Confirmation prepares a receipt in the tenant portal. The optional email checkbox sends it only on the owner's explicit action. Receipt buttons in payment history support sharing/copying and emailing. Manual rent recording also prepares a receipt. Email uses the lease recipient, not a caller-supplied email, and a stable provider idempotency key. Delivery errors do not undo or retry the payment. Email requires the existing Resend configuration. No bank credentials, account linking or money transfers are introduced.

Receipts identify the amount received, period, method and payment ID. They do not claim a balance is paid in full. Deleting a payment removes its receipt. A confirmed report whose payment was deleted is labeled Payment record removed.

Report and receipt tables have RLS. Only the reporting active tenant or property owner reads a report. Only the owner confirms. Tenants cannot change amount, method, lease or report status after submitting. Receipt snapshots are generated from confirmed payments. No public receipt links. Evidence links expire after 60 seconds. No service-role client is used by this workflow.

UI refreshes reports on entry, foreground return, Refresh, and once per minute while visible. Existing rent calculations remain the source of balance and paid/partial/overdue states.

## Verification

- Focused tests cover amounts, evidence limits, local dates, partial-payment receipt wording, auth/owner authorization, server-chosen recipient, email idempotency key and existing rent-ledger/notification behavior.
- supabase/tests/rent-payment-reports-v1.test.sql uses fictional users and data within ROLLBACK. Confirms tenant isolation, rejected tenant confirmation/status forgery, pending duplicate protection, one payment/income on retries, receipt visibility and revoked access.
- No real tenant email sent during verification. Physical iPhone attachment picking, receipt sharing and mailbox delivery need device acceptance checks.
- Supabase advisors report no new security findings for these objects. Existing tenant-view/legacy-function/password-protection findings remain outside this change.
