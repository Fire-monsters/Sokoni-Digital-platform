import { Router } from "express";

import { sendSuccess, sendZodValidationError } from "../../http/responses.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { createPaymentsService } from "./payments.composition.js";
import { marketPickupPaymentSchema, paymentCheckoutParamsSchema } from "./payments.schemas.js";
import type { PaymentsService } from "./payments.service.js";

export function createPaymentOperationsRouter(
  service: PaymentsService = createPaymentsService(),
): Router {
  const router = Router();
  router.use(authenticate, authorize(["admin", "agent", "vendor"]));

  router.post("/checkouts/:checkoutId/market-payment", async (request, response, next) => {
    const params = paymentCheckoutParamsSchema.safeParse(request.params);
    const body = marketPickupPaymentSchema.safeParse(request.body);
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
        await service.recordMarketPickupPayment(
          request.auth.userId,
          request.auth.roles,
          params.data.checkoutId,
          body.data,
        ),
      );
    } catch (cause) {
      next(cause);
    }
  });

  return router;
}
