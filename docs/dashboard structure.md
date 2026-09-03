You already have a thin operations prototype—not a blank slate. It currently includes:

- Listing and price approval queues
- A live delivery board
- Nearby-rider search
- Manual rider assignment and reassignment
- Delivery exception handling
- Audited rider/customer contact access
- Delivery-evidence viewing

The current entry point is [App.tsx](/home/jjemba/Alpha_pjts/sokoni-digital/apps/operations-web/src/App.tsx), with dispatch functionality in [DeliveryBoard.tsx](/home/jjemba/Alpha_pjts/sokoni-digital/apps/operations-web/src/DeliveryBoard.tsx).

## Recommended dashboard structure

### 1. Operations overview

The landing page should answer: “What needs attention right now?”

Show:

- Orders received today
- Gross order value
- Paid, pending and failed payments
- Orders waiting for vendor acceptance
- Orders delayed in preparation
- Deliveries waiting for riders
- Active deliveries
- Delivery problems
- Pending vendor/rider approvals
- Pending listing and price approvals
- Vendors currently active
- Riders currently available

Include an “Attention required” section containing actionable alerts such as:

- Order not accepted after 10 minutes
- Paid order stuck in preparation
- Delivery has no rider
- Rider has not progressed an active delivery
- Payment awaiting reconciliation
- Delivery issue reported
- Vendor or rider application awaiting review

Every card should link directly to the filtered operational queue.

---

### 2. Order management

Provide a searchable table of all checkouts and seller orders.

Filters:

- Order reference
- Consumer telephone
- Vendor
- Market
- Fulfilment type
- Payment status
- Seller-order status
- Delivery status
- Date range
- “Delayed only”
- “Issues only”

The order detail page should show:

- Consumer and delivery information
- Payment summary
- Products grouped by vendor
- Vendor acceptance and preparation progress
- Packing/quality photographs
- Delivery assignment
- Complete status timeline
- Notifications sent
- Refund history
- Internal support notes

Safe administrative actions might include:

- Cancel an eligible order
- Start a refund
- Resend a notification
- Contact the consumer
- Contact the vendor
- Escalate to dispatch
- Record an internal note

Actions must respect the existing order state machine. Staff should not be able to arbitrarily change a database status.

---

### 3. Live delivery control room

Build upon the existing delivery board with columns such as:

```
Waiting for rider → Offers sent → Assigned → At market
→ Picked up → In transit → Problems → Completed
```

Functionality:

- Search nearby available riders
- Assign or reassign a rider
- See rider availability and latest location snapshot
- View pickup checklist across multiple vendors
- Contact rider, consumer or vendor
- Cancel an assignment
- Handle customer-unavailable cases
- Return an order to the market
- Review consumer PIN confirmation
- Review delivery photographs
- Resolve delivery issues with standard resolution codes
- Show how long each delivery has remained in its current state

The system currently uses location snapshots rather than continuous GPS tracking. The dashboard should communicate “last updated location” instead of implying live continuous tracking.

---

### 4. Vendor and rider approvals

Create one combined “Applications” area with separate Vendor and Rider tabs.

Vendor review:

- Applicant identity
- Phone verification
- Stall name and Kitooro stall number
- Product categories
- Market identification
- Market-leadership confirmation
- Stall photograph
- Terms and commission acceptance
- Review timeline

Rider review:

- Applicant identity
- Phone verification
- National ID documents
- Motorcycle details
- Number plate
- Rider association
- Next-of-kin details
- Verification photographs
- Review timeline

Actions:

- Start review
- Approve
- Request changes
- Reject
- Suspend an approved account
- Add private review notes

The API routes exist, but many are currently placeholder responses and need real repositories and database operations.

---

### 5. Catalogue governance

Extend the current functionality with:

- Pending listing approvals
- Pending price changes
- Listings requiring changes
- Active and archived listings
- Products without usable photographs
- Unavailable and low-stock products
- Vendor catalogue history
- Price-change history
- Duplicate or suspicious listings

Reviewers should see:

- Product images
- Package quantity and unit
- Vendor and stall
- Current price
- Proposed price
- Previous approved price
- Reviewer notes
- Relevant audit history

Useful alerts include unusually large price changes and repeated availability conflicts.

---

### 6. Payments and reconciliation

Create a payments workspace with:

- Successful, pending, failed and reversed payments
- MTN MoMo, Airtel Money and market-pickup payments
- Provider references
- Checkout references
- Callback/webhook status
- Reconciliation attempts
- Payment audit events
- Duplicate or unmatched provider events

Actions:

- Recheck an individual payment
- Run a pending-payment reconciliation batch
- Review provider response history
- Mark a case for financial investigation
- Start a controlled refund workflow

The backend already provides reconciliation endpoints. The operations interface has not yet exposed them.

---

### 7. Refunds and disputes

A dedicated exception queue should cover:

- Consumer cancellation
- Vendor rejection
- Missing products
- Poor-quality products
- Failed delivery
- Duplicate payment
- Incorrect payment amount
- Partial fulfilment

Each case should contain:

- Order evidence
- Packing photograph
- Delivery photograph
- Payment information
- Communication history
- Proposed refund amount
- Approval state
- Resolution notes

For financial safety, use maker-checker approval for larger refunds: one employee proposes the refund and another approves it.

---

### 8. Settlements and earnings

