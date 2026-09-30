Phase 4 is the **mutation safety layer** for Sokoni.

The source defines the contract clearly: every administrative mutation should carry a mandatory `reason`, an `expectedVersion` for optimistic concurrency, and an `operationId` for idempotency. It also preserves the dispatch patterns of server-enforced transitions and audit events, with confirmation dialogs for high-impact actions.

I would implement Phase 4 as **7 vertical slices**.

# Phase 4 — Controlled Mutations

## Target mutation contract

Every sensitive operation should conceptually look like:

```ts
type AdminMutationCommand<T> = {
  data: T;

  reason: string;
  expectedVersion: number;
  operationId: string;
};
```

For example:

```json
{
  "data": {
    "newRiderId": "rider-uuid"
  },
  "reason": "Current rider reported motorcycle breakdown",
  "expectedVersion": 12,
  "operationId": "01J8XYZ..."
}
```

The important point is that these fields are not decorative metadata.

Each exists to solve a specific operational risk:

```text
reason
    ↓
Why did the employee perform this action?

expectedVersion
    ↓
Has somebody else changed this record since I loaded it?

operationId
    ↓
Has this same operation already been executed?

server transition rules
    ↓
Is this action valid from the current business state?

audit event
    ↓
What exactly happened, by whom, and when?
```

---

# Slice 4.1 — Standardize the admin mutation envelope

Phase 3 introduced individual workflow operations.

Phase 4 should make their contracts consistent.

Instead of:

```text
POST /deliveries/:id/reassign
{
  newRiderId
}
```

use:

```text
POST /deliveries/:id/reassign
{
  newRiderId,
  reason,
  expectedVersion,
  operationId
}
```

Likewise:

```text
POST /orders/:id/cancel
POST /applications/:id/reject
POST /users/:id/suspend
POST /refunds/:id/approve
POST /listings/:id/approve
```

should all carry the same control metadata.

I would define a reusable schema.

For example:

```ts
const ControlledMutationSchema = z.object({
  reason: z.string()
    .trim()
    .min(5)
    .max(500),

  expectedVersion: z.number()
    .int()
    .min(0),

  operationId: z.string()
    .min(10)
    .max(100)
});
```

Then compose it into operation-specific schemas.

```ts
const ReassignRiderSchema =
  ControlledMutationSchema.extend({
    newRiderId: z.string().uuid()
  });
```

This avoids each workflow implementing slightly different safety semantics.

---

# Slice 4.2 — Mandatory operational reasons

The `reason` field should become a genuine operational control.

Do not accept:

```text
reason = ""
```

or meaningless placeholders such as:

```text
ok
test
change
```

For sensitive operations, the dialog should explicitly request a reason.

For example:

```text
Reassign delivery

Current rider:
John K.

New rider:
Peter M.

Reason:
[ Motorcycle breakdown reported by assigned rider ]

                     Cancel   Confirm reassignment
```

The reason should then be persisted into:

```text
domain operation history
+
audit event
```

not merely logged in the application server.

## Structured reason codes

For recurring operational workflows, combine structured reason codes with free text.

Example:

```json
{
  "reasonCode": "RIDER_BREAKDOWN",
  "reason": "Rider reported a punctured rear tyre.",
  "expectedVersion": 12,
  "operationId": "..."
}
```

Suggested examples:

### Delivery

```text
RIDER_UNAVAILABLE
RIDER_BREAKDOWN
CUSTOMER_UNAVAILABLE
WRONG_ASSIGNMENT
DELIVERY_EXCEPTION
OPERATIONS_OVERRIDE
```

### Application rejection

```text
IDENTITY_UNVERIFIED
DOCUMENT_UNREADABLE
MARKET_VERIFICATION_FAILED
VEHICLE_REQUIREMENTS_FAILED
DUPLICATE_APPLICATION
OTHER
```

### Suspension

```text
FRAUD_REVIEW
SAFETY_INCIDENT
POLICY_VIOLATION
VERIFICATION_ISSUE
ACCOUNT_COMPROMISE
OTHER
```

Structured codes enable reporting later, while the free-text reason preserves human context.

---

# Slice 4.3 — Optimistic concurrency

This is one of the most important controls.

Consider two agents loading the same order.

At the time they both load it:

```text
Order version = 14
```

Agent A:

```text
cancels order
expectedVersion = 14
```

The server updates:

```text
version = 15
```

Agent B still sees version 14 and attempts:

```text
issue refund
expectedVersion = 14
```

The server must reject it.

```http
409 Conflict
```

Example:

```json
{
  "error": {
    "code": "VERSION_CONFLICT",
    "message": "This order has changed since it was loaded.",
    "currentVersion": 15
  }
}
```

The UI should then:

