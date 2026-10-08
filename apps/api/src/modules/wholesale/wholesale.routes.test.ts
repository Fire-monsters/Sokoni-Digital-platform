import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { errorHandler } from "../../middleware/error-handler.js";
import { createWholesaleRouter } from "./wholesale.routes.js";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../../infrastructure/supabase/client.js", () => ({
  supabase: { rpc: mocks.rpc },
}));
vi.mock("../../middleware/authenticate.js", () => ({
  authenticate: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.auth = { userId: "ad000000-0000-4000-8000-000000000001", roles: [] };
    next();
  },
}));

const businessId = "ad000000-0000-4000-8000-000000000011";
const orderId = "ad000000-0000-4000-8000-000000000021";
const operationId = "ad000000-0000-4000-8000-000000000031";
const app = express().use(express.json()).use(createWholesaleRouter()).use(errorHandler);

describe("wholesale route scoping", () => {
  it("denies catalogue access without approved SME membership", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "42501", message: "Approved business membership required" },
    });
    const response = await request(app).get(`/sme/businesses/${businessId}/wholesale/catalogue`);
    expect(response.status).toBe(403);
    expect(response.body as unknown).toMatchObject({ error: { code: "FORBIDDEN" } });
    expect(mocks.rpc).toHaveBeenCalledWith("wholesale_require_business", {
      p_actor: "ad000000-0000-4000-8000-000000000001",
      p_business: businessId,
      p_kind: "sme",
      p_owner: false,
    });
  });

  it("denies order confirmation before reading another warehouse's order", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { code: "42501", message: "Approved business membership required" },
    });
    const response = await request(app)
      .post(`/warehouse/businesses/${businessId}/wholesale/orders/${orderId}/confirm`)
      .send({ operationId });
    expect(response.status).toBe(403);
    expect(response.body as unknown).toMatchObject({ error: { code: "FORBIDDEN" } });
    expect(mocks.rpc).toHaveBeenLastCalledWith("wholesale_require_business", {
      p_actor: "ad000000-0000-4000-8000-000000000001",
      p_business: businessId,
      p_kind: "warehouse",
      p_owner: false,
    });
  });
});
