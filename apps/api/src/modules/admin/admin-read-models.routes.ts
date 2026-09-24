import { Router } from "express";
import { z } from "zod";

import { sendSuccess, sendZodValidationError } from "../../http/responses.js";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/require-permission.js";
import { createAdminCollectionQuerySchema } from "./admin-query.js";
import { AdminReadModelsRepository } from "./admin-read-models.repository.js";
import type { AdminReadModelReader } from "./admin-read-models.types.js";

const optionalDate = z.iso
  .datetime({ offset: true })
  .transform((value) => new Date(value))
  .optional();

export const adminOverviewQuerySchema = z
  .object({ from: optionalDate, to: optionalDate })
  .strict()
  .refine((query) => !query.from || !query.to || query.from <= query.to, {
    message: "The from date must be before or equal to the to date.",
    path: ["from"],
  });

const paymentStatuses = [
  "created",
  "initiating",
  "pending",
  "paid",
  "failed",
  "cancelled",
  "expired",
  "requires_reconciliation",
] as const;

const sellerOrderStatuses = [
  "awaiting_payment",
  "awaiting_vendor_acceptance",
  "accepted",
  "preparing",
  "quality_verified",
  "ready_for_pickup",
  "issue_reported",
  "expired",
  "cancelled",
] as const;

const deliveryStatuses = [
  "waiting_for_rider",
  "assigned",
  "arrived_at_market",
  "picked_up",
  "in_transit",
  "arrived_at_customer",
  "delivered",
  "assignment_cancelled",
  "pickup_failed",
  "delivery_failed",
  "customer_unavailable",
  "issue_reported",
  "returned",
] as const;

export const adminOrdersQuerySchema = createAdminCollectionQuerySchema({
  sortFields: ["createdAt", "updatedAt", "total", "status"],
  defaultSortBy: "createdAt",
  filters: {
    marketId: z.uuid().optional(),
    vendorId: z.uuid().optional(),
    fulfilmentType: z.enum(["delivery", "market_pickup"]).optional(),
    paymentStatus: z.enum(paymentStatuses).optional(),
    sellerOrderStatus: z.enum(sellerOrderStatuses).optional(),
    deliveryStatus: z.enum(deliveryStatuses).optional(),
    delayedOnly: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional(),
    issuesOnly: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional(),
  },
});

const adminOrderParamsSchema = z.object({ orderId: z.uuid() });

export const adminApplicationsQuerySchema = createAdminCollectionQuerySchema({
  sortFields: ["submittedAt", "status", "type"],
  defaultSortBy: "submittedAt",
  filters: {
    type: z.enum(["vendor", "rider"]).optional(),
    status: z
      .enum([
        "pending_review",
        "in_review",
        "changes_requested",
        "approved",
        "rejected",
        "suspended",
      ])
      .optional(),
    marketId: z.uuid().optional(),
  },
});

export const adminPaymentReconciliationQuerySchema = createAdminCollectionQuerySchema({
  sortFields: ["createdAt", "amount", "status"],
  defaultSortBy: "createdAt",
  filters: {
    provider: z.enum(["pesapal", "market_pickup"]).optional(),
    paymentMethod: z
      .enum([
        "mtn_momo",
        "airtel_money",
        "visa",
        "mastercard",
        "card",
        "bank",
        "market_pickup",
        "unknown",
      ])
      .optional(),
    status: z.enum(paymentStatuses).optional(),
    reconciliationStatus: z
      .enum(["not_started", "pending", "reconciled", "needs_review"])
      .optional(),
    callbackStatus: z
      .enum(["missing", "received", "verified", "processed", "duplicate", "rejected", "failed"])
      .optional(),
  },
});

const refundReasons = [
  "cancellation",
  "vendor_rejection",
  "missing_products",
  "poor_quality",
  "failed_delivery",
  "duplicate_payment",
  "incorrect_payment",
  "partial_fulfilment",
  "other",
] as const;

const refundStatuses = [
  "requested",
  "awaiting_approval",
  "approved",
  "processing",
  "completed",
  "rejected",
  "cancelled",
  "failed",
] as const;

export const adminRefundsQuerySchema = createAdminCollectionQuerySchema({
  sortFields: ["createdAt", "updatedAt", "amount", "status"],
  defaultSortBy: "createdAt",
  filters: {
    status: z.enum(refundStatuses).optional(),
    reason: z.enum(refundReasons).optional(),
    approvalState: z.enum(["pending", "approved", "rejected", "not_required"]).optional(),
    minAmount: z.coerce.number().int().min(0).optional(),
    maxAmount: z.coerce.number().int().min(0).optional(),
  },
}).refine(
  (query) =>
    query.minAmount === undefined ||
    query.maxAmount === undefined ||
    query.minAmount <= query.maxAmount,
  { message: "The minimum amount must not exceed the maximum amount.", path: ["minAmount"] },
);

export const adminSettlementsQuerySchema = createAdminCollectionQuerySchema({
  sortFields: ["createdAt", "amount", "status"],
  defaultSortBy: "createdAt",
  filters: {
    vendorId: z.uuid().optional(),
    status: z.string().trim().min(1).max(50).optional(),
  },
});

