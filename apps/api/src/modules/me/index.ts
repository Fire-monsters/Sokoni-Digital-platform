import { Router } from "express";
import { z } from "zod";

import { sendSuccess, sendZodValidationError } from "../../http/responses.js";
import { authenticate } from "../../middleware/authenticate.js";

const trustedDeviceChallengeSchema = z.object({
  installationId: z.uuid(),
  deviceLabel: z.string().trim().min(1).max(80).optional(),
});

const trustedDeviceVerifySchema = z.object({
  challengeId: z.uuid(),
  otpCode: z
    .string()
    .trim()
    .regex(/^[0-9]{6}$/, "Enter the 6-digit verification code."),
});

const trustedDeviceParamsSchema = z.object({
  deviceId: z.uuid(),
});

export const meRouter = Router();

meRouter.use(authenticate);

meRouter.get("/trusted-devices", (request, response) => {
  sendSuccess(request, response, 200, {
    devices: [],
    activeApprovedDeviceLimit: 1,
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
    resendCooldownSeconds: 60,
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
    trustedDeviceStatus: "pending_admin_approval",
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
    revoked: true,
  });
});
