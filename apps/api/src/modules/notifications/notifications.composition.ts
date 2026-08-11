import { parseServerEnvironment } from "../../config/index.js";
import { ExpoPushAdapter, TwilioSmsAdapter } from "../../infrastructure/messaging/index.js";
import { SupabaseNotificationRepository } from "./notifications.repository.js";
import { NotificationsService } from "./notifications.service.js";

export function createNotificationsService(): NotificationsService {
  const env = parseServerEnvironment();
  return new NotificationsService(
    new SupabaseNotificationRepository(),
    new ExpoPushAdapter(env.EXPO_ACCESS_TOKEN),
    new TwilioSmsAdapter(
      env.TWILIO_ACCOUNT_SID,
      env.TWILIO_AUTH_TOKEN,
      env.TWILIO_MESSAGING_SERVICE_SID,
    ),
    env.NOTIFICATION_MAX_ATTEMPTS,
    env.NOTIFICATION_RETRY_BASE_SECONDS,
  );
}
