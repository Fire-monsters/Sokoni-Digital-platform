import { Router } from "express";
import { z } from "zod";

import { sendSuccess, sendZodValidationError } from "../../http/responses.js";
import { authenticate } from "../../middleware/authenticate.js";

const applicationRoleSchema = z.enum(["vendor", "rider"]);

const vendorApplicationPatchSchema = z.object({
  personalDetails: z.record(z.string(), z.unknown()).optional(),
  stallDetails: z.record(z.string(), z.unknown()).optional(),
  verification: z.record(z.string(), z.unknown()).optional()
});

const riderApplicationPatchSchema = z.object({
  personalDetails: z.record(z.string(), z.unknown()).optional(),
  motorcycleDetails: z.record(z.string(), z.unknown()).optional(),
  associationAndNextOfKin: z.record(z.string(), z.unknown()).optional(),
  verification: z.record(z.string(), z.unknown()).optional()
});

const submitApplicationSchema = z.object({
  role: applicationRoleSchema,
  idempotencyKey: z.uuid()
});

const signUploadSchema = z.object({
  applicationType: applicationRoleSchema,
  documentType: z.string().min(2),
  fileName: z.string().min(1),
  contentType: z.enum(["image/jpeg", "image/png", "application/pdf"]),
  byteSize: z.number().int().positive().max(5_000_000)
});

const completeUploadSchema = z.object({
  documentId: z.uuid(),
  storagePath: z.string().min(1),
  checksum: z.string().min(16).optional()
});

const trustedDeviceChallengeSchema = z.object({
  installationId: z.uuid(),
  deviceLabel: z.string().trim().min(1).max(80).optional()
});

const trustedDeviceVerifySchema = z.object({
  challengeId: z.uuid(),
  otpCode: z.string().trim().regex(/^[0-9]{6}$/, "Enter the 6-digit verification code.")
});

const trustedDeviceParamsSchema = z.object({
  deviceId: z.uuid()
});

export const meRouter = Router();

meRouter.use(authenticate);

meRouter.get("/", (request, response) => {
  sendSuccess(request, response, 200, {
    userId: "authenticated-user-pending-jwt",
    role: "vendor",
    phoneVerified: false,
    approvalStatus: "draft"
  });
});

meRouter.get("/onboarding", (request, response) => {
  sendSuccess(request, response, 200, {
    role: "vendor",
    currentStep: "phone_verification",
    applicationStatus: "draft",
    requiredActions: ["verify_phone", "complete_application"]
  });
});

meRouter.patch("/vendor-application", (request, response) => {
  const result = vendorApplicationPatchSchema.safeParse(request.body);

  if (!result.success) {
    sendZodValidationError(request, response, result.error.issues);
    return;
  }

  sendSuccess(request, response, 200, {
    role: "vendor",
    applicationStatus: "draft",
    saved: true,
    receivedSections: Object.keys(result.data)
  });
});

meRouter.patch("/rider-application", (request, response) => {
  const result = riderApplicationPatchSchema.safeParse(request.body);

  if (!result.success) {
    sendZodValidationError(request, response, result.error.issues);
    return;
  }

  sendSuccess(request, response, 200, {
    role: "rider",
    applicationStatus: "draft",
    saved: true,
    receivedSections: Object.keys(result.data)
  });
});

meRouter.post("/application/submit", (request, response) => {
  const result = submitApplicationSchema.safeParse(request.body);

  if (!result.success) {
    sendZodValidationError(request, response, result.error.issues);
    return;
  }

  sendSuccess(request, response, 202, {
    role: result.data.role,
    applicationStatus: "submitted",
    reviewStatus: "pending",
    duplicateSubmissionProtected: true
  });
});

meRouter.post("/verification-documents/sign-upload", (request, response) => {
  const result = signUploadSchema.safeParse(request.body);

  if (!result.success) {
    sendZodValidationError(request, response, result.error.issues);
    return;
  }

  sendSuccess(request, response, 202, {
    documentId: "00000000-0000-4000-8000-000000000000",
    storagePath: `verification-documents/pending-user/${result.data.applicationType}/${result.data.documentType}/${result.data.fileName}`,
    uploadUrl: null,
    providerAction: "private_signed_upload_pending"
  });
});

meRouter.post("/verification-documents/complete", (request, response) => {
  const result = completeUploadSchema.safeParse(request.body);

  if (!result.success) {
    sendZodValidationError(request, response, result.error.issues);
    return;
  }

  sendSuccess(request, response, 200, {
    documentId: result.data.documentId,
    storagePath: result.data.storagePath,
    status: "uploaded"
  });
});

meRouter.get("/trusted-devices", (request, response) => {
  sendSuccess(request, response, 200, {
    devices: [],
    activeApprovedDeviceLimit: 1
  });
});

meRouter.post("/trusted-devices/challenge", (request, response) => {
  const result = trustedDeviceChallengeSchema.safeParse(request.body);

  if (!result.success) {
    sendZodValidationError(request, response, result.error.issues);
    return;
  }

  sendSuccess(request, response, 202, {
    installationId: result.data.installationId,
    challengeId: "00000000-0000-4000-8000-000000000001",
    deliveryChannel: "sms",
    resendCooldownSeconds: 60
  });
});

meRouter.post("/trusted-devices/verify", (request, response) => {
  const result = trustedDeviceVerifySchema.safeParse(request.body);

  if (!result.success) {
    sendZodValidationError(request, response, result.error.issues);
    return;
  }

  sendSuccess(request, response, 200, {
    challengeId: result.data.challengeId,
    trustedDeviceStatus: "pending_admin_approval"
  });
});

meRouter.delete("/trusted-devices/:deviceId", (request, response) => {
  const result = trustedDeviceParamsSchema.safeParse(request.params);

  if (!result.success) {
    sendZodValidationError(request, response, result.error.issues);
    return;
  }

  sendSuccess(request, response, 200, {
    deviceId: result.data.deviceId,
    revoked: true
  });
});
