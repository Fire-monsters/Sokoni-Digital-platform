import type {
  VendorOrderDetails,
  VendorOrderSummary,
  VendorOrderTransitionResult,
  VendorOrderTransitionTarget,
} from "@sokoni-digital/domain";
import { describe, expect, it } from "vitest";

import {
  decodeVendorOrderCursor,
  encodeVendorOrderCursor,
  InvalidVendorOrderCursorError,
} from "./vendor-orders.cursor.js";
import { VendorOrdersService } from "./vendor-orders.service.js";
import type { VendorOrderListInput, VendorOrderRepository } from "./vendor-orders.types.js";

const order: VendorOrderSummary = {
  id: "d5000000-0000-4000-8000-000000000001",
  reference: "EK-S-9500001",
  status: "awaiting_vendor_acceptance",
  version: 1,
  createdAt: "2026-08-10T12:00:00.000Z",
  subtotalUgx: 10_000,
  itemCount: 2,
  items: [],
  fulfilment: {
    type: "delivery",
    scheduleType: "immediate",
    requestedFor: null,
  },
  qualityCheck: {
    id: null,
    status: "not_started",
    imageCount: 0,
    hasPackingProof: false,
  },
};

class FakeVendorOrderRepository implements VendorOrderRepository {
  lastListInput: VendorOrderListInput | null = null;
  lastTransition:
    | {
        userId: string;
        orderId: string;
        toStatus: VendorOrderTransitionTarget;
        expectedVersion: number;
        operationId: string;
      }
    | undefined;

  list(_userId: string, input: VendorOrderListInput) {
    this.lastListInput = input;
    return Promise.resolve({ items: [order], hasMore: true });
  }

  get(): Promise<VendorOrderDetails> {
    return Promise.resolve({
      ...order,
      updatedAt: order.createdAt,
      timeline: [],
      packingProofThumbnailUrl: null,
    });
  }

  transition(
    userId: string,
    orderId: string,
    toStatus: VendorOrderTransitionTarget,
    expectedVersion: number,
    operationId: string,
  ): Promise<VendorOrderTransitionResult> {
    this.lastTransition = { userId, orderId, toStatus, expectedVersion, operationId };
    return Promise.resolve({
      orderId,
      status: toStatus,
      version: expectedVersion + 1,
      operationId,
      duplicate: false,
    });
  }
}

describe("VendorOrdersService", () => {
  it("builds a stable descending queue cursor and forwards status filters", async () => {
    const repository = new FakeVendorOrderRepository();
    const service = new VendorOrdersService(repository);

    const page = await service.list("vendor-user", {
      status: ["awaiting_vendor_acceptance", "preparing"],
      limit: 1,
    });

    expect(repository.lastListInput).toEqual({
      statuses: ["awaiting_vendor_acceptance", "preparing"],
      limit: 1,
    });
    expect(page.nextCursor).not.toBeNull();
    expect(decodeVendorOrderCursor(page.nextCursor ?? "")).toEqual({
      id: order.id,
      createdAt: order.createdAt,
    });
  });

  it("decodes a supplied cursor before querying the repository", async () => {
    const repository = new FakeVendorOrderRepository();
    const service = new VendorOrdersService(repository);
    const cursor = encodeVendorOrderCursor({ id: order.id, createdAt: order.createdAt });

    await service.list("vendor-user", { cursor, limit: 20 });

    expect(repository.lastListInput?.cursor).toEqual({
      id: order.id,
      createdAt: order.createdAt,
    });
  });

  it("rejects malformed cursors before querying storage", async () => {
    const repository = new FakeVendorOrderRepository();
    const service = new VendorOrdersService(repository);

    await expect(
      service.list("vendor-user", { cursor: "not-json", limit: 20 }),
    ).rejects.toBeInstanceOf(InvalidVendorOrderCursorError);
    expect(repository.lastListInput).toBeNull();
  });

  it("forwards version and operation identity to the authoritative transition", async () => {
    const repository = new FakeVendorOrderRepository();
    const service = new VendorOrdersService(repository);
    const operationId = "b5000000-0000-4000-8000-000000000001";

    const result = await service.transition("vendor-user", order.id, "accepted", 1, operationId);

    expect(repository.lastTransition).toEqual({
      userId: "vendor-user",
      orderId: order.id,
      toStatus: "accepted",
      expectedVersion: 1,
      operationId,
    });
    expect(result).toMatchObject({ status: "accepted", version: 2, duplicate: false });
  });
});
