import { Router } from "express";
import {
  changeAvailabilitySchema,
  createListingSchema,
  createPriceRequestSchema,
  listingIdParamsSchema,
  updateListingSchema,
} from "@sokoni-digital/validation/listing";
import {
  completeUploadSchema,
  imageParamsSchema,
  uploadIntentSchema,
} from "@sokoni-digital/validation/listing-image";

import { sendSuccess, sendZodValidationError } from "../../http/responses.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { ListingImagesService } from "./listing-images.service.js";
import { ListingsRepository } from "./listings.repository.js";

export function createListingsRouter(
  listings = new ListingsRepository(),
  images = new ListingImagesService(listings),
): Router {
  const router = Router();
  router.use(authenticate, authorize(["vendor"]));

  const userId = (request: Express.Request) => {
    if (!request.auth) throw new Error("Authenticated request context is missing.");
    return request.auth.userId;
  };

  router.post("/", async (request, response, next) => {
    const parsed = createListingSchema.safeParse(request.body);
    if (!parsed.success) {
      sendZodValidationError(request, response, parsed.error.issues);
      return;
    }
    try {
      sendSuccess(request, response, 201, await listings.create(userId(request), parsed.data));
    } catch (error) {
      next(error);
    }
  });

  router.get("/", async (request, response, next) => {
    try {
      sendSuccess(request, response, 200, await listings.list(userId(request)));
    } catch (error) {
      next(error);
    }
  });

  router.get("/:listingId", async (request, response, next) => {
    const parsed = listingIdParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      sendZodValidationError(request, response, parsed.error.issues);
      return;
    }
    try {
      sendSuccess(
        request,
        response,
        200,
        await listings.getById(userId(request), parsed.data.listingId),
      );
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:listingId", async (request, response, next) => {
    const params = listingIdParamsSchema.safeParse(request.params);
    const body = updateListingSchema.safeParse(request.body);
    if (!params.success) {
      sendZodValidationError(request, response, params.error.issues);
      return;
    }
    if (!body.success) {
      sendZodValidationError(request, response, body.error.issues);
      return;
    }
    try {
      sendSuccess(
        request,
        response,
        200,
        await listings.update(userId(request), params.data.listingId, body.data),
      );
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:listingId", async (request, response, next) => {
    const parsed = listingIdParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      sendZodValidationError(request, response, parsed.error.issues);
      return;
    }
    try {
      await listings.archive(userId(request), parsed.data.listingId);
      response.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  router.post("/:listingId/submit", async (request, response, next) => {
    const parsed = listingIdParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      sendZodValidationError(request, response, parsed.error.issues);
      return;
    }
    try {
      sendSuccess(
        request,
        response,
        200,
        await listings.submit(userId(request), parsed.data.listingId),
      );
    } catch (error) {
      next(error);
    }
  });

  router.post("/:listingId/price-requests", async (request, response, next) => {
    const params = listingIdParamsSchema.safeParse(request.params);
    const body = createPriceRequestSchema.safeParse(request.body);
    if (!params.success) {
      sendZodValidationError(request, response, params.error.issues);
      return;
    }
    if (!body.success) {
      sendZodValidationError(request, response, body.error.issues);
      return;
    }
    try {
      sendSuccess(
        request,
        response,
        201,
        await listings.createPriceRequest(
          userId(request),
          params.data.listingId,
          body.data.proposedPriceUgx,
          body.data.reason,
        ),
      );
    } catch (error) {
      next(error);
    }
  });

  router.patch("/:listingId/availability", async (request, response, next) => {
    const params = listingIdParamsSchema.safeParse(request.params);
    const body = changeAvailabilitySchema.safeParse(request.body);
    if (!params.success) {
      sendZodValidationError(request, response, params.error.issues);
      return;
    }
    if (!body.success) {
      sendZodValidationError(request, response, body.error.issues);
      return;
    }
    try {
      sendSuccess(
        request,
        response,
        200,
        await listings.changeAvailability(
          userId(request),
          params.data.listingId,
          body.data.availability,
          body.data.expectedVersion,
          body.data.operationId,
        ),
      );
    } catch (error) {
      next(error);
    }
  });

  router.post("/:listingId/images/upload-intent", async (request, response, next) => {
    const params = listingIdParamsSchema.safeParse(request.params);
    const body = uploadIntentSchema.safeParse(request.body);
    if (!params.success) {
      sendZodValidationError(request, response, params.error.issues);
      return;
    }
    if (!body.success) {
      sendZodValidationError(request, response, body.error.issues);
      return;
    }
    try {
      sendSuccess(
        request,
        response,
        201,
        await images.createIntent(userId(request), params.data.listingId, body.data.mimeType),
      );
    } catch (error) {
      next(error);
    }
  });

  router.post("/:listingId/images/:imageId/complete", async (request, response, next) => {
    const params = imageParamsSchema.safeParse(request.params);
    const body = completeUploadSchema.safeParse(request.body);
    if (!params.success) {
      sendZodValidationError(request, response, params.error.issues);
      return;
    }
    if (!body.success) {
      sendZodValidationError(request, response, body.error.issues);
      return;
    }
    try {
      sendSuccess(
        request,
        response,
        201,
        await images.complete(
          userId(request),
          params.data.listingId,
          params.data.imageId,
          body.data,
        ),
      );
    } catch (error) {
      next(error);
    }
  });

  return router;
}
