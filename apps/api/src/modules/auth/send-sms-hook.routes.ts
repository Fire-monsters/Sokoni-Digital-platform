import { Router } from "express";
import { z } from "zod";

import { parseServerEnvironment } from "../../config/index.js";
import { YoolaSmsAdapter, type SmsAdapter } from "../../infrastructure/messaging/index.js";
import { verifyStandardWebhook } from "./standard-webhook.js";

const sendSmsHookSchema = z.object({
  user: z.object({
    phone: z.string().regex(/^\+[1-9][0-9]{7,14}$/),
  }),
  sms: z.object({
    otp: z.string().regex(/^[0-9]{6,10}$/),
  }),
});

export function createAuthHookRouter(options?: {
  smsAdapter?: SmsAdapter;
  hookSecret?: string;
}): Router {
  const router = Router();

  router.post("/hooks/send-sms", async (request, response) => {
    const environment = options ? undefined : parseServerEnvironment();
    const hookSecret = options?.hookSecret ?? environment?.SUPABASE_AUTH_SEND_SMS_HOOK_SECRETS;
    const smsAdapter = options?.smsAdapter ?? new YoolaSmsAdapter(environment?.YOOLA_SMS_API_KEY);
    const rawBody = request.rawBody;
    const webhookId = request.header("webhook-id");
    const webhookTimestamp = request.header("webhook-timestamp");
    const webhookSignature = request.header("webhook-signature");

    if (!hookSecret || !rawBody || !webhookId || !webhookTimestamp || !webhookSignature) {
      response.status(401).json({ error: "Invalid webhook signature." });
      return;
    }

    const verified = verifyStandardWebhook(
      rawBody,
      { id: webhookId, timestamp: webhookTimestamp, signature: webhookSignature },
      hookSecret,
    );
    if (!verified) {
      response.status(401).json({ error: "Invalid webhook signature." });
      return;
    }

    const parsed = sendSmsHookSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Invalid Send SMS hook payload." });
      return;
    }

    try {
      await smsAdapter.send(parsed.data.user.phone, {
        title: "Sokoni Digital verification code",
        body: `Your Sokoni Digital verification code is ${parsed.data.sms.otp}.`,
        data: { purpose: "authentication" },
      });
      response.status(200).json({});
    } catch (error) {
      request.log.error({ err: error }, "Yoola authentication SMS delivery failed");
      response.setHeader("retry-after", "2");
      response.status(503).json({ error: "SMS delivery is temporarily unavailable." });
    }
  });

  return router;
}
