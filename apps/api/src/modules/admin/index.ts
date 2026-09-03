import { Router } from "express";
import { z } from "zod";

import { sendError, sendSuccess, sendZodValidationError } from "../../http/responses.js";
import { supabase } from "../../infrastructure/supabase/client.js";
import { authenticate } from "../../middleware/authenticate.js";
import { requireActiveStaff, requirePermission } from "../../middleware/require-permission.js";

const applicationStatusSchema = z.enum([
  "submitted",
  "under_review",
  "changes_requested",
  "approved",
  "rejected",
  "suspended",
]);

const applicationListQuerySchema = z.object({
  status: applicationStatusSchema.optional(),
  role: z.enum(["vendor", "rider"]).optional(),
  market: z.string().min(1).optional(),
  submittedFrom: z.iso.datetime().optional(),
  submittedTo: z.iso.datetime().optional(),
});

const applicationParamsSchema = z.object({
  applicationId: z.uuid(),
});

const deviceRequestParamsSchema = z.object({
  requestId: z.uuid(),
});

const trustedDeviceParamsSchema = z.object({
  deviceId: z.uuid(),
});

const userParamsSchema = z.object({
  userId: z.uuid(),
});

const decisionReasonSchema = z.object({
  reason: z.string().trim().min(3, "A reason is required."),
  internalNotes: z.string().trim().optional(),
});

const optionalNotesSchema = z.object({
  internalNotes: z.string().trim().optional(),
});

export const adminRouter = Router();

adminRouter.use(authenticate);

adminRouter.get("/session", requireActiveStaff(), async (request, response) => {
  const staff = request.auth?.staff;
  if (!staff) throw new Error("Staff authorization context is missing.");
  const { data: authData, error: authError } = await supabase.auth.admin.getUserById(staff.userId);
  if (authError) {
    sendError(
      request,
      response,
      401,
      "UNAUTHENTICATED",
      "The staff session could not be verified.",
    );
    return;
  }
  sendSuccess(request, response, 200, {
    userId: staff.userId,
    email: authData.user.email ?? "",
    displayName: staff.displayName,
    role: staff.role,
    status: staff.status,
    permissions: staff.permissions,
  });
});

adminRouter.get("/applications", requirePermission("applications.read"), (request, response) => {
  const result = applicationListQuerySchema.safeParse(request.query);

  if (!result.success) {
    sendZodValidationError(request, response, result.error.issues);
    return;
  }

  sendSuccess(request, response, 200, {
    filters: result.data,
    applications: [],
    nextCursor: null,
  });
});

adminRouter.get(
  "/applications/:applicationId",
  requirePermission("applications.read"),
  (request, response) => {
    const result = applicationParamsSchema.safeParse(request.params);

    if (!result.success) {
      sendZodValidationError(request, response, result.error.issues);
      return;
    }

    sendSuccess(request, response, 200, {
      applicationId: result.data.applicationId,
      status: "submitted",
      applicant: null,
      documents: [],
      timeline: [],
    });
  },
);

adminRouter.post(
  "/applications/:applicationId/start-review",
  requirePermission("applications.review"),
  (request, response) => {
    const params = applicationParamsSchema.safeParse(request.params);
    const body = optionalNotesSchema.safeParse(request.body);

    if (!params.success) {
      sendZodValidationError(request, response, params.error.issues);
      return;
    }

    if (!body.success) {
      sendZodValidationError(request, response, body.error.issues);
      return;
    }

    sendSuccess(request, response, 200, {
      applicationId: params.data.applicationId,
      status: "under_review",
      auditRecorded: true,
    });
  },
);

adminRouter.post(
  "/applications/:applicationId/approve",
  requirePermission("applications.review"),
  (request, response) => {
    const params = applicationParamsSchema.safeParse(request.params);
    const body = optionalNotesSchema.safeParse(request.body);

    if (!params.success) {
      sendZodValidationError(request, response, params.error.issues);
      return;
    }

    if (!body.success) {
      sendZodValidationError(request, response, body.error.issues);
      return;
    }

    sendSuccess(request, response, 200, {
      applicationId: params.data.applicationId,
      status: "approved",
      auditRecorded: true,
    });
  },
);

