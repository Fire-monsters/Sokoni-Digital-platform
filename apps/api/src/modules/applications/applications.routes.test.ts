import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApplicationReviewRouter } from "./applications.routes.js";
import { ApplicationReviewService } from "./applications.service.js";
import { errorHandler } from "../../middleware/error-handler.js";

const auth = vi.hoisted(() => ({
  permissions: ["applications.read", "applications.review"] as string[],
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
vi.mock("../../middleware/authenticate.js", () => ({
  authenticate: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.requestId = "review-test";
    req.auth = { userId: "a3300000-0000-4000-8000-000000000002", roles: [] };
    next();
  },
}));
vi.mock("../staff/staff-authorization.repository.js", () => ({
  StaffAuthorizationRepository: class {
    findByUserId() {
      return Promise.resolve({
        userId: "a3300000-0000-4000-8000-000000000002",
        role: "agent",
        status: "active",
        displayName: "Reviewer",
        permissions: auth.permissions,
      });
    }
  },
}));
describe("application review boundary", () => {
  const id = "a3300000-0000-4000-8000-000000000004";
  const operationId = "a3300000-0000-4000-8000-000000000005";
  const repository = { get: vi.fn(), review: vi.fn() };
  function app() {
    const server = express();
    server.use(express.json());
    server.use(
      "/v1/admin",
      createApplicationReviewRouter(new ApplicationReviewService(repository)),
    );
    server.use(errorHandler);
    return server;
  }
  beforeEach(() => {
    vi.clearAllMocks();
    auth.permissions = ["applications.read", "applications.review"];
  });
  it("loads persisted detail with no-store caching", async () => {
    repository.get.mockResolvedValue({ id, documents: [], timeline: [] });
    const result = await request(app()).get(`/v1/admin/applications/${id}`);
    expect(result.status).toBe(200);
    expect(result.headers["cache-control"]).toBe("no-store");
    expect(repository.get).toHaveBeenCalledWith(id);
  });
  it("denies detail reads without permission", async () => {
    auth.permissions = [];
    expect((await request(app()).get(`/v1/admin/applications/${id}`)).status).toBe(403);
    expect(repository.get).not.toHaveBeenCalled();
  });
  it("passes staff identity and concurrency controls into the command", async () => {
    repository.review.mockResolvedValue({
      applicationId: id,
      status: "in_review",
      version: 2,
      operationId,
      duplicate: false,
    });
    const result = await request(app())
      .post(`/v1/admin/applications/${id}/start-review`)
      .send({ expectedVersion: 1, operationId, reason: "Begin document verification" });
    expect(result.status).toBe(200);
    expect(repository.review).toHaveBeenCalledWith(
      id,
      "a3300000-0000-4000-8000-000000000002",
      "start-review",
      { expectedVersion: 1, operationId, reason: "Begin document verification" },
      {
        requestId: "review-test",
        ipAddress: "::ffff:127.0.0.1",
        userAgent: "unknown",
      },
    );
  });
  it.each(["request-changes", "reject", "suspend"])("requires a reason for %s", async (action) => {
    auth.permissions.push("users.manage");
    expect(
      (
        await request(app())
          .post(`/v1/admin/applications/${id}/${action}`)
          .send({ expectedVersion: 1, operationId })
      ).status,
    ).toBe(400);
    expect(repository.review).not.toHaveBeenCalled();
  });
  it("requires users.manage for suspension", async () => {
    expect(
      (
        await request(app())
          .post(`/v1/admin/applications/${id}/suspend`)
          .send({ expectedVersion: 1, operationId, reason: "Safety review" })
      ).status,
    ).toBe(403);
    expect(repository.review).not.toHaveBeenCalled();
  });
  it("rejects empty private notes", async () => {
    expect(
      (
        await request(app())
          .post(`/v1/admin/applications/${id}/notes`)
          .send({ expectedVersion: 1, operationId, internalNotes: " " })
      ).status,
    ).toBe(400);
    expect(repository.review).not.toHaveBeenCalled();
  });
  it("rejects caller-supplied actor IDs", async () => {
    expect(
      (
        await request(app())
          .post(`/v1/admin/applications/${id}/approve`)
          .send({ expectedVersion: 1, operationId, actorId: "someone-else" })
      ).status,
    ).toBe(400);
    expect(repository.review).not.toHaveBeenCalled();
  });
  it("preserves concurrency errors for the dashboard", async () => {
    repository.review.mockRejectedValue(
      Object.assign(new Error("Refresh before reviewing."), { statusCode: 409, code: "CONFLICT" }),
    );
    expect(
      (
        await request(app())
          .post(`/v1/admin/applications/${id}/approve`)
          .send({ expectedVersion: 1, operationId, reason: "Documents verified" })
      ).status,
    ).toBe(409);
  });
});
