import { parseServerEnvironment } from "../config/index.js";
import { createNotificationsService } from "../modules/notifications/index.js";
import type { NotificationsService } from "../modules/notifications/notifications.service.js";

let running = false;

export async function retryNotifications(
  service: NotificationsService = createNotificationsService(),
): Promise<void> {
  if (running) return;
  running = true;
  try {
    const env = parseServerEnvironment();
    const result = await service.deliverBatch(env.NOTIFICATION_DELIVERY_BATCH_SIZE);
    if (result.claimed > 0)
      console.info(JSON.stringify({ event: "notifications.delivered", ...result }));
  } catch (cause) {
    console.error(
      JSON.stringify({
        event: "notifications.delivery_failed",
        error: cause instanceof Error ? cause.message : "unknown",
      }),
    );
  } finally {
    running = false;
  }
}

export function startNotificationScheduler(): () => void {
  const env = parseServerEnvironment();
  const timer = setInterval(() => void retryNotifications(), env.NOTIFICATION_POLL_INTERVAL_MS);
  timer.unref();
  return () => {
    clearInterval(timer);
  };
}
