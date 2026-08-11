import { describe, expect, it, vi } from "vitest";

import type { PushAdapter, SmsAdapter } from "../../infrastructure/messaging/index.js";
import type {
  ClaimedNotificationDelivery,
  NotificationEventRecord,
  NotificationRepository,
} from "./notifications.repository.js";
import { NotificationsService } from "./notifications.service.js";

class FakeRepository implements NotificationRepository {
  failures: { retrySeconds: number; smsFallback: boolean }[] = [];
  completed: string[] = [];
  constructor(
    private readonly deliveries: ClaimedNotificationDelivery[],
    private readonly event: NotificationEventRecord,
    private readonly destination: string | null,
  ) {}
  claim() {
    return Promise.resolve(this.deliveries);
  }
  getEvent() {
    return Promise.resolve(this.event);
  }
  resolveDestination() {
    return Promise.resolve(this.destination);
  }
  complete(deliveryId: string) {
    this.completed.push(deliveryId);
    return Promise.resolve();
  }
  fail(_id: string, _reason: string, retrySeconds: number, _max: number, smsFallback: boolean) {
    this.failures.push({ retrySeconds, smsFallback });
    return Promise.resolve();
  }
}

const event: NotificationEventRecord = {
  id: "event",
  userId: "user",
  title: "Ready",
  body: "Your order is ready.",
  priority: "critical",
  payload: { sellerOrderId: "order" },
};
const sms: SmsAdapter = { send: vi.fn(() => Promise.resolve({ providerReference: "sms-1" })) };

describe("NotificationsService", () => {
  it("records successful push delivery", async () => {
    const repository = new FakeRepository(
      [{ id: "delivery", eventId: "event", channel: "push", attemptCount: 1 }],
      event,
      "ExponentPushToken[token]",
    );
    const push: PushAdapter = {
      send: vi.fn(() => Promise.resolve({ providerReference: "ticket-1" })),
    };
    const result = await new NotificationsService(repository, push, sms, 5, 30).deliverBatch(50);
    expect(result).toEqual({ claimed: 1, delivered: 1, failed: 0 });
    expect(repository.completed).toEqual(["delivery"]);
  });

  it("backs off and requests SMS fallback after push failure", async () => {
    const repository = new FakeRepository(
      [{ id: "delivery", eventId: "event", channel: "push", attemptCount: 3 }],
      event,
      null,
    );
    const push: PushAdapter = { send: vi.fn() };
    const result = await new NotificationsService(repository, push, sms, 5, 30).deliverBatch(50);
    expect(result.failed).toBe(1);
    expect(repository.failures).toEqual([{ retrySeconds: 120, smsFallback: true }]);
  });

  it("does not recursively fall back when SMS fails", async () => {
    const repository = new FakeRepository(
      [{ id: "delivery", eventId: "event", channel: "sms", attemptCount: 1 }],
      event,
      null,
    );
    await new NotificationsService(repository, { send: vi.fn() }, sms, 5, 30).deliverBatch(50);
    expect(repository.failures[0]?.smsFallback).toBe(false);
  });
});
