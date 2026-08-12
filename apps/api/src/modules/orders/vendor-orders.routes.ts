import { Router } from "express";
import {
  vendorOrderListQuerySchema,
  vendorOrderParamsSchema,
  vendorOrderTransitionSchema,
  vendorPickupConfirmationSchema,
} from "@sokoni-digital/validation/vendor-order";

import { sendSuccess, sendZodValidationError } from "../../http/responses.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { SupabaseVendorOrdersRepository } from "./vendor-orders.repository.js";
import { VendorOrdersService } from "./vendor-orders.service.js";

export function createVendorOrdersRouter(
  service = new VendorOrdersService(new SupabaseVendorOrdersRepository()),
): Router {
  const router = Router();
  router.use(authenticate, authorize(["vendor"]));

  router.get("/", async (request, response, next) => {
    const parsed = vendorOrderListQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      sendZodValidationError(request, response, parsed.error.issues);
      return;
    }
    if (!request.auth) {
      next(new Error("Authenticated request context is missing."));
      return;
    }
    try {
      sendSuccess(request, response, 200, await service.list(request.auth.userId, parsed.data));
    } catch (error) {
      next(error);
    }
  });

  router.get("/:sellerOrderId", async (request, response, next) => {
    const parsed = vendorOrderParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      sendZodValidationError(request, response, parsed.error.issues);
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
        await service.get(request.auth.userId, parsed.data.sellerOrderId),
      );
    } catch (error) {
      next(error);
    }
  });

  router.post("/:sellerOrderId/transitions", async (request, response, next) => {
    const params = vendorOrderParamsSchema.safeParse(request.params);
    const body = vendorOrderTransitionSchema.safeParse(request.body);
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
        await service.transition(
          request.auth.userId,
          params.data.sellerOrderId,
          body.data.toStatus,
          body.data.expectedVersion,
          body.data.operationId,
        ),
      );
    } catch (error) {
      next(error);
    }
  });

  router.post("/:sellerOrderId/pickup/confirm", async (request, response, next) => {
    const params = vendorOrderParamsSchema.safeParse(request.params);
    const body = vendorPickupConfirmationSchema.safeParse(request.body);
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
        await service.confirmPickup(
          request.auth.userId,
          params.data.sellerOrderId,
          body.data.operationId,
        ),
      );
    } catch (error) {
      next(error);
    }
  });

  return router;
}
