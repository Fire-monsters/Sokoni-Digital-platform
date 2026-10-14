# Epic 3 — Operations reconnection

The Operations dashboard now uses the public Operations workspace boundary for persisted workflows. `VITE_DEMO_ENABLED=true` retains the old local fixtures only in development; production always uses the API. The server selects the configured Operations actor, reloads active staff permissions, checks an exact route/action allowlist, and delegates to the existing admin domain routes. Existing authenticated admin, SME and wholesale routes keep their own boundaries. The public Operations router is mounted only in `APP_MODE=full`.

| Slice | Existing backend and data | Frontend gap closed |
| --- | --- | --- |
| Applications | Application queue/detail, append-only reviewer notes, versioned review commands, audit | Vendor/rider lists and review actions now call those contracts and refetch. |
| Catalogue | Pending listing projection, versioned approve/request-changes RPC, catalogue audit | Queue, decisions and history now use persisted records. Additive operational notes are persisted. No stock effect. |
| Prices | Pending price requests, approve/reject RPC, review/audit history | Queue and decisions now call the existing domain; separate notes persist. |
| Deliveries | Dispatch board/detail, rider assignment, issue resolution and validated actions, audit | Board and commands now use backend data. Additive delivery notes persist. No vehicle entity exists in this domain; rider assignment remains the supported form. Nearby search and external/contact actions are unavailable. |
| Orders | Order investigation read model, support notes and audit | Order list/detail uses backend; a small additive investigation case model persists open, notes, version and resolution. Dispatch/cancel are hidden in production Operations. |
| Payments | Reconciliation list/detail, payment investigations and audit | Payments read from backend. Additive manual observations store external reference, optional amount, observed time and note without changing payment status. Provider rechecks remain unavailable. |
| Refunds | Existing request-refund domain command and refund request table/read model | Approval-only creation and persisted refund queue are connected. No refund execution is exposed. |

New migration: `supabase/migrations/20261009000100_operations_case_records.sql`. It creates only Operations investigations, manual payment records, delivery notes and catalogue/price notes, plus one nullable investigation link on existing support notes. Four transactional RPCs enforce resource existence, staff permission, required fields, version where applicable, idempotency and audit. RLS denies anon/authenticated direct access; service role only reaches the RPCs through the API. The migration was applied to the running local Supabase PostgreSQL instance without changing historical rows.

Public endpoint groups under `/v1/public/operations`:

- `GET /applications`, `GET /applications/:id`, and `POST /applications/:id/{start-review,notes,approve,reject,request-changes}` reuse application review routes.
- `GET /listings`, `POST /listings/:id/{approve,request-changes}`, `GET|POST /listings/:id/notes`; `GET /price-requests`, `POST /price-requests/:id/{approve,reject}`, `GET|POST /price-requests/:id/notes` use existing review routes and new notes RPCs.
- `GET /deliveries`, `GET /deliveries/:id`, `GET /delivery-riders`, `POST /deliveries/:id/{assign-rider,reassign-rider,actions}`, `POST /delivery-issues/:id/resolve`, `GET|POST /deliveries/:id/notes` use dispatch services and notes RPC. Public `actions` accepts only `CANCEL_ASSIGNMENT` and `MARK_CUSTOMER_UNAVAILABLE`.
- `GET /orders`, `GET /orders/:id`, `POST /orders/:id/notes`, `GET|POST /orders/:id/investigations`, `POST /orders/:id/investigations/{notes,resolve}` use the existing order model and new case RPC.
- `GET /payments/reconciliation`, `GET /payments/:id`, `POST /payments/:id/flag-investigation`, `GET|POST /payments/:id/records`, `GET /refunds`, `POST /payments/:id/request-refund`, and `GET /audit-events` reuse finance/audit services with new observation RPC.

The Operations adapter uses the shared typed API client and query cache. A successful mutation invalidates affected queries; version conflicts invalidate current data for review. New panels preserve an operation ID across retries. Every production record comes from a backend query after reload. Errors, loading, empty states and manual refresh are visible. The UI reports a refund *request* and payment *observation*, never execution or provider verification.

Payment provider recheck/batch, refund execution, notifications, nearby-rider/GPS/fleet calls and other unsupported public operations actions are rejected by the server as `UNAVAILABLE` or `ACTION_NOT_AVAILABLE`. No warehouse inventory, procurement, fulfilment or stock logic was added.

Validation on the local stack: `pnpm --filter @sokoni-digital/api typecheck`, `pnpm --filter @sokoni-digital/api build`, `pnpm --filter @sokoni-digital/api test` (45 files, 272 tests), `pnpm --filter operations-web typecheck`, `pnpm --filter operations-web test` (10 files, 39 tests), `pnpm --filter operations-web build`, and `pnpm --filter @sokoni-digital/api-client test` (43 tests) passed. The migration applied successfully to local Supabase; a SQL smoke test invoked all four new RPCs and confirmed missing resources are rejected. The local database has no customer orders, payments, deliveries, listings or price proposals, so a complete database-backed success-path reload test was not possible against existing records. Those success paths are covered through existing domain tests and the shared query invalidation test; a seeded full-stack workflow test remains useful future Operations work.

Lint: Operations-web and api-client lint pass. The full API lint command still fails on public-workspace/readiness files introduced before this reconnection (primarily test typing and async mock style); the two new Operations source files pass targeted ESLint. This is separate from the passing API typecheck, build and regression suite.
