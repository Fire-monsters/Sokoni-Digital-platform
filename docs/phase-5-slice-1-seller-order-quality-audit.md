# Phase 5 Slice 1 — seller-order and quality audit

Audited on 2026-08-10 against the checked-in migrations, generated database types,
API modules, jobs, and mobile applications.

## Outcome

The Phase 3 and Phase 4 work provides the paid seller-order allocation that Phase 5
can extend. A checkout creates one `vendor_orders` row per seller and immutable
`vendor_order_items` snapshots. A successful Pesapal payment or a market-pickup
selection changes the seller order from `awaiting_payment` to `confirmed`.

No fulfilment state machine or quality-proof implementation exists yet. In
particular, the database cannot currently represent or enforce the Phase 5 rule
that an order needs a valid private packing image before it becomes
`quality_verified` or `ready_for_pickup`.

## Step-by-step audit process

1. Read the Phase 5 brief and treated the migrations in `supabase/migrations` as
   the authoritative schema history.
2. Traced `vendor_orders` from checkout creation through payment success,
   market-pickup selection, payment failure, and reservation expiry.
3. Searched migrations, generated database types, API code, tests, and mobile
   code for seller-order history, quality tables, transition functions, and
   Phase 5 statuses.
4. Inspected every checked-in Storage bucket and `storage.objects` policy, then
   traced the existing listing-image signed-upload flow as a reusable pattern.
5. Inspected the notifications module, messaging infrastructure boundary, retry
   job, server scheduler wiring, database schema, and notification-related
   configuration.
6. Compared the live names and behavior with the Phase 5 transition and packing
   proof requirements.
7. Recorded reusable foundations, missing controls, and the migration order that
   should be used by the next slice.

## Existing implementation matrix

