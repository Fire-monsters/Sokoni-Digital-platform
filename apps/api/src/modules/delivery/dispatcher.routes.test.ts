import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { errorHandler } from "../../middleware/error-handler.js";
import { DeliveryProofService } from "./delivery-proof.service.js";
import { createDispatcherRouter } from "./dispatcher.routes.js";
import { DispatcherService } from "./dispatcher.service.js";

vi.mock("../../middleware/authenticate.js", () => ({
  authenticate: (
    request: express.Request,
    _response: express.Response,
    next: express.NextFunction,
  ) => {
    request.auth = { userId: "dispatcher-user", roles: ["admin"] };
    next();
  },
}));
vi.mock("../../infrastructure/supabase/client.js", () => ({ supabase: {} }));

describe("dispatcher routes", () => {
  const performAction = vi.fn();
  const service = Object.assign(Object.create(DispatcherService.prototype) as DispatcherService, {
    performAction,
  });
  const proofService = Object.create(DeliveryProofService.prototype) as DeliveryProofService;
  const deliveryId = "d5000000-0000-4000-8000-000000000001";
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function app() {
    const server = express();
    server.use(express.json());
    server.use("/v1/admin", createDispatcherRouter(service, proofService));
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
    expect(performAction).toHaveBeenCalledWith(
      "dispatcher-user",
      deliveryId,
      expect.objectContaining({ action: "CONTACT_CONSUMER", expectedVersion: 3 }),
    );
  });
});
