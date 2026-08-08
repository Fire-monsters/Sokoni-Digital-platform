import { Router } from "express";
import {
  priceRequestParamsSchema,
  requestChangesSchema,
  reviewListingSchema,
  reviewPriceSchema,
} from "@sokoni-digital/validation/listing-approval";
import { listingIdParamsSchema } from "@sokoni-digital/validation/listing";

import { sendSuccess, sendZodValidationError } from "../../http/responses.js";
import { authenticate } from "../../middleware/authenticate.js";
import { authorize } from "../../middleware/authorize.js";
import { ListingApprovalRepository } from "./listing-approval.repository.js";

export function createListingApprovalRouter(repository = new ListingApprovalRepository()): Router {
  const router = Router();
  router.use(authenticate, authorize(["admin", "agent"]));
  const adminId = (request: Express.Request) => {
    if (!request.auth) throw new Error("Authenticated request context is missing.");
    return request.auth.userId;
  };

  router.get("/listings", async (request, response, next) => {
    try {
      sendSuccess(request, response, 200, { listings: await repository.listPending() });
    } catch (error) {
      next(error);
    }
  });

  router.get("/price-requests", async (request, response, next) => {
    try {
      sendSuccess(request, response, 200, { requests: await repository.listPendingPrices() });
    } catch (error) {
      next(error);
    }
  });

  router.get("/listings/:listingId", async (request, response, next) => {
    const parsed = listingIdParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      sendZodValidationError(request, response, parsed.error.issues);
      return;
    }
    try {
      sendSuccess(request, response, 200, await repository.getListing(parsed.data.listingId));
    } catch (error) {
      next(error);
    }
  });

  router.post("/listings/:listingId/approve", async (request, response, next) => {
    const params = listingIdParamsSchema.safeParse(request.params);
    const body = reviewListingSchema.safeParse(request.body);
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
        await repository.approveListing(
          params.data.listingId,
          adminId(request),
          body.data.reviewNote,
        ),
      );
    } catch (error) {
      next(error);
    }
  });

  router.post("/listings/:listingId/request-changes", async (request, response, next) => {
    const params = listingIdParamsSchema.safeParse(request.params);
    const body = requestChangesSchema.safeParse(request.body);
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
        await repository.requestChanges(
          params.data.listingId,
          adminId(request),
          body.data.reviewNote,
        ),
      );
    } catch (error) {
      next(error);
    }
  });

  for (const decision of ["approved", "rejected"] as const) {
    router.post(
      `/price-requests/:requestId/${decision === "approved" ? "approve" : "reject"}`,
      async (request, response, next) => {
        const params = priceRequestParamsSchema.safeParse(request.params);
        const body = reviewPriceSchema.safeParse(request.body);
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
            await repository.reviewPrice(
              params.data.requestId,
              adminId(request),
              decision,
              body.data.reviewNote,
            ),
          );
        } catch (error) {
          next(error);
        }
      },
    );
  }

  return router;
}
