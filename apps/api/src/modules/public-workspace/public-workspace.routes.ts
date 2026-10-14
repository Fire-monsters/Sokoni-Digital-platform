import { createOperationsRecordsRouter } from "./operations-records.routes.js";
import { operationsRouteAllowlist, operationsStaff } from "./operations-boundary.js";
import type { StaffAuthorizationReader } from "../staff/staff-authorization.repository.js";
import { createApplicationReviewRouter } from "../applications/applications.routes.js";
import { createListingApprovalRouter } from "../listing-approval/listing-approval.routes.js";
import { createDispatcherRouter } from "../delivery/dispatcher.routes.js";
import { createOrderInvestigationRouter } from "../order-investigation/order-investigation.routes.js";
import { createPaymentAdminRouter } from "../payments/payments.admin.routes.js";
import { createAdminReadModelsRouter } from "../admin/admin-read-models.routes.js";
import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { sendError, sendSuccess, sendZodValidationError } from "../../http/responses.js";
import {
  requirePublicWorkspace,
  type PublicWorkspaceGuardOptions,
} from "./public-workspace.guard.js";
import {
  assertPublicWorkspaceAction,
  requirePublicAction,
} from "./public-workspace-allowlist.js";
import {
  defaultAuditService,
  type PublicWorkspaceAuditService,
} from "./public-workspace-audit.service.js";

const stockAdjustBodySchema = z
  .object({
    sku: z.string().trim().min(2, "SKU is required."),
    quantityDelta: z.number().int(),
    reason: z.string().trim().min(3, "A reason is required."),
  })
  .strict();

const actionCheckBodySchema = z
  .object({
    action: z.string().trim().min(1),
  })
  .strict();

export interface PublicWorkspaceRouterOptions extends PublicWorkspaceGuardOptions {
  auditService?: PublicWorkspaceAuditService;
  staffReader?: StaffAuthorizationReader;
}

export function createPublicOperationsRouter(options: PublicWorkspaceRouterOptions = {}): Router {
  const router = Router();


  router.use(requirePublicWorkspace("operations", options));
  router.use((_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    next();
  });

  // Action check endpoint
  router.post("/actions/check", (request, response) => {
    const body = actionCheckBodySchema.safeParse(request.body);
    if (!body.success) {
      sendZodValidationError(request, response, body.error.issues);
      return;
    }

    if (!request.publicWorkspace) {
      sendError(request, response, 403, "FORBIDDEN", "Public workspace context is required.");
      return;
    }

    try {
      assertPublicWorkspaceAction(request.publicWorkspace, body.data.action);
      sendSuccess(request, response, 200, {
        action: body.data.action,
        allowed: true,
        workspace: "operations",
      });
    } catch {
      sendError(
        request,
        response,
        403,
        "ACTION_NOT_AVAILABLE",
        `Action '${body.data.action}' is not available in the public operations workspace.`,
      );
    }
  });

  router.use(operationsRouteAllowlist);
  const boundary = operationsStaff(options.staffReader);
  router.use(createOperationsRecordsRouter(boundary));
  router.use(createApplicationReviewRouter(undefined, boundary));
  router.use(createListingApprovalRouter(undefined, boundary));
  router.use(createDispatcherRouter(undefined, boundary));
  router.use(createOrderInvestigationRouter(undefined, boundary));
  router.use(createPaymentAdminRouter(undefined, boundary));
  router.use(createAdminReadModelsRouter(undefined, boundary));

  return router;
}

export function createPublicWarehouseRouter(options: PublicWorkspaceRouterOptions = {}): Router {
  const router = Router();
  const auditService = options.auditService ?? defaultAuditService;

  router.use(requirePublicWorkspace("warehouse", options));
  router.use((_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    next();
  });

  // Action check endpoint
  router.post("/actions/check", (request, response) => {
    const body = actionCheckBodySchema.safeParse(request.body);
    if (!body.success) {
      sendZodValidationError(request, response, body.error.issues);
      return;
    }

    if (!request.publicWorkspace) {
      sendError(request, response, 403, "FORBIDDEN", "Public workspace context is required.");
      return;
    }

    try {
      assertPublicWorkspaceAction(request.publicWorkspace, body.data.action);
      sendSuccess(request, response, 200, {
        action: body.data.action,
        allowed: true,
        workspace: "warehouse",
      });
    } catch {
      sendError(
        request,
        response,
        403,
        "ACTION_NOT_AVAILABLE",
        `Action '${body.data.action}' is not available in the public warehouse workspace.`,
      );
    }
  });

  // Safe stock adjustment mutation to prove the public-workspace boundary
  router.post(
    "/stock/adjust",
    requirePublicAction("stock.adjust"),
    async (request, response, next) => {
      const body = stockAdjustBodySchema.safeParse(request.body);
      if (!body.success) {
        sendZodValidationError(request, response, body.error.issues);
        return;
      }

      const context = request.publicWorkspace;
      if (!context || context.kind !== "warehouse") {
        response.status(403).json({ success: false, error: { code: "FORBIDDEN" } });
        return;
      }

      const lotId = randomUUID();

      try {
        const auditEvent = await auditService.recordMutation({
          actorId: context.actorId,
          workspace: "warehouse",
          action: "stock.adjust",
          resourceType: "inventory_lot",
          resourceId: lotId,
          warehouseId: context.warehouseId,
          correlationId: request.requestId,
          reason: body.data.reason,
          after: {
            sku: body.data.sku,
            quantityDelta: body.data.quantityDelta,
          },
        });

        sendSuccess(request, response, 200, {
          lotId,
          sku: body.data.sku,
          quantityDelta: body.data.quantityDelta,
          warehouseId: context.warehouseId,
          actorId: context.actorId,
          auditEventId: auditEvent.correlationId,
          auditRecorded: true,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
