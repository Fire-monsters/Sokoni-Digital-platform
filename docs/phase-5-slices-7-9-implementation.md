# Phase 5 Slices 7–9 — Implementation

## Outcome

Phase 5 now exposes seller-by-seller progress to consumers, delivers durable notifications through a transactional outbox, and preserves quality-photo work across offline/reconnect cycles.

## Slice 7 — Consumer progress

1. Added shared response contracts for checkout progress, seller-order cards, timeline steps, and private quality proof.
2. Added `GET /v1/checkouts/:checkoutId/progress`. The repository verifies `consumer_id`, groups each seller order, derives item totals, and builds a timeline from `vendor_order_status_history`.
3. Added `GET /v1/orders/:sellerOrderId/quality-proof`. It verifies checkout ownership and requires a completed quality check with a ready packing proof.
4. The proof endpoint signs the private thumbnail for 10 minutes and original image for 5 minutes; storage paths are never returned to the client.
5. Added the consumer order-progress screen with seller-order cards, state timelines, and payment-success navigation.
6. Proof images are opt-in. The thumbnail loads first with low priority and `memory-disk` caching; the full image loads only after a second user action. Expiring URLs refetch after image failure or reconnect.

## Slice 8 — Notifications

1. Added `notification_events` as the immutable event outbox, `notification_deliveries` as channel-specific work, `notification_devices` for Expo tokens, and `notification_audit_events` for delivery history.
2. Added a transactional `vendor_orders` trigger. Status updates enqueue a deduplicated event and push delivery in the same database transaction.
3. Added service-role-only claim, complete, and fail RPCs. Claims use `FOR UPDATE SKIP LOCKED` and recover expired processing leases.
4. Added an Expo Push adapter and a Twilio Messaging Service adapter. Secrets remain server-only.
5. Added exponential retries capped at one hour and a maximum-attempt dead-letter state.
6. A failed push for a critical event (`new order`, `ready`, `cancelled`, or `issue`) idempotently creates an SMS fallback delivery.
7. Added authenticated notification listing and device-token registration endpoints.
8. Replaced the notification job stub with a guarded scheduler that polls every 15 seconds by default.
9. Added audit records for enqueue, delivery, retry, dead-letter, and fallback creation.

## Slice 9 — Offline hardening

1. Every prepared quality photo receives a stable UUID before any network request.
2. Upload intent uses that UUID as the database image ID. Replaying the same operation therefore returns the same paths and record instead of creating a duplicate.
3. Failed uploads are persisted in AsyncStorage with local original and thumbnail URIs.
4. The vendor order screen listens for reconnect, flushes due uploads, and refreshes the order after success.
5. Signed-storage duplicate-object responses are treated as replay evidence, after which metadata finalization confirms the upload idempotently.
6. Existing optimistic version checks continue to surface transition conflicts without overwriting newer state.
7. The weak-network consumer policy uses a cached, low-priority thumbnail and never automatically downloads the full proof.

## Configuration

The API accepts these optional notification variables:

- `EXPO_ACCESS_TOKEN`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_MESSAGING_SERVICE_SID`
- `NOTIFICATION_DELIVERY_BATCH_SIZE` (default `50`)
- `NOTIFICATION_MAX_ATTEMPTS` (default `5`)
- `NOTIFICATION_RETRY_BASE_SECONDS` (default `30`)
- `NOTIFICATION_POLL_INTERVAL_MS` (default `15000`)

Without a registered Expo token, push fails into the audited retry path. For critical events, configured Twilio credentials and an Auth phone number allow the SMS fallback to deliver.

## Verification

- Local migrations reset successfully through `20260810001300_consumer_progress_notifications.sql`.
- Database: 8 files, 184 pgTAP assertions.
- API: 12 files, 42 Vitest tests.
- Offline sync: 5 tests, including offline capture persistence, reconnect upload, and duplicate operation IDs.
- Consumer: 3 tests, including the weak-network quality-proof policy.
- API, domain, validation, API client, consumer mobile, and vendor mobile TypeScript checks pass.
- API, consumer mobile, and vendor mobile lint checks pass.

## Operational rollout

1. Apply migrations in order through `20260810001300`.
2. Deploy the API with Expo and Twilio variables appropriate to the environment.
3. Register each installed client token through `POST /v1/notifications/devices` after the client obtains an Expo push token.
4. Confirm the notification scheduler is running in exactly one API process per claimed-delivery workload, or run the worker as a dedicated process.
5. Monitor `notification_deliveries` for `dead_letter` and inspect `notification_audit_events` for the complete attempt trail.
