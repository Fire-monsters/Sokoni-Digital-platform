import type * as Api from "@sokoni-digital/api-client";
import type {
  AuditEventDetail,
  DispatcherDeliveryBoard,
  OrderInvestigationCommandResult,
} from "@sokoni-digital/domain";
import { createFixtures, now, operator } from "./fixtures";
// Keep domain-compatible results without accepting API origins or credentials.
type Local<T> = T extends (options: never, ...args: infer A) => infer R ? (...args: A) => R : never;
const store = createFixtures();
const copy = <T>(value: T): T => structuredClone(value);
function find<T extends { id: string }>(items: T[], id: string): T {
  const item = items.find((item) => item.id === id);
  if (!item) throw new DemoError("Demo record not found.", "NOT_FOUND");
  return item;
}
export class DemoError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}
function check(item: { version: number }, version: number) {
  if (item.version !== version)
    throw new DemoError("This demo record changed.", "VERSION_CONFLICT");
}
function audit(
  action: string,
  type: string,
  id: string,
  reason: string,
  previous: unknown,
  next: unknown,
) {
  const entry: AuditEventDetail = {
    id: crypto.randomUUID(),
    actor: { staffId: operator.id, name: operator.name, role: "Demo operator" },
    action,
    entity: { type, id, reference: null },
    reason,
    operationId: null,
    requestId: null,
    context: { ip: null, device: "Local demo", userAgent: null },
    occurredAt: now(),
    previousState: { value: copy(previous) },
    newState: { value: copy(next) },
    details: { simulated: true },
  };
  store.audit.unshift(entry);
}
function page<T>(items: T[], number = 1, size = 25) {
  return copy({
    data: items.slice((number - 1) * size, number * size),
    pagination: {
      page: number,
      pageSize: size,
      totalItems: items.length,
      totalPages: Math.ceil(items.length / size),
    },
  });
}
export const fetchApplicationQueue: Local<typeof Api.fetchApplicationQueue> = async (query) =>
  page(
    store.applications
      .filter((a) => a.type === query.type && (!query.status || a.status === query.status))
      .map((a) => ({
        id: a.id,
        type: a.type,
        status: a.status,
        applicant: { name: a.applicantName, phoneMasked: "Demo phone ••••" },
        market: a.market,
        reviewer: a.reviewerId ? { id: a.reviewerId, name: operator.name } : null,
        submittedAt: a.submittedAt,
        reviewStartedAt: a.reviewStartedAt,
      })),
    query.page,
  );
export const fetchApplicationReview: Local<typeof Api.fetchApplicationReview> = async (id) =>
  copy(find(store.applications, id));
export const reviewApplication: Local<typeof Api.reviewApplication> = async (id, action, input) => {
  const a = find(store.applications, id);
  check(a, input.expectedVersion);
  const previous = copy(a);
  if (action !== "notes")
    a.status = (
      {
        "start-review": "in_review",
        approve: "approved",
        "request-changes": "changes_requested",
        reject: "rejected",
        suspend: "suspended",
      } as const
    )[action];
  a.version++;
  a.reason = input.reason;
  a.issues = input.issues ?? [];
  if (action === "start-review") {
    a.reviewerId = operator.id;
    a.reviewerName = operator.name;
    a.reviewStartedAt = now();
  }
  a.timeline.unshift({
    id: crypto.randomUUID(),
    action,
    actorUserId: operator.id,
    fromStatus: previous.status,
    toStatus: a.status,
    reason: input.reason,
    issues: a.issues,
    internalNotes: input.internalNotes ?? null,
    createdAt: now(),
  });
  audit(`application.${action}`, "application", id, input.reason, previous, a);
  return {
    applicationId: id,
    status: a.status,
    version: a.version,
    operationId: input.operationId,
    duplicate: false,
  };
};
export const fetchAdminListingQueue: Local<typeof Api.fetchAdminListingQueue> = async () =>
  copy({ listings: store.listings });