adminRouter.post(
  "/applications/:applicationId/request-changes",
  requirePermission("applications.review"),
  (request, response) => {
    const params = applicationParamsSchema.safeParse(request.params);
    const body = decisionReasonSchema.safeParse(request.body);

    if (!params.success) {
      sendZodValidationError(request, response, params.error.issues);
      return;
    }

    if (!body.success) {
      sendZodValidationError(request, response, body.error.issues);
      return;
    }

    sendSuccess(request, response, 200, {
      applicationId: params.data.applicationId,
      status: "changes_requested",
      reason: body.data.reason,
      auditRecorded: true,
    });
  },
);

adminRouter.post(
  "/applications/:applicationId/reject",
  requirePermission("applications.review"),
  (request, response) => {
    const params = applicationParamsSchema.safeParse(request.params);
    const body = decisionReasonSchema.safeParse(request.body);

    if (!params.success) {
      sendZodValidationError(request, response, params.error.issues);
      return;
    }

    if (!body.success) {
      sendZodValidationError(request, response, body.error.issues);
      return;
    }

    sendSuccess(request, response, 200, {
      applicationId: params.data.applicationId,
      status: "rejected",
      reason: body.data.reason,
      auditRecorded: true,
    });
  },
);

adminRouter.post(
  "/users/:userId/suspend",
  requirePermission("users.manage"),
  (request, response) => {
    const params = userParamsSchema.safeParse(request.params);
    const body = decisionReasonSchema.safeParse(request.body);

    if (!params.success) {
      sendZodValidationError(request, response, params.error.issues);
      return;
    }

    if (!body.success) {
      sendZodValidationError(request, response, body.error.issues);
      return;
    }

    sendSuccess(request, response, 200, {
      userId: params.data.userId,
      status: "suspended",
      reason: body.data.reason,
      auditRecorded: true,
    });
  },
);

adminRouter.get("/device-requests", requirePermission("users.read"), (request, response) => {
  sendSuccess(request, response, 200, {
    requests: [],
    nextCursor: null,
  });
});

adminRouter.post(
  "/device-requests/:requestId/approve",
  requirePermission("users.manage"),
  (request, response) => {
    const result = deviceRequestParamsSchema.safeParse(request.params);

    if (!result.success) {
      sendZodValidationError(request, response, result.error.issues);
      return;
    }

    sendSuccess(request, response, 200, {
      requestId: result.data.requestId,
      status: "approved",
      auditRecorded: true,
    });
  },
);

adminRouter.post(
  "/device-requests/:requestId/reject",
  requirePermission("users.manage"),
  (request, response) => {
    const params = deviceRequestParamsSchema.safeParse(request.params);
    const body = decisionReasonSchema.safeParse(request.body);

    if (!params.success) {
      sendZodValidationError(request, response, params.error.issues);
      return;
    }

    if (!body.success) {
      sendZodValidationError(request, response, body.error.issues);
      return;
    }

    sendSuccess(request, response, 200, {
      requestId: params.data.requestId,
      status: "rejected",
      reason: body.data.reason,
      auditRecorded: true,
    });
  },
);

adminRouter.post(
  "/trusted-devices/:deviceId/revoke",
  requirePermission("users.manage"),
  (request, response) => {
    const params = trustedDeviceParamsSchema.safeParse(request.params);
    const body = decisionReasonSchema.safeParse(request.body);

    if (!params.success) {
      sendZodValidationError(request, response, params.error.issues);
      return;
    }

    if (!body.success) {
      sendZodValidationError(request, response, body.error.issues);
      return;
    }

    sendSuccess(request, response, 200, {
      deviceId: params.data.deviceId,
      revoked: true,
      reason: body.data.reason,
      auditRecorded: true,
    });
  },
);
