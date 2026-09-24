import { Router, type Request } from "express";
import { z } from "zod";
import { supabase } from "../../infrastructure/supabase/client.js";
import { authenticate } from "../../middleware/authenticate.js";
import { sendSuccess, sendZodValidationError } from "../../http/responses.js";
import { SupabaseApplicationRepository } from "./applications.repository.js";
import {
  vendorPatch,
  riderPatch,
  submitInput,
  uploadInput,
  completeInput,
} from "./applications.schemas.js";

function authenticated(request: Request) {
  if (!request.auth) throw new Error("Authenticated context is missing.");
  return request.auth;
}

const profileQuery = z
  .object({ role: z.enum(["vendor", "rider", "consumer"]).optional() })
  .strict();

function defaultRole(request: Request) {
  const { roles } = authenticated(request);
  return roles.includes("rider") ? "rider" : roles.includes("vendor") ? "vendor" : "consumer";
}

export function createApplicantRouter(
  repository: Pick<
    SupabaseApplicationRepository,
    "own" | "save" | "submit" | "upload" | "complete"
  > = new SupabaseApplicationRepository(),
) {
  const router = Router();
  router.use(authenticate);
  router.use((_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    next();
  });
  router.get("/", async (request, response, next) => {
    const parsed = profileQuery.safeParse(request.query);
    if (!parsed.success) {
      sendZodValidationError(request, response, parsed.error.issues);
      return;
    }
    try {
      const userId = authenticated(request).userId;
      const { data, error } = await supabase.auth.admin.getUserById(userId);
      if (error) throw error;
      const role = parsed.data.role ?? defaultRole(request);
      const application = role === "consumer" ? null : await repository.own(userId, role);
      const status = application?.status ?? (role === "consumer" ? "not_required" : "draft");
      sendSuccess(request, response, 200, {
        userId,
        role,
        phoneNumber: data.user.phone,
        phoneVerified: Boolean(data.user.phone_confirmed_at),
        approvalStatus:
          status === "pending_review"
            ? "submitted"
            : status === "in_review"
              ? "under_review"
              : status,
        trustedDeviceStatus: role === "consumer" ? "not_required" : "unknown",
      });
    } catch (error) {
      next(error);
    }
  });
  for (const type of ["vendor", "rider"] as const) {
    router.get(`/${type}-application`, async (request, response, next) => {
      try {
        sendSuccess(
          request,
          response,
          200,
          await repository.own(authenticated(request).userId, type),
        );
      } catch (error) {
        next(error);
      }
    });
    router.patch(`/${type}-application`, async (request, response, next) => {
      const parsed = (type === "vendor" ? vendorPatch : riderPatch).safeParse(request.body);
      if (!parsed.success) {
        sendZodValidationError(request, response, parsed.error.issues);
        return;
      }
      try {
        sendSuccess(
          request,
          response,
          200,
          await repository.save(authenticated(request).userId, type, parsed.data),
        );
      } catch (error) {
        next(error);
      }
    });
  }
  router.post("/application/submit", async (request, response, next) => {
    const parsed = submitInput.safeParse(request.body);
    if (!parsed.success) {
      sendZodValidationError(request, response, parsed.error.issues);
      return;
    }
    try {
      sendSuccess(
        request,
        response,
        200,
        await repository.submit(
          authenticated(request).userId,
          parsed.data.role,
          parsed.data.idempotencyKey,
        ),
      );
    } catch (error) {
      next(error);
    }
  });
  router.post("/verification-documents/sign-upload", async (request, response, next) => {
    const parsed = uploadInput.safeParse(request.body);
    if (!parsed.success) {
      sendZodValidationError(request, response, parsed.error.issues);
      return;
    }
    try {
      sendSuccess(
        request,
        response,
        200,
        await repository.upload(authenticated(request).userId, parsed.data),
      );
    } catch (error) {
      next(error);
    }
  });
  router.post("/verification-documents/complete", async (request, response, next) => {
    const parsed = completeInput.safeParse(request.body);
    if (!parsed.success) {
      sendZodValidationError(request, response, parsed.error.issues);
      return;
    }
    try {
      sendSuccess(
        request,
        response,
        200,
        await repository.complete(authenticated(request).userId, parsed.data.documentId),
      );
    } catch (error) {
      next(error);
    }
  });
  router.get("/onboarding", async (request, response, next) => {
    const parsed = profileQuery.safeParse(request.query);
    if (!parsed.success) {
      sendZodValidationError(request, response, parsed.error.issues);
      return;
    }
    const role = parsed.data.role ?? defaultRole(request);
    try {
      const application =
        role === "consumer" ? null : await repository.own(authenticated(request).userId, role);
      const status = application?.status ?? (role === "consumer" ? "not_required" : "draft");
      sendSuccess(request, response, 200, {
        role,
        applicationStatus:
          status === "pending_review"
            ? "submitted"
            : status === "in_review"
              ? "under_review"
              : status,
        currentStep:
          status === "approved" || status === "not_required"
            ? "complete"
            : ["draft", "changes_requested"].includes(status)
              ? "personal_details"
              : "pending_approval",
        requiredActions: application?.issues ?? [],
        reason: application?.reason ?? null,
      });
    } catch (error) {
      next(error);
    }
  });
  return router;
}