export const fetchAdminPriceQueue: Local<typeof Api.fetchAdminPriceQueue> = async () =>
  copy({ requests: store.prices });
function listingDecision(
  id: string,
  version: number,
  operationId: string,
  reason: string,
  status: "active" | "changes_requested",
) {
  const item = find(store.listings, id);
  check(item, version);
  const previous = copy(item);
  item.status = status;
  item.version++;
  item.auditHistory.unshift({
    id: crypto.randomUUID(),
    action: `listing.${status}`,
    actorUserId: operator.id,
    previousState: { status: previous.status },
    nextState: { status },
    createdAt: now(),
  });
  audit(`listing.${status}`, "listing", id, reason, previous, item);
  return {
    operationId,
    duplicate: false,
    listingId: id,
    requestId: null,
    status,
    version: item.version,
  };
}
export const approveAdminListing: Local<typeof Api.approveAdminListing> = async (
  id,
  version,
  operationId,
  reason,
) => listingDecision(id, version, operationId, reason, "active");
export const requestAdminListingChanges: Local<typeof Api.requestAdminListingChanges> = async (
  id,
  version,
  operationId,
  reason,
) => listingDecision(id, version, operationId, reason, "changes_requested");
export const reviewAdminPrice: Local<typeof Api.reviewAdminPrice> = async (
  id,
  decision,
  operationId,
  version,
  reason,
) => {
  const price = store.prices.find((p) => p.requestId === id);
  if (!price) throw new DemoError("Price request not found.", "NOT_FOUND");
  const listing = find(store.listings, price.listingId);
  if (version !== 0) check(listing, version);
  const previous = copy(listing);
  if (decision === "approve") listing.approvedPriceUgx = price.proposedPriceUgx;
  listing.version++;
  listing.priceHistory.unshift({
    requestId: id,
    previousPriceUgx: price.currentPriceUgx,
    proposedPriceUgx: price.proposedPriceUgx,
    status: decision === "approve" ? "approved" : "rejected",
    reason: price.reason,
    reviewNote: reason,
    submittedAt: price.createdAt,
    reviewedAt: now(),
  });
  store.prices.splice(store.prices.indexOf(price), 1);
  audit(`price.${decision}`, "price_request", id, reason, previous, listing);
  return {
    operationId,
    duplicate: false,
    listingId: listing.id,
    requestId: id,
    status: decision === "approve" ? "approved" : "rejected",
    version: listing.version,
  };
};
export const fetchPaymentFinanceQueue: Local<typeof Api.fetchPaymentFinanceQueue> = async (query) =>
  page(
    store.payments
      .map((p) => ({
        paymentId: p.id,
        orderReference: p.reference,
        provider: p.provider,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        reconciliation: {
          status: p.investigations.length
            ? "needs_review"
            : p.status === "successful"
              ? "resolved"
              : "pending",
          attemptCount: p.reconciliations.length,
          lastAttemptAt: p.reconciliations[0]?.created_at ?? null,
        },
        flags: p.investigations.length ? ["needs_review"] : [],
      }))
      .filter(
        (p) =>
          (!query.q ||
            `${p.orderReference} ${p.paymentId}`.toLowerCase().includes(query.q.toLowerCase())) &&
          (!query.reconciliationStatus || p.reconciliation.status === query.reconciliationStatus),
      ),
    query.page,
  );
export const fetchPaymentFinanceDetail: Local<typeof Api.fetchPaymentFinanceDetail> = async (id) =>
  copy(find(store.payments, id));