export const adminAuditEventsQuerySchema = createAdminCollectionQuerySchema({
  sortFields: ["occurredAt", "action", "entityType"],
  defaultSortBy: "occurredAt",
  filters: {
    staffUserId: z.uuid().optional(),
    action: z.string().trim().min(1).max(100).optional(),
    entityType: z.string().trim().min(1).max(50).optional(),
    entityId: z.uuid().optional(),
  },
});

const adminAuditEventParamsSchema = z.object({
  eventId: z.string().regex(/^[a-z_]+:(?:[0-9]+|[0-9a-f-]{36})$/i),
});

const slowAdminReadThresholdMs = 1_000;

function adminReadPermission(path: string): string {
  if (path.startsWith("/orders")) return "orders.read";
  if (path.startsWith("/applications")) return "applications.read";
  if (path.startsWith("/payments")) return "payments.read";
  if (path.startsWith("/refunds")) return "refunds.read";
  if (path.startsWith("/settlements")) return "settlements.read";
  if (path.startsWith("/audit-events")) return "audit.read";
  return "overview.read";
}

export function createAdminReadModelsRouter(
  reader: AdminReadModelReader = new AdminReadModelsRepository(),
): Router {
  const router = Router();
  router.use(authenticate);
  router.use((request, response, next) => {
    const startedAt = performance.now();
    response.on("finish", () => {
      const logger = (request as unknown as { log?: typeof request.log }).log;
      if (!logger) return;
      const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;
      const pageSize =
        typeof request.query.pageSize === "string" ? request.query.pageSize : undefined;
      const filterCount = Object.keys(request.query).filter(
        (key) => !["page", "pageSize", "sortBy", "sortOrder"].includes(key),
      ).length;
      const context = {
        event: "admin_read_query",
        endpoint: request.path,
        status: response.statusCode,
        durationMs,
        staffId: request.auth?.staff?.userId,
        permission: adminReadPermission(request.path),
        pageSize,
        filterCount,
        requestId: request.requestId,
      };
      if (durationMs >= slowAdminReadThresholdMs) {
        logger.warn(context, "Slow admin read query");
      } else {
        logger.info(context, "Admin read query completed");
      }
    });
    next();
  });

  router.get("/overview", requirePermission("overview.read"), async (request, response, next) => {
    const parsed = adminOverviewQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      sendZodValidationError(request, response, parsed.error.issues);
      return;
    }
    try {
      sendSuccess(request, response, 200, await reader.getOverview(parsed.data));
    } catch (error) {
      next(error);
    }
  });

  router.get("/orders", requirePermission("orders.read"), async (request, response, next) => {
    const parsed = adminOrdersQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      sendZodValidationError(request, response, parsed.error.issues);
      return;
    }
    try {
      sendSuccess(request, response, 200, await reader.listOrders(parsed.data));
    } catch (error) {
      next(error);
    }
  });

  router.get(
    "/orders/:orderId",
    requirePermission("orders.read"),
    async (request, response, next) => {
      const parsed = adminOrderParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        sendZodValidationError(request, response, parsed.error.issues);
        return;
      }
      try {
        sendSuccess(request, response, 200, await reader.getOrder(parsed.data.orderId));
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/applications",
    requirePermission("applications.read"),
    async (request, response, next) => {
      const parsed = adminApplicationsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        sendZodValidationError(request, response, parsed.error.issues);
        return;
      }
      try {
        sendSuccess(request, response, 200, await reader.listApplications(parsed.data));
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/payments/reconciliation",
    requirePermission("payments.read"),
    async (request, response, next) => {
      const parsed = adminPaymentReconciliationQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        sendZodValidationError(request, response, parsed.error.issues);
        return;
      }
      try {
        sendSuccess(request, response, 200, await reader.listPaymentReconciliation(parsed.data));
      } catch (error) {
        next(error);
      }
    },
  );

  router.get("/refunds", requirePermission("refunds.read"), async (request, response, next) => {
    const parsed = adminRefundsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      sendZodValidationError(request, response, parsed.error.issues);
      return;
    }
    try {
      sendSuccess(request, response, 200, await reader.listRefunds(parsed.data));
    } catch (error) {
      next(error);
    }
  });

  router.get(
    "/settlements",
    requirePermission("settlements.read"),
    async (request, response, next) => {
      const parsed = adminSettlementsQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        sendZodValidationError(request, response, parsed.error.issues);
        return;
      }
      try {
        sendSuccess(request, response, 200, await reader.listSettlements(parsed.data));
      } catch (error) {
        next(error);
      }
    },
  );

  router.get("/audit-events", requirePermission("audit.read"), async (request, response, next) => {
    const parsed = adminAuditEventsQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      sendZodValidationError(request, response, parsed.error.issues);
      return;
    }
    try {
      response.setHeader("Cache-Control", "no-store");
      sendSuccess(request, response, 200, await reader.listAuditEvents(parsed.data));
    } catch (error) {
      next(error);
    }
  });

  router.get(
    "/audit-events/:eventId",
    requirePermission("audit.read"),
    async (request, response, next) => {
      const parsed = adminAuditEventParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        sendZodValidationError(request, response, parsed.error.issues);
        return;
      }
      try {
        response.setHeader("Cache-Control", "no-store");
        sendSuccess(request, response, 200, await reader.getAuditEvent(parsed.data.eventId));
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
