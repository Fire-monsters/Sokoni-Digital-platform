# Phase 5 Slices 2–3 — state machine and vendor order API

Implemented on 2026-08-10 after the Slice 1 audit.

## Outcome

Seller fulfilment status is now controlled by a versioned, idempotent PostgreSQL
transition function. The function verifies approved seller ownership, applies an
explicit transition map, enforces packing proof for `quality_verified`, and
writes operation, history, and audit records in the same transaction.

Approved vendors can now list their actionable seller orders, filter the queue,
page through it with an opaque stable cursor, read order detail, and request a
transition through the Express API.

## Step-by-step implementation process

### 1. Commit the fulfilment statuses

Migration `20260810001000_vendor_order_fulfilment_statuses.sql` adds:

- `awaiting_vendor_acceptance`
- `accepted`
- `preparing`
- `quality_verified`
- `ready_for_pickup`
- `issue_reported`

The enum additions are isolated in their own migration so PostgreSQL commits the
new values before a subsequent migration uses them in functions and constraints.

The legacy `confirmed` value remains in the enum for compatibility with the
existing payment RPCs. A database trigger converts every new `confirmed` write
to `awaiting_vendor_acceptance`, and existing rows are migrated. It is therefore
not a vendor-facing state and the vendor API excludes it.

### 2. Add optimistic versioning

`vendor_orders.version` starts at `1` and must remain positive. Every applied
vendor transition increments it once. The client sends its last observed value
as `expectedVersion`; a mismatch raises SQLSTATE `40001` and becomes HTTP `409`.

### 3. Add quality metadata required by the invariant

The migration creates:

- `quality_checks`, one per seller order;
- `quality_check_images`, up to three active images per check;
- `quality_check_status`: `draft`, `completed`, `invalidated`;
- `quality_image_upload_status`: `pending`, `ready`, `invalidated`.

Composite foreign keys ensure the seller and seller order on a check agree, and
the check and seller order on an image agree. A partial unique index permits one
active authoritative packing proof per check. The transition lookup has a
partial index for ready packing proof.

These tables are service-only and RLS-enabled. Slice 4 will add the private
bucket and the authorized upload/finalization workflow that produces ready image
metadata.

### 4. Persist transition identity, history, and audit

The migration adds:

- `vendor_order_operations` for globally unique operation IDs and replayed
  results;
- `vendor_order_status_history` for the ordered seller-order timeline;
- `vendor_order_audit_events` for actor, action, before/after state, operation,
  and version evidence.

An identical operation replay returns the original result with
`duplicate: true`. Reusing the UUID with different order, actor, transition, or
expected version is rejected.

### 5. Make `transition_vendor_order` authoritative

The service-role-only RPC performs:

```text
Validate target status
→ Lock seller-order row
→ Verify the approved vendor owns it
→ Return an identical stored operation replay
→ Compare expected version
→ Check the explicit transition map
→ Check quality proof when required
→ Store operation result
→ Update status and version
→ Insert history
→ Insert audit event
→ Return the result
```

The enforced map is:

```text
awaiting_vendor_acceptance → accepted | cancelled
accepted                  → preparing | cancelled
preparing                 → quality_verified | issue_reported
quality_verified          → ready_for_pickup
ready_for_pickup          → terminal
cancelled                 → terminal
issue_reported            → terminal
```

For `preparing -> quality_verified`, the same transaction requires:

```text
quality check belongs to this seller order and seller
AND quality check status = completed
AND associated image upload status = ready
AND image is the packing proof
```

Otherwise the database raises `PACKING_IMAGE_REQUIRED`.

### 6. Add shared domain and validation contracts

`packages/domain/src/vendor-order.ts` provides:

- the single TypeScript transition map;
- fulfilment status and transition-target constants;
- queue, detail, item, fulfilment, quality, timeline, and transition DTOs.

`packages/validation/src/vendor-order.ts` validates:

- UUID order parameters;
- one or comma-separated status filters;
- an opaque cursor and limit from 1 to 50;
- `toStatus`, positive `expectedVersion`, and UUID `operationId`.

The TypeScript map is useful to clients and UI code. PostgreSQL independently
enforces the same rules and remains authoritative.

### 7. Implement the vendor queue

Endpoint:

```http
GET /v1/vendor/orders?status=awaiting_vendor_acceptance,preparing&limit=20&cursor=...
```

Behavior:

- bearer authentication and vendor role required;
- approved seller account resolved server-side;
- only that seller's actionable orders are returned;
- status filtering is optional;
- default page size is 20, maximum 50;
- ordering is `created_at DESC, id DESC`;
- cursor is an opaque base64url value containing the last creation timestamp and
  UUID;
- `limit + 1` lookup determines `nextCursor` without offset drift.

Each queue item includes order/version data, immutable item snapshots, public
listing thumbnails, fulfilment type/schedule, subtotal, and quality-check
summary. It does not expose consumer address, phone, or payment data.

### 8. Implement order detail

Endpoint:

```http
GET /v1/vendor/orders/:sellerOrderId
```

The seller ownership predicate is part of the database query. The response adds
`updatedAt` and the ordered seller-order history timeline to the queue model.

### 9. Implement transitions

Endpoint:

```http
POST /v1/vendor/orders/:sellerOrderId/transitions
```

Request:

```json
{
  "toStatus": "accepted",
  "expectedVersion": 1,
  "operationId": "b5000000-0000-4000-8000-000000000001"
}
```

Response data:

```json
{
  "orderId": "d5000000-0000-4000-8000-000000000001",
  "status": "accepted",
  "version": 2,
  "operationId": "b5000000-0000-4000-8000-000000000001",
  "duplicate": false
}
```

The endpoint never accepts seller ID, consumer ID, current status, or actor role.
Database errors are mapped to not found, forbidden, version/operation conflict,
invalid transition, or packing-image-required responses.

### 10. Regenerate and verify database types

The checked-in Supabase types were regenerated after a clean local database
reset. They now include all Phase 3, Phase 4, and Phase 5 tables, enums, foreign
keys, and the `transition_vendor_order` RPC.

## Database tests

`vendor_order_state_machine.sql` covers:

- legacy `confirmed` normalization;
- valid acceptance, preparation, quality, ready, and cancellation transitions;
- forbidden jumps and terminal states;
- optimistic version conflicts;
- identical operation replay and mismatched operation reuse;
- seller ownership and missing orders;
- absent and pending packing proof;
- completed check with ready packing proof;
- one history and audit row per applied transition;
- three-active-image limit;
- denial of direct RPC execution to `authenticated`.

Earlier payment tests now expect the normalized Phase 5 entry status.

## API tests

The vendor order service tests cover:

- status filter forwarding;
- stable next-cursor generation;
- supplied cursor decoding;
- malformed cursor rejection before repository access;
- version and operation identity forwarding to the database transition.

## Verification results

- Fresh local Supabase reset: passed.
- Full pgTAP suite: 8 files and 163 assertions passed.
- API tests: 10 files and 37 tests passed.
- Domain typecheck and lint: passed.
- Validation typecheck and lint: passed.
- API typecheck and lint: passed.

## Boundaries intentionally deferred

- The quality-image bucket, upload intent, object verification, and signed reads
  remain Slice 4.
- Completing the quality checklist and its authorized API remain Slice 5.
- Vendor mobile screens remain Slice 6.
- Consumer progress remains Slice 7.
- Notification outbox and delivery remain Slice 8.

Until Slices 4 and 5 create a completed check with ready packing proof,
`quality_verified` is correctly unreachable.