export const recheckPayment: Local<typeof Api.recheckPayment> = async (
  id,
  operationId,
  version,
  reason,
) => {
  const p = find(store.payments, id);
  check(p, version);
  const previous = copy(p);
  p.status = "successful";
  p.version++;
  const reconciliationId = crypto.randomUUID();
  p.reconciliations.unshift({
    id: reconciliationId,
    previous_status: previous.status,
    local_status_after: p.status,
    provider_status: "simulated_successful",
    result: "simulated",
    error_code: null,
    requested_by: operator.name,
    run_source: "demo",
    request_reference: operationId,
    provider_amount_ugx: p.amount,
    provider_currency: p.currency,
    created_at: now(),
  });
  audit("payment.simulated_recheck", "payment", id, reason, previous, p);
  return {
    paymentAttemptId: id,
    status: p.status,
    outcome: "simulated_successful",
    reconciliationId,
    duplicate: false,
  };
};
export const reconcilePendingPayments: Local<typeof Api.reconcilePendingPayments> = async (
  operationId,
  reason,
) => {
  const pending = store.payments.filter((p) => p.status === "pending");
  for (const p of pending) await recheckPayment(p.id, operationId, p.version, reason);
  return {
    claimed: pending.length,
    resolved: pending.length,
    pending: 0,
    needsReview: 0,
    failed: 0,
  };
};
export const commandPaymentFinance: Local<typeof Api.commandPaymentFinance> = async (
  id,
  action,
  input,
) => {
  const p = find(store.payments, id);
  check(p, input.expectedVersion);
  const previous = copy(p);
  const resultId = crypto.randomUUID();
  if (action === "request-refund") {
    if (!input.amount || input.amount <= 0 || input.amount > p.amount)
      throw new DemoError("Enter an amount within the payment total.", "VALIDATION");
    p.refunds.unshift({
      id: resultId,
      reason: input.reason,
      requested_amount_ugx: input.amount,
      status: "pending",
      approval_state: "pending",
      created_at: now(),
    });
  } else
    p.investigations.unshift({
      id: resultId,
      reason_code: input.reasonCode,
      reason: input.reason,
      status: "open",
      created_by: operator.name,
      created_at: now(),
    });
  p.version++;
  audit(`payment.${action}`, "payment", id, input.reason, previous, p);
  return {
    id: resultId,
    paymentAttemptId: id,
    status: "pending",
    duplicate: false,
    version: p.version,
  };
};
export const fetchDispatcherDeliveryBoard: Local<
  typeof Api.fetchDispatcherDeliveryBoard
> = async () => {
  const board: DispatcherDeliveryBoard = {
    deliveries: store.deliveries.map((d) => ({
      ...d.delivery,
      marketName: d.delivery.market.name,
      zoneName: d.delivery.destination.zoneName,
      destinationSummary: d.delivery.destination.summary,
      transporter: d.assignedRider,
      openIssueCount: d.issues.filter((i) => i.status === "open").length,
    })),
    issues: store.deliveries.flatMap((d) =>
      d.issues
        .filter((i) => i.status === "open")
        .map((i) => ({ ...i, deliveryId: d.delivery.id, deliveryReference: d.delivery.reference })),
    ),
  };
  return copy(board);
};
function delivery(id: string) {
  const d = store.deliveries.find((d) => d.delivery.id === id);
  if (!d) throw new DemoError("Delivery not found.", "NOT_FOUND");
  return d;
}
export const fetchDispatcherDelivery: Local<typeof Api.fetchDispatcherDelivery> = async (id) =>
  copy(delivery(id));
export const fetchDispatcherRiders: Local<typeof Api.fetchDispatcherRiders> = async () =>
  copy(store.riders);
export const fetchDispatcherNearbyRiders: Local<typeof Api.fetchDispatcherNearbyRiders> = async (
  id,
  radius = 10,
) => {
  delivery(id);
  return copy(store.riders.filter((r) => (r.distanceKm ?? 0) <= radius));
};
export const assignDispatcherDelivery: Local<typeof Api.assignDispatcherDelivery> = async (
  id,
  reassign,
  input,
) => {
  const d = delivery(id);
  check(d.delivery, input.expectedVersion);
  const previous = copy(d);
  const rider = find(store.riders, input.transporterId);
  d.assignedRider = copy(rider);
  d.delivery.status = "assigned";
  d.delivery.version++;
  d.delivery.assignedAt = now();
  d.delivery.updatedAt = now();
  d.assignmentHistory.unshift({
    operationId: input.operationId,
    riderId: rider.id,
    riderName: rider.displayName,
    previousRiderId: previous.assignedRider?.id ?? null,
    reason: input.reason,
    assignedBy: operator,
    assignedAt: now(),
    reassignment: reassign,
  });
  audit("delivery.assigned", "delivery", id, input.reason, previous, d);
  return {
    deliveryId: id,
    transporterId: rider.id,
    previousTransporterId: previous.assignedRider?.id ?? null,
    status: "assigned",
    version: d.delivery.version,
    operationId: input.operationId,
    duplicate: false,
  };
};
export const performDispatcherDeliveryAction: Local<
  typeof Api.performDispatcherDeliveryAction