```text
Action failed
      ↓
Reload latest state
      ↓
Show what changed
      ↓
Require operator to reconsider
```

It should **not automatically retry the mutation with the new version**.

That would defeat the purpose of optimistic concurrency.

---

## Database version field

Operational entities that support concurrent administration should have something like:

```text
version bigint not null default 0
```

Then mutation logic becomes conceptually:

```sql
UPDATE deliveries
SET
    rider_id = ...,
    version = version + 1
WHERE
    id = target_id
    AND version = expected_version;
```

If:

```text
affected rows = 0
```

then either:

```text
record missing
```

or:

```text
version conflict
```

The server resolves which and returns the appropriate error.

---

# Slice 4.4 — Idempotency with operation IDs

Consider this scenario:

```text
Finance clicks "Approve refund"
        ↓
request reaches backend
        ↓
refund executes
        ↓
network connection drops
        ↓
browser never receives success response
        ↓
finance clicks again
```

Without idempotency, that could cause duplicate processing.

This is exactly what:

```text
operationId
```

should prevent.

Generate the ID **before submitting the mutation**.

For example:

```ts
const operationId = crypto.randomUUID();
```

Then:

```json
{
  "reason": "...",
  "expectedVersion": 8,
  "operationId": "550e8400-e29b-41d4-a716-446655440000"
}
```

The database/backend stores processed operations.

Something like:

```text
admin_operations

operation_id
actor_staff_id
operation_type
entity_type
entity_id
request_hash
status
response
created_at
completed_at
```

When the same `operationId` arrives again:

```text
Has this operationId already completed?
        │
       yes
        ↓
return previous result

        OR

       no
        ↓
execute operation
```

Do not execute it twice.

---

## Protect against operation ID misuse

There is another important case:

```text
same operationId
different payload
```

That should fail.

For example:

```http
409 IDEMPOTENCY_KEY_REUSED
```

because an ID associated with:

```text
refund UGX 20,000
```

must not later be reused for:

```text
refund UGX 50,000
```

A request hash provides that protection.

---

# Slice 4.5 — Server-enforced state transitions

The browser must never dictate the resulting state.

Bad API:

```http
PATCH /orders/:id

{
  "status": "cancelled"
}
```

Better API:

```http
POST /orders/:id/cancel
```

The backend then determines whether:

```text
current state
+
business rules
+
permissions
+
related records
```

allow cancellation.

The source explicitly says earlier that staff must respect the order state machine and must not arbitrarily change database status.

That principle should become universal in Phase 4.

---

## Example: delivery reassignment

Allowed:

```text
Assigned
    ↓
reassign
    ↓
Assigned to another rider
```

Possibly allowed:

```text
At market
    ↓
reassign
```

depending on business rules.

Probably invalid:

```text
Completed
    ↓
reassign
```

The database/application service should return:

```http
409 Conflict
```

```json
{
  "error": {
    "code": "INVALID_STATE_TRANSITION",
    "message": "Completed deliveries cannot be reassigned."
  }
}
```

---

## Model actions instead of arbitrary status changes

Prefer:

```text
assign_rider()
reassign_rider()
approve_listing()
reject_application()
cancel_order()
approve_refund()
suspend_vendor()
```

instead of:

```text
set_status()
```

This keeps domain rules explicit.

---

# Slice 4.6 — Confirmation and impact summaries

This is the main frontend part of Phase 4.

The source specifically requires confirmation dialogs to explain exactly what will happen before high-impact actions such as cancellation, reassignment, suspension, or refund.

Do not use generic dialogs like:

```text
Are you sure?

Cancel   Confirm
```

They provide almost no protection.

The dialog should answer:

```text
WHAT?
WHO/WHAT IS AFFECTED?
WHAT CHANGES?
CAN IT BE UNDONE?
WHY ARE YOU DOING IT?
```

---

# Example — rider reassignment

```text
Reassign delivery

Order
SOK-24092

Current rider
John Mukasa

New rider
Peter Ssenyonga

This will:
• end John's active assignment
• assign Peter to the delivery
• notify affected operational parties
• add an entry to the delivery timeline
• create an audit record

Reason
[ Rider reported motorcycle breakdown ]

Cancel                     Reassign delivery
```

The actual side effects displayed must correspond to what the backend truly performs.

---

# Example — suspend vendor

```text
Suspend vendor

Vendor
Nakato Fresh Foods

This will:
• prevent the vendor from operating normally
• affect access to vendor operations
• preserve existing historical orders
• create a suspension and audit record

This action remains in effect until the account is reactivated.

Reason
[________________________]

Cancel                     Suspend vendor
```

If the real implementation does **not** stop listings or account access, the dialog must not claim that it does.

---

# Example — order cancellation

