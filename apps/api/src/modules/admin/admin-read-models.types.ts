import type { AdminPage, AdminSortOrder } from "./admin-query.js";
import type { AuditEventDetail, AuditEventRow, OrderInvestigation } from "@sokoni-digital/domain";

export interface AdminOverviewQuery {
  from?: Date | undefined;
  to?: Date | undefined;
}

export interface AdminAttentionItem {
  type: string;
  severity: "high" | "medium" | "low";
  entityType: "order" | "delivery";
  entityId: string;
  orderReference: string;
  ageSeconds: number;
  message: string;
  action: { label: string; href: string };
}

export interface AdminOperationalOverview {
  period: { from: string; to: string };
  orders: {
    receivedToday: number;
    grossOrderValue: number;
    waitingForVendorAcceptance: number;
    delayedInPreparation: number;
  };
  payments: { paid: number; pending: number; failed: number; awaitingReconciliation: number };
  deliveries: { waitingForRider: number; active: number; issues: number };
  approvals: { vendors: number; riders: number; listings: number; priceChanges: number };
  operations: { activeVendors: number; availableRiders: number };
  attentionRequired: AdminAttentionItem[];
}

export interface AdminOrderRow {
  id: string;
  reference: string;
  consumer: { name: string; phoneMasked: string };
  market: { id: string; name: string };
  fulfilmentType: "delivery" | "market_pickup";
  payment: { status: string; amount: number } | null;
  sellerOrders: { total: number; accepted: number; preparing: number; ready: number };
  delivery: { status: string; hasIssue: boolean } | null;
  createdAt: string;
  updatedAt: string;
  flags: { delayed: boolean; hasIssue: boolean };
}

export interface AdminOrdersQuery {
  page: number;
  pageSize: number;
  q?: string | undefined;
  marketId?: string | undefined;
  vendorId?: string | undefined;
  fulfilmentType?: "delivery" | "market_pickup" | undefined;
  paymentStatus?: string | undefined;
  sellerOrderStatus?: string | undefined;
  deliveryStatus?: string | undefined;
  delayedOnly?: boolean | undefined;
  issuesOnly?: boolean | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
  sortBy: "createdAt" | "updatedAt" | "total" | "status";
  sortOrder: AdminSortOrder;
}

export interface AdminReadModelReader {
  getOverview(query: AdminOverviewQuery): Promise<AdminOperationalOverview>;
  listOrders(query: AdminOrdersQuery): Promise<AdminPage<AdminOrderRow>>;
  getOrder(orderId: string): Promise<AdminOrderInvestigation>;
  listApplications(query: AdminApplicationsQuery): Promise<AdminPage<AdminApplicationRow>>;
  listPaymentReconciliation(
    query: AdminPaymentReconciliationQuery,
  ): Promise<AdminPage<AdminPaymentReconciliationRow>>;
  listRefunds(query: AdminRefundsQuery): Promise<AdminPage<AdminRefundRow>>;
  listSettlements(query: AdminSettlementsQuery): Promise<AdminPage<AdminSettlementRow>>;
  listAuditEvents(query: AdminAuditEventsQuery): Promise<AdminPage<AdminAuditEventRow>>;
  getAuditEvent(eventId: string): Promise<AdminAuditEventDetail>;
}

export type AdminOrderInvestigation = OrderInvestigation;

export interface AdminApplicationRow {
  id: string;
  type: "vendor" | "rider";
  applicant: { name: string; phoneMasked: string };
  market: { id: string; name: string } | null;
  status:
    "pending_review" | "in_review" | "changes_requested" | "approved" | "rejected" | "suspended";
  submittedAt: string;
  reviewStartedAt: string | null;
  reviewer: { id: string; name: string } | null;
  flags: string[];
}

export interface AdminApplicationsQuery {
  page: number;
  pageSize: number;
  q?: string | undefined;
  type?: "vendor" | "rider" | undefined;
  status?:
    | "pending_review"
    | "in_review"
    | "changes_requested"
    | "approved"
    | "rejected"
    | "suspended"
    | undefined;
  marketId?: string | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
  sortBy: "submittedAt" | "status" | "type";
  sortOrder: AdminSortOrder;
}

export interface AdminPaymentReconciliationRow {
  paymentId: string;
  checkoutReference: string;
  orderReference: string;
  provider: string;
  paymentMethod: string | null;
  providerReference: string | null;
  amount: number;
  currency: string;
  status: string;
  callback: { received: boolean; status: string | null; receivedAt: string | null };
  reconciliation: { status: string; attemptCount: number; lastAttemptAt: string | null };
  flags: string[];
  createdAt: string;
}

export interface AdminPaymentReconciliationQuery {
  page: number;
  pageSize: number;
  q?: string | undefined;
  provider?: "pesapal" | "market_pickup" | undefined;
  paymentMethod?: string | undefined;
  status?: string | undefined;
  reconciliationStatus?: "not_started" | "pending" | "reconciled" | "needs_review" | undefined;
  callbackStatus?: string | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
  sortBy: "createdAt" | "amount" | "status";
  sortOrder: AdminSortOrder;
}

export interface AdminRefundRow {
  id: string;
  orderId: string;
  orderReference: string;
  reason: string;
  requestedAmount: number;
  currency: string;
  status: string;
  approvalState: string;
  proposedBy: { id: string; name: string };
  approvedBy: { id: string; name: string } | null;
  payment: { id: string; status: string; amount: number } | null;
  resolutionNotes: string | null;
  createdAt: string;
  updatedAt: string;
  flags: string[];
}

export interface AdminRefundsQuery {
  page: number;
  pageSize: number;
  q?: string | undefined;
  status?: string | undefined;
  reason?: string | undefined;
  approvalState?: string | undefined;
  minAmount?: number | undefined;
  maxAmount?: number | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
  sortBy: "createdAt" | "updatedAt" | "amount" | "status";
  sortOrder: AdminSortOrder;
}

export interface AdminSettlementRow {
  id: string;
}

export interface AdminSettlementsQuery {
  page: number;
  pageSize: number;
  q?: string | undefined;
  vendorId?: string | undefined;
  status?: string | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
  sortBy: "createdAt" | "amount" | "status";
  sortOrder: AdminSortOrder;
}

export type AdminAuditEventRow = AuditEventRow;

export type AdminAuditEventDetail = AuditEventDetail;

export interface AdminAuditEventsQuery {
  page: number;
  pageSize: number;
  q?: string | undefined;
  staffUserId?: string | undefined;
  action?: string | undefined;
  entityType?: string | undefined;
  entityId?: string | undefined;
  from?: Date | undefined;
  to?: Date | undefined;
  sortBy: "occurredAt" | "action" | "entityType";
  sortOrder: AdminSortOrder;
}
