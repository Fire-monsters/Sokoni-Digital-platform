import { describe, expect, it, vi } from "vitest";

import { AdminReadModelsRepository } from "./admin-read-models.repository.js";

vi.mock("../../infrastructure/supabase/client.js", () => ({ supabase: {} }));

describe("AdminReadModelsRepository", () => {
  it("serializes dates and filters for the order RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { data: [], pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 } },
      error: null,
    });
    const repository = new AdminReadModelsRepository({ rpc });

    await repository.listOrders({
      page: 1,
      pageSize: 25,
      marketId: "10000000-0000-4000-8000-000000000001",
      from: new Date("2026-09-01T00:00:00Z"),
      to: new Date("2026-09-02T00:00:00Z"),
      delayedOnly: true,
      sortBy: "createdAt",
      sortOrder: "desc",
    });

    expect(rpc).toHaveBeenCalledWith(
      "admin_list_orders",
      expect.objectContaining({
        p_page: 1,
        p_page_size: 25,
        p_market_id: "10000000-0000-4000-8000-000000000001",
        p_from: "2026-09-01T00:00:00.000Z",
        p_to: "2026-09-02T00:00:00.000Z",
        p_delayed_only: true,
        p_sort_by: "createdAt",
        p_sort_order: "desc",
      }),
    );
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("surfaces database errors", async () => {
    const repository = new AdminReadModelsRepository({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "read failed" } }),
    });

    await expect(repository.getOverview({})).rejects.toThrow("read failed");
  });

  it("maps missing order investigations to a 404 error", async () => {
    const repository = new AdminReadModelsRepository({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { code: "P0002", message: "missing" } }),
    });

    await expect(repository.getOrder("10000000-0000-4000-8000-000000000001")).rejects.toMatchObject(
      { statusCode: 404, code: "NOT_FOUND" },
    );
  });

  it("signs private order evidence and removes storage paths", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        order: {},
        consumer: {},
        deliveryAddress: null,
        payment: null,
        timeline: [],
        notifications: [],
        refunds: [],
        supportNotes: [],
        vendors: [
          {
            vendor: {},
            sellerOrder: {},
            items: [],
            evidence: [
              {
                id: "vendor-image",
                storageBucket: "quality",
                storagePath: "private/vendor.jpg",
                thumbnailPath: "private/vendor-thumb.jpg",
                capturedAt: "2026-09-24T00:00:00Z",
                mimeType: "image/jpeg",
              },
            ],
          },
        ],
        delivery: {
          evidence: [
            {
              id: "delivery-image",
              storageBucket: "delivery-proof-images",
              storagePath: "private/delivery.jpg",
              thumbnailPath: null,
              capturedAt: "2026-09-24T00:00:00Z",
            },
          ],
        },
      },
      error: null,
    });
    const createSignedUrl = vi.fn((path: string) =>
      Promise.resolve({ data: { signedUrl: `signed:${path}` }, error: null }),
    );
    const repository = new AdminReadModelsRepository(
      { rpc },
      { from: () => ({ createSignedUrl }) },
    );
    const result = await repository.getOrder("order");
    expect(result.vendors[0]?.evidence[0]).toMatchObject({
      url: "signed:private/vendor.jpg",
      thumbnailUrl: "signed:private/vendor-thumb.jpg",
    });
    expect(result.delivery?.evidence[0]).toMatchObject({
      url: "signed:private/delivery.jpg",
      thumbnailUrl: null,
    });
    expect(result.vendors[0]?.evidence[0]).not.toHaveProperty("storagePath");
    expect(createSignedUrl).toHaveBeenCalledTimes(3);
  });

  it("keeps settlements empty until a payable ledger exists", async () => {
    const repository = new AdminReadModelsRepository({ rpc: vi.fn() });

    await expect(
      repository.listSettlements({
        page: 2,
        pageSize: 50,
        sortBy: "createdAt",
        sortOrder: "desc",
      }),
    ).resolves.toEqual({
      data: [],
      pagination: { page: 2, pageSize: 50, totalItems: 0, totalPages: 0 },
    });
  });

  it("serializes audit filters for the audit RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { data: [], pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 } },
      error: null,
    });
    const repository = new AdminReadModelsRepository({ rpc });

    await repository.listAuditEvents({
      page: 1,
      pageSize: 25,
      q: "DEL-1234",
      action: "delivery.rider_assigned",
      from: new Date("2026-09-01T00:00:00Z"),
      sortBy: "occurredAt",
      sortOrder: "desc",
    });

    expect(rpc).toHaveBeenCalledWith(
      "admin_list_audit_events",
      expect.objectContaining({
        p_query: "DEL-1234",
        p_action: "delivery.rider_assigned",
        p_from: "2026-09-01T00:00:00.000Z",
      }),
    );
  });

  it("maps a missing audit event to a 404 error", async () => {
    const repository = new AdminReadModelsRepository({
      rpc: vi.fn().mockResolvedValue({ data: null, error: { code: "P0002", message: "missing" } }),
    });

    await expect(repository.getAuditEvent("delivery:42")).rejects.toMatchObject({
      statusCode: 404,
      code: "NOT_FOUND",
    });
  });
});
