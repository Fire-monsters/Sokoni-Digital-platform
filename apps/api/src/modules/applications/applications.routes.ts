import { Router } from "express";
import { sendSuccess, sendZodValidationError } from "../../http/responses.js";
import { authenticate } from "../../middleware/authenticate.js";
import { requirePermission } from "../../middleware/require-permission.js";
import { createAdminWorkflowRoute } from "../admin/workflows/index.js";
import { SupabaseApplicationRepository } from "./applications.repository.js";
import { ApplicationReviewService } from "./applications.service.js";
import { applicationParams, reviewInput, reasonInput, noteInput } from "./applications.schemas.js";

export function createApplicationReviewRouter(
  service = new ApplicationReviewService(new SupabaseApplicationRepository()),
) {
  const router = Router();
  router.use(authenticate);
  router.use((_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    next();
  });
  router.get(
    "/applications/:applicationId",
    requirePermission("applications.read"),
    async (request, response, next) => {
      const parsed = applicationParams.safeParse(request.params);
      if (!parsed.success) {
        sendZodValidationError(request, response, parsed.error.issues);
        return;
      }
      try {
        sendSuccess(request, response, 200, await service.get(parsed.data.applicationId));
      } catch (error) {
        next(error);
      }
    },
  );
  for (const action of [
    "start-review",
    "approve",
    "request-changes",
    "reject",
    "suspend",
    "notes",
  ] as const) {
    router.post(
      `/applications/:applicationId/${action}`,
      ...createAdminWorkflowRoute({
        operation: `applications.${action}`,
        permission: action === "suspend" ? "users.manage" : "applications.review",
        paramsSchema: applicationParams,
        bodySchema:
          action === "notes"
            ? noteInput
            : ["request-changes", "reject", "suspend"].includes(action)
              ? reasonInput
              : reviewInput,
        execute: (command) => service.execute(action, command),
      }),
    );
  }
  return router;
}
