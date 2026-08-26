import { parseServerEnvironment } from "../../config/index.js";
import { ExpoPushAdapter, YoolaSmsAdapter } from "../../infrastructure/messaging/index.js";
import { SupabaseNotificationRepository } from "./notifications.repository.js";
import { NotificationsService } from "./notifications.service.js";

export function createNotificationsService(): NotificationsService {
  const env = parseServerEnvironment();
  return new NotificationsService(
    new SupabaseNotificationRepository(),
    new ExpoPushAdapter(env.EXPO_ACCESS_TOKEN),
    new YoolaSmsAdapter(env.YOOLA_SMS_API_KEY),
    env.NOTIFICATION_MAX_ATTEMPTS,
    env.NOTIFICATION_RETRY_BASE_SECONDS,
  );
}
