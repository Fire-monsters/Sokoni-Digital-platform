import { Router, type NextFunction, type Request, type Response } from "express";
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
import { DeliveryProofService } from "./delivery-proof.service.js";
import { DispatcherService } from "./dispatcher.service.js";

export function createDispatcherRouter(
  service = new DispatcherService(),
  proofService = new DeliveryProofService(),
): Router {
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

  const assign =
    (reassign: boolean) => async (request: Request, response: Response, next: NextFunction) => {
      const params = riderDeliveryParamsSchema.safeParse(request.params);
      const body = dispatcherAssignmentSchema.safeParse(request.body);
      if (!params.success) {
        sendZodValidationError(request, response, params.error.issues);
        return;
      }
      if (!body.success) {
        sendZodValidationError(request, response, body.error.issues);
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
          await service.assign(request.auth.userId, params.data.deliveryId, reassign, body.data),
        );
      } catch (error) {
        next(error);
      }
    };
  router.post(
    "/deliveries/:deliveryId/assign",
    requirePermission("deliveries.manage"),
    assign(false),
  );
  router.post(
    "/deliveries/:deliveryId/reassign",
    requirePermission("deliveries.manage"),
    assign(true),
  );

  router.post(
    "/delivery-issues/:issueId/resolve",
    requirePermission("deliveries.manage"),
    async (request, response, next) => {
      const params = deliveryIssueParamsSchema.safeParse(request.params);
      const body = deliveryIssueResolutionSchema.safeParse(request.body);
      if (!params.success) {
        sendZodValidationError(request, response, params.error.issues);
        return;
      }
      if (!body.success) {
        sendZodValidationError(request, response, body.error.issues);
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
          await service.resolveIssue(request.auth.userId, params.data.issueId, body.data),
        );
      } catch (error) {
        next(error);
      }
    },
  );
  router.post(
    "/deliveries/:deliveryId/actions",
    requirePermission("deliveries.manage"),
    async (request, response, next) => {
      const params = riderDeliveryParamsSchema.safeParse(request.params);
      const body = dispatcherDeliveryActionSchema.safeParse(request.body);
      if (!params.success) {
        sendZodValidationError(request, response, params.error.issues);
        return;
      }
      if (!body.success) {
        sendZodValidationError(request, response, body.error.issues);
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
          await service.performAction(request.auth.userId, params.data.deliveryId, body.data),
        );
      } catch (error) {
        next(error);
      }
    },
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
          await proofService.getEvidence(request.auth.userId, "staff", params.data.deliveryId),
        );
      } catch (error) {
        next(error);
      }
    },
  );
  return router;
}