```text
Cancel order SOK-20814

Payment
Paid — UGX 84,000

Vendors
2

Delivery
Not yet assigned

Cancelling this order will:
• prevent further fulfilment
• cancel eligible seller orders
• create a cancellation event
• initiate the appropriate refund workflow where required

Reason
[________________________]

Back                        Cancel order
```

---

# Example — refund

Financial operations deserve stricter confirmation.

```text
Approve refund

Order
SOK-20260902-119

Customer
•••• 7712

Original payment
UGX 95,000

Refund amount
UGX 25,000

Reason
Missing product from Vendor B

This will create a financial refund instruction.
This operation will be audited.

Cancel                     Approve UGX 25,000 refund
```

Later, maker-checker rules can further restrict large refunds. The dashboard specification already recommends separate proposal and approval for larger refund amounts.

---

# Slice 4.7 — Unified audit + mutation result handling

Every controlled mutation should produce a consistent audit record.

For example:

```json
{
  "actorStaffId": "...",
  "action": "delivery.rider_reassigned",

  "entity": {
    "type": "delivery",
    "id": "..."
  },

  "reason": "Rider motorcycle breakdown",

  "previousState": {
    "riderId": "rider-a",
    "version": 12
  },

  "newState": {
    "riderId": "rider-b",
    "version": 13
  },

  "operationId": "...",
  "requestId": "...",

  "occurredAt": "..."
}
```

The audit requirements already call for previous state, new state, staff identity, reason, timestamp, operation/request identifiers and appropriate device/network information.

Importantly:

```text
business mutation
+
audit event
```

should normally occur within the same transaction.

Otherwise this can happen:

```text
mutation succeeds
        ↓
audit insert fails
        ↓
system changed with no audit trail
```

For high-value operations, that should generally result in rollback.

---

# Standard database function pattern

I would now establish a standard shape for all administrative DB functions.

Conceptually:

```sql
admin_reassign_delivery_rider(
    p_delivery_id,
    p_new_rider_id,
    p_reason,
    p_expected_version,
    p_operation_id,
    p_actor_staff_id
)
```

Internally:

```text
BEGIN

1. Check operation ID
2. Validate staff permission/context
3. Load and lock target
4. Compare expectedVersion
5. Check allowed state transition
6. Validate business conditions
7. Perform mutation
8. Increment version
9. Record domain history
10. Record audit event
11. Store idempotent result

COMMIT
```

If any mandatory step fails:

```text
ROLLBACK
```

---

# Recommended error vocabulary

Phase 4 should also standardize domain errors.

For example:

```text
400 VALIDATION_ERROR

401 UNAUTHENTICATED

403 FORBIDDEN

404 RESOURCE_NOT_FOUND

409 VERSION_CONFLICT

409 INVALID_STATE_TRANSITION

409 IDEMPOTENCY_KEY_REUSED

422 BUSINESS_RULE_VIOLATION

500 INTERNAL_ERROR
```

The frontend can then respond meaningfully.

For instance:

### `VERSION_CONFLICT`

```text
This delivery changed after I opened it.
Reload the latest state before attempting the action again.
```

### `INVALID_STATE_TRANSITION`

```text
This delivery is already completed and can no longer be reassigned.
```

### `IDEMPOTENCY_KEY_REUSED`

```text
This operation identifier was already used for a different request.
```

---

# UI mutation state machine

Every controlled operation should follow roughly:

```text
Idle
 ↓
Confirmation open
 ↓
Reason entered
 ↓
Submitting
 ├────→ Success
 │        ↓
 │      refresh
 │
 ├────→ Version conflict
 │        ↓
 │      reload
 │
 ├────→ Invalid transition
 │        ↓
 │      explain
 │
 └────→ Network/server error
          ↓
        safe retry
```

Important distinction:

A network retry can reuse the **same**:

```text
operationId
```

because that is exactly what makes the retry safe.

A new intentional operation gets a new ID.

---

# Example React abstraction

I would eventually create something like:

```tsx
<ControlledActionDialog
  title="Reassign delivery"
  description="..."
  impact={impact}
  requireReason
  onConfirm={async ({ reason, operationId }) => {
    await reassignDelivery({
      deliveryId,
      newRiderId,
      reason,
      expectedVersion: delivery.version,
      operationId,
    });
  }}
/>
```

But the component should handle only generic interaction.

Business-specific impact text belongs in the individual workflow.

Avoid one gigantic generic mutation engine trying to understand every domain operation.

---

# Where versions should live

Likely versioned entities include:

```text
orders
deliveries
applications
listings
price_change_requests
refunds
vendor_accounts
rider_accounts
settlement_batches
```

Not necessarily every database table needs a version field.

Version the **aggregate/resource being administratively controlled**.

