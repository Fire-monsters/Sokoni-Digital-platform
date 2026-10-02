import { createHmac } from "node:crypto";
import { Router } from "express";
import {
  businessLoginSchema,
  businessOtpSchema,
  businessRefreshSchema,
  businessRegisterSchema,
  businessResendSchema,
} from "@sokoni-digital/validation";
import { parseServerEnvironment } from "../../config/index.js";
import { supabase } from "../../infrastructure/supabase/client.js";
import { sendError, sendSuccess, sendZodValidationError } from "../../http/responses.js";
import { createBusinessAuthProvider, type BusinessAuthProvider } from "./business-auth.provider.js";

export type AuthLimiter = (key: string, max: number, seconds: number) => Promise<boolean>;
export const databaseAuthLimiter: AuthLimiter = async (key, max, seconds) => {
  const env = parseServerEnvironment();
  const hash = createHmac("sha256", env.SUPABASE_SECRET_KEY).update(key).digest("hex");
  const { data, error } = await supabase.rpc("consume_business_auth_limit", {
    p_key: hash,
    p_max: max,
    p_seconds: seconds,
  });
  if (error)
    throw Object.assign(new Error("Authentication rate limiter unavailable."), {
      statusCode: 503,
      code: "INTERNAL_ERROR",
    });
  return data;
};
export function createBusinessAuthRouter(
  factory: () => BusinessAuthProvider = createBusinessAuthProvider,
  limit: AuthLimiter = databaseAuthLimiter,
) {
  const router = Router();
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  const actions = [
    ["register", businessRegisterSchema],
    ["login", businessLoginSchema],
    ["verify-otp", businessOtpSchema],
    ["resend-otp", businessResendSchema],
    ["refresh", businessRefreshSchema],
  ] as const;
  for (const [action, schema] of actions) {
    router.post(`/${action}`, async (req, res, next) => {
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        sendZodValidationError(req, res, parsed.error.issues);
        return;
      }
      try {
        const input = parsed.data;
        const isSms = action === "register" || action === "resend-otp";
        // Ignore user-supplied forwarding headers; Express trust proxy must be configured by deployment.
        const ipAllowed = await limit(`ip:${req.ip ?? "unknown"}`, 60, 60);
        const phoneAllowed =
          !("phoneNumber" in input) ||
          (await limit(`${isSms ? "sms" : action}:${input.phoneNumber}`, isSms ? 1 : 10, 60));
        if (!ipAllowed || !phoneAllowed) {
          res.setHeader("Retry-After", "60");
          sendError(req, res, 429, "RATE_LIMITED", "Too many attempts. Please try again later.");
          return;
        }
        const provider = factory();
        switch (action) {
          case "register": {
            const v = businessRegisterSchema.parse(input);
            await provider.register(v.phoneNumber, v.password);
            sendSuccess(req, res, 202, { phoneVerificationRequired: true });
            break;
          }
          case "resend-otp": {
            const v = businessResendSchema.parse(input);
            await provider.resend(v.phoneNumber);
            sendSuccess(req, res, 202, { phoneVerificationRequired: true });
            break;
          }
          case "verify-otp": {
            const v = businessOtpSchema.parse(input);
            sendSuccess(req, res, 200, await provider.verify(v.phoneNumber, v.otpCode));
            break;
          }
          case "login": {
            const v = businessLoginSchema.parse(input);
            sendSuccess(req, res, 200, await provider.login(v.phoneNumber, v.password));
            break;
          }
          case "refresh": {
            const v = businessRefreshSchema.parse(input);
            sendSuccess(req, res, 200, await provider.refresh(v.refreshToken));
            break;
          }
        }
      } catch (e) {
        next(e);
      }
    });
  }
  router.post("/logout", async (req, res, next) => {
    const token = req.header("authorization")?.match(/^Bearer (\S+)$/)?.[1];
    if (!token) {
      sendError(req, res, 401, "UNAUTHENTICATED", "Bearer token required.");
      return;
    }
    try {
      if (!(await limit(`ip:${req.ip ?? "unknown"}`, 60, 60))) {
        sendError(req, res, 429, "RATE_LIMITED", "Too many attempts.");
        return;
      }
      await factory().logout(token);
      sendSuccess(req, res, 200, { signedOut: true });
    } catch (e) {
      next(e);
    }
  });
  return router;
}
