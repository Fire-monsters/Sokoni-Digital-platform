# Slice 3.5 — Order investigation

The order detail route at `/dashboard/orders/:orderId` is an operational narrative:
customer and delivery details, payment state, every vendor and item, signed private
evidence, delivery assignment/issues, a unified timeline, notifications, refunds,
and append-only internal notes.

## Staff commands

| Endpoint under `/v1/admin`                              | Permission             | Behavior                                                                       |
| ------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------ |
| `POST /orders/:id/notes`                                | `orders.support`       | Appends an immutable internal note                                             |
| `POST /orders/:id/contact/:target/reveal`               | `orders.support`       | Reveals the linked consumer or assigned rider phone once and audits the reason |
| `POST /orders/:id/notifications/:notificationId/resend` | `notifications.manage` | Rebuilds a current approved template and queues it through the existing outbox |
| `POST /orders/:id/escalate-dispatch`                    | `orders.support`       | Opens a linked delivery issue using optimistic delivery version checking       |
| `POST /orders/:id/cancel`                               | `orders.support`       | Cancels only an unpaid, undispatched order and atomically releases inventory   |

Every body is strict and requires an operation UUID. Actor identity is taken from
the authenticated staff session and rechecked inside PostgreSQL. Unknown database
errors are masked at the API boundary.

## Sensitive data

Order reads return masked contacts. A reveal requires a reason and a new audited
operation. Phone values are returned only in the first command response and are
excluded from operation replay records and audit details. Replaying the same key
does not reveal the phone again.

Quality and delivery evidence remains in private storage. The API replaces storage
paths with five-minute signed URLs; raw bucket paths are not returned to the browser.
Support notes, operations, and audits have RLS enabled with no client policies.

## Notification and cancellation boundaries

Resends cannot contain operator-authored copy. The database verifies that the
original notification belongs to the order, its referenced vendor/delivery is
still in that state, and the template is approved. A 60-second per-event cooldown
prevents repeated sends. The existing notification worker delivers the new outbox row.

Cancellation is intentionally narrow. It rejects paid orders, unresolved payment
attempts, vendor preparation, and any linked delivery. Eligible cancellation locks
financial and inventory records, validates reserved stock, releases reservations,
and records checkout/support audit history in one transaction. Paid-order resolution
uses the existing approval-only refund request flow; staff cannot directly execute a
refund from this screen.

## Verification

`supabase/tests/order_investigation.sql` covers permissions, immutable notes,
idempotency, contact-data non-retention, optimistic dispatch escalation, template
reconstruction/cooldown, cancellation eligibility, inventory release, timelines,
and refund projection. Before release, run the complete database, API, and web
test suites and perform browser smoke tests with read-only, support, notification,
dispatcher, and finance permissions.
