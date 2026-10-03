# Agriculture Supabase schema before API implementation

The pasted vertical-slice plan is the implementation order. This repository already
has a consumer marketplace schema; the agriculture procurement flow uses separate
tables so retail seller IDs, listings, orders, payments and inventory keep their
current meaning.

## Current baseline

| Plan object | Repository object | Decision |
| --- | --- | --- |
| `businesses`, `business_memberships` | Existing tables in `20261002000100` | Reuse them. Business kinds are `farmer`, `sme`, `warehouse`; the current self-registration API accepts only farmer and SME. Warehouse creation needs an authorized onboarding path in its own slice. |
| `business_applications` | New read-only view over `businesses` | `businesses.status` is the application state of record. `business_audit_events` records transitions. A second writable application table would allow statuses to diverge. |
| `agricultural_products`, `product_categories`, `product_category_memberships` | Existing tables through `20261002000200` | Reuse one product ID per crop. Seeded active crops are coffee, maize and coconut. Maize belongs to both CASH and FOOD. |
| `business_product_preferences`, `business_category_preferences` | Existing tables through `20261002000200` | Reuse these for farmer and SME crop selections. |
| `audit_events`, `business_audit_events`, `business_operations` | Existing tables | Reuse existing audit and business onboarding operation records. New procurement status history starts with the purchase order. |

## Added for milestone 1

Migration `20261002000300_agriculture_procurement_foundation.sql` adds:

| Slice | Tables and objects |
| --- | --- |
| Farmer listing | `farmer_listings`, `farmer_listing_photos`, private `farmer-listing-photos` storage bucket |
| Warehouse review | `listing_reviews`, `listing_information_requests` |
| Grade-priced offer | `procurement_offers`, `procurement_offer_grade_prices` |
| Accepted purchase order | `purchase_orders`, `purchase_order_lines`, `purchase_order_grade_prices`, `purchase_order_status_history`, `create_purchase_order_from_offer` |

All quantities and grade prices in this milestone use kilograms and UGX per
kilogram. The offer must have A, B and C prices before submission. An accepted
offer can produce one purchase order. The database function locks the offer,
checks the approved warehouse membership, copies quantity, product and all grade
prices into the purchase order, and returns the same order for a repeated
operation ID. Purchase order line and grade snapshots cannot be updated or
deleted. Later amendments need separate audited records.

All new tables have RLS enabled and no `anon` or `authenticated` table grants.
The private photo bucket has no direct client upload policy. The API must derive
the actor from a verified Supabase token, authorize each business read and
mutation, and issue scoped signed photo URLs. A service-role connection bypasses
RLS, so it must never infer authorization merely from the ability to query a row.

## Later slices

The plan's receiving, inventory, payables, SME wholesale, payments, dispatch,
processing, retail conversion, reporting and worker tables are deliberately
deferred until their business transitions and transaction boundaries are
designed and tested. In particular, receipt posting and lot reservation must be
database transactions, and the existing consumer `inventory_reservations` and
`payment_attempts` must not be repurposed for wholesale stock or finance.

## Deployment dependency

The linked hosted Supabase project does **not** match the repository's migration
history or several existing object definitions. See
[hosted-schema-reconciliation.md](hosted-schema-reconciliation.md). The new
migration applied and passed its rollback-only SQL assertions locally; it has
not been pushed to hosted Supabase. Before a hosted deployment, take a restorable
backup, reconcile the existing hosted schema on an isolated copy, establish
accurate migration history, then apply this migration and run the SQL assertions
against staging. Do not mark old migrations as applied merely to unblock this
one.

Local validation:

```sh
pnpm exec supabase migration up --local
psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
  -X -v ON_ERROR_STOP=1 \
  -f supabase/tests/agriculture_procurement_foundation.sql
pnpm --filter @sokoni-digital/database-types typecheck
pnpm --filter @sokoni-digital/api typecheck
```