> = async (id, input) => {
  const d = delivery(id);
  check(d.delivery, input.expectedVersion);
  const previous = copy(d);
  if (input.action === "CANCEL_ASSIGNMENT") {
    d.assignedRider = null;
    d.delivery.status = "unassigned";
  }
  if (input.action === "MARK_CUSTOMER_UNAVAILABLE") d.delivery.status = "customer_unavailable";
  if (input.action === "RETURN_TO_MARKET") d.delivery.status = "returned";
  d.delivery.version++;
  d.delivery.updatedAt = now();
  d.timeline.unshift({
    id: crypto.randomUUID(),
    type: "status",
    title: `Demo: ${input.action}`,
    fromStatus: previous.delivery.status,
    toStatus: d.delivery.status,
    actor: operator,
    reason: input.reason,
    occurredAt: now(),
  });
  audit(`delivery.${input.action}`, "delivery", id, input.reason, previous, d);
  return {
    deliveryId: id,
    action: input.action,
    status: d.delivery.status,
    version: d.delivery.version,
    operationId: input.operationId,
    contactPhoneNumber: input.action.startsWith("CONTACT") ? "Demo contact (no real number)" : null,
    duplicate: false,
  };
};
export const resolveDispatcherDeliveryIssue: Local<
  typeof Api.resolveDispatcherDeliveryIssue
