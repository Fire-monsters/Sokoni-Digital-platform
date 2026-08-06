# E-Katale MVP Monorepo Development Plan

## 1. Delivery objective

Build a low-bandwidth marketplace for Kitooro Market that supports:

- Guest catalogue browsing.
- Google sign-in for consumers at checkout.
- Phone/password and OTP authentication for vendors and transporters.
- Multi-vendor carts split into seller-specific orders.
- Mobile Money and market-pickup payment flows.
- Mandatory packing photographs.
- Nearby transporter offers and controlled delivery tracking.
- Offline-first vendor and rider operations.
- An operations console for agents, dispatchers and administrators.

The farmer, village-agent, aggregation and warehouse domains remain outside the first production release.

## 2. Monorepo structure

Use `pnpm` workspaces with Turborepo. Expo applications share domain packages, while the Express API remains the only trusted orchestrator for payment callbacks, checkout and administrative operations.

```text
ekatale/
├── apps/
│   ├── consumer-mobile/        # Expo: Android, iOS later, Expo web/PWA
│   ├── vendor-mobile/          # Expo: vendor and market-agent workflow
│   ├── rider-mobile/           # Expo: transporter workflow
│   ├── operations-web/         # React + Vite administration/dispatch console
│   └── api/                    # Express.js HTTP API and webhook receiver
├── packages/
│   ├── api-client/             # Typed HTTP client, retry and idempotency support
│   ├── auth/                   # Supabase clients, session helpers and guards
│   ├── config/                 # Environment parsing and feature flags
│   ├── database-types/         # Generated Supabase TypeScript types
│   ├── domain/                 # Domain entities, statuses and state machines
│   ├── offline-sync/           # SQLite/IndexedDB outbox and conflict handling
│   ├── ui/                     # Shared tokens and cross-platform components
│   ├── validation/             # Zod schemas shared by API and clients
│   ├── localization/           # English, Luganda and Swahili resources
│   ├── observability/          # Logging, tracing and error normalization
│   └── test-utils/             # Fixtures, factories and mocks
├── supabase/
│   ├── migrations/
│   ├── seed.sql
│   ├── tests/                  # pgTAP database tests
│   └── config.toml
├── tooling/
│   ├── eslint/
│   ├── typescript/
│   └── scripts/
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

## 3. Technical standards

### Runtime and language

- Node.js 22 LTS or the current project-approved LTS release.
- TypeScript in strict mode.
- Expo Router for mobile navigation.
- Express.js with a layered modular architecture.
- Supabase PostgreSQL, Auth and Storage.
- TanStack Query for server state.
- Zustand or Redux Toolkit only for local workflow state; do not duplicate server data unnecessarily.
- Zod validation at every HTTP boundary.

### Low-bandwidth defaults

- Text and thumbnails load before full images.
- WebP/JPEG images compressed on-device before upload.
- Listing image target: 150-300 KB; hard bucket limit: 1 MB.
- Quality image target: 250-500 KB; hard bucket limit: 1.5 MB.
- Paginate catalogue responses; default 20 items.
- Cache catalogue and active work locally.
- Queue offline mutations in an outbox with `operationId`, `baseVersion` and retry state.
- Use exponential backoff with jitter.
- Never retry payment initiation or order creation without an idempotency key.
- Avoid continuous GPS. Submit location only when available, on assignment screens and status transitions.

## 4. Backend architecture

```text
apps/api/src/
├── app.ts
├── server.ts
├── config/
├── middleware/
│   ├── authenticate.ts
│   ├── authorize.ts
│   ├── idempotency.ts
│   ├── request-context.ts
│   ├── rate-limit.ts
│   └── error-handler.ts
├── modules/
│   ├── identity/
│   ├── onboarding/
│   ├── catalogue/
│   ├── carts/
│   ├── checkout/
│   ├── payments/
│   ├── orders/
│   ├── quality/
│   ├── delivery/
│   ├── settlements/
│   ├── notifications/
│   ├── sync/
│   └── operations/
├── infrastructure/
│   ├── supabase/
│   ├── mobile-money/
│   ├── messaging/
│   ├── storage/
│   └── observability/
└── jobs/
    ├── expire-reservations.ts
    ├── retry-notifications.ts
    └── expire-rider-offers.ts
