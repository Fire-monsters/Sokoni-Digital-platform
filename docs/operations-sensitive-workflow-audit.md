# Slice 3.6 — Sensitive workflow audit

Sensitive operations now produce one canonical, append-only audit record in the same
database transaction as their domain change. Existing domain-specific audit tables
remain useful for local histories; database triggers copy their events into
`public.audit_events`. The migration backfills the earlier catalogue, seller-order,
quality, payment, delivery, pickup, application, and order-support history.

## Canonical contract

Each event records the staff actor, normalized action, entity and reference, previous
and new state, reason, operation ID, HTTP request ID, IP address, user agent, timestamp,
and non-sensitive workflow details. Contact values, application private notes, provider
payloads, and other secrets are deliberately excluded.

The central table has RLS enabled, grants no browser role access, and rejects updates
and deletes. Eight transaction triggers cover the sensitive workflow sources. Audited
RPC wrappers bind API request metadata with `set_config(..., true)` before executing the
existing authoritative database function, so the command and its audit event commit or
roll back together.

Normalized action examples include:

- `delivery.rider_assigned` and `delivery.rider_reassigned`
- `catalogue.listing_approved` and `catalogue.listing_changes_requested`
- `catalogue.price_change_approved`
- `application.review_started`, `application.approved`, and `application.rejected`
- `payment.reconciled` and `payment.investigation_flagged`
- `order.support_note_added` and `order.notification_resent`

## Operations access

Only staff with `audit.read` can use:

- `GET /v1/admin/audit-events`
- `GET /v1/admin/audit-events/:eventId`

Both endpoints return `Cache-Control: no-store`. The `/dashboard/audit` workspace
supports server-side reference/action/request search, entity and date filtering,
pagination, and immutable event detail with before/after state and request correlation.

## Verification

`supabase/tests/sensitive_workflow_audit.sql` verifies RLS and grants, all eight source
triggers, normalized actions, request metadata, state snapshots, search/detail reads,
and update/delete rejection. API tests cover metadata binding, audited RPC selection,
permissions, validation, and no-store responses. Web tests cover the unified ledger and
cross-workflow filters.
