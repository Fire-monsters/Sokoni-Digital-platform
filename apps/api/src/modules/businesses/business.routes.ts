import { Router, type Request, type RequestHandler } from "express";
import { z } from "zod";
import {
  businessMutationSchema,
  businessPageSchema,
  businessPreferencesSchema,
  businessReviewSchema,
  createBusinessSchema,
  cropCategorySchema,
  patchBusinessSchema,
} from "@sokoni-digital/validation";
import type { BusinessAccount, BusinessAnalyticsContext } from "@sokoni-digital/domain";
import { authenticate } from "../../middleware/authenticate.js";
import { sendSuccess, sendZodValidationError } from "../../http/responses.js";
import { SupabaseBusinessRepository, type BusinessRepository } from "./business.repository.js";

function actor(req: Request): string {
  if (!req.auth)
    throw Object.assign(new Error("Authentication required."), {
      statusCode: 401,
      code: "UNAUTHENTICATED",
    });
  return req.auth.userId;
}

export function createBusinessRouter(
  repository: BusinessRepository = new SupabaseBusinessRepository(),
  auth: RequestHandler = authenticate,
) {
  const router = Router();
  router.use(
    ["/agriculture", "/me/businesses", "/admin/business-applications"],
    auth,
    (_req, res, next) => {
      res.setHeader("Cache-Control", "no-store");
      next();
    },
  );
  router.get("/agriculture/products", async (req, res, next) => {
    const parsed = z
      .object({ category: cropCategorySchema.optional() })
      .strict()
      .safeParse(req.query);
    if (!parsed.success) {
      sendZodValidationError(req, res, parsed.error.issues);
      return;
    }
    try {
      sendSuccess(req, res, 200, await repository.products(parsed.data.category));
    } catch (e) {
      next(e);
    }
  });
  for (const [base, admin] of [
    ["/me/businesses", false],
    ["/admin/business-applications", true],
  ] as const) {
    router.get(base, async (req, res, next) => {
      const parsed = businessPageSchema.safeParse(req.query);
      if (!parsed.success) {
        sendZodValidationError(req, res, parsed.error.issues);
        return;
      }
      try {
        sendSuccess(
          req,
          res,
          200,
          await repository.read(
            actor(req),
            undefined,
            admin,
            parsed.data.limit,
            parsed.data.offset,
          ),
        );
      } catch (e) {
        next(e);
      }
    });
    router.get(`${base}/:businessId`, async (req, res, next) => {
      const id = z.uuid().safeParse("businessId" in req.params ? req.params.businessId : undefined);
      if (!id.success) {
        sendZodValidationError(req, res, id.error.issues);
        return;
      }
      try {
        sendSuccess(req, res, 200, await repository.read(actor(req), id.data, admin));
      } catch (e) {
        next(e);
      }
    });
  }
  router.get("/me/businesses/:businessId/analytics-context", async (req, res, next) => {
    const id = z.uuid().safeParse("businessId" in req.params ? req.params.businessId : undefined);
    if (!id.success) {
      sendZodValidationError(req, res, id.error.issues);
      return;
    }
    try {
      const business = (await repository.read(actor(req), id.data)) as BusinessAccount;
      const context: BusinessAnalyticsContext = {
        businessId: business.id,
        categories: business.categories,
        productIds: business.productIds,
        defaultScope: business.productIds.length ? "selected_products" : "all_products",
        reportingTimezone: "Africa/Kampala",
        metricsAvailable: false,
      };
      sendSuccess(req, res, 200, context);
    } catch (e) {
      next(e);
    }
  });
  const mutations = [
    ["post", "/me/businesses", "create", createBusinessSchema],
    ["patch", "/me/businesses/:businessId", "profile", patchBusinessSchema],
    [
      "put",
      "/me/businesses/:businessId/product-preferences",
      "preferences",
      businessPreferencesSchema,
    ],
    ["post", "/me/businesses/:businessId/submit", "submit", businessMutationSchema],
    ["post", "/admin/business-applications/:businessId/review", "review", businessReviewSchema],
  ] as const;
  for (const [method, path, action, schema] of mutations) {
    router[method](path, async (req, res, next) => {
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        sendZodValidationError(req, res, parsed.error.issues);
        return;
      }
      const id = z
        .uuid()
        .optional()
        .safeParse("businessId" in req.params ? req.params.businessId : undefined);
      if (!id.success) {
        sendZodValidationError(req, res, id.error.issues);
        return;
      }
      try {
        const { operationId, ...input } = parsed.data;
        sendSuccess(
          req,
          res,
          action === "create" ? 201 : 200,
          await repository.command(actor(req), action, operationId, input, id.data),
        );
      } catch (e) {
        next(e);
      }
    });
  }
  return router;
}
