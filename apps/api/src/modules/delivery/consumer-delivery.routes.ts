import { Router } from "express";
import { riderDeliveryParamsSchema } from "@sokoni-digital/validation/delivery";

import { sendSuccess, sendZodValidationError } from "../../http/responses.js";
import { authenticate } from "../../middleware/authenticate.js";
import { DeliveryProofService } from "./delivery-proof.service.js";

export function createConsumerDeliveryRouter(service = new DeliveryProofService()): Router {
  const router = Router();
  router.use(authenticate);
  router.post("/:deliveryId/pin", async (request, response, next) => {
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
        201,
        await service.rotatePin(request.auth.userId, params.data.deliveryId),
      );
    } catch (error) {
      next(error);
    }
  });
  router.get("/:deliveryId/evidence", async (request, response, next) => {
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
        await service.getEvidence(request.auth.userId, "consumer", params.data.deliveryId),
      );
    } catch (error) {
      next(error);
    }
  });
  return router;
}
