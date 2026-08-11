import { Router } from "express";
import { z } from "zod";

import { sendSuccess, sendZodValidationError } from "../../http/responses.js";
import { supabase } from "../../infrastructure/supabase/client.js";
import { authenticate } from "../../middleware/authenticate.js";

const deviceSchema = z.object({
  expoPushToken: z
    .string()
    .trim()
    .regex(/^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/),
  platform: z.enum(["android", "ios"]),
});

export function createNotificationsRouter(): Router {
  const router = Router();
  router.use(authenticate);

  router.post("/devices", async (request, response, next) => {
    const parsed = deviceSchema.safeParse(request.body);
    if (!parsed.success) {
      sendZodValidationError(request, response, parsed.error.issues);
      return;
    }
    if (!request.auth) {
      next(new Error("Authenticated request context is missing."));
      return;
    }
    try {
      const { data, error } = await supabase
        .from("notification_devices")
        .upsert(
          {
            user_id: request.auth.userId,
            expo_push_token: parsed.data.expoPushToken,
            platform: parsed.data.platform,
            enabled: true,
            last_seen_at: new Date().toISOString(),
          },
          { onConflict: "expo_push_token" },
        )
        .select("id,platform,last_seen_at")
        .single();
      if (error) throw new Error(error.message);
      sendSuccess(request, response, 200, {
        id: data.id,
        platform: data.platform,
        lastSeenAt: data.last_seen_at,
      });
    } catch (cause) {
      next(cause);
    }
  });

  router.get("/", async (request, response, next) => {
    if (!request.auth) {
      next(new Error("Authenticated request context is missing."));
      return;
    }
    try {
      const { data, error } = await supabase
        .from("notification_events")
        .select("id,event_type,title,body,priority,payload,created_at")
        .eq("user_id", request.auth.userId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      sendSuccess(request, response, 200, data);
    } catch (cause) {
      next(cause);
    }
  });

  return router;
}