For example, an order investigation may join:

```text
order
seller_orders
payment
delivery
```

but cancelling the order might primarily operate against:

```text
order.version
```

while rider reassignment uses:

```text
delivery.version
```

---

# High-impact vs routine operations

Not every action needs an equally heavy confirmation.

## Routine

For example:

```text
add support note
resend ordinary notification
start application review
```

may use lighter confirmation or no modal at all.

## High impact

Require full confirmation:

```text
cancel order
refund payment
reassign active delivery
reject application
suspend vendor
suspend rider
reactivate account
approve settlement
reverse financial operation
```

This keeps the dashboard usable while preserving friction where mistakes are expensive.

---

# Proposed controlled mutation contract

By the end of Phase 4, I would aim for this convention:

```ts
type ControlledMutation<TData> = {
  data: TData;

  control: {
    reason: string;
    expectedVersion: number;
    operationId: string;
  };
};
```

Example:

```json
{
  "data": {
    "newRiderId": "..."
  },
  "control": {
    "reason": "Current rider unavailable",
    "expectedVersion": 4,
    "operationId": "..."
  }
}
```

Whether those fields are nested under `control` or remain top-level is mostly an API-style choice. The important requirement is that the semantics remain consistent across the entire admin API.

---

# Phase 4 backlog

## Mutation framework

```text
P4-001 Controlled mutation schema
P4-002 Common operation metadata type
P4-003 Standard mutation error model
P4-004 Version conflict handling
P4-005 Idempotency infrastructure
P4-006 Operation result persistence
```

## Concurrency

```text
P4-010 Add entity version fields
P4-011 Repository expected-version support
P4-012 Database compare-and-update logic
P4-013 409 VERSION_CONFLICT responses
P4-014 Concurrent mutation integration tests
```

## Idempotency

```text
P4-020 admin_operations table
P4-021 operation ID lookup
P4-022 request hashing
P4-023 duplicate response replay
P4-024 conflicting reuse detection
P4-025 retry tests
```

## State machines

```text
P4-030 Centralize valid delivery transitions
P4-031 Order mutation rules
P4-032 Application mutation rules
P4-033 Catalogue mutation rules
P4-034 Refund transition rules
P4-035 Account suspension rules
```

## Audit

```text
P4-040 Transactional audit writer
P4-041 Previous-state capture
P4-042 New-state capture
P4-043 Operation/request correlation
P4-044 Audit integrity tests
```

## Frontend

```text
P4-050 ControlledActionDialog
P4-051 Mandatory reason control
P4-052 Impact summary component
P4-053 Version conflict UI
P4-054 Invalid-transition UI
P4-055 Retry semantics
```

## Workflow migrations

```text
P4-060 Convert delivery mutations
P4-061 Convert catalogue mutations
P4-062 Convert application mutations
P4-063 Convert payment mutations
P4-064 Convert order mutations
P4-065 Convert suspension workflows
P4-066 Convert refund workflows
```

---

# Phase 4 Definition of Done

I would not call Phase 4 complete until:

- every sensitive administrative mutation requires a meaningful reason;
    
- operation IDs are generated client-side before submission;
    
- retries with the same operation ID cannot duplicate an action;
    
- reuse of an operation ID with a different payload is rejected;
    
- controlled entities expose a version;
    
- mutations send `expectedVersion`;
    
- stale mutations return `409 VERSION_CONFLICT`;
    
- the UI does not silently retry version conflicts;
    
- business state transitions are enforced server-side;
    
- generic direct status editing is eliminated from admin APIs;
    
- multi-record operations are transactional;
    
- audit events are written together with the operation;
    
- audit records preserve previous and new state where appropriate;
    
- high-impact actions show precise impact summaries;
    
- cancellation, reassignment, suspension, and refund use controlled confirmation flows;
    
- authorization remains enforced server-side;
    
- duplicate-click and network-retry tests pass;
    
- concurrent-operator tests pass;
    
- invalid transition tests pass;
    
- every Phase 3 mutation has been migrated onto the controlled mutation framework.
    

The architecture after Phase 4 becomes:

```text
PHASE 1
Authentication + permissions
          ↓
PHASE 2
Read models
          ↓
PHASE 3
Real workflows
          ↓
PHASE 4
Controlled mutations
          ↓

       Sokoni Admin
   ┌─────────────────┐
   │ Authenticated   │
   │ Authorized      │
   │ Concurrent-safe │
   │ Idempotent      │
   │ State-aware     │
   │ Auditable       │
   └─────────────────┘
```

This phase is especially important because from this point onward the operations dashboard is no longer merely an internal UI. It becomes a **privileged control plane for marketplace operations and money movement**, so mutation safety needs to be part of the architecture rather than something added after the pilot.