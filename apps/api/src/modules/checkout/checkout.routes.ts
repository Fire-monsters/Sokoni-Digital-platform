/* eslint-disable @typescript-eslint/no-confusing-void-expression */
import { Router } from "express";

import { parseServerEnvironment } from "../../config/index.js";
import { authenticate } from "../../middleware/authenticate.js";
import { requireIdempotency } from "../idempotency/index.js";
import { CheckoutRepository } from "./checkout.repository.js";
import {
  checkoutParamsSchema,
  consumerOrderParamsSchema,
  createAddressSchema,
  createCheckoutSchema,
  deliveryZonesQuerySchema,
} from "./checkout.schemas.js";
import { sendSuccess, sendZodValidationError } from "../../http/responses.js";

export function createCheckoutRouter(
  repository = new CheckoutRepository(),
  reservationMinutes = parseServerEnvironment().CHECKOUT_RESERVATION_MINUTES,
): Router {
  const router = Router();
  router.use(authenticate);

  router.post(
    "/",
    (request, response, next) => {
      const parsed = createCheckoutSchema.safeParse(request.body);
      if (!parsed.success) {
        sendZodValidationError(request, response, parsed.error.issues);
        return;
      }
      next();
    },
    requireIdempotency("checkout.create"),
    async (request, response, next) => {
      const parsed = createCheckoutSchema.safeParse(request.body);
      if (!parsed.success) {
        next(new Error("Validated checkout input was unexpectedly unavailable."));
        return;
      }
      if (!request.auth || !request.idempotency)
        return next(new Error("Required request context is missing."));
      try {
        const data = await repository.create(
          request.auth.userId,
          parsed.data,
          request.idempotency.key,
          reservationMinutes,
        );
        const payload = { success: true, data, meta: { requestId: request.requestId } };
        await request.idempotency.repository.complete(request.idempotency.recordId, 201, payload);
        response.status(201).json(payload);
      } catch (cause) {
        await request.idempotency.repository
          .fail(request.idempotency.recordId)
          .catch(() => undefined);
        next(cause);
      }
    },
  );

  router.get("/delivery-zones", async (request, response, next) => {
    const parsed = deliveryZonesQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      sendZodValidationError(request, response, parsed.error.issues);
      return;
    }
    try {
      sendSuccess(request, response, 200, await repository.listDeliveryZones(parsed.data.marketId));
    } catch (cause) {
      next(cause);
    }
  });

  router.get("/addresses", async (request, response, next) => {
    if (!request.auth) {
      next(new Error("Authenticated request context is missing."));
      return;
    }
    try {
      sendSuccess(request, response, 200, await repository.listAddresses(request.auth.userId));
    } catch (cause) {
      next(cause);
    }
  });

  router.post("/addresses", async (request, response, next) => {
    const parsed = createAddressSchema.safeParse(request.body);
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
        201,
        await repository.createAddress(request.auth.userId, parsed.data),
      );
    } catch (cause) {
      next(cause);
    }
  });

  router.get("/:checkoutId/progress", async (request, response, next) => {
    const parsed = checkoutParamsSchema.safeParse(request.params);
    if (!parsed.success) return sendZodValidationError(request, response, parsed.error.issues);
    if (!request.auth) return next(new Error("Authenticated request context is missing."));
    try {
      sendSuccess(
        request,
        response,
        200,
        await repository.getProgress(request.auth.userId, parsed.data.checkoutId),
      );
    } catch (cause) {
      next(cause);
    }
  });

  router.get("/:checkoutId", async (request, response, next) => {
    const parsed = checkoutParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      sendZodValidationError(request, response, parsed.error.issues);
      return;
    }
    if (!request.auth) return next(new Error("Authenticated request context is missing."));
    try {
      sendSuccess(
        request,
        response,
        200,
        await repository.get(request.auth.userId, parsed.data.checkoutId),
      );
    } catch (cause) {
      next(cause);
    }
  });
  return router;
}

export function createConsumerOrdersRouter(repository = new CheckoutRepository()): Router {
  const router = Router();
  router.use(authenticate);
  router.get("/:sellerOrderId/quality-proof", async (request, response, next) => {
    const parsed = consumerOrderParamsSchema.safeParse(request.params);
    if (!parsed.success) return sendZodValidationError(request, response, parsed.error.issues);
    if (!request.auth) return next(new Error("Authenticated request context is missing."));
    try {
      sendSuccess(
        request,
        response,
        200,
        await repository.getQualityProof(request.auth.userId, parsed.data.sellerOrderId),
      );
    } catch (cause) {
      next(cause);
    }
  });
  return router;
}
