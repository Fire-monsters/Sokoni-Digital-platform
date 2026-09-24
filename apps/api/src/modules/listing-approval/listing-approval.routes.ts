import { Router } from "express";
import {
  priceRequestParamsSchema,
  rejectPriceSchema,
  requestChangesSchema,
  reviewListingSchema,
  reviewPriceSchema,
} from "@sokoni-digital/validation/listing-approval";
import { listingIdParamsSchema } from "@sokoni-digital/validation/listing";

import { sendSuccess, sendZodValidationError } from "../../http/responses.js";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/require-permission.js";
import { createAdminWorkflowRoute } from "../admin/workflows/index.js";
import {
  SupabaseCatalogueReviewRepository,
  type CatalogueReviewRepository,
} from "./listing-approval.repository.js";
import { ListingApprovalService } from "./listing-approval.service.js";

export function createListingApprovalRouter(
  repository: CatalogueReviewRepository = new SupabaseCatalogueReviewRepository(),
): Router {
  const router = Router();
  const service = new ListingApprovalService(repository);
  router.use(authenticate);

  router.get("/listings", requirePermission("catalogue.read"), async (request, response, next) => {
    try {
      sendSuccess(request, response, 200, { listings: await repository.listPending() });
    } catch (error) {
      next(error);
    }
  });

  router.get(
    "/price-requests",
    requirePermission("catalogue.read"),
    async (request, response, next) => {
      try {
        sendSuccess(request, response, 200, { requests: await repository.listPendingPrices() });
      } catch (error) {
        next(error);
      }
    },
  );

  router.get(
    "/listings/:listingId",
    requirePermission("catalogue.read"),
    async (request, response, next) => {
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
    },
  );

  router.post(
    "/listings/:listingId/approve",
    ...createAdminWorkflowRoute({
      operation: "catalogue.listing.approve",
      permission: "catalogue.review",
      paramsSchema: listingIdParamsSchema,
      bodySchema: reviewListingSchema,
      execute: (command) => service.approveListing(command),
    }),
  );

  router.post(
    "/listings/:listingId/request-changes",
    ...createAdminWorkflowRoute({
      operation: "catalogue.listing.request_changes",
      permission: "catalogue.review",
      paramsSchema: listingIdParamsSchema,
      bodySchema: requestChangesSchema,
      execute: (command) => service.requestChanges(command),
    }),
  );

  for (const decision of ["approved", "rejected"] as const) {
    router.post(
      `/price-requests/:requestId/${decision === "approved" ? "approve" : "reject"}`,
      ...createAdminWorkflowRoute({
        operation: `catalogue.price_request.${decision}`,
        permission: "catalogue.review",
        paramsSchema: priceRequestParamsSchema,
        bodySchema: decision === "approved" ? reviewPriceSchema : rejectPriceSchema,
        execute: (command) => service.reviewPrice(decision, command),
      }),
    );
  }

  return router;
}