> = async (id, input) => {
  const d = store.deliveries.find((d) => d.issues.some((i) => i.id === id));
  if (!d) throw new DemoError("Issue not found.", "NOT_FOUND");
  check(d.delivery, input.expectedVersion);
  const issue = find(d.issues, id);
  const previous = copy(issue);
  issue.status = "resolved";
  issue.resolutionCode = input.resolutionCode;
  issue.resolutionNote = input.resolutionNote;
  issue.resolvedAt = now();
  d.delivery.version++;
  audit("delivery.issue_resolved", "delivery_issue", id, input.reason, previous, issue);
  return { issueId: id, deliveryId: d.delivery.id, status: "resolved", duplicate: false };
};
export const fetchOrderInvestigation: Local<typeof Api.fetchOrderInvestigation> = async (id) => {
  const o = store.orders.find((o) => o.order.id === id);
  if (!o) throw new DemoError("Demo order not found.", "NOT_FOUND");
  const p = o.payment && find(store.payments, String(o.payment.id));
  if (p) {
    o.payment = {
      ...o.payment,
      version: p.version,
      status: p.status === "successful" ? "paid" : p.status,
    };
    o.refunds = p.refunds.map((r) => ({
      id: r.id,
      requestedAmount: r.requested_amount_ugx,
      currency: p.currency,
      reason: r.reason,
      status: r.status,
      approvalState: r.approval_state,
      createdAt: r.created_at,
    }));
  }
  if (o.delivery) {
    const d = delivery(o.delivery.id);
    o.delivery = {
      ...o.delivery,
      status: d.delivery.status,
      version: d.delivery.version,
      rider: d.assignedRider
        ? {
            id: d.assignedRider.id,
            name: d.assignedRider.displayName,
            phoneMasked: "Demo phone ••••",
          }
        : null,
      issues: copy(d.issues),
    };
  }
  return copy(o);
};
function order(id: string) {
  const o = store.orders.find((o) => o.order.id === id);
  if (!o) throw new DemoError("Demo order not found.", "NOT_FOUND");
  return o;
}
function orderResult(id: string, status: string): OrderInvestigationCommandResult {
  return { orderId: id, status, duplicate: false };
}
export const addOrderSupportNote: Local<typeof Api.addOrderSupportNote> = async (
  id,
  operationId,
  note,
) => {
  const o = order(id);
  o.supportNotes.unshift({ id: operationId, note, createdAt: now(), author: operator });
  audit("order.notes", "order", id, note, null, { note });
  return orderResult(id, "recorded");
};
export const revealOrderContact: Local<typeof Api.revealOrderContact> = async (
  id,
  target,
  operationId,
  reason,
) => {
  order(id);
  audit("order.reveal_contact", "order", id, reason, null, { target, operationId });
  return { ...orderResult(id, "simulated"), phoneNumber: "Demo contact (no real number)" };
};
export const resendOrderNotification: Local<typeof Api.resendOrderNotification> = async (
  id,
  notificationId,
  operationId,
  reason,
) => {
  const n = find(order(id).notifications, notificationId);
  n.deliveries.forEach((d) => {
    d.status = "simulated";
    d.attemptCount++;
  });
  audit("order.simulated_notification", "order", id, reason, null, { notificationId, operationId });
  return orderResult(id, "simulated");
};
export const escalateOrderToDispatch: Local<typeof Api.escalateOrderToDispatch> = async (
  id,
  operationId,
  reason,
  version,
) => {
  const o = order(id);
  if (!o.delivery) throw new DemoError("No delivery.", "NOT_FOUND");
  const d = delivery(o.delivery.id);
  check(d.delivery, version);
  const issueId = crypto.randomUUID();
  d.issues.push({
    id: issueId,
    reason: "OTHER",
    note: reason,
    status: "open",
    reportedStatus: d.delivery.status,
    reportedVersion: d.delivery.version,
    resolutionCode: null,
    resolutionNote: null,
    createdAt: now(),
    resolvedAt: null,
  });
  d.delivery.version++;
  audit("order.escalated", "order", id, reason, null, { issueId, operationId });
  return { ...orderResult(id, "open"), issueId, deliveryId: d.delivery.id };
};
export const cancelUnpaidOrder: Local<typeof Api.cancelUnpaidOrder> = async (
  id,
  operationId,
  reason,
) => {
  const o = order(id);
  const previous = copy(o.order);
  o.order.status = "cancelled";
  o.order.updatedAt = now();
  o.timeline.push({
    type: "status",
    entityId: id,
    fromStatus: previous.status,
    toStatus: "cancelled",
    actorId: operator.id,
    details: { reason, operationId },
    occurredAt: now(),
  });
  audit("order.cancelled", "order", id, reason, previous, o.order);
  return orderResult(id, "cancelled");
};
export const fetchAuditEvents: Local<typeof Api.fetchAuditEvents> = async (query = {}) => {
  const data = store.audit.filter(
    (a) =>
      (!query.q || JSON.stringify(a).toLowerCase().includes(query.q.toLowerCase())) &&
      (!query.action || a.action.includes(query.action)) &&
      (!query.entityType || a.entity.type === query.entityType) &&
      (!query.entityId || a.entity.id === query.entityId) &&
      (!query.staffUserId || a.actor?.staffId === query.staffUserId) &&
      (!query.from || a.occurredAt >= query.from) &&
      (!query.to || a.occurredAt <= query.to),
  );
  const key = (a: AuditEventDetail) =>
    query.sortBy === "action"
      ? a.action
      : query.sortBy === "entityType"
        ? a.entity.type
        : a.occurredAt;
  data.sort((a, b) => key(a).localeCompare(key(b)) * (query.sortOrder === "asc" ? 1 : -1));
  return page(data, query.page, query.pageSize);
};
export const fetchAuditEvent: Local<typeof Api.fetchAuditEvent> = async (id) =>
  copy(find(store.audit, id));
