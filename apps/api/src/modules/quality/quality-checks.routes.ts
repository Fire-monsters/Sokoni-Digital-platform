import { Router } from "express";
import {
  completeQualityCheckSchema,
  completeQualityImageSchema,
  qualityImageIntentSchema,
  qualityImageParamsSchema,
} from "@sokoni-digital/validation/quality-check";
import { vendorOrderParamsSchema } from "@sokoni-digital/validation/vendor-order";

import { sendSuccess, sendZodValidationError } from "../../http/responses.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { QualityChecksService } from "./quality-checks.service.js";

export function createQualityChecksRouter(service = new QualityChecksService()): Router {
  const router = Router();
  router.use(authenticate, authorize(["vendor"]));

  router.post(
    "/:sellerOrderId/quality-check/images/upload-intent",
    async (request, response, next) => {
      const params = vendorOrderParamsSchema.safeParse(request.params);
      const body = qualityImageIntentSchema.safeParse(request.body);
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
          201,
          await service.createUploadIntent(
            request.auth.userId,
            params.data.sellerOrderId,
            body.data,
          ),
        );
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/:sellerOrderId/quality-check/images/:imageId/complete",
    async (request, response, next) => {
      const params = qualityImageParamsSchema.safeParse(request.params);
      const body = completeQualityImageSchema.safeParse(request.body);
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
          await service.completeUpload(
            request.auth.userId,
            params.data.sellerOrderId,
            params.data.imageId,
            body.data,
          ),
        );
      } catch (error) {
        next(error);
      }
    },
  );

  router.post("/:sellerOrderId/quality-check/complete", async (request, response, next) => {
    const params = vendorOrderParamsSchema.safeParse(request.params);
    const body = completeQualityCheckSchema.safeParse(request.body);
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
        await service.completeCheck(request.auth.userId, params.data.sellerOrderId, body.data),
      );
    } catch (error) {
      next(error);
    }
  });

  return router;
}
