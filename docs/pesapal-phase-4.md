# Phase 4 — Pesapal production integration

E-Katale uses Pesapal as its only digital-payment processor. MTN MoMo, Airtel Money and cards are payment methods reported by Pesapal, not separate backend integrations.

## Payment sequence

1. The authenticated consumer reserves a checkout.
2. `POST /v1/checkouts/:checkoutId/payments` creates an authoritative attempt from the checkout total.
3. The backend obtains a short-lived Pesapal bearer token and submits an order.
4. E-Katale stores Pesapal's order tracking ID and hosted redirect URL, then returns a redirect next action.
5. The consumer app opens the hosted page with Expo WebBrowser. The customer selects MTN MoMo, Airtel Money or card without leaving the app-owned flow.
6. Pesapal redirects through the backend return endpoint, which redirects into `consumermobile://payments/return`.
7. Pesapal also sends an IPN. Neither browser return nor IPN is proof of payment.
8. The backend queries Pesapal's transaction-status endpoint and validates the merchant reference, tracking ID, exact amount and currency.
9. PostgreSQL finalizes payment, checkout, inventory reservations and seller orders atomically.
10. A one-minute reconciliation worker recovers delayed or missing IPNs.

Official references:

- <https://developer.pesapal.com/how-to-integrate/e-commerce/api-30-json/authentication>
- <https://developer.pesapal.com/how-to-integrate/e-commerce/api-30-json/submitorderrequest>
- <https://developer.pesapal.com/how-to-integrate/e-commerce/api-30-json/gettransactionstatus>

## Environment setup

Local development defaults to the deterministic fake adapter. Pesapal sandbox and production require:

```dotenv
PAYMENTS_ENV=sandbox
PAYMENT_CALLBACK_BASE_URL=https://public-api.example.com/v1/payments
PAYMENT_APP_RETURN_URL=consumermobile://payments/return
PAYMENT_PENDING_MAX_MINUTES=15
PAYMENT_MAX_ATTEMPTS=3
PAYMENT_RECONCILIATION_BATCH_SIZE=100
PESAPAL_CONSUMER_KEY=...
PESAPAL_CONSUMER_SECRET=...
PESAPAL_IPN_ID=...
```

Production startup rejects fake payments and non-HTTPS callback URLs.

## Pesapal preparation

1. Complete the Pesapal business-account verification and merchant agreement.
2. Configure the settlement bank account.
3. Obtain sandbox credentials.
4. Register `https://public-api.example.com/v1/payments/callbacks/pesapal` as a POST IPN URL.
5. Put its notification UUID in `PESAPAL_IPN_ID`.
6. Create an Expo development build after configuring the `consumermobile` scheme.
7. Test MTN, Airtel, card, cancellation, failure, delayed IPN and app-restart recovery in sandbox.
8. Replace all credentials with live values and set `PAYMENTS_ENV=production` for launch.

## Endpoints

```text
POST /v1/checkouts/:checkoutId/payments
GET  /v1/payments/:paymentAttemptId
POST /v1/payments/callbacks/pesapal
GET  /v1/payments/callbacks/pesapal
GET  /v1/payments/returns/pesapal
GET  /v1/payments/returns/pesapal/cancel

GET  /v1/admin/payments/reconciliation?limit=50
POST /v1/admin/payments/reconciliation/run
POST /v1/admin/payments/:paymentAttemptId/reconcile

POST /v1/operations/checkouts/:checkoutId/market-payment
```

The IPN route has no consumer JWT. For POST callbacks it captures the exact request bytes before JSON parsing. Events are deduplicated using a semantic Pesapal event key, with the raw-payload hash retained as a fallback and forensic record. It then matches references and obtains authoritative details through Pesapal's authenticated status API.

Pesapal API 3.0 IPNs do not carry the direct-provider HMAC signature anticipated by the original Phase 4 design. Payload shape validation is therefore only the first gate: the event is marked authenticity-verified only after the backend successfully queries Pesapal with merchant credentials and validates the returned tracking ID, merchant reference, amount and currency. The raw event records `provider_status_lookup` as its verification method; `signature_verified` remains false.

The admin endpoints require an authenticated `admin` or `agent` role. They expose the pending/reconciliation queue and recent run metadata, trigger one leased batch, or query Pesapal for one specific attempt. They do not expose raw provider responses, payer accounts or authorization data.

## Slice coverage

- **Slice 4 — initiation:** checkout validation, authoritative attempt creation, idempotency, provider submission, pending response and ambiguous/definitive failure mapping.
- **Slice 7 — callback:** exact raw-body capture, provider-specific verification, event persistence, semantic duplicate detection, normalization, shared result RPC and Pesapal acknowledgement.
- **Slice 8 — reconciliation:** leased pending selection, provider lookup, run evidence, shared result processing, secured admin controls and the one-minute scheduler.
- **Slice 9 — consumer:** Pesapal provider presentation, payer contact confirmation, hosted payment request, progressive polling, success/failure/cancellation/error screens and persisted ambiguous-payment recovery. MTN, Airtel and card selection remains inside Pesapal.
- **Slice 10 — market pickup:** pay-at-pickup selection for market-pickup fulfilment, pending physical-payment status, immediate inventory allocation, separate checkout/payment read-model states, securely retained pickup code and an idempotent collection-recording contract.
- **Slice 11 — hardening:** semantic duplicate callback tests, callback/expiry and callback/reconciliation process races, amount mismatch coverage, provider initiation/status timeout tests and durable app-restart recovery tests.

## Market-pickup contract

Selecting `market_pickup` through the normal initiation endpoint does not contact Pesapal:

```json
{ "provider": "market_pickup" }
```

In one transaction E-Katale creates a pending physical-payment attempt, commits the inventory allocation, confirms vendor orders and moves the checkout to `confirmed_unpaid`. The checkout read model therefore exposes order status and payment status independently. The short digital-payment expiry job can no longer release this committed allocation.

At collection an authenticated admin or agent—or the owning vendor for a single-vendor checkout—records payment with:

```json
{
  "amountReceived": 28000,
  "currency": "UGX",
  "paymentMethod": "cash",
  "pickupCode": "483921",
  "operationId": "00000000-0000-4000-8000-000000000001"
}
```

The database verifies the actor, six-digit pickup-code hash, exact server amount, UGX currency and operation UUID. A replay of the same operation returns the original success; reuse with different data is rejected. Actual collection evidence is stored separately from the normalized payment attempt.

## Concurrency rules

- Expiry, callbacks and pay-at-pickup selection lock checkout rows before listing and reservation rows.
- If expiry wins against a late successful callback, the checkout stays expired and the payment enters reconciliation without consuming inventory.
- If the callback wins, the checkout is paid and expiry skips it.
- Callback and reconciliation workers share `process_payment_result`; payment-attempt locking and terminal-state idempotency guarantee one inventory commitment and one success transition.

## Operational rules

- Redirects and IPNs are not proof of payment.
- The mobile client never supplies the authoritative amount.
- Timeouts and unknown states do not release inventory.
- `REVERSED` and unrecognized statuses require reconciliation; they never reverse completed inventory automatically.
- Do not log secrets, bearer tokens, full payer accounts or authorization headers.
- Pesapal settlement to E-Katale remains separate from later vendor settlements.
