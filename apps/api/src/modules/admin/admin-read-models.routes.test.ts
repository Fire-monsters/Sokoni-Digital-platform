import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { errorHandler } from "../../middleware/error-handler.js";
import { createAdminReadModelsRouter } from "./admin-read-models.routes.js";
import type { AdminReadModelReader } from "./admin-read-models.types.js";

vi.mock("../../middleware/authenticate.js", () => ({
  authenticate: (
    request: express.Request,
    _response: express.Response,
    next: express.NextFunction,
  ) => {
    request.auth = { userId: "admin-user", roles: ["admin"] };
    next();
  },
}));
vi.mock("../../infrastructure/supabase/client.js", () => ({ supabase: {} }));
vi.mock("../../middleware/require-permission.js", () => ({
  requirePermission:
    () => (_request: express.Request, _response: express.Response, next: express.NextFunction) => {
      next();
    },
}));

describe("admin operational read model routes", () => {
  const getOverview = vi.fn();
  const listOrders = vi.fn();
  const getOrder = vi.fn();
  const listApplications = vi.fn();
  const listPaymentReconciliation = vi.fn();
  const listRefunds = vi.fn();
  const listSettlements = vi.fn();
  const listAuditEvents = vi.fn();
  const getAuditEvent = vi.fn();
  const reader = {
    getOverview,
    listOrders,
    getOrder,
    listApplications,
    listPaymentReconciliation,
    listRefunds,
    listSettlements,
    listAuditEvents,
    getAuditEvent,
  } as AdminReadModelReader;

  beforeEach(() => vi.clearAllMocks());

  function app() {
    const server = express();
    server.use("/v1/admin", createAdminReadModelsRouter(reader));
    server.use(errorHandler);
    return server;
  }

  it("returns the overview projection", async () => {
    getOverview.mockResolvedValue({ period: {}, attentionRequired: [] });

    const response = await request(app()).get(
      "/v1/admin/overview?from=2026-09-01T00%3A00%3A00Z&to=2026-09-02T00%3A00%3A00Z",
    );

    expect(response.status).toBe(200);
    expect(getOverview).toHaveBeenCalledWith({
      from: new Date("2026-09-01T00:00:00Z"),
      to: new Date("2026-09-02T00:00:00Z"),
    });
  });

  it("normalizes and forwards the orders query", async () => {
    listOrders.mockResolvedValue({
      data: [],
      pagination: { page: 2, pageSize: 50, totalItems: 0, totalPages: 0 },
    });

    const response = await request(app()).get(
      "/v1/admin/orders?page=2&pageSize=50&q=EK-2026&paymentStatus=paid&delayedOnly=false&sortBy=total&sortOrder=asc",
    );

    expect(response.status).toBe(200);
    expect(listOrders).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 2,
        pageSize: 50,
        q: "EK-2026",
        paymentStatus: "paid",
        delayedOnly: false,
        sortBy: "total",
        sortOrder: "asc",
      }),
    );
  });

  it.each([
    ["/v1/admin/overview?from=2026-09-03T00%3A00%3A00Z&to=2026-09-02T00%3A00%3A00Z"],
    ["/v1/admin/orders?pageSize=101"],
    ["/v1/admin/orders?sortBy=consumer_name"],
    ["/v1/admin/orders?delayedOnly=1"],
  ])("rejects invalid query input: %s", async (path) => {
    const response = await request(app()).get(path);
    expect(response.status).toBe(400);
    expect((response.body as { error: { code: string } }).error.code).toBe("VALIDATION_ERROR");
    expect(getOverview).not.toHaveBeenCalled();
    expect(listOrders).not.toHaveBeenCalled();
  });

  it("loads one order investigation model", async () => {
    const orderId = "10000000-0000-4000-8000-000000000001";
    getOrder.mockResolvedValue({ order: { id: orderId }, timeline: [] });

    const response = await request(app()).get(`/v1/admin/orders/${orderId}`);

    expect(response.status).toBe(200);
    expect(getOrder).toHaveBeenCalledWith(orderId);
  });

  it("forwards the normalized applications queue query", async () => {
    listApplications.mockResolvedValue({
      data: [],
      pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 },
    });

    const response = await request(app()).get(
      "/v1/admin/applications?type=vendor&status=pending_review&sortBy=status",
    );

    expect(response.status).toBe(200);
    expect(listApplications).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        pageSize: 25,
        type: "vendor",
        status: "pending_review",
        sortBy: "status",
        sortOrder: "desc",
      }),
    );
  });

  it("forwards reconciliation filters", async () => {
    listPaymentReconciliation.mockResolvedValue({
      data: [],
      pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 },
    });
    const response = await request(app()).get(
      "/v1/admin/payments/reconciliation?provider=pesapal&status=paid&callbackStatus=processed",
    );
    expect(response.status).toBe(200);
    expect(listPaymentReconciliation).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "pesapal",
        status: "paid",
        callbackStatus: "processed",
      }),
    );
  });

  it("rejects an inverted refund amount range", async () => {
    const response = await request(app()).get("/v1/admin/refunds?minAmount=50000&maxAmount=10000");
    expect(response.status).toBe(400);
    expect(listRefunds).not.toHaveBeenCalled();
  });

  it("returns the empty settlement contract", async () => {
    listSettlements.mockResolvedValue({
      data: [],
      pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 },
    });
    const response = await request(app()).get("/v1/admin/settlements");
    expect(response.status).toBe(200);
    expect((response.body as { data: unknown }).data).toEqual({
      data: [],
      pagination: { page: 1, pageSize: 25, totalItems: 0, totalPages: 0 },
    });
  });

  it("forwards normalized audit filters and pagination", async () => {
    listAuditEvents.mockResolvedValue({
      data: [],
      pagination: { page: 2, pageSize: 10, totalItems: 0, totalPages: 0 },
    });
    const response = await request(app()).get(
      "/v1/admin/audit-events?page=2&pageSize=10&action=delivery.rider_assigned&entityType=delivery&staffUserId=10000000-0000-4000-8000-000000000001",
    );
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(listAuditEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 2,
        pageSize: 10,
        action: "delivery.rider_assigned",
        entityType: "delivery",
        staffUserId: "10000000-0000-4000-8000-000000000001",
      }),
    );
  });

  it("loads audit detail using its namespaced event ID", async () => {
    getAuditEvent.mockResolvedValue({ id: "delivery:42", previousState: {}, newState: {} });
    const response = await request(app()).get("/v1/admin/audit-events/delivery:42");
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(getAuditEvent).toHaveBeenCalledWith("delivery:42");
  });

  it.each([
    ["/v1/admin/audit-events?page=0"],
    ["/v1/admin/audit-events?entityId=not-a-uuid"],
    ["/v1/admin/audit-events?sortBy=actor"],
    ["/v1/admin/audit-events/not-an-event-id"],
  ])("rejects invalid audit input: %s", async (path) => {
    const response = await request(app()).get(path);
    expect(response.status).toBe(400);
    expect(listAuditEvents).not.toHaveBeenCalled();
    expect(getAuditEvent).not.toHaveBeenCalled();
  });
});
