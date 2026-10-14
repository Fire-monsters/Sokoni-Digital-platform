# Epic 2 — Shared frontend API foundation

## Architecture discovered

- `apps/operations-web`: Vite/React; domain-compatible local services in `src/demo/service.ts`, fixtures in `src/demo/fixtures.ts`; component state and manual reload counters; shared feedback components and inline messages (no toast library).
- `apps/agro-warehouse`: Next/React; `lib/wholesale-client.ts` is an in-memory demo, despite its name. `app/page.tsx` contains illustrative data and local form state. `lib/warehouse-service.ts` is an unused legacy fixture/helper module. Toasts are local state with a legitimate dismissal timeout.
- `packages/api-client`: existing HTTP functions and query keys used elsewhere in the monorepo. Backend responses use `{ success: true, data, meta: { requestId } }`; failures use `{ success: false, error: { code, message, requestId, ... } }`. Some health endpoints return raw JSON.
- TanStack Query is already installed and used in SME/mobile apps; neither target dashboard had a query provider. Reuse it, without creating another cache.
- Shared domain types remain in `packages/domain`. Existing `packages/config` public schema requires Supabase credentials that these dashboards do not need; use a narrow browser-only config factory in the API client instead of importing server configuration.

## Implementation and usage

`packages/api-client/src/transport.ts` extends the existing client, retaining all existing domain functions and their envelope-unwrapped return values. Generic operations:

```ts
import { api } from './lib/api';
const rows = await api.get<ResponseDto>('/path', { signal });
const created = await api.post<ResponseDto, CreateInput>('/path', input);
const updated = await api.patch<ResponseDto, UpdateInput>('/path/id', input);
await api.delete('/path/id');
```

No endpoint or workflow is newly connected in this slice. Direct foundation tests provide the proof integration. Explicit `responseMode: 'raw'` supports raw JSON endpoints; the default remains the existing envelope contract. `onResponse` exposes successful response status/request ID without changing domain return values. Request headers and AbortSignal pass through. Empty successful responses resolve `undefined`; every non-2xx response rejects, even if its body claims success.

`ApiError` is the shared error base. The backward-compatible HTTP-only `ApiClientError` subclass preserves mobile offline-queue checks, so network failures are not mistaken for terminal server rejection. The model preserves `statusCode`, `code`, operation/version/retry metadata and adds `status`, `requestId`, and diagnostic `kind` (`http`, `network`, `aborted`, `invalid-response`, `unavailable`). Flat and envelope errors are accepted. Unknown/malformed failure bodies become typed HTTP errors. Malformed successes reject. Error codes are open strings, including backend codes added by other slices.

Both dashboards have one public config adapter, `lib/api.ts`, and mount `ApiProvider`. Blank API URLs mean same-origin requests; no production host is hardcoded. Tokens remain optional runtime client options; no authentication flow changes.

```tsx
const query = useApiQuery({
  queryKey: ['applications'],
  queryFn: ({ signal }) => api.get<ResponseDto>('/path', { signal }),
});
const mutation = useApiMutation({
  mutationFn: (input: InputDto) => api.patch<ResponseDto, InputDto>('/path/id', input),
  invalidate: [['applications'], ['application', id]],
});
<ApiFeedback pending={query.isPending} refreshing={query.isFetching && !query.isPending}
  error={query.error} onRetry={() => void query.refetch()} />
```

The hooks expose TanStack's data, typed error, initial pending, refetching, refetch, mutation pending/result/reset. Reads retry at most twice for network errors and HTTP 502/503/504; no retries for aborted/invalid responses, UNAVAILABLE, explicit `retryable: false`, or other statuses. Mutations never automatically retry. Success awaits invalidation of the requested keys and refetches active observers from the backend. Failed mutations do not invalidate or invoke success behavior. Existing intentional domain state is not migrated.

`ApiFeedback` is optional minimal accessible feedback compatible with existing layouts. `apiErrorMessage` uses safe user-facing messages rather than raw backend messages/details. Diagnostic codes and request IDs can be displayed; stack traces and database errors cannot.

## Fake behavior audit / implementation checklist

All dashboard source files were searched for fetch, axios, timers, random IDs/statuses, mock/demo/fixture/fake/simulation, success, Promise.resolve, and browser storage; services and hooks were inspected manually. No production HTTP wrappers or direct Supabase mutations existed in these two dashboards before this slice.