This will require new backend development because the settlements module is currently empty.

Vendor settlement functionality:

- Gross sales
- Commission
- Refund deductions
- Net vendor payable
- Settlement status
- Settlement period
- Payment reference
- Downloadable statement

Rider settlement functionality:

- Completed deliveries
- Delivery fees earned
- Adjustments
- Net rider payable
- Payment status
- Downloadable statement

Operations should be able to:

- Generate settlement batches
- Review totals
- Approve batches
- Mark payments as sent
- Record external payment references
- Export CSV reports
- Investigate settlement differences

Do not calculate final settlement totals only in the browser. The backend/database must generate immutable ledger entries.

---

### 9. User and device management

Provide management for:

- Consumers
- Vendors
- Riders
- Agents
- Administrators
- Trusted devices
- New-device approval requests
- Suspended accounts

Actions:

- View account status
- Suspend/reactivate accounts
- Approve or reject device requests
- Revoke trusted devices
- View sign-in/security events
- Reset account access through a controlled workflow

Sensitive information should be masked by default.

---

### 10. Notifications and communication

Track operational messages sent through:

- Push notification
- SMS
- WhatsApp fallback
- In-app notifications

Show:

- Message type
- Recipient
- Related order
- Delivery status
- Failure reason
- Number of attempts

Allow staff to resend approved notification templates, but not compose unrestricted messages from the dashboard.

---

### 11. Audit and reporting

Every sensitive dashboard action should produce an audit event containing:

- Staff user
- Action
- Entity affected
- Previous state
- New state
- Mandatory reason
- Date and time
- Request/operation ID
- IP or device information where appropriate

Reports could include:

- Daily orders and revenue
- Vendor acceptance rate
- Average preparation time
- Rider offer acceptance rate
- Average delivery time
- Delivery success rate
- Refund rate
- Payment success rate
- Products frequently unavailable
- Sales per vendor/category
- Commission and settlement totals

## Suggested navigation

```
Overview
Orders
Deliveries
Approvals
  ├── Vendors
  ├── Riders
  ├── Listings
  └── Price changes
Payments
Refunds
Settlements
Users & devices
Notifications
Reports
Audit log
Settings
```

## How to develop it

### Phase 1: Establish the secure dashboard shell

Refactor the current single-page prototype into a proper application shell:

- Sidebar navigation
- Top status bar
- Responsive desktop/tablet layout
- React Router
- Shared tables, filters, badges, dialogs and detail drawers
- Error boundary and loading states
- Role-aware navigation

Replace the pasted bearer-token field with an actual staff sign-in using Supabase Auth. Never expose the Supabase service-role key in the web application.

Initially support:

- `admin`: full access
- `agent`: approvals and customer support
- `dispatcher`: delivery operations
- `finance`: payments, refunds and settlements
- `viewer`: reporting-only access

This requires extending the current `admin | agent` authorization model into permission-based access.

### Phase 2: Create backend read models

Dashboard screens should not assemble information through dozens of client requests. Add purpose-built API endpoints such as:

```
GET /v1/admin/overview
GET /v1/admin/orders
GET /v1/admin/orders/:id
GET /v1/admin/applications
GET /v1/admin/payments/reconciliation
GET /v1/admin/refunds
GET /v1/admin/settlements
GET /v1/admin/audit-events
```

Each endpoint should support:

- Pagination
- Server-side filters
- Date ranges
- Search
- Sorting
- Permission checks

Use PostgreSQL views or RPC functions for operational summaries where joins are complex.

### Phase 3: Complete the existing workflows

Prioritize the workflows already supported by the platform:

1. Delivery control room
2. Listing and price approvals
3. Vendor/rider application approval
4. Payment reconciliation
5. Order investigation

Connect the current placeholder application routes to Supabase repositories and audited database functions.

### Phase 4: Add controlled mutations

Every administrative mutation should include:

```
{
  reason: string;
  expectedVersion: number;
  operationId: string;
}
```

This preserves the patterns already used in dispatch:

- Mandatory operational reason
- Optimistic concurrency
- Idempotent operations
- Server-enforced state transitions
- Audit events

Confirmation dialogs should summarize exactly what will happen before high-impact actions such as cancellation, reassignment, suspension or refund.

### Phase 5: Add settlements and reports

Create:

- Vendor payable ledger
- Rider payable ledger
- Settlement batches
- Settlement batch items
- Adjustments
- External payment references
- Settlement audit events

After the ledger is reliable, add dashboard summaries and CSV exports.

### Phase 6: Improve freshness and alerting

The existing dashboard polls every 15 seconds. That is acceptable for the pilot.

Later, use Supabase Realtime or server-sent events for:

- New paid orders
- Delivery state changes
- Rider-reported problems
- Payment reconciliation results
- New applications

Keep polling as a fallback so operations do not depend on realtime connectivity.

## Recommended first release

For the Kitooro Market pilot, I would limit the first production dashboard to:

1. Secure staff authentication and permissions
2. Overview and attention queue
3. Full order lookup
4. Delivery control room
5. Vendor/rider approvals
6. Listing and price approvals
7. Payment reconciliation
8. Basic refund handling
9. Audit log

Settlements, advanced analytics and notification management can follow once real pilot data reveals the actual operational bottlenecks. This gives the team a genuine control room without delaying launch for a large analytics system.