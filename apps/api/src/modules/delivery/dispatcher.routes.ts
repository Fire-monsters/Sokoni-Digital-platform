import { Router } from "express";
import {
  deliveryIssueParamsSchema,
  deliveryIssueResolutionSchema,
  dispatcherAssignmentSchema,
  dispatcherDeliveryActionSchema,
  dispatcherNearbyRidersQuerySchema,
  riderDeliveryParamsSchema,
} from "@sokoni-digital/validation/delivery";

import { sendSuccess, sendZodValidationError } from "../../http/responses.js";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/require-permission.js";
import { createAdminWorkflowRoute } from "../admin/workflows/index.js";
import { DispatcherService } from "./dispatcher.service.js";

export function createDispatcherRouter(service = new DispatcherService()): Router {
  const router = Router();
  router.use(authenticate);

  router.get(
    "/deliveries",
    requirePermission("deliveries.read"),
    async (request, response, next) => {
      try {
        sendSuccess(request, response, 200, await service.getBoard());
      } catch (error) {
        next(error);
      }
    },
  );
  router.get(
    "/delivery-riders",
    requirePermission("deliveries.read"),
    async (request, response, next) => {
      try {
        sendSuccess(request, response, 200, await service.getRiders());
      } catch (error) {
        next(error);
      }
    },
  );
  router.get(
    "/deliveries/:deliveryId",
    requirePermission("deliveries.read"),
    async (request, response, next) => {
      const params = riderDeliveryParamsSchema.safeParse(request.params);
      if (!params.success) {
        sendZodValidationError(request, response, params.error.issues);
        return;
      }
      const staff = request.auth?.staff;
      if (!staff) {
        next(new Error("Staff authorization context is missing."));
        return;
      }
      try {
        sendSuccess(
          request,
          response,
          200,
          await service.getDelivery(staff.userId, params.data.deliveryId),
        );
      } catch (error) {
        next(error);
      }
    },
  );
  router.get(
    "/deliveries/:deliveryId/nearby-riders",
    requirePermission("deliveries.manage"),
    async (request, response, next) => {
      const params = riderDeliveryParamsSchema.safeParse(request.params);
      const query = dispatcherNearbyRidersQuerySchema.safeParse(request.query);
      if (!params.success) {
        sendZodValidationError(request, response, params.error.issues);
        return;
      }
      if (!query.success) {
        sendZodValidationError(request, response, query.error.issues);
        return;
      }
      try {
        sendSuccess(
          request,
          response,
          200,
          await service.getNearbyRiders(params.data.deliveryId, query.data.radiusKm),
        );
      } catch (error) {
        next(error);
      }
    },
  );

  const assignment = (reassign: boolean) =>
    createAdminWorkflowRoute({
      operation: reassign ? "delivery.reassign_rider" : "delivery.assign_rider",
      permission: "deliveries.manage",
      paramsSchema: riderDeliveryParamsSchema,
      bodySchema: dispatcherAssignmentSchema,
      execute: (command) => service.assign(reassign, command),
    });
  router.post("/deliveries/:deliveryId/assign-rider", ...assignment(false));
  router.post("/deliveries/:deliveryId/reassign-rider", ...assignment(true));
  // Backward-compatible aliases for clients released before the operation route names stabilized.
  router.post("/deliveries/:deliveryId/assign", ...assignment(false));
  router.post("/deliveries/:deliveryId/reassign", ...assignment(true));

  router.post(
    "/delivery-issues/:issueId/resolve",
    ...createAdminWorkflowRoute({
      operation: "delivery.resolve_issue",
      permission: "deliveries.manage",
      paramsSchema: deliveryIssueParamsSchema,
      bodySchema: deliveryIssueResolutionSchema,
      execute: (command) => service.resolveIssue(command),
    }),
  );
  router.post(
    "/deliveries/:deliveryId/actions",
    ...createAdminWorkflowRoute({
      operation: "delivery.perform_exception_action",
      permission: "deliveries.manage",
      paramsSchema: riderDeliveryParamsSchema,
      bodySchema: dispatcherDeliveryActionSchema,
      execute: (command) => service.performAction(command),
    }),
  );

  router.get(
    "/deliveries/:deliveryId/evidence",
    requirePermission("deliveries.read"),
    async (request, response, next) => {
      const params = riderDeliveryParamsSchema.safeParse(request.params);
      if (!params.success) {
        sendZodValidationError(request, response, params.error.issues);
        return;
      }
      if (!request.auth) {
        next(new Error("Authenticated request context is missing."));
        return;
      }
      try {
        sendSuccess(
          request,
          response,
          200,
          await service.getEvidence(request.auth.userId, params.data.deliveryId),
        );
      } catch (error) {
        next(error);
      }
    },
  );
  return router;
}
