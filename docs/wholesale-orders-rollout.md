# SME wholesale purchasing rollout

The SME purchase flow and Agro-Warehouse Buyer orders, Wholesale catalogue and
Finance views share the `wholesale_*` tables. This flow is separate from farmer
procurement `purchase_orders` and consumer marketplace orders. SME-to-warehouse
selling, dispatch and SME inventory receipt are outside this release.

## Current state (2026-10-03)

- Local Supabase has the agriculture and wholesale migrations installed. The
  rollback-only `supabase/tests/wholesale_orders.sql` verifies membership,
  price snapshots, order replay, stock commitment, insufficient stock, decline,
  cancellation, invoices and partial/full verified payments.
- The linked hosted database has conflicting schema and migration history; see
  [hosted-schema-reconciliation.md](hosted-schema-reconciliation.md). No wholesale
  or agriculture migration has been applied there.
- Read-only hosted **public schema and data** exports were saved at
  `/private/tmp/sokoni-hosted-pre-wholesale-20261003.sql` and
  `/private/tmp/sokoni-hosted-data-pre-wholesale-20261003.sql` (mode 600). Both
  restored with `ON_ERROR_STOP=1` to a fresh database in the local Supabase
  PostgreSQL 17.6 image. These exports do **not** include Auth users, Storage
  objects or a full project backup. Obtain and restore-test those separately
  before changing production.
- The production UI is gated by `VITE_WHOLESALE_ENABLED=true` in SME Dashboard
  and `NEXT_PUBLIC_WHOLESALE_ENABLED=true` in Agro-Warehouse. The default is off.

## Hosted sequence

1. Create a full hosted backup covering `auth`, `storage`, `public`, roles and
   existing data. Verify recovery in an isolated Supabase project. Preserve the
   existing hosted users and their identifiers.
2. Reconcile the hosted schema against repository migrations on that copy.
   Existing `listing_status`, `listings`, `sellers`, `markets` and migration
   history conflict with the repository. Build explicit data-preserving repair
   migrations; do not bulk-mark migrations as applied.
3. Apply `20261002000300_agriculture_procurement_foundation.sql` and
   `20261003000100_wholesale_orders.sql` to staging. Confirm the private
   `wholesale-invoices` bucket and service-role-only function/table grants.
4. Run the SQL test on staging inside a transaction. Then test real approved
   SME and warehouse memberships, staff with `wholesale.payments.verify`,
   cross-business denial, invoice PDF download and retries, concurrent
   confirmations, and external payment references. Never create a payment as a
   substitute for provider verification.
5. Deploy API and both dashboards with the flags off. Configure the SME API
   origin; configure Agro-Warehouse API origin, Supabase URL and publishable key.
   Provision a verified warehouse owner using `pnpm --filter @sokoni-digital/api
   warehouse:provision -- --admin-user-id=<uuid> --owner-user-id=<uuid>
   --name=<name> --location=<place>`. The owner signs in with a verified phone
   account. Finance staff sign in separately by email and need an active staff
   record with the dedicated permission.
6. Publish an offer for an active canonical crop. Confirm an SME submission
   appears only in the intended warehouse. Verify frozen prices, quantity
   commitment, PDF, partial payment and balance. Repeat this on production
   after the reconciled migration; then turn both flags on.

The invoice PDF is generated on first authorized download from frozen invoice
rows. Its private object is retrieved through a 120-second signed URL. A failed
generation is marked retryable and does not create another invoice.
