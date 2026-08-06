import { Router } from "express";
import { z } from "zod";

import { sendSuccess, sendZodValidationError } from "../../http/responses.js";

const ugandanPhoneNumberSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/\s+/g, ""))
  .transform((value) => (value.startsWith("0") ? `+256${value.slice(1)}` : value))
  .refine((value) => /^(?:\+256)(?:7[0-9]|3[0-9])[0-9]{7}$/.test(value), {
    message: "Enter a valid Ugandan phone number."
  });

const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  .regex(/[A-Z]/, "Use at least one uppercase letter.")
  .regex(/[a-z]/, "Use at least one lowercase letter.")
  .regex(/[0-9]/, "Use at least one number.");

const otpCodeSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/\s+/g, ""))
  .refine((value) => /^[0-9]{6}$/.test(value), {
    message: "Enter the 6-digit verification code."
  });

const roleSchema = z.enum(["vendor", "rider"]);
const otpPurposeSchema = z.enum(["registration", "recovery", "trusted_device"]);

const registerSchema = z.object({
  phoneNumber: ugandanPhoneNumberSchema,
  password: passwordSchema,
  preferredLanguage: z.enum(["en", "lg"]).default("en"),
  installationId: z.uuid().optional()
});

const sendOtpSchema = z.object({
  phoneNumber: ugandanPhoneNumberSchema,
  purpose: otpPurposeSchema,
  role: roleSchema.optional()
});

const verifyOtpSchema = z.object({
  phoneNumber: ugandanPhoneNumberSchema,
  otpCode: otpCodeSchema,
  purpose: otpPurposeSchema,
  role: roleSchema.optional()
});

const signInSchema = z.object({
  phoneNumber: ugandanPhoneNumberSchema,
  password: z.string().min(1, "Enter your password."),
  installationId: z.uuid().optional()
});

const recoveryRequestSchema = z.object({
  phoneNumber: ugandanPhoneNumberSchema,
  role: roleSchema
});

const recoveryVerifySchema = z.object({
  phoneNumber: ugandanPhoneNumberSchema,
  role: roleSchema,
  otpCode: otpCodeSchema
});

const recoveryResetPasswordSchema = z.object({
  phoneNumber: ugandanPhoneNumberSchema,
  role: roleSchema,
  recoveryToken: z.string().min(16, "Recovery token is required."),
  password: passwordSchema
});

export const authRouter = Router();

authRouter.post("/vendor/register", (request, response) => {
  const result = registerSchema.safeParse(request.body);

  if (!result.success) {
    sendZodValidationError(request, response, result.error.issues);
    return;
  }

  sendSuccess(request, response, 202, {
    role: "vendor",
    phoneNumber: result.data.phoneNumber,
    preferredLanguage: result.data.preferredLanguage,
    phoneVerificationRequired: true,
    applicationStatus: "draft",
    providerAction: "supabase_registration_pending"
  });
});

authRouter.post("/rider/register", (request, response) => {
  const result = registerSchema.safeParse(request.body);

  if (!result.success) {
    sendZodValidationError(request, response, result.error.issues);
    return;
  }

  sendSuccess(request, response, 202, {
    role: "rider",
    phoneNumber: result.data.phoneNumber,
    preferredLanguage: result.data.preferredLanguage,
    phoneVerificationRequired: true,
    applicationStatus: "draft",
    providerAction: "supabase_registration_pending"
  });
});

authRouter.post("/send-otp", (request, response) => {
  const result = sendOtpSchema.safeParse(request.body);

  if (!result.success) {
    sendZodValidationError(request, response, result.error.issues);
    return;
  }

  sendSuccess(request, response, 202, {
    phoneNumber: result.data.phoneNumber,
    purpose: result.data.purpose,
    deliveryChannel: "sms",
    resendCooldownSeconds: 60,
    providerAction: "otp_delivery_pending"
  });
});

authRouter.post("/verify-otp", (request, response) => {
  const result = verifyOtpSchema.safeParse(request.body);

  if (!result.success) {
    sendZodValidationError(request, response, result.error.issues);
    return;
  }

  sendSuccess(request, response, 200, {
    phoneNumber: result.data.phoneNumber,
    purpose: result.data.purpose,
    verified: true,
    verificationToken: "otp-verification-token-pending-provider"
  });
});

authRouter.post("/sign-in", (request, response) => {
  const result = signInSchema.safeParse(request.body);

  if (!result.success) {
    sendZodValidationError(request, response, result.error.issues);
    return;
  }

  sendSuccess(request, response, 202, {
    phoneNumber: result.data.phoneNumber,
    authenticated: false,
    trustedDeviceRequired: true,
    providerAction: "supabase_password_sign_in_pending"
  });
});

authRouter.post("/recovery/request", (request, response) => {
  const result = recoveryRequestSchema.safeParse(request.body);

  if (!result.success) {
    sendZodValidationError(request, response, result.error.issues);
    return;
  }

  sendSuccess(request, response, 202, {
    phoneNumber: result.data.phoneNumber,
    role: result.data.role,
    deliveryChannel: "sms",
    resendCooldownSeconds: 60,
    message: "If the account can be recovered, a verification code will be sent."
  });
});

authRouter.post("/recovery/verify", (request, response) => {
  const result = recoveryVerifySchema.safeParse(request.body);

  if (!result.success) {
    sendZodValidationError(request, response, result.error.issues);
    return;
  }

  sendSuccess(request, response, 200, {
    phoneNumber: result.data.phoneNumber,
    role: result.data.role,
    verified: true,
    recoveryToken: "password-recovery-token-pending-provider"
  });
});

authRouter.post("/recovery/reset-password", (request, response) => {
  const result = recoveryResetPasswordSchema.safeParse(request.body);

  if (!result.success) {
    sendZodValidationError(request, response, result.error.issues);
    return;
  }

  sendSuccess(request, response, 200, {
    phoneNumber: result.data.phoneNumber,
    role: result.data.role,
    passwordUpdated: true,
    providerAction: "supabase_password_update_pending"
  });
});
