# Phase 6 Slice 1 — delivery-schema audit

Audited on 2026-08-11 against the Phase 6 brief, all checked-in migrations,
generated database types, Git history and reachable refs, API modules and jobs,
and the consumer, rider, and operations applications.

## Outcome

The repository does not currently implement the Phase 6 delivery domain. Of the
objects named by Slice 1, only `delivery_zones` exists. There is no `deliveries`,
`delivery_status_history`, `delivery_offers`, or `transporter_profiles` table,
and there is no nearby-offer or offer-acceptance RPC.

The existing checkout schema provides useful delivery intent: a checkout can
select an active market delivery zone and snapshot its zone, address, phone, and
schedule in `checkout_fulfilments`. Phase 5 also provides the
`ready_for_pickup` seller-order boundary. It does not turn that intent into a
physical delivery, group seller orders, assign a rider, track custody, or prove
completion.

No checked-in **Migration 003** exists. The migration directory starts at
`20260806000400_catalogue_listings_storage.sql`, and Migration 003 is absent from
the full Git history, current refs, generated types, and recoverable unreachable
blobs. Consequently, no Phase 6 behavior can safely be attributed to Migration
003 from this repository. If a separate deployed Supabase database contains an
uncommitted Migration 003, its SQL must be retrieved and reconciled before a
production rollout; it is not part of the reproducible schema.

## Audit process

1. Treated `supabase/migrations` as the authoritative reproducible schema.
2. Searched every migration and generated table/RPC/enum definition for delivery,
   offer, transporter, rider-location, and acceptance objects.
3. Inspected the checkout delivery-zone and fulfilment creation transaction.
4. Traced Phase 5's `ready_for_pickup` state and current consumer progress reads.
5. Inspected the delivery API boundary, rider-offer expiry job, app router, rider
   mobile application, and operations web application.
6. Searched all Git commits, branches, refs, and recoverable unreachable blobs
   for Migration 003 and the delivery object names.

## Existing implementation matrix

| Concern                   | What exists                                                                                           | Phase 6 assessment                                                                                                      |
| ------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `deliveries`              | Absent from migrations and generated types.                                                           | Create after the grouping decision is made. There is currently no assignment row or concurrency lock target.            |
| `delivery_status_history` | Absent. Checkout and vendor-order histories are separate domain histories.                            | Create an append-only delivery history; do not overload either existing history table.                                  |
| `delivery_offers`         | Absent.                                                                                               | Create pending/accepted/rejected/expired/withdrawn offers with authoritative expiry and partial indexes.                |
| `transporter_profiles`    | Absent. Phase 1 rider onboarding endpoints return placeholder data only.                              | Add a real rider/transporter account boundary before availability, eligibility, or assignment can be enforced.          |
| Delivery zones            | `delivery_zones` exists with market, name, fee, active flag, timestamps, RLS, and public read access. | Reuse. Add a market/active lookup index if candidate workloads justify it; current table has no dedicated lookup index. |
| Checkout delivery intent  | `checkout_fulfilments` snapshots delivery zone, address, phone, and schedule for a checkout.          | Reuse as the source for a delivery group, but avoid exposing its sensitive fields before assignment.                    |
| Dispatch readiness        | Vendor orders can reach `ready_for_pickup` through the Phase 5 state machine.                         | Reuse as the prerequisite. No trigger or service currently creates a dispatchable delivery/group.                       |
| Nearby-offer RPC          | Absent from migrations and generated RPC types.                                                       | Implement only after rider availability/current location and delivery locking exist.                                    |
| Offer-acceptance RPC      | Absent from migrations and generated RPC types.                                                       | Implement as one row-locking transaction. The exit criterion is currently unenforced.                                   |
| Offer expiry              | `apps/api/src/jobs/expire-rider-offers.ts` is a no-op. No database expiry function or cron exists.    | Implement authoritative database expiry plus opportunistic expiry on reads/acceptance.                                  |
| Delivery API              | `apps/api/src/modules/delivery/index.ts` only exports an empty module and is not mounted in `app.ts`. | Build after the database contracts exist.                                                                               |
| Rider UI                  | The rider home screen contains informational placeholder cards.                                       | No availability, location, offer, cached assignment, map, or transition workflow exists.                                |
| Consumer tracking         | Consumer order progress stops at seller-order fulfilment statuses.                                    | No assigned rider, package custody, map position, arrival, or delivery evidence is available.                           |
| Dispatcher UI             | Operations web has no delivery assignment/exception workflow.                                         | Implement after the delivery state machine and audited dispatcher RPCs.                                                 |

## What the current delivery-zone schema does

`delivery_zones` was introduced by
`20260808000600_checkout_idempotency_reservations.sql`, not Migration 003. It
contains:

