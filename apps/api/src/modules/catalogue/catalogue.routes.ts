import { Router } from "express";
import type { CatalogueQuery } from "@sokoni-digital/domain";
import {
  catalogueHomeQuerySchema,
  catalogueListingParamsSchema,
  catalogueQuerySchema,
} from "@sokoni-digital/validation/catalogue-search";

import { sendSuccess, sendZodValidationError } from "../../http/responses.js";
import { InvalidCatalogueCursorError } from "./catalogue.cursor.js";
import { SupabaseCatalogueRepository } from "./catalogue.repository.js";
import { CatalogueService } from "./catalogue.service.js";
import type { CatalogueRepository } from "./catalogue.types.js";

export function createCatalogueRouter(
  repository: CatalogueRepository = new SupabaseCatalogueRepository(),
): Router {
  const router = Router();
  const service = new CatalogueService(repository);

  router.get("/categories", async (request, response, next) => {
    try {
      sendSuccess(request, response, 200, await service.listCategories());
    } catch (error) {
      next(error);
    }
  });

  router.get("/products", async (request, response, next) => {
    const categoryId =
      typeof request.query.categoryId === "string" ? request.query.categoryId : undefined;
    try {
      sendSuccess(request, response, 200, await service.listProducts(categoryId));
    } catch (error) {
      next(error);
    }
  });

  router.get("/home", async (request, response, next) => {
    const result = catalogueHomeQuerySchema.safeParse(request.query);

    if (!result.success) {
      sendZodValidationError(request, response, result.error.issues);
      return;
    }

    try {
      sendSuccess(request, response, 200, await service.getHome(result.data.marketId), {
        reducedData: result.data.reducedData,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/listings", async (request, response, next) => {
    const result = catalogueQuerySchema.safeParse(request.query);

    if (!result.success) {
      sendZodValidationError(request, response, result.error.issues);
      return;
    }

    try {
      const query = Object.fromEntries(
        Object.entries(result.data).filter(([, value]) => value !== undefined),
      ) as CatalogueQuery;
      sendSuccess(request, response, 200, await service.listListings(query), {
        reducedData: result.data.reducedData,
      });
    } catch (error) {
      if (error instanceof InvalidCatalogueCursorError) {
        sendZodValidationError(request, response, [
          {
            code: "custom",
            path: ["cursor"],
            message: error.message,
            input: request.query.cursor,
          },
        ]);
        return;
      }

      next(error);
    }
  });

  router.get("/listings/:listingId", async (request, response, next) => {
    const result = catalogueListingParamsSchema.safeParse(request.params);

    if (!result.success) {
      sendZodValidationError(request, response, result.error.issues);
      return;
    }

    try {
      sendSuccess(request, response, 200, await service.getListing(result.data.listingId));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