```

Each module should expose:

```text
controller -> application service -> repository/provider
```

Controllers validate HTTP input. Application services implement use cases. Repositories and providers isolate Supabase and third-party APIs.

### API ownership

**Clients may read through Supabase RLS:**

- Active categories and catalogue products.
- Active listings and listing thumbnails.
- Their own profiles, addresses, checkouts, orders and delivery records.
- Vendor-owned orders and listings.
- Rider-owned offers and assignments.

**Express API owns:**

- Checkout RPC invocation.
- Mobile Money initiation and callbacks.
- Administrative onboarding approval.
- Price approval.
- Refund approval.
- Signed quality-image URLs.
- Nearby-rider offer creation.
- Notifications and fallback SMS/WhatsApp.
- Settlement and reconciliation operations.

### Initial API surface

```text
GET    /v1/catalog/categories
GET    /v1/catalog/listings
GET    /v1/catalog/listings/:id
POST   /v1/carts
POST   /v1/carts/:id/items
PATCH  /v1/carts/:id/items/:itemId
POST   /v1/checkouts
POST   /v1/payments/mobile-money
POST   /v1/webhooks/payments/:provider
GET    /v1/me/checkouts/:id
GET    /v1/vendor/orders
POST   /v1/vendor/orders/:id/transition
POST   /v1/vendor/orders/:id/packing-image/sign
POST   /v1/vendor/orders/:id/quality-check
POST   /v1/riders/location
GET    /v1/riders/offers
POST   /v1/riders/offers/:id/accept
POST   /v1/deliveries/:id/status
GET    /v1/operations/dashboard
POST   /v1/operations/deliveries/:id/find-riders
POST   /v1/operations/vendors/:id/approve
POST   /v1/operations/riders/:id/approve
```

## 5. Frontend applications

### Consumer application

Primary screens:

1. Splash and connection-status handling.
2. Guest home screen.
3. Search and categories.
4. Listing details.
5. Multi-vendor cart with seller grouping.
6. Google authentication gate.
7. Fulfilment method and delivery zone.
8. Checkout review.
9. Mobile Money prompt or market-pickup selection.
10. Checkout tracking with seller-specific order cards.
11. Delivery tracking.
12. Order history, ratings and support.

Home-screen principles can resemble Glovo's information hierarchy—search, categories, nearby availability and fast cart access—without copying its identity or exact layout.

### Vendor application

Primary screens:

1. Phone/password sign-in and OTP recovery.
2. Verification status.
3. Today dashboard.
4. New order queue.
5. Order detail and acceptance.
6. Preparation checklist.
7. Packing-image capture and upload.
8. Mark ready for pickup.
9. Listings and availability.
10. Price-change request.
11. Sales and settlement summary.
12. Offline outbox and synchronization status.

### Rider application

Primary screens:

1. Phone/password sign-in.
2. Verification status.
3. Availability toggle.
4. Nearby delivery offers.
5. Offer detail and acceptance.
6. Cached pickup/drop-off details.
7. Status transition controls.
8. Proof-of-delivery capture.
9. Earnings summary.
10. Offline outbox.

### Operations web console

Primary screens:

1. Operational dashboard.
2. Vendor approval queue.
3. Rider approval queue.
4. New and delayed orders.
5. Payment reconciliation.
6. Ready-for-rider queue.
7. Rider offer/assignment panel.
8. Delivery exceptions.
9. Refund approvals.
10. Price approvals.
11. Vendor/rider settlements.
12. Audit log.

## 6. Incremental implementation plan

### Phase 0 — Repository foundation

Deliverables:

- Initialize pnpm/Turborepo workspace.
- Configure strict TypeScript, ESLint, Prettier and environment validation.
- Add GitHub Actions for lint, type-check, tests and builds.
- Add local Supabase configuration and migrations.
- Generate database types into `packages/database-types`.
- Add shared API error format and request IDs.

Exit criterion: every application builds in CI and the local Supabase database can be recreated from migrations.

### Phase 1 — Identity and controlled onboarding

Backend:

- Supabase Auth clients.
- Google consumer authentication.
- Vendor/rider phone-password registration.
- OTP verification and recovery.
- Vendor/rider onboarding submissions.
- Admin approval endpoints.
- Device-session enforcement.

Frontend:

- Auth flows for all applications.
- Verification-pending screens.
- Operations approval queues.

Exit criterion: approved vendors and riders can enter their respective applications; unapproved accounts cannot access operational features.

### Phase 2 — Catalogue, listings and storage

Backend:

- Read-optimized catalogue queries.
- Listing CRUD and price-approval workflow.
- Storage upload path generation.
- Image metadata insertion after successful upload.

Frontend:

- Consumer guest home, search and details.
- Vendor listing editor and availability controls.
- On-device image compression and thumbnail-first rendering.

Exit criterion: verified vendor listings are visible to guest consumers and remain usable on a weak connection.

### Phase 3 — Cart, checkout and inventory reservation

Backend:

- Cart APIs.
- `create_checkout_from_cart` integration.
- Idempotency middleware.
- Reservation-expiry job.
- Checkout read model.

Frontend:

- Guest cart persisted locally.
- Cart-to-account merge after Google sign-in.
- Seller-grouped checkout review.
- Delivery or market-pickup selection.

Exit criterion: one cart reliably creates one checkout and multiple seller orders without overselling stock.

### Phase 4 — Payments

Backend:

- MTN and Airtel provider adapters behind one interface.
- Payment initiation.
- Signature-verified callbacks.
- `process_payment_callback` integration.
- Reconciliation endpoint and audit trail.

Frontend:

- Mobile Money phone confirmation.
- Payment-pending polling with conservative intervals.
- Market-pickup payment status.
- Failure and retry recovery.

Exit criterion: callbacks are idempotent, mismatched amounts are rejected and failed payments release reservations.

### Phase 5 — Vendor fulfilment and quality assurance

Backend:

- Order transition endpoint.
- Signed upload workflow for private packing images.
- Quality-check metadata and signed read URLs.
- Vendor notification fan-out.

Frontend:

- Vendor new-order queue.
- Accept, prepare, photograph and ready workflow.
- Consumer seller-order progress cards.

Exit criterion: an order cannot become quality-verified without an associated packing image.

### Phase 6 — Delivery and transporter workflow

Backend:

- Rider location update endpoint.
- Nearby offer RPC.
- Offer expiry.
- Atomic offer acceptance.
- Delivery status state machine.
- Proof-of-delivery workflow.

Frontend:

- Rider availability and offer screens.
- Cached assignment details.
- Low-data status updates.
- Dispatcher assignment and exception handling.

Exit criterion: two riders cannot accept the same delivery, and delivery can be completed with consumer confirmation and evidence.

### Phase 7 — Offline synchronization and resilience

- Implement SQLite outbox on Expo clients.
- Implement IndexedDB outbox for the PWA/operations surfaces where needed.
- Add version-aware listing updates.
- Cache active orders and delivery assignments.
- Add network-quality detection and text-only mode.
- Add push notification fallback to SMS/WhatsApp.
- Add replay, conflict and airplane-mode tests.

Exit criterion: vendors and riders can perform their critical workflow offline and synchronize safely within 24 hours.

### Phase 8 — Pilot readiness

- Seed and verify Kitooro data.
- Conduct role-based acceptance testing.
- Test payment and refund reconciliation.
- Run load tests around catalogue, checkout and callbacks.
- Configure logs, alerts, backups and incident procedures.
- Train agents, dispatchers, vendors and riders.
- Launch to a controlled consumer cohort.

## 7. Testing strategy

### Database

- pgTAP tests for RLS and RPC authorization.
- Concurrent checkout tests for the same listing.
- Idempotent callback and duplicate checkout tests.
- Invalid order-transition tests.
- Competing rider acceptance tests.

### Backend

- Unit tests for application services and provider adapters.
- Integration tests against local Supabase.
- Contract tests for payment provider payloads.
- Supertest for HTTP APIs.

### Frontend

- React Native Testing Library for workflows.
- Playwright for operations web and PWA checkout.
- Maestro or Detox for critical Android flows.
- Offline, slow-3G and interrupted-upload scenarios.

### Performance targets for the pilot

- Catalogue first useful render under 3 seconds on simulated slow 3G after cold start.
- Cached home screen under 1 second.
- API payloads generally under 100 KB excluding images.
- Checkout database transaction p95 under 1 second at pilot load.
- Payment webhook acknowledgement under 2 seconds after signature verification.

## 8. Security controls

- Never expose the service-role key to any client.
- Verify Mobile Money signatures before invoking payment RPCs.
- Restrict function execution explicitly.
- Use `SECURITY DEFINER` only for reviewed transactional functions with an empty search path and fully-qualified objects.
- Use signed URLs for quality images.
- Do not write directly to `storage.objects`; use the Storage API.
- Redact phone numbers, tokens and payment payload secrets from logs.
- Rate-limit authentication, checkout, payment initiation and rider-location endpoints.
- Run Supabase Security and Performance Advisors after each migration.

## 9. First two development milestones

### Milestone A — Foundation and catalogue

- Repository and CI.
- Local Supabase migrations and seed.
- Shared design tokens and API types.
- Consumer guest catalogue.
- Vendor listing management.
- Storage upload policies.

### Milestone B — Transaction loop

- Multi-vendor cart.
- Google checkout gate.
- Transactional checkout and reservation.
- Mobile Money integration.
- Vendor fulfilment and packing image.
- Rider assignment and delivery completion.

The MVP is considered operational when a guest consumer can discover products, authenticate, pay, receive seller-specific fulfilment updates and complete delivery through a verified rider without manual database intervention.
