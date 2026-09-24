# Slice 3.4 — Payment reconciliation

The operations payment page replaces the placeholder at `/dashboard/payments`.
It uses the existing finance read model and Pesapal adapter; operators cannot
submit payment statuses, provider amounts, or provider references as commands.

## Commands

| Endpoint (under `/v1/admin`)            | Permission           | Input                                                                       |
| --------------------------------------- | -------------------- | --------------------------------------------------------------------------- |
| `GET /payments/reconciliation`          | `payments.read`      | Paginated query, reference search, reconciliation-state filter              |
| `GET /payments/:id`                     | `payments.read`      | Payment ID                                                                  |
| `POST /payments/:id/reconcile`          | `payments.reconcile` | `operationId` UUID                                                          |
| `POST /payments/reconciliation/run`     | `payments.reconcile` | `operationId` UUID, `scope: "pending"`                                      |
| `POST /payments/:id/flag-investigation` | `payments.reconcile` | `operationId`, structured `reasonCode`, `reason`                            |
| `POST /payments/:id/request-refund`     | `refunds.manage`     | `operationId`, refund `reasonCode`, `reason`, positive integer UGX `amount` |

All mutation bodies reject unknown fields. Actor identity comes from the staff
session. Transactional RPCs recheck active staff permissions. Private finance
tables and RPCs are not accessible directly to anonymous or authenticated clients.

## Reconciliation guarantees

- Provider results, actual resulting local status, reconciliation evidence, and
  the audit event commit in one PostgreSQL transaction using the existing
  payment-finalization and inventory logic.
- Terminal payments can be rechecked to uncover disagreements. A mismatch never
  silently downgrades a successful payment. Missing references and lookup failures
  become explicit review outcomes, not invented successful payments.
- The existing `payment_reconciliation_runs` table is extended rather than
  introducing a second reconciliation history. Older rows have no recorded
  post-operation status; the UI labels that as not recorded.
- The staff API exposes bounded normalized history (latest 100 per section), not
  raw provider bodies, headers, tokens, or customer payer details.
- A recheck retry key is scoped to a payment, actor, and source. It returns the
  committed result on replay. Provider lookups may repeat, but committed database
  transitions, history, and audit do not.
- Admin batch membership is persisted by operation ID. Retrying resumes the same
  payments, not the next page. Admin batches contain at most 10 due payments;
  provider lookups use at most five concurrent workers. The scheduled worker
  retains its configured batch size. Pending, resolved, review-required, and
  persistence-failed results are counted separately.
- Due-batch selection retains the existing claim behavior: attempts without a
  tracking reference require individual review rather than a provider lookup.
- Open investigations appear in `needs_review` with `OPEN_INVESTIGATION` flags.
  Investigation resolution is not part of this slice.

## Refund boundary

A refund command creates a `refund_cases` row in `awaiting_approval` / `pending`.
It does **not** approve a refund, call a provider refund API, or alter the payment.
The payment must be successful. Its row is locked while validating the sum of
existing refund reservations and inserting the request. Completed, processing,
pending, and failed cases continue to reserve their amount; only cancelled or
rejected cases release it. Future refund execution must use the same payment lock
and establish its own approval, execution, and provider-idempotency controls.

## Deployment and verification

Apply `20260924000100_payment_reconciliation_workflow.sql` and
`20260924000200_payment_detail_projection_fix.sql` before deploying the API.
The migration is additive except for replacing the finance queue projection to
include investigations and distinguish pending rechecks from reconciled payments.
Existing financial data is not backfilled with guessed status history.

Local verification completed on 2026-09-24 after Docker became available:

- Both migrations applied successfully without resetting the database.
- All 487 database checks passed, including 49 payment-finance checks.
- Database types were regenerated from the migrated local schema.
- All 183 API tests and 22 operations-web tests passed.
- API and API-client typechecks and the operations-web production build passed.

The first database run exposed an ambiguous `result` identifier in the payment
detail projection. The corrective migration separates the return variable from
the reconciliation result column; the full suite passed after applying it.

To repeat verification with local Supabase available:

```sh
pnpm exec supabase migration up --local
pnpm exec supabase test db
pnpm db:types
pnpm --dir apps/api typecheck
pnpm --dir apps/api exec vitest run
pnpm --dir apps/operations-web build
```

`supabase/tests/payment_finance_workflow.sql` covers permission boundaries,
atomic rollback on audit failure, payment/inventory finalization, retry safety,
batch membership, normalized history privacy, investigations, and refund limits.
Run browser smoke tests with read-only and finance staff sessions before release.
No live-provider charge or refund was initiated during implementation.
