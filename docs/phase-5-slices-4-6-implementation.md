# Phase 5 Slices 4–6 — private quality workflow and vendor UI

Implemented on 2026-08-10 on top of the Slice 2 state machine and Slice 3 vendor
order API.

## Outcome

An approved vendor can now accept a paid seller order, start preparing it,
capture or select a packing photograph, compress and upload original/thumbnail
files directly to private Storage, finalize verified metadata, complete the
packing checklist, move the order to `quality_verified`, and mark it
`ready_for_pickup`.

The database remains authoritative. The frontend cannot complete the quality
check without ready proof metadata, cannot enter `quality_verified` without a
completed check and packing proof, and cannot jump directly to ready.

## Step-by-step implementation process

### 1. Create private quality Storage

Migration `20260810001200_private_quality_upload_verification.sql` creates the
`quality-check-images` bucket with:

- `public = false`;
- JPEG and WebP object types;
- a 500,000-byte object ceiling;
- no `storage.objects` client policy.

The absence of a bucket-specific client policy is intentional default-deny RLS.
The backend service role creates signed upload tokens and short-lived signed
thumbnail URLs. No permanent public quality-image URL is generated.

### 2. Define one compression contract

`qualityImageCompressionContract` is shared through the domain package:

| Output    | Contract                                                 |
| --------- | -------------------------------------------------------- |
| Original  | JPEG, 1280-pixel long edge, quality 0.72, maximum 500 KB |
| Thumbnail | JPEG, 320-pixel long edge, quality 0.65, maximum 75 KB   |

Validation applies the same dimensional and byte ceilings at the API boundary.
PostgreSQL independently validates intent metadata, and the Storage bucket
enforces the final object ceiling.

### 3. Reserve the quality check and image intent atomically

The backend calls `ensure_quality_check` to lock the order, verify approved
seller ownership, require `accepted` or `preparing`, and return the one draft
quality check for that order.

It then creates seller/order/check/image-scoped paths:

```text
{seller_id}/{seller_order_id}/{quality_check_id}/{image_id}/original.jpg
{seller_id}/{seller_order_id}/{quality_check_id}/{image_id}/thumbnail.jpg
```

`create_quality_image_intent` reserves a pending metadata row inside the
database. This makes the three-active-image constraint concurrency-safe. Pending
intents expire after two hours and are invalidated before a later intent counts
the active images.

### 4. Issue signed uploads

Endpoint:

```http
POST /v1/vendor/orders/:sellerOrderId/quality-check/images/upload-intent
```

The response contains:

- quality check and image IDs;
- signed upload path/token pairs for the thumbnail and original;
- expiry timestamp;
- the authoritative compression contract.

The mobile app uploads thumbnail first and original second with
`uploadToSignedUrl`. It never receives the Supabase service-role key.

### 5. Verify objects and finalize metadata

Endpoint:

```http
POST /v1/vendor/orders/:sellerOrderId/quality-check/images/:imageId/complete
```

The backend:

1. resolves the authenticated seller account;
2. verifies the image belongs to that seller order;
3. requires the exact reserved original and thumbnail paths;
4. verifies both objects exist in private Storage;
5. compares Storage object sizes with submitted metadata when available;
6. calls `finalize_quality_image`;
7. returns a ten-minute signed thumbnail URL.

The finalization RPC locks the seller order and image, rechecks ownership and
order state, rejects metadata that differs from the intent, and marks the first
ready image as the authoritative packing proof. Identical finalization safely
replays.

### 6. Complete the verification record

`quality_checks` now stores:

- the three-item checklist as JSON;
- packing actor;
- notes;
- verification timestamp;
- unique completion operation ID.

Endpoint:

```http
POST /v1/vendor/orders/:sellerOrderId/quality-check/complete
```

All checklist values must be true. `complete_quality_check` locks the order,
verifies ownership and `preparing` status, requires ready packing proof, writes
the completion record, and inserts one `quality_check_audit_events` row.
Identical completion replays without duplicating the audit event.

### 7. Perform quality and ready transitions

The UI continues to use the single transition endpoint:

```http
POST /v1/vendor/orders/:sellerOrderId/transitions
```

After checklist completion it requests:

```text
preparing -> quality_verified
```

The Slice 2 RPC rechecks completed quality metadata and ready packing proof.
After server confirmation, the UI enables:

```text
quality_verified -> ready_for_pickup
```

Neither state is optimistically claimed before the server responds.

### 8. Add API-client and query boundaries

The shared API client now supports:

- paginated vendor orders;
- seller-order detail;
- versioned transitions;
- upload intent;
- upload completion;
- quality-check completion.

TanStack Query owns order queue/detail state and invalidates all seller-order
queries after mutations. The queue uses `useInfiniteQuery` and the opaque Slice 3
cursor.

Zustand owns only transient capture state:

- selected local photo;
- preparing/uploading/ready/error state;
- returned signed thumbnail;
- local packing checklist.

### 9. Build the vendor order queue

The Orders tab displays status-grouped sections for new, accepted, preparing,
quality-checked, ready, and attention-required orders. Each card contains only
the order reference, item count, subtotal, fulfilment type, status, and version.
It supports refresh, cached/offline display, and cursor-based loading of more
orders.

### 10. Build the status-driven order detail

The order screen shows one primary workflow for the current server status:

| Status                       | Primary action                         |
| ---------------------------- | -------------------------------------- |
| `awaiting_vendor_acceptance` | Accept order                           |
| `accepted`                   | Start preparing                        |
| `preparing`, no proof        | Open camera or choose from gallery     |
| `preparing`, local photo     | Preview, upload, or retake             |
| `preparing`, proof ready     | Complete checklist and confirm packing |
| `quality_verified`           | Mark ready for pickup                  |
| `ready_for_pickup`           | Server-confirmed ready screen          |

The screen also shows immutable order items, quantities, subtotal, fulfilment
type/schedule, upload status, and recoverable error messages.

### 11. Implement SDK 54 capture and compression

The camera is the primary action and the library is the fallback. The app asks
for camera permission immediately before launching the system camera, uses the
back camera, and handles cancellation. It uses the SDK 54 contextual
ImageManipulator API to resize and encode original and thumbnail JPEGs, and the
SDK 54 File API to measure and read the resulting objects.

The image-picker config plugin now provides explicit packed-order camera and
photo-library permission descriptions and keeps microphone permission disabled.

## Verification

- Clean local Supabase migration reset: passed.
- Full pgTAP suite: 8 files and 178 assertions passed.
- API tests: 11 files and 39 tests passed.
- Domain, validation, API client, and API typechecks: passed.
- Vendor mobile TypeScript check: passed.
- Domain, validation, API client, API, and vendor lint: passed.
- Vendor web export: passed.

## Deferred boundaries

- Consumer progress and consumer-authorized signed quality proof remain Slice 7.
- Notification fan-out remains Slice 8.
- Persistent offline photo recovery and conflict reconciliation remain Slice 9.
