import { Router } from "express";

import { sendSuccess, sendZodValidationError } from "../../http/responses.js";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/require-permission.js";
import { createPaymentsService } from "./payments.composition.js";
import { paymentParamsSchema, reconciliationQueueQuerySchema } from "./payments.schemas.js";
import type { PaymentsService } from "./payments.service.js";

export function createPaymentAdminRouter(
  service: PaymentsService = createPaymentsService(),
): Router {
  const router = Router();
  router.use(authenticate);

  router.get(
    "/payments/reconciliation",
    requirePermission("payments.read"),
    async (request, response, next) => {
      const parsed = reconciliationQueueQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        sendZodValidationError(request, response, parsed.error.issues);
        return;
      }
      try {
        sendSuccess(
          request,
          response,
          200,
          await service.getReconciliationOverview(parsed.data.limit),
        );
      } catch (cause) {
        next(cause);
      }
    },
  );

  router.post(
    "/payments/reconciliation/run",
    requirePermission("payments.reconcile"),
    async (request, response, next) => {
      try {
        sendSuccess(
          request,
          response,
          200,
          await service.reconcilePendingBatch("admin_request", adminId(request)),
        );
      } catch (cause) {
        next(cause);
      }
    },
  );

  router.post(
    "/payments/:paymentAttemptId/reconcile",
    requirePermission("payments.reconcile"),
    async (request, response, next) => {
      const parsed = paymentParamsSchema.safeParse(request.params);
      if (!parsed.success) {
        sendZodValidationError(request, response, parsed.error.issues);
        return;
      }
      try {
        sendSuccess(
          request,
          response,
          200,
          await service.reconcileAttempt(parsed.data.paymentAttemptId, adminId(request)),
        );
      } catch (cause) {
        next(cause);
      }
    },
  );

  return router;
}

function adminId(request: Express.Request): string {
  if (!request.auth) throw new Error("Authenticated request context is missing.");
  return request.auth.userId;
}
