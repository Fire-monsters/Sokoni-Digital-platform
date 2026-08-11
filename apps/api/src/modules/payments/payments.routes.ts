/* eslint-disable @typescript-eslint/no-confusing-void-expression */
import { Router } from "express";
import type { Request, Response } from "express";

import { parseServerEnvironment } from "../../config/index.js";
import { sendSuccess, sendZodValidationError } from "../../http/responses.js";
import { authenticate } from "../../middleware/authenticate.js";
import { requireIdempotency } from "../idempotency/index.js";
import { createPaymentsService } from "./payments.composition.js";
import {
  initiatePaymentSchema,
  paymentCheckoutParamsSchema,
  paymentParamsSchema,
  pesapalCancellationSchema,
  pesapalNotificationSchema,
  pesapalReturnSchema,
} from "./payments.schemas.js";
import type { PaymentsService } from "./payments.service.js";

export function createPaymentsRouter(
  service: PaymentsService = createPaymentsService(),
  appReturnUrl = parseServerEnvironment().PAYMENT_APP_RETURN_URL,
): Router {
  const router = Router();

  const ipnHandler = async (request: Request, response: Response) => {
    const source: unknown = request.method === "GET" ? request.query : request.body;
    const parsed = pesapalNotificationSchema.safeParse(source);
    if (!parsed.success) {
      response.status(400).json({ status: 500, message: "Invalid Pesapal IPN." });
      return;
    }
    const rawBody = request.rawBody ?? Buffer.from(JSON.stringify(parsed.data), "utf8");
    try {
      await service.processNotification(parsed.data, rawBody, request.headers, request.requestId);
      response.status(200).json({
        orderNotificationType: parsed.data.OrderNotificationType,
        orderTrackingId: parsed.data.OrderTrackingId,
        orderMerchantReference: parsed.data.OrderMerchantReference,
        status: 200,
      });
    } catch (cause) {
      request.log.error({ err: cause }, "Pesapal IPN processing failed");
      response.status(500).json({
        orderNotificationType: parsed.data.OrderNotificationType,
        orderTrackingId: parsed.data.OrderTrackingId,
        orderMerchantReference: parsed.data.OrderMerchantReference,
        status: 500,
      });
    }
  };
  router.get("/payments/callbacks/pesapal", ipnHandler);
  router.post("/payments/callbacks/pesapal", ipnHandler);

  router.get("/payments/returns/pesapal", async (request, response) => {
    const parsed = pesapalReturnSchema.safeParse(request.query);
    if (!parsed.success) {
      response.redirect(302, buildAppReturnUrl(appReturnUrl, "", "error", "invalid_return"));
      return;
    }
    try {
      const result = await service.processBrowserReturn(
        parsed.data.OrderMerchantReference,
        parsed.data.OrderTrackingId,
      );
      response.redirect(
        302,
        buildAppReturnUrl(appReturnUrl, result.paymentAttemptId, result.status, "completed"),
      );
    } catch {
      response.redirect(302, buildAppReturnUrl(appReturnUrl, "", "error", "return_failed"));
    }
  });

  router.get("/payments/returns/pesapal/cancel", async (request, response) => {
    const parsed = pesapalCancellationSchema.safeParse(request.query);
    if (!parsed.success) {
      response.redirect(302, buildAppReturnUrl(appReturnUrl, "", "error", "invalid_cancel"));
      return;
    }
    try {
      const attempt = await service.getAttemptByReference(parsed.data.merchantReference);
      response.redirect(
        302,
        buildAppReturnUrl(appReturnUrl, attempt.id, attempt.status, "cancelled"),
      );
    } catch {
      response.redirect(302, buildAppReturnUrl(appReturnUrl, "", "error", "cancel_failed"));
    }
  });

  router.post(
    "/checkouts/:checkoutId/payments",
    authenticate,
    (request, response, next) => {
      const params = paymentCheckoutParamsSchema.safeParse(request.params);
      const body = initiatePaymentSchema.safeParse(request.body);
      if (!params.success) return sendZodValidationError(request, response, params.error.issues);
      if (!body.success) return sendZodValidationError(request, response, body.error.issues);
      next();
    },
    requireIdempotency("payment.create"),
    async (request, response, next) => {
      const params = paymentCheckoutParamsSchema.parse(request.params);
      const body = initiatePaymentSchema.parse(request.body);
      if (!request.auth || !request.idempotency)
        return next(new Error("Required request context is missing."));
      try {
        const data = await service.initiate(request.auth.userId, params.checkoutId, body);
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

  router.get("/payments/:paymentAttemptId", authenticate, async (request, response, next) => {
    const parsed = paymentParamsSchema.safeParse(request.params);
    if (!parsed.success) return sendZodValidationError(request, response, parsed.error.issues);
    if (!request.auth) return next(new Error("Authenticated request context is missing."));
    try {
      sendSuccess(
        request,
        response,
        200,
        await service.get(request.auth.userId, parsed.data.paymentAttemptId),
      );
    } catch (cause) {
      next(cause);
    }
  });
  return router;
}

function buildAppReturnUrl(
  base: string,
  paymentAttemptId: string,
  status: string,
  outcome: string,
): string {
  const separator = base.includes("?") ? "&" : "?";
  const query = new URLSearchParams({ paymentAttemptId, status, outcome });
  return `${base}${separator}${query.toString()}`;
}
