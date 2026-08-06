# E-Katale MVP System Design — Version 2

## 1. Product boundary

The first pilot serves Kitooro Market and consumers within Entebbe Municipality.

The MVP connects:
- controlled, verified market vendors;
- consumers using guest browsing and Google sign-in at checkout;
- independent, verified boda-boda transporters;
- E-Katale market agents, dispatchers, and administrators.

Farmer sourcing, village agents, aggregation centres, and warehouse procurement are future modules and are not part of the first operational release.

## 2. Core business flow

1. A vendor creates packaged, pre-weighed listings and marks them Available, Low Stock, or Unavailable.
2. A guest consumer browses listings and builds a multi-vendor cart.
3. The consumer signs in with Google at checkout.
4. Express validates all prices and availability.
5. One checkout is created and split into one vendor order per seller.
6. The consumer pays E-Katale through MTN MoMo, Airtel Money, or chooses market pickup payment where allowed.
7. Each vendor accepts and packs their vendor order.
8. Every vendor order receives a packing/quality photograph.
9. For delivery, eligible nearby riders receive a delivery offer and one rider accepts it.
10. Orders within a compatible radius may be grouped into one rider trip.
11. The consumer follows low-bandwidth status updates and confirms delivery.
12. The platform records commissions, rider earnings, vendor payables, refunds, and settlement status.

## 3. Bounded domains

### Identity and onboarding
Profiles, one account/one role, OTP phone verification, Google consumers, vendor verification, rider verification, device sessions, staff permissions.

### Marketplace and ordering
Markets, stalls, categories, products, seller listings, package plans, carts, checkouts, vendor orders, order items, quality photographs, pickup and scheduled-delivery options.

### Payments and settlement
Checkout payments, refunds, commissions, vendor payable ledger, rider payable ledger, daily/weekly settlements, webhook idempotency.

### Delivery and operations
Delivery zones, delivery jobs, nearby-rider offers, rider acceptance, grouped trips, status history, proof of delivery, dispatcher controls, operational dashboard.

## 4. Application architecture

### Client applications
Use an Expo monorepo with role-specific surfaces:
- Consumer app/PWA
- Vendor app/PWA
- Rider app/PWA
- Operations web dashboard

Shared packages:
- UI components
- API client
- validation schemas
- localization
- offline database and synchronization engine
- shared domain types

### Backend
Express.js is the transactional application layer. It owns:
- checkout creation and seller-order splitting;
- payment initiation and webhook processing;
- order state transitions;
- commission calculations;
- rider offer generation and acceptance;
- refunds and settlements;
- synchronization conflict handling;
- privileged administration operations.

Clients may read public catalogue data through Supabase, but sensitive writes must go through Express.

### Data and infrastructure
- Supabase PostgreSQL: source of truth
- Supabase Auth: identities and sessions
- Supabase Storage: listing, verification, packing, and proof-of-delivery images
- Supabase Realtime: optional foreground updates, not required for correctness
- Redis later: dispatch queues, rate limits, ephemeral locks, and hot catalogue cache
- Background worker: notifications, retries, settlement generation, image processing

## 5. Offline and low-bandwidth architecture

### Local persistence
Use SQLite on native clients and IndexedDB on the PWA. Cache:
- product catalogue and compressed thumbnails;
- active vendor orders;
- assigned rider jobs;
- delivery zones and addresses;
- unsynchronized mutations.

### Outbox synchronization
Every offline write receives a client-generated UUID and is stored in a local outbox. The sync endpoint processes each operation idempotently.

Each mutation contains:
- operation_id
- entity_type
- entity_id
- operation_type
- base_version
- payload
- device_timestamp

### Conflict policy
- Price changes require administrator approval and never use last-write-wins.
- Listing availability uses version checks; conflicting updates are rejected and refreshed.
- Order status uses a server-enforced state machine.
- Delivery status is append-only; invalid backwards transitions are rejected.
- Vendor and agent conflicts are resolved by the latest approved server version, with an audit entry.

### Bandwidth controls
- text-first interface;
- thumbnails before full images;
- WebP/AVIF where supported;
- target packing and delivery proof image: 100–250 KB;
- cursor pagination;
- delta sync using updated_at and version;
- no continuous GPS streaming in MVP;
- push notifications with SMS/WhatsApp fallback for critical events;
- automatic reduced-data mode on slow connections.

## 6. Order model

### Checkout
Customer-level commercial transaction containing products from multiple sellers.

### Vendor order
Seller-specific fulfilment unit created from the checkout. Each vendor accepts, packs, photographs, and completes their own order.

### Payment
Initially paid to E-Katale at checkout level. Payment success confirms all child vendor orders atomically.

### Fulfilment
Each vendor order chooses:
- delivery;
- immediate delivery;
- scheduled delivery;
- market pickup.

One delivery trip may contain several vendor-order deliveries when pickup and drop-off constraints are compatible.

## 7. Recommended state machines

### Checkout
DRAFT → AWAITING_PAYMENT → PAID → PARTIALLY_FULFILLED → COMPLETED
Alternative: CANCELLED, PARTIALLY_REFUNDED, REFUNDED

### Vendor order
AWAITING_PAYMENT → NEW → ACCEPTED → PREPARING → QUALITY_VERIFIED → READY_FOR_PICKUP → DISPATCHED → DELIVERED
Alternative: CANCELLED, REFUND_PENDING, REFUNDED, FAILED

### Rider offer
OFFERED → ACCEPTED
Alternative: REJECTED, EXPIRED, WITHDRAWN

### Delivery
UNASSIGNED → OFFERING → ASSIGNED → ARRIVED_AT_MARKET → PICKED_UP → IN_TRANSIT → DELIVERED
Alternative: FAILED, CANCELLED

## 8. Security rules

- No passwords in public tables.
- Consumers use Google authentication at checkout.
- Vendors and riders use verified phone/password accounts with OTP recovery.
- One primary role per account in MVP.
- Vendor and rider registrations require administrator approval.
- One active trusted device is recommended for vendor and rider accounts; new-device login requires OTP verification.
- Service-role credentials remain server-side only.
- RLS applies to all exposed tables.
- Payment webhooks require signature verification and idempotency.
- National ID images should use a private storage bucket and restricted signed URLs.

## 9. MVP implementation order

1. Identity, roles, vendor/rider approval and device sessions.
2. Catalogue, packaged listings, availability, price approval.
3. Guest browsing, cart, checkout, multi-vendor split.
4. Payment API integration and webhook reconciliation.
5. Vendor order handling and mandatory packing photographs.
6. Delivery zones, rider offers, assignment, status updates, proof of delivery.
7. Operations dashboard, refunds, commission and settlement ledger.
8. Produce package subscriptions.
9. Offline outbox, delta synchronization, SMS/WhatsApp fallback, localization.

## 10. Deferred modules

- farmer accounts;
- village agents;
- harvest forecasts;
- procurement requests;
- aggregation centres;
- warehouse lots and traceability;
- inbound rural transport;
- direct farmer settlement.
