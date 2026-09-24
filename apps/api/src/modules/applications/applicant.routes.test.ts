import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApplicantRouter } from "./applicant.routes.js";
import { errorHandler } from "../../middleware/error-handler.js";

const session = vi.hoisted(() => ({
  roles: ["vendor"] as string[],
  userId: "a3300000-0000-4000-8000-000000000001",
}));
vi.mock("../../infrastructure/supabase/client.js", () => ({
  supabase: {
    auth: {
      admin: {
        getUserById: vi.fn().mockResolvedValue({
          data: { user: { phone: "+256700000001", phone_confirmed_at: "2026-09-23T10:00:00Z" } },
          error: null,
        }),
      },
    },
  },
}));
vi.mock("../../middleware/authenticate.js", () => ({
  authenticate: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.requestId = "applicant-test";
    req.auth = { userId: session.userId, roles: session.roles };
    next();
  },
}));

describe("applicant workflow", () => {
  const repository = {
    own: vi.fn(),
    save: vi.fn(),
    submit: vi.fn(),
    upload: vi.fn(),
    complete: vi.fn(),
  };
  const operationId = "a3300000-0000-4000-8000-000000000002";
  function app() {
    const server = express();
    server.use(express.json());
    server.use("/v1/me", createApplicantRouter(repository));
    server.use(errorHandler);
    return server;
  }
  beforeEach(() => {
    vi.clearAllMocks();
    session.roles = ["vendor"];
    repository.own.mockResolvedValue(null);
  });

  it.each(["vendor", "rider"])(
    "uses the authenticated owner when saving %s details",
    async (role) => {
      const details = {
        personalDetails: { fullName: "Test Applicant", nationalIdNumber: "CM123456789" },
      };
      repository.save.mockResolvedValue({ saved: true });
      const response = await request(app()).patch(`/v1/me/${role}-application`).send(details);
      expect(response.status).toBe(200);
      expect(repository.save).toHaveBeenCalledWith(session.userId, role, details);
    },
  );
  it.each(["A", "A".repeat(101)])(
    "rejects names that cannot activate a rider profile",
    async (fullName) => {
      const response = await request(app())
        .patch("/v1/me/rider-application")
        .send({ personalDetails: { fullName, nationalIdNumber: "CM123456789" } });
      expect(response.status).toBe(400);
      expect(repository.save).not.toHaveBeenCalled();
    },
  );
  it("rejects approval-state injection in an applicant update", async () => {
    const response = await request(app())
      .patch("/v1/me/vendor-application")
      .send({ status: "approved", reviewerId: operationId });
    expect(response.status).toBe(400);
    expect(repository.save).not.toHaveBeenCalled();
  });
  it("binds submission retries to the authenticated owner", async () => {
    repository.submit.mockResolvedValue({ applicationStatus: "pending_review", duplicate: true });
    const response = await request(app())
      .post("/v1/me/application/submit")
      .send({ role: "vendor", idempotencyKey: operationId });
    expect(response.status).toBe(200);
    expect(repository.submit).toHaveBeenCalledWith(session.userId, "vendor", operationId);
  });
  it("derives document ownership on the server instead of trusting the submitted path", async () => {
    repository.complete.mockResolvedValue({ documentId: operationId, status: "uploaded" });
    const response = await request(app())
      .post("/v1/me/verification-documents/complete")
      .send({ documentId: operationId, storagePath: "another-owner/private-file" });
    expect(response.status).toBe(200);
    expect(repository.complete).toHaveBeenCalledWith(session.userId, operationId);
  });
  it("does not put consumers into vendor approval", async () => {
    session.roles = ["consumer"];
    const response = await request(app()).get("/v1/me/onboarding");
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      data: { role: "consumer", applicationStatus: "not_required", currentStep: "complete" },
    });
    expect(repository.own).not.toHaveBeenCalled();
  });
  it.each(["/v1/me", "/v1/me/onboarding"])(
    "honors the requested role for dual-role applicants at %s",
    async (path) => {
      session.roles = ["vendor", "rider"];
      repository.own.mockResolvedValue({ status: "in_review", issues: [], reason: null });
      const response = await request(app()).get(`${path}?role=vendor`);
      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({ data: { role: "vendor" } });
      expect(repository.own).toHaveBeenCalledWith(session.userId, "vendor");
    },
  );
  it("provides applicant feedback without returning the private review record", async () => {
    repository.own.mockResolvedValue({
      status: "changes_requested",
      issues: ["NATIONAL_ID_IMAGE_UNREADABLE"],
      reason: "Please replace the photo.",
      details: { personalDetails: {} },
    });
    const response = await request(app()).get("/v1/me/onboarding");
    expect(response.body).toMatchObject({
      data: {
        applicationStatus: "changes_requested",
        requiredActions: ["NATIONAL_ID_IMAGE_UNREADABLE"],
        reason: "Please replace the photo.",
      },
    });
    expect(response.headers["cache-control"]).toBe("no-store");
    const body = response.body as { data: Record<string, unknown> };
    expect(body.data).not.toHaveProperty("details");
  });
});
