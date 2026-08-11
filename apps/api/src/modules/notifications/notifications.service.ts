import type { PushAdapter, SmsAdapter } from "../../infrastructure/messaging/index.js";
import type { NotificationRepository } from "./notifications.repository.js";

export class NotificationsService {
  constructor(
    private readonly repository: NotificationRepository,
    private readonly push: PushAdapter,
    private readonly sms: SmsAdapter,
    private readonly maxAttempts: number,
    private readonly retryBaseSeconds: number,
  ) {}

  async deliverBatch(
    batchSize: number,
  ): Promise<{ claimed: number; delivered: number; failed: number }> {
    const deliveries = await this.repository.claim(batchSize, 120);
    let delivered = 0;
    let failed = 0;
    for (const delivery of deliveries) {
      try {
        const event = await this.repository.getEvent(delivery.eventId);
        const destination = await this.repository.resolveDestination(
          event.userId,
          delivery.channel,
        );
        if (!destination) throw new Error(`No ${delivery.channel} destination is registered.`);
        const adapter = delivery.channel === "push" ? this.push : this.sms;
        const receipt = await adapter.send(destination, {
          title: event.title,
          body: event.body,
          data: event.payload,
        });
        await this.repository.complete(delivery.id, destination, receipt.providerReference);
        delivered += 1;
      } catch (cause) {
        const retrySeconds = Math.min(
          this.retryBaseSeconds * 2 ** Math.max(0, delivery.attemptCount - 1),
          3600,
        );
        await this.repository.fail(
          delivery.id,
          cause instanceof Error ? cause.message : "Notification delivery failed.",
          retrySeconds,
          this.maxAttempts,
          delivery.channel === "push",
        );
        failed += 1;
      }
    }
    return { claimed: deliveries.length, delivered, failed };
  }
}
