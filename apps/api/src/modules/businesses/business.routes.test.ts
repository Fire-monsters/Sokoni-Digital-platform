import express from "express";
import request from "supertest";
import { describe, it, expect, vi } from "vitest";
import { createBusinessRouter } from "./business.routes.js";
import { businessDatabaseError, type BusinessRepository } from "./business.repository.js";
import { errorHandler } from "../../middleware/error-handler.js";
vi.mock("../../infrastructure/supabase/client.js", () => ({ supabase: {} }));
const id = "10000000-0000-4000-8000-000000000001";
const operationId = "10000000-0000-4000-8000-000000000002";
function setup() {
  const business = {
    id,
    kind: "farmer" as const,
    name: "Farm",
    location: "Entebbe",
    status: "draft" as const,
    version: 1,
    canTrade: false,
    categories: ["cash" as const],
    productIds: [id],
    reviewReason: null,
  };
  const repository = {
    products: vi.fn().mockResolvedValue([]),
    read: vi.fn().mockResolvedValue(business),
    command: vi.fn().mockResolvedValue(business),
  } satisfies BusinessRepository;
  const auth: express.RequestHandler = (req, _res, next) => {
    req.auth = { userId: "actor-from-token", roles: [] };
    next();
  };
  const app = express()
    .use(express.json())
    .use(createBusinessRouter(repository, auth))
    .use(errorHandler);
  return { app, repository };
}
describe("business account routes", () => {
  it("uses authenticated actor and passes repeat-safe operation ID", async () => {
    const { app, repository } = setup();
    const input = { operationId, kind: "farmer", name: "Farm", location: "Entebbe" };
    expect((await request(app).post("/me/businesses").send(input)).status).toBe(201);
    expect(repository.command).toHaveBeenCalledWith(
      "actor-from-token",
      "create",
      operationId,
      { kind: "farmer", name: "Farm", location: "Entebbe" },
      undefined,
    );
  });
  it("rejects warehouse self-registration and client owner assignment", async () => {
    const { app, repository } = setup();
    for (const extra of [{ kind: "warehouse" }, { ownerId: id }]) {
      expect(
        (
          await request(app)
            .post("/me/businesses")
            .send({ operationId, kind: "farmer", name: "Farm", location: "Entebbe", ...extra })
        ).status,
      ).toBe(400);
    }
    expect(repository.command).not.toHaveBeenCalled();
  });
  it("validates duplicates and empty product preferences", async () => {
    const { app, repository } = setup();
    for (const preferences of [
      { categories: ["cash", "cash"], productIds: [id] },
      { categories: ["food"], productIds: [] },
      { categories: ["food"], productIds: [id, id] },
    ]) {
      expect(
        (
          await request(app)
            .put(`/me/businesses/${id}/product-preferences`)
            .send({ operationId, expectedVersion: 1, ...preferences })
        ).status,
      ).toBe(400);
    }
    expect(repository.command).not.toHaveBeenCalled();
  });
  it("returns preferences without simulated metrics", async () => {
    const { app } = setup();
    const result = await request(app).get(`/me/businesses/${id}/analytics-context`);
    expect((result.body as { data: unknown }).data).toMatchObject({
      productIds: [id],
      defaultScope: "selected_products",
      metricsAvailable: false,
    });
    expect((result.body as { data: unknown }).data).not.toHaveProperty("revenue");
  });
  it("propagates database access denial and concurrency conflicts", async () => {
    const { app, repository } = setup();
    repository.read.mockRejectedValue(businessDatabaseError({ code: "42501" }));
    expect((await request(app).get(`/me/businesses/${id}`)).status).toBe(403);
    repository.command.mockRejectedValue(businessDatabaseError({ code: "40001" }));
    expect(
      (
        await request(app)
          .post(`/me/businesses/${id}/submit`)
          .send({ operationId, expectedVersion: 1 })
      ).status,
    ).toBe(409);
  });
  it("passes staff reads to the database permission gate and rejects invalid pagination", async () => {
    const { app, repository } = setup();
    expect((await request(app).get("/admin/business-applications?limit=10&offset=20")).status).toBe(
      200,
    );
    expect(repository.read).toHaveBeenCalledWith("actor-from-token", undefined, true, 10, 20);
    expect((await request(app).get("/admin/business-applications?limit=1000")).status).toBe(400);
  });
  it("does not intercept unrelated existing public endpoints", async () => {
    const app = express().use(
      createBusinessRouter(undefined, (_req, res) => {
        res.sendStatus(401);
      }),
    );
    app.get("/catalogue", (_req, res) => res.sendStatus(200));
    expect((await request(app).get("/catalogue")).status).toBe(200);
  });
});