- `id`, `market_id`, `name`, and `delivery_fee_ugx`;
- `is_active` and maintained `created_at`/`updated_at` timestamps;
- a foreign key to `markets`;
- public `SELECT` access for anonymous and authenticated catalogue/checkout use.

During `create_checkout_from_cart`, PostgreSQL verifies that the selected zone
is active and belongs to the cart's market. It then snapshots the zone name and
consumer destination/contact data in `checkout_fulfilments`. This is pricing and
fulfilment intent, not a delivery job.

Important limitations for Phase 6:

- zones contain no geometry, centroid, radius, polygon, or Google place ID;
- consumer addresses contain only a label, summary, and phone number—no latitude
  or longitude;
- markets likewise have no pickup coordinates;
- there is no link from a checkout/vendor order to a physical delivery record;
- the address snapshot is sensitive and must not be included in pre-acceptance
  offers.

## Migration 003 finding

The repository contains migration filenames `004` through `013`, with two
different migrations currently using sequence `005`. It contains no `001`,
`002`, or `003` file. The first schema migration was added in the Phase 2 commit;
the earlier Phase 1 commit implemented placeholder APIs and screens but did not
add its expected onboarding schema.

The generated database types agree with the checked-in migrations: they contain
`delivery_zones` and `checkout_fulfilments`, but none of the audited delivery,
offer, transporter, or rider-location structures or RPCs.

Therefore:

1. Migration 003 implements **nothing verifiable in this codebase**.
2. A fresh local database cannot reproduce any supposed Migration 003 behavior.
3. Slice 2 must not assume transporter identity, delivery jobs, offers, or
   acceptance already exist.
4. If “Migration 003” refers to a remote-only migration, retrieve its exact SQL
   and add a reconciled baseline migration before proceeding beyond local
   development.

## Schema decisions required before Slice 2

### 1. Use delivery groups now

Adopt `delivery_groups` plus `delivery_group_orders`, with one `deliveries` row
for the active physical trip. This matches the Phase 6 brief and prevents the
schema from hard-coding one rider trip per vendor in a multi-vendor checkout.
The first implementation may still create one group/order mapping at a time.

Recommended ownership chain:

```text
customer_checkouts
  -> delivery_groups
      -> delivery_group_orders -> vendor_orders
      -> deliveries
          -> delivery_offers
          -> delivery_status_history
```

### 2. Establish transporter identity explicitly

Do not attach delivery foreign keys directly to an arbitrary `auth.users` row.
Create a transporter/rider profile with an account owner relation, approval and
operational eligibility, then reference the profile ID consistently from
locations, offers, assignments, histories, and proofs.

Phase 1 onboarding is not database-backed, so Phase 6 must either implement the
minimum approved transporter profile/account model or first complete the missing
onboarding persistence. Availability cannot substitute for account approval or
suspension.

### 3. Separate availability from current location

Store availability on the transporter operational profile and current coarse
position in `transporter_locations_current`. Keep server `received_at` separate
from client `captured_at`. Nearby matching should require `available` and a
non-stale location. Optional delivery location events can provide an auditable,
low-frequency trail for customer tracking without continuous GPS ingestion.

### 4. Add coordinates needed by the map workflow

Google Maps can render and route only after the system has coordinates. Add a
pickup coordinate to the market (or a market-location table) and a consumer
delivery coordinate/address snapshot to the delivery group. Keep the existing
text summary for offline fallback. Google Maps should be a presentation/routing
provider; PostgreSQL remains authoritative for rider assignment, delivery
status, and coarse last-known position.

### 5. Make assignment uniqueness database-authoritative

`accept_delivery_offer` must lock the offer and delivery, validate ownership and
expiry, assign exactly one transporter, accept the selected offer, withdraw all
competitors, update rider availability, and append history/audit records in one
transaction. Client reads, API-only checks, or a unique constraint alone do not
provide the complete required behavior.

## Slice 2 hand-off

Implement the next database foundation in this order:

1. Add canonical delivery and exception enums plus a shared domain transition
   map.
2. Add `delivery_groups` and `delivery_group_orders`, with constraints tying all
   orders to the intended checkout/consumer/market/zone.
3. Add `deliveries` with `version`, one assigned transporter field, timestamps,
   fee snapshot, and a clear active-trip uniqueness rule.
4. Add append-only `delivery_status_history`, operation-id idempotency, audit
   events, and an authoritative `transition_delivery` RPC.
5. Add database tests for every allowed/forbidden transition, stale expected
   versions, idempotent replay, ownership, and terminal-state behavior.
6. Leave offers and acceptance for Slices 4–5, but choose keys and status names
   now so those migrations can lock `deliveries` without reshaping it.

Proof-of-delivery remains a later slice, but the `delivered` transition must be
designed from the start so it can be gated by valid evidence and consumer
confirmation rather than exposed as a generic status update.