| File / functions | Previous behavior | Classification | New behavior |
| --- | --- | --- | --- |
| Operations `demo/service.ts`: application review/start/notes; listing approve/change requests; price review | In-memory mutations exposed by default dashboard routes | LOCAL_ONLY_MUTATION | Every exported service rejects UNAVAILABLE outside explicit development demo; production routes show Not connected yet |
| Same: delivery assignment/reassignment, action, issue resolution; order notes, contact reveal, escalation, cancellation | Local state/audit writes and fictional contact values | LOCAL_ONLY_MUTATION / DEMO_DATA | Same service guard and production route boundary; no domain reconnection |
| Same: `commandPaymentFinance` investigation flags and refund approval requests | In-memory finance records (no actual refund execution) | LOCAL_ONLY_MUTATION | Development demo only; production UNAVAILABLE |
| Same: `recheckPayment`, `reconcilePendingPayments` | Invented provider reconciliation changed payment to successful | SIMULATED_EXTERNAL_PROVIDER | Always UNAVAILABLE, including demo; controls disabled with explanation |
| Same: `resendOrderNotification` | Simulated delivery incremented attempt count and claimed local resend | SIMULATED_EXTERNAL_PROVIDER | Always UNAVAILABLE; no notification/audit mutation; control disabled |
| Operations `demo/fixtures.ts`, read services and random audit IDs | Fictional operational records displayed by default | DEMO_DATA | Reads require explicit development demo; no fixtures rendered by production route boundary |
| Warehouse `lib/wholesale-client.ts`: `decideOrder`, `saveOffer`, `allocatePayment` | Local order confirmation/decline, catalogue edits and simulated invoice allocation | LOCAL_ONLY_MUTATION | Every async entry point guards development demo; production rejects UNAVAILABLE before mutations |
| Same: `demoWarehouse`, `crops`, `catalogue`, `orders`, `financeInvoices` | Fictional warehouse and commerce records | DEMO_DATA | Development demo only, otherwise UNAVAILABLE |
| Warehouse `app/page.tsx`: inventory reset, intake submission, farmer offer | Local forms claimed inventory update / offer sent | LOCAL_ONLY_MUTATION / FAKE_PRODUCTION_SUCCESS | Production renders Not connected yet; development demo labels explicitly say local/non-persisted and nothing sent |
| Warehouse `app/page.tsx`: KPIs, trends, inventory, farmer/buyer lists | Hardcoded realistic records | DEMO_DATA | Only rendered inside explicit development demo |
| Warehouse `lib/warehouse-service.ts`: snapshot/reset/load/updateListingStatus/createDemoOrder, acceptListing, createPurchaseOrder, receiveProduce, publishAvailability, reserveStock, dispatchOrder | Unused legacy fixture helpers, delayed mock success | DEMO_DATA / LOCAL_ONLY_MUTATION | All async entry points and synchronous mock commands guarded; artificial delays removed; no production imports |
| Warehouse toast dismissal timeout, operations styling/status labels, loading/refresh messages | UI lifecycle/presentation | LEGITIMATE_UI_BEHAVIOR | Retained |
| Existing mock fetches and fixtures in tests | Isolated regression data | TEST_ONLY | Retained; demo suites explicitly opt in |

Demo enablement requires both a non-production build and `VITE_DEMO_ENABLED=true` or `NEXT_PUBLIC_DEMO_ENABLED=true`. Even explicitly setting the flag in a production build cannot enable the demo. The screens retain their demo layouts for development; production operational pages are placeholders until later integration slices. No runtime query parameter or browser storage can bypass this policy.

## Unavailable actions

Provider rechecks/reconciliation and notification resend are the external actions actually present. They now reject typed UNAVAILABLE without writing success state; the UI disables the controls with explanatory titles. Refund approval requests and warehouse invoice allocations are local demo mutations, not provider execution: they are blocked in production. No actual payout/refund execution client was found. No new backend capability is assumed.

## Security and remaining work

Browser code calls backend HTTP through the shared client. No privileged Supabase client, service-role secret, database URL, JWT secret or server workspace actor identity is added to browser configuration. Existing SME authentication files remain unchanged.

All operations modules (applications, catalogue/prices, deliveries, order investigations, payments/refund approval requests, audit) and warehouse modules (overview, inventory/intake, farmer offers, wholesale orders/catalogue, finance, procurement/dispatch) await their respective later API integration slices. This work does not change backend permissions, authentication, payments, stock invariants or metrics.

## Verification

