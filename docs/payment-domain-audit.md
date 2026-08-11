# Phase 4 payment-domain audit

Audited on 2026-08-10 before implementing Phase 4 slices 2 and 3, then revised when Pesapal was selected as the sole digital-payment processor.

## Existing foundations

| Concern             | Existing implementation                                                                                                                                       | Phase 4 decision                                                                                                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Payments            | No payment table existed. `apps/api/src/modules/payments/index.ts` was an empty module boundary.                                                              | Add `payment_attempts`; Pesapal is the digital provider, while MTN MoMo, Airtel Money, and cards are payment methods reported by Pesapal.                                                     |
| Callback processing | No callback-event table or payment-result RPC existed.                                                                                                        | Persist and deduplicate Pesapal IPNs, then authenticate the result with Pesapal's status API before calling the atomic finalization RPC.                                                      |
| Checkout state      | `checkout_status`: `awaiting_payment`, `paid`, `confirmed_unpaid`, `expired`, `cancelled`.                                                                    | Reuse `paid` for successful digital payment and `confirmed_unpaid` for market pickup. Add `payment_failed` for a definitive failed collection.                                                |
| Seller-order state  | `vendor_order_status`: `awaiting_payment`, `confirmed`, `expired`, `cancelled`.                                                                               | Reuse `confirmed`; it is the Phase 3 equivalent of the specification's `awaiting_vendor_acceptance`. A later fulfilment migration may split it without coupling provider code to order state. |
| Reservations        | `inventory_reservation_status`: `active`, `committed`, `released`, `expired`, with timestamps and release reason.                                             | Reuse unchanged. Payment success commits active reservations; definitive failure releases them in the future callback RPC.                                                                    |
| Idempotency         | `idempotency_records` plus service-role-only claim, complete, fail, and cleanup RPCs. Records are scoped by user, operation, and key and bind a request hash. | Reuse for `payment.create` in the initiation slice. No payment-specific idempotency table.                                                                                                    |
| Audit               | `catalogue_audit_events` is deliberately catalogue-specific; `checkout_status_history` records only checkout transitions.                                     | Do not overload either table. Add append-only `payment_audit_events` with payment and provider-event correlation.                                                                             |
| Environment         | Server configuration validated Supabase, CORS, logging, and checkout reservation duration. No payment credentials existed.                                    | Local development defaults to a fake adapter. Sandbox/production conditionally require Pesapal credentials and an IPN ID; production rejects fake mode and non-HTTPS callbacks.               |
| Generated types     | Checked-in Supabase types predate the uncommitted Phase 3 migrations.                                                                                         | Regenerate from a reset local database after the payment migration so Phase 3 and Phase 4 are represented together.                                                                           |

## Migration ordering

The Phase 4 brief suggests `20260806000600_payments_and_reconciliation.sql`, but that timestamp sorts before the Phase 3 checkout migration it references. The implementation uses `20260810000700_payments_and_reconciliation.sql` so a clean database applies dependencies in a valid order.

## Security boundary

Consumers may read only their own payment attempts. Provider events, reconciliation evidence, and audit rows contain operational data and have RLS enabled with no client policy. No client role receives insert, update, or delete privileges on payment tables. The backend service role is the only write path.

## Provider decision

There are no direct MTN or Airtel transports, credentials, callback routes, or provider enums. The backend submits one Pesapal order and the hosted Pesapal experience presents the payment methods available to that shopper. This keeps provider settlement configuration in the Pesapal merchant account and prevents mobile-money-specific logic leaking into checkout or inventory code.

The completed lifecycle, callback, reconciliation, and mobile-hosted-payment implementation is documented in `docs/pesapal-phase-4.md`.
