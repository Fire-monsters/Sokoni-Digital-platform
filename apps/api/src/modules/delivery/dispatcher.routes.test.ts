import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { errorHandler } from "../../middleware/error-handler.js";
import { createDispatcherRouter } from "./dispatcher.routes.js";
import { DispatcherService } from "./dispatcher.service.js";

vi.mock("../../middleware/authenticate.js", () => ({
  authenticate: (
    request: express.Request,
    _response: express.Response,
    next: express.NextFunction,
  ) => {
    request.requestId = "request-id";
    request.auth = {
      userId: "dispatcher-user",
      roles: ["admin"],
      staff: {
        userId: "dispatcher-user",
        displayName: "Dispatcher",
        role: "dispatcher",
        status: "active",
        permissions: ["deliveries.read", "deliveries.manage"],
      },
    };
    next();
  },
}));
vi.mock("../../infrastructure/supabase/client.js", () => ({
  supabase: {
    rpc: (name: string, input: { p_operation_id?: string }) =>
      Promise.resolve({
        data:
          name === "claim_admin_operation"
            ? { action: "proceed", operationId: input.p_operation_id }
            : null,
        error: null,
      }),
  },
}));
vi.mock("../../middleware/require-permission.js", () => ({
  requirePermission:
    () => (_request: express.Request, _response: express.Response, next: express.NextFunction) => {
      next();
    },
}));

describe("dispatcher routes", () => {
  const performAction = vi.fn();
  const assign = vi.fn();
  const getDelivery = vi.fn();
  const getNearbyRiders = vi.fn();
  const service = Object.assign(Object.create(DispatcherService.prototype) as DispatcherService, {
    performAction,
    assign,
    getDelivery,
    getNearbyRiders,
  });
  const deliveryId = "d5000000-0000-4000-8000-000000000001";
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function app() {
    const server = express();
    server.use(express.json());
    server.use("/v1/admin", createDispatcherRouter(service));
    server.use(errorHandler);
    return server;
  }

  it("requires a reason for sensitive overrides", async () => {
    const response = await request(app()).post(`/v1/admin/deliveries/${deliveryId}/actions`).send({
      action: "CANCEL_ASSIGNMENT",
      reason: "",
      expectedVersion: 3,
      operationId: "d5000000-0000-4000-8000-000000000002",
    });
    expect(response.status).toBe(400);
    expect(performAction).not.toHaveBeenCalled();
  });

  it("forwards a validated, versioned dispatcher action", async () => {
    performAction.mockResolvedValue({
      deliveryId,
      action: "CONTACT_CONSUMER",
      status: "assigned",
      version: 3,
      operationId: "d5000000-0000-4000-8000-000000000003",
      contactPhoneNumber: "+256700000000",
      duplicate: false,
    });
    const response = await request(app()).post(`/v1/admin/deliveries/${deliveryId}/actions`).send({
      action: "CONTACT_CONSUMER",
      reason: "Confirming the corrected address",
      expectedVersion: 3,
      operationId: "d5000000-0000-4000-8000-000000000003",
    });
    expect(response.status).toBe(200);
    const command = performAction.mock.calls[0]?.[0] as unknown as {
      actor: { userId: string };
      params: { deliveryId: string };
      input: { action: string; expectedVersion: number };
      requestId: string;
    };
    expect(command).toMatchObject({
      actor: { userId: "dispatcher-user" },
      params: { deliveryId },
      input: { action: "CONTACT_CONSUMER", expectedVersion: 3 },
      requestId: "request-id",
    });
  });

  it("loads the complete delivery detail with the authorized staff identity", async () => {
    getDelivery.mockResolvedValue({ delivery: { id: deliveryId }, timeline: [] });

    const response = await request(app()).get(`/v1/admin/deliveries/${deliveryId}`);

    expect(response.status).toBe(200);
    expect(getDelivery).toHaveBeenCalledWith("dispatcher-user", deliveryId);
  });

  it("normalizes the nearby-rider radius", async () => {
    getNearbyRiders.mockResolvedValue([]);

    const response = await request(app()).get(
      `/v1/admin/deliveries/${deliveryId}/nearby-riders?radiusKm=15`,
    );

    expect(response.status).toBe(200);
    expect(getNearbyRiders).toHaveBeenCalledWith(deliveryId, 15);
  });

  it.each([
    ["assign-rider", false],
    ["reassign-rider", true],
  ] as const)("executes the %s workflow with staff context", async (path, reassign) => {
    assign.mockResolvedValue({ deliveryId, status: "assigned" });
    const operationId = "d5000000-0000-4000-8000-000000000004";

    const response = await request(app()).post(`/v1/admin/deliveries/${deliveryId}/${path}`).send({
      transporterId: "d5000000-0000-4000-8000-000000000010",
      reason: "Nearest eligible rider",
      expectedVersion: 3,
      operationId,
    });

    expect(response.status).toBe(200);
    expect(assign.mock.calls[0]?.[0]).toBe(reassign);
    const command = assign.mock.calls[0]?.[1] as unknown as {
      actor: { userId: string };
      params: { deliveryId: string };
      input: { operationId: string; expectedVersion: number };
    };
    expect(command).toMatchObject({
      actor: { userId: "dispatcher-user" },
      params: { deliveryId },
      input: { operationId, expectedVersion: 3 },
    });
  });
});
