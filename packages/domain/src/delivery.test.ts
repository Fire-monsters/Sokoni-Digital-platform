import { describe, expect, it } from "vitest";

import {
  deliveryStatuses,
  deliveryTransitions,
  isAssignmentCacheFresh,
  isLocationSnapshotUsable,
  shouldPersistProofUploadFailure,
  shouldQueueDeliveryTransition,
} from "./delivery.js";

describe("deliveryTransitions", () => {
  it("defines a transition list for every canonical status", () => {
    expect(Object.keys(deliveryTransitions).sort()).toEqual([...deliveryStatuses].sort());
  });

  it("keeps completion and exception states terminal", () => {
    for (const status of [
      "delivered",
      "assignment_cancelled",
      "pickup_failed",
      "delivery_failed",
      "customer_unavailable",
      "issue_reported",
      "returned",
    ] as const) {
      expect(deliveryTransitions[status]).toEqual([]);
    }
  });

  it("does not allow custody steps to be skipped", () => {
    expect(deliveryTransitions.assigned).toContain("arrived_at_market");
    expect(deliveryTransitions.assigned).not.toContain("picked_up");
    expect(deliveryTransitions.in_transit).not.toContain("delivered");
  });
});

describe("offline delivery recovery policy", () => {
  const now = Date.parse("2026-08-11T12:00:00.000Z");

  it("keeps a recent assignment available after connection loss and app restart", () => {
    expect(isAssignmentCacheFresh("2026-08-11T11:55:00.000Z", now)).toBe(true);
  });

  it("rejects a stale cached assignment after restart", () => {
    expect(isAssignmentCacheFresh("2026-08-10T10:00:00.000Z", now)).toBe(false);
  });

  it("queues only low-risk market-arrival and in-transit updates", () => {
    expect(shouldQueueDeliveryTransition("arrived_at_market")).toBe(true);
    expect(shouldQueueDeliveryTransition("in_transit")).toBe(true);
    expect(shouldQueueDeliveryTransition("picked_up")).toBe(false);
    expect(shouldQueueDeliveryTransition("arrived_at_customer")).toBe(false);
    expect(shouldQueueDeliveryTransition("delivered")).toBe(false);
  });

  it("allows delivery progress when location is unavailable or inaccurate", () => {
    expect(isLocationSnapshotUsable(null)).toBe(false);
    expect(
      isLocationSnapshotUsable({ latitude: 0.05, longitude: 32.46, accuracyMeters: 900 }),
    ).toBe(false);
    expect(isLocationSnapshotUsable({ latitude: 0.05, longitude: 32.46, accuracyMeters: 25 })).toBe(
      true,
    );
  });

  it("persists slow or disconnected proof uploads but not server rejections", () => {
    expect(shouldPersistProofUploadFailure("timeout")).toBe(true);
    expect(shouldPersistProofUploadFailure("network")).toBe(true);
    expect(shouldPersistProofUploadFailure("server_rejected")).toBe(false);
  });
});
