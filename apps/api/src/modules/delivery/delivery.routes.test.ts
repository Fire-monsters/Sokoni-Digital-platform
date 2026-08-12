import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { errorHandler } from "../../middleware/error-handler.js";
import { DeliveryProofService } from "./delivery-proof.service.js";
import { createRiderOperationsRouter } from "./delivery.routes.js";
import { RiderOperationsService } from "./delivery.service.js";

vi.mock("../../middleware/authenticate.js", () => ({
  authenticate: (
    request: express.Request,
    _response: express.Response,
    next: express.NextFunction,
  ) => {
    request.auth = { userId: "rider-user", roles: ["rider", "admin"] };
    next();
  },
}));
vi.mock("../../infrastructure/supabase/client.js", () => ({ supabase: {} }));

describe("delivery proof routes", () => {
  const confirmPin = vi.fn();
  const completeDelivery = vi.fn();
  const proofService = Object.assign(
    Object.create(DeliveryProofService.prototype) as DeliveryProofService,
    { confirmPin, completeDelivery },
  );
  const riderService = Object.create(RiderOperationsService.prototype) as RiderOperationsService;
  const deliveryId = "d5000000-0000-4000-8000-000000000001";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function app() {
    const server = express();
    server.use(express.json());
    server.use("/v1/rider", createRiderOperationsRouter(riderService, proofService));
    server.use(errorHandler);
    return server;
  }

  it("rejects malformed delivery PINs before calling the workflow", async () => {
    const response = await request(app())
      .post(`/v1/rider/deliveries/${deliveryId}/confirm-consumer`)
      .send({ pin: "123", operationId: "d5000000-0000-4000-8000-000000000002" });
    expect(response.status).toBe(400);
    expect(confirmPin).not.toHaveBeenCalled();
  });

  it("forwards valid completion identity to the proof service", async () => {
    completeDelivery.mockResolvedValue({
      deliveryId,
      status: "delivered",
      version: 9,
      operationId: "d5000000-0000-4000-8000-000000000003",
      duplicate: false,
    });
    const response = await request(app())
      .post(`/v1/rider/deliveries/${deliveryId}/complete`)
      .send({ expectedVersion: 8, operationId: "d5000000-0000-4000-8000-000000000003" });
    expect(response.status).toBe(200);
    expect(completeDelivery).toHaveBeenCalledWith(
      "rider-user",
      deliveryId,
      8,
      "d5000000-0000-4000-8000-000000000003",
    );
  });
});
