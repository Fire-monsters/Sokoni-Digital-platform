import { Router } from "express";
import {
  deliveryOfferAcceptanceSchema,
  deliveryOfferParamsSchema,
  deliveryOfferRejectionSchema,
  deliveryOperationSchema,
  deliveryCompletionSchema,
  deliveryIssueReportSchema,
  deliveryPinConfirmationSchema,
  deliveryProofImageParamsSchema,
  deliveryProofUploadCompletionSchema,
  deliveryProofUploadIntentSchema,
  riderDeliveryParamsSchema,
  riderDeliveryTransitionSchema,
  riderPickupParamsSchema,
  riderAvailabilityUpdateSchema,
  riderLocationUpdateSchema,
} from "@sokoni-digital/validation/delivery";

import { sendSuccess, sendZodValidationError } from "../../http/responses.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { createRateLimit } from "../../middleware/rate-limit.js";
import { SupabaseRiderOperationsRepository } from "./delivery.repository.js";
import { RiderOperationsService } from "./delivery.service.js";
import { DeliveryProofService } from "./delivery-proof.service.js";

const availabilityRateLimit = createRateLimit({
  namespace: "rider-availability",
  windowMs: 60_000,
  maxRequests: 12,
});
const locationRateLimit = createRateLimit({
  namespace: "rider-location",
  windowMs: 60_000,
  maxRequests: 6,
});
const offerAcceptanceRateLimit = createRateLimit({
  namespace: "rider-offer-acceptance",
  windowMs: 60_000,
  maxRequests: 10,
});
const deliveryMutationRateLimit = createRateLimit({
  namespace: "rider-delivery-mutation",
  windowMs: 60_000,
  maxRequests: 20,
});

export function createRiderOperationsRouter(
  service = new RiderOperationsService(new SupabaseRiderOperationsRepository()),
  proofService = new DeliveryProofService(),
): Router {
  const router = Router();
  router.use(authenticate, authorize(["rider"]));

  router.get("/status", async (request, response, next) => {
    if (!request.auth) {
      next(new Error("Authenticated request context is missing."));
      return;
    }
    try {
      sendSuccess(request, response, 200, await service.getOperationalState(request.auth.userId));
    } catch (error) {
      next(error);
    }
  });

  router.patch("/availability", availabilityRateLimit, async (request, response, next) => {
    const parsed = riderAvailabilityUpdateSchema.safeParse(request.body);
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
        await service.setAvailability(
          request.auth.userId,
          parsed.data.availability,
          parsed.data.operationId,
        ),
      );
    } catch (error) {
      next(error);
    }
  });

  router.put("/location", locationRateLimit, async (request, response, next) => {
    const parsed = riderLocationUpdateSchema.safeParse(request.body);
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
        await service.updateLocation(request.auth.userId, parsed.data),
      );
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/offers/:offerId/accept",
    offerAcceptanceRateLimit,
    async (request, response, next) => {
      const params = deliveryOfferParamsSchema.safeParse(request.params);
      const body = deliveryOfferAcceptanceSchema.safeParse(request.body);
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
          await service.acceptOffer(
            request.auth.userId,
            params.data.offerId,
            body.data.expectedDeliveryVersion,
            body.data.operationId,
          ),
        );
      } catch (error) {
        next(error);
      }
    },
  );

  router.get("/offers/current", async (request, response, next) => {
    if (!request.auth) {
      next(new Error("Authenticated request context is missing."));
      return;
    }
    try {
      sendSuccess(request, response, 200, await service.getCurrentOffer(request.auth.userId));
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/offers/:offerId/reject",
    deliveryMutationRateLimit,
    async (request, response, next) => {
      const params = deliveryOfferParamsSchema.safeParse(request.params);
      const body = deliveryOfferRejectionSchema.safeParse(request.body);
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
          await service.rejectOffer(
            request.auth.userId,
            params.data.offerId,
            body.data.operationId,
          ),
        );
      } catch (error) {
        next(error);
      }
    },
  );

  router.get("/deliveries/current", async (request, response, next) => {
    if (!request.auth) {
      next(new Error("Authenticated request context is missing."));
      return;
    }
    try {
      sendSuccess(request, response, 200, await service.getCurrentDelivery(request.auth.userId));
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/deliveries/:deliveryId/pickups/:sellerOrderId/confirm",
    deliveryMutationRateLimit,
    async (request, response, next) => {
      const params = riderPickupParamsSchema.safeParse(request.params);
      const body = deliveryOperationSchema.safeParse(request.body);
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
        const result = await service.confirmPickup(
          request.auth.userId,
          params.data.sellerOrderId,
          body.data.operationId,
        );
        if (result.deliveryId !== params.data.deliveryId) {
          next(new Error("Pickup delivery mismatch."));
          return;
        }
        sendSuccess(request, response, 200, result);
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/deliveries/:deliveryId/transitions",
    deliveryMutationRateLimit,
    async (request, response, next) => {
      const params = riderDeliveryParamsSchema.safeParse(request.params);
      const body = riderDeliveryTransitionSchema.safeParse(request.body);
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
          await service.transitionDelivery(
            request.auth.userId,
            params.data.deliveryId,
            body.data.toStatus,
            body.data.expectedVersion,
            body.data.operationId,
          ),
        );
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/deliveries/:deliveryId/confirm-consumer",
    deliveryMutationRateLimit,
    async (request, response, next) => {
      const params = riderDeliveryParamsSchema.safeParse(request.params);
      const body = deliveryPinConfirmationSchema.safeParse(request.body);
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
          await proofService.confirmPin(
            request.auth.userId,
            params.data.deliveryId,
            body.data.pin,
            body.data.operationId,
          ),
        );
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/deliveries/:deliveryId/proof/images/upload-intent",
    deliveryMutationRateLimit,
    async (request, response, next) => {
      const params = riderDeliveryParamsSchema.safeParse(request.params);
      const body = deliveryProofUploadIntentSchema.safeParse(request.body);
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
          await proofService.createUploadIntent(
            request.auth.userId,
            params.data.deliveryId,
            body.data,
          ),
        );
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/deliveries/:deliveryId/proof/images/:imageId/complete",
    deliveryMutationRateLimit,
    async (request, response, next) => {
      const params = deliveryProofImageParamsSchema.safeParse(request.params);
      const body = deliveryProofUploadCompletionSchema.safeParse(request.body);
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
          await proofService.completeUpload(
            request.auth.userId,
            params.data.deliveryId,
            params.data.imageId,
            body.data,
          ),
        );
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/deliveries/:deliveryId/complete",
    deliveryMutationRateLimit,
    async (request, response, next) => {
      const params = riderDeliveryParamsSchema.safeParse(request.params);
      const body = deliveryCompletionSchema.safeParse(request.body);
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
          await proofService.completeDelivery(
            request.auth.userId,
            params.data.deliveryId,
            body.data.expectedVersion,
            body.data.operationId,
          ),
        );
      } catch (error) {
        next(error);
      }
    },
  );

  router.post(
    "/deliveries/:deliveryId/issues",
    deliveryMutationRateLimit,
    async (request, response, next) => {
      const params = riderDeliveryParamsSchema.safeParse(request.params);
      const body = deliveryIssueReportSchema.safeParse(request.body);
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
          await proofService.reportIssue(request.auth.userId, params.data.deliveryId, body.data),
        );
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
