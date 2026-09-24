import { Router } from "express";
import { z } from "zod";
import { sendSuccess, sendZodValidationError } from "../../http/responses.js";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/require-permission.js";
import { createAdminWorkflowRoute } from "../admin/workflows/index.js";
import { createPaymentsService } from "./payments.composition.js";
import {
  paymentParamsSchema,
  reconcilePaymentSchema,
  reconcileBatchSchema,
  flagPaymentSchema,
  requestRefundSchema,
} from "./payments.schemas.js";
import type { PaymentsService } from "./payments.service.js";

export function createPaymentAdminRouter(
  service: Pick<
    PaymentsService,
    "getFinanceDetail" | "commandFinance" | "reconcileAttempt" | "reconcilePendingBatch"
  > = createPaymentsService(),
): Router {
  const router = Router();
  router.use(authenticate);
  router.use((_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    next();
  });
  router.get(
    "/payments/:paymentAttemptId",
    requirePermission("payments.read"),
    async (request, response, next) => {
      const params = paymentParamsSchema.safeParse(request.params);
      if (!params.success) {
        sendZodValidationError(request, response, params.error.issues);
        return;
      }
      try {
        sendSuccess(
          request,
          response,
          200,
          await service.getFinanceDetail(params.data.paymentAttemptId),
        );
      } catch (error) {
        next(error);
      }
    },
  );
  router.post(
    "/payments/reconciliation/run",
    ...createAdminWorkflowRoute({
      operation: "payments.reconciliation.run",
      permission: "payments.reconcile",
      paramsSchema: z.object({}).strict(),
      bodySchema: reconcileBatchSchema,
      execute: ({ actor, input, auditContext }) =>
        service.reconcilePendingBatch(
          "admin_request",
          actor.userId,
          input.operationId,
          auditContext,
        ),
    }),
  );
  router.post(
    "/payments/:paymentAttemptId/reconcile",
    ...createAdminWorkflowRoute({
      operation: "payments.reconcile",
      permission: "payments.reconcile",
      paramsSchema: paymentParamsSchema,
      bodySchema: reconcilePaymentSchema,
      execute: ({ actor, params, input, auditContext }) =>
        service.reconcileAttempt(
          params.paymentAttemptId,
          actor.userId,
          input.operationId,
          auditContext,
        ),
    }),
  );
  router.post(
    "/payments/:paymentAttemptId/flag-investigation",
    ...createAdminWorkflowRoute({
      operation: "payments.flag-investigation",
      permission: "payments.reconcile",
      paramsSchema: paymentParamsSchema,
      bodySchema: flagPaymentSchema,
      execute: ({ actor, params, input, auditContext }) =>
        service.commandFinance(
          actor.userId,
          params.paymentAttemptId,
          "flag-investigation",
          input,
          auditContext,
        ),
    }),
  );
  router.post(
    "/payments/:paymentAttemptId/request-refund",
    ...createAdminWorkflowRoute({
      operation: "payments.request-refund",
      permission: "refunds.manage",
      paramsSchema: paymentParamsSchema,
      bodySchema: requestRefundSchema,
      execute: ({ actor, params, input, auditContext }) =>
        service.commandFinance(
          actor.userId,
          params.paymentAttemptId,
          "request-refund",
          input,
          auditContext,
        ),
    }),
  );
  return router;
}