Results are recorded after running the package/dashboard checks. Existing user changes in backend/config/domain and the prior lockfile edits were preserved.

| Command | Final result |
| --- | --- |
| `pnpm --filter @sokoni-digital/api-client typecheck` | Pass |
| `pnpm --filter @sokoni-digital/api-client lint` | Pass |
| `pnpm --filter @sokoni-digital/api-client test` | Pass: 42 tests |
| `pnpm --filter operations-web typecheck` | Pass (also runs in production build) |
| `pnpm --filter operations-web lint` | Pass |
| `pnpm --filter operations-web test` | Pass: 39 tests |
| `pnpm --filter operations-web build` | Pass: TypeScript + Vite production build |
| `pnpm --filter agro-warehouse typecheck` | Pass after build completed |
| `pnpm --filter agro-warehouse test` | Pass: 10 tests |
| `pnpm --filter agro-warehouse build` | Pass: Next webpack production build and prerender |
| `pnpm --filter agro-warehouse lint` | Existing configuration gap: no lint script exists |
| `pnpm --filter sme-dashboard test -- src/services/business-auth.test.ts src/features/auth/validation.test.ts src/features/auth/routes.test.ts` | Pass: Vitest ran all 4 SME suites, 22 tests |
| `git diff --check -- packages/api-client apps/operations-web apps/agro-warehouse docs/implementation` | Pass |

Initial implementation validation found and fixed React duplication, Next's `.js` to TypeScript source resolution, and new-code lint errors. One warehouse typecheck was started alongside Next build and encountered files being regenerated under `.next/types`; running it after build completion passes. No failures were suppressed. Root-wide `git diff --check` also identifies pre-existing trailing blank lines in `.env.example`, `apps/api/src/config/index.ts`, `packages/config/src/server-env.test.ts`, and `packages/config/src/server-env.ts`; those user-owned files were not changed by this slice.

Security searches over dashboard source, shared API source, and built browser assets (`operations-web/dist`, `agro-warehouse/.next/static`) found no service-role tokens/config names, workspace actor IDs, database URL or JWT secret references. Dashboard source imports no server-only configuration/auth package or privileged Supabase client. This is a source/build verification, not a live backend integration test.

## Significant files changed

| File | Reason |
| --- | --- |
| `packages/api-client/src/transport.ts` (new) | Shared typed HTTP operations, safe parsing, error model, retry classifier and public config factory |
| `packages/api-client/src/react.ts` (new) | Shared existing-library provider, query/mutation hooks, awaited invalidation and safe feedback |
| `packages/api-client/src/index.ts` | Re-export new transport; keep existing domain endpoint functions compatible |
| `packages/api-client/src/{transport,react}.test.ts` (new) | HTTP/network/retry/invalidation regressions including legacy offline-error distinction |
| `packages/api-client/package.json`, `pnpm-lock.yaml` | Declare existing TanStack/React dependencies and React subpath; preserve prior workspace edits |
| `apps/operations-web/src/lib/api.ts`, `apps/agro-warehouse/lib/api.ts` (new) | One typed public configuration and client per framework |
| Dashboard `.env.example` and README files | Document API base URL, opt-in demo policy and remaining integration scope |
| `apps/operations-web/src/App.tsx`, `src/components/DashboardLayout.tsx` | Mount query provider and hide demo routes behind development-only policy |
| `apps/operations-web/src/demo/service.ts` | Guard every demo export; remove simulated provider success and notification delivery |
| `apps/operations-web/src/pages/{PaymentsPage,OrderInvestigationPage}.tsx` | Explain/disable unavailable provider actions and reuse safe API error messages |
| `apps/agro-warehouse/app/page.tsx` | Provider, production placeholder and truthful local-demo form messages |
| `apps/agro-warehouse/lib/{wholesale-client,warehouse-service}.ts` | Guard local mock commands/reads; remove obsolete simulated service delays |
| Both `production.test.tsx` files (new) | Block production fixtures and all discovered mock mutation entry points |
| `apps/operations-web/src/lib/api-feedback.test.tsx` (new) | Safe unavailable display, retry callback, loading/refetch feedback |
| Existing dashboard demo/service/page test files | Explicit demo opt-in; assert unavailable provider actions do not mutate or succeed |
| `apps/operations-web/package.json` | Add explicit typecheck script |

No fixture files were deleted. Unused warehouse helpers remain deprecated development fixtures, guarded against successful command execution in production. No backend or SME code was edited.