| Concern                   | What exists                                                                                                                               | Phase 5 assessment                                                                                                                                         |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vendor_orders`           | Created in `20260808000600_checkout_idempotency_reservations.sql`; one row per checkout and seller.                                       | Reuse and extend in place.                                                                                                                                 |
| Seller-order statuses     | `awaiting_payment`, `confirmed`, `expired`, `cancelled`.                                                                                  | `confirmed` currently means the paid/allocated order is actionable. It does not express vendor acceptance and must be migrated to the Phase 5 entry state. |
| Status history            | `checkout_status_history` records checkout-level changes only.                                                                            | Do not reuse it for seller-order transitions. Add seller-order-specific history.                                                                           |
| `quality_checks`          | Absent from migrations and generated types.                                                                                               | Create it before enforcing quality verification.                                                                                                           |
| `quality_check_images`    | Absent from migrations and generated types.                                                                                               | Create it and associate images with a quality check and seller order.                                                                                      |
| Storage                   | A public `listing-images` bucket with a public read policy is the only application image bucket.                                          | Add a separate private `quality-check-images` bucket. Never reuse the public listing bucket.                                                               |
| `transition_vendor_order` | Absent from migrations, generated RPC types, and API calls.                                                                               | Add one service-role-only transactional RPC as the authoritative write path.                                                                               |
| Vendor order API          | `apps/api/src/modules/orders/index.ts` is empty. No vendor queue, detail, or transition route is mounted.                                 | Implement in Slice 3 after the database state machine exists.                                                                                              |
| Quality API               | `apps/api/src/modules/quality/index.ts` is empty.                                                                                         | Implement upload and verification after the quality schema exists.                                                                                         |
| Notifications             | The notifications module and messaging infrastructure files are empty; `retryNotifications` is a no-op and is not started by `server.ts`. | Add outbox/event, delivery, provider, scheduler, and retry behavior in Slice 8.                                                                            |

## `vendor_orders` today

The table currently contains:

| Column                     | Current behavior                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------- |
| `id`                       | UUID primary key generated in PostgreSQL.                                           |
| `reference`                | Unique seller-order reference generated as `EK-S-...`.                              |
| `checkout_id`              | Required foreign key to `customer_checkouts`, cascading on checkout deletion.       |
| `seller_id`                | Required foreign key to `sellers`. A checkout may have only one order for a seller. |
| `status`                   | `vendor_order_status`, defaulting to `awaiting_payment`.                            |
| `subtotal_ugx`             | Positive immutable seller subtotal snapshot.                                        |
| `commission_ugx`           | Non-negative commission amount, currently defaulting to zero.                       |
| `created_at`, `updated_at` | Database timestamps; `updated_at` is maintained by a trigger.                       |

The only index dedicated to the table is
`vendor_orders_checkout_idx (checkout_id, seller_id)`. The unique constraint on
`reference` and the unique `(checkout_id, seller_id)` constraint also create
indexes.

Phase 5 fields are absent:

- no optimistic-lock `version`;
- no accepted, preparation, quality, or ready timestamps;
- no response deadline;
- no operation identifier;
- no actor or transition metadata.

### Current creation and mutation paths

`create_checkout_from_cart` creates each seller order as `awaiting_payment` and
creates its item snapshots and inventory reservations in the same transaction.

The following functions mutate seller-order status directly:

| Function                               | Current seller-order mutation                                                                                         |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `process_payment_result`               | `awaiting_payment -> confirmed` on successful Pesapal payment; `awaiting_payment -> cancelled` on definitive failure. |
| `create_market_pickup_payment_attempt` | `awaiting_payment -> confirmed` after inventory is committed for pay-at-pickup.                                       |
| `expire_inventory_reservations`        | `awaiting_payment -> expired` when the final active reservation expires.                                              |

These functions do not call a shared seller-order transition function and do not
write seller-order history. Their payment and expiry mutations should remain
separate from vendor-owned fulfilment transitions, but the entry status emitted
on successful allocation must be changed from `confirmed` to
`awaiting_vendor_acceptance` when the Phase 5 enum is introduced.

### Existing read path

`CheckoutRepository.get` reads seller orders and item snapshots for an
authenticated consumer after first resolving a checkout owned by that consumer.
It exposes seller-group status in the checkout response. This is a useful base
for the later consumer progress read model, but it provides neither timeline nor
quality-check data.

There is no vendor-owned order read path in the API or vendor mobile app.

## Status history and audit

`checkout_status_history` has `checkout_id`, checkout-level `from_status` and
`to_status`, an optional reason, and `created_at`. Payment and expiry functions
write to it only when the parent checkout changes.

It is not suitable for Phase 5 because:

- it cannot identify a `vendor_order` in a multi-seller checkout;
- its status columns use `checkout_status`, not `vendor_order_status`;
- it has no actor, operation ID, version, request ID, or structured metadata;
- a seller order can advance independently while its checkout status remains
  unchanged.

`catalogue_audit_events` and `payment_audit_events` are domain-specific and
should not be overloaded. Phase 5 therefore needs both append-only
`vendor_order_status_history` and fulfilment/quality audit events (or a carefully
named seller-order audit table) written by the authoritative database workflow.

## Quality schema

Neither `quality_checks` nor `quality_check_images` exists. There are also no
quality enums, foreign keys, indexes, constraints, triggers, RLS policies, grants,
generated types, repository methods, routes, domain models, validation schemas,
or tests.

Consequently, there is currently no representation of:

- a draft/completed/invalidated check;
- the seller order and seller that own a check;
- who packed or verified an order;
- original and thumbnail object paths;
- MIME type, dimensions, byte size, packing-proof designation, or upload state;
- a minimum one-image or maximum three-image rule;
- invalidation or deletion semantics that can block a transition.

## Storage and image-upload support

The only bucket created by migrations is `listing-images`. It is explicitly
public, permits JPEG and WebP, limits each object to 500,000 bytes, and has a
public `storage.objects` select policy. It must not hold private packing proof.

There is no `quality-check-images` bucket and no quality-image read or write
policy. There is no signed quality-image read endpoint.

The existing listing image service is a useful implementation pattern:

1. Resolve the authenticated seller and listing ownership.
2. Generate seller/listing/image-scoped original and thumbnail paths.
3. Issue signed upload tokens from the backend.
4. Verify both returned paths and confirm both objects exist.
5. Insert metadata only after verification.

For Phase 5, this pattern must be adapted to a private bucket and an ownership
path of `{seller_id}/{vendor_order_id}/{quality_check_id}/{image_id}/...`.
Unlike listing images, reads must use short-lived signed URLs and never
`getPublicUrl`.

## RLS and authorization boundary

RLS is enabled on `vendor_orders`, `vendor_order_items`, inventory reservations,
checkout fulfilments, and checkout history. No direct client policy or table
grant exists for `vendor_orders` or its items. The service-role API is therefore
the current access boundary.

This is a safe starting posture, but Phase 5 still needs explicit backend checks:

- vendor actor -> `seller_accounts.user_id` -> owned `seller_id`;
- consumer actor -> owned checkout -> requested seller order;
- admin access through a separately authorized path;
- no rider packing-photo access in Phase 5.

The existing `owns_seller(uuid)` helper can support seller ownership checks, but
the transition RPC should resolve and lock the order itself and must not trust a
client-supplied `seller_id`, consumer ID, current status, or actor role.

## `transition_vendor_order`

No function with this name or equivalent seller fulfilment behavior exists.
Seller-order mutations currently use direct `UPDATE` statements in payment and
expiry functions. No database code currently provides:

- an explicit fulfilment transition map;
- row locking and expected-version comparison;
- operation-ID idempotency;
- packing-image and completed-check invariants;
- seller ownership validation;
- atomic seller-order history, audit, and notification-event writes.

The generic `idempotency_records` implementation can protect an HTTP operation,
but it is not a substitute for a unique database operation ID inside the
seller-order transition transaction.

## Notifications support

There is no order-notification implementation:

- no `notification_events`, `notification_deliveries`, device-token, or channel
  preference tables;
- no repository, service, adapter, API, or worker;
- `apps/api/src/modules/notifications/index.ts` is an empty boundary;
- `apps/api/src/infrastructure/messaging/index.ts` is an empty boundary;
- `apps/api/src/jobs/retry-notifications.ts` only awaits a resolved promise;
- `apps/api/src/server.ts` starts payment reconciliation only.

Supabase Auth SMS configuration and the Pesapal `IPNCHANGE` callback are not
marketplace notification support. The former sends authentication OTPs; the
latter is an inbound payment-provider notification.

## Gaps against the Phase 5 hard rule

Today any service-role code can update a seller order to any value already in the
enum. The desired Phase 5 values do not exist, and no valid packing proof can be
stored or checked. The hard rule is therefore entirely unimplemented.

The next migration must make this invariant database-authoritative. UI gating,
API validation, and TypeScript transition maps are defense-in-depth only.

## Slice 2 implementation hand-off

Implement the database foundation in this dependency order:

1. Expand `vendor_order_status` with `awaiting_vendor_acceptance`, `accepted`,
   `preparing`, `quality_verified`, `ready_for_pickup`, and `issue_reported`.
2. Update existing `confirmed` rows and every successful payment/allocation path
   to use `awaiting_vendor_acceptance`; decide whether to retain legacy
   `confirmed` temporarily because PostgreSQL enum values cannot be removed
   cheaply.
3. Add `vendor_orders.version` with a positive/default invariant.
4. Create the quality-check status/upload enums, `quality_checks`, and
   `quality_check_images`, including seller-order ownership consistency,
   image-count enforcement, and indexes for the transition proof lookup.
5. Create append-only seller-order history and audit/operation records. Make
   operation IDs unique within an unambiguous actor/order scope.
6. Implement `transition_vendor_order` as `SECURITY DEFINER`, lock the order,
   resolve actor ownership, compare `expectedVersion`, validate the transition,
   and enforce a completed check plus a ready packing proof for
   `preparing -> quality_verified`.
7. Increment the version and atomically insert history, audit, and a future-safe
   notification outbox event. Do not perform external delivery in the
   transaction.
8. Revoke public execution and grant the RPC only to `service_role`.
9. Add pgTAP coverage for valid transitions, forbidden jumps, ownership,
   version conflicts, operation replay, missing/invalid proof, history, and
   notification-event uniqueness.
10. Regenerate `packages/database-types/src/database.types.ts` from the migrated
    local database.

The private bucket and signed upload/read policies belong to Slice 4. Slice 2 can
still enforce the proof invariant against image metadata by requiring only rows
whose upload status is `ready`; until Slice 4 can produce such metadata through
the authorized workflow, quality verification must remain unreachable.

## Slice 1 acceptance check

- Existing seller-order creation and all current status mutation paths are
  identified.
- Checkout history is explicitly distinguished from missing seller-order
  history.
- Both requested quality tables are confirmed absent.
- All current application Storage buckets and policies are accounted for.
- The requested transition RPC is confirmed absent.
- Notification placeholders are distinguished from working notification
  support.
- Slice 2 has an ordered, implementation-ready hand-off without introducing a
  UI-only quality invariant.
