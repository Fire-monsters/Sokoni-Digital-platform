import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { errorHandler } from "../../../middleware/error-handler.js";
import type { StaffAuthorizationReader } from "../../staff/staff-authorization.repository.js";
import { createAdminWorkflowRoute } from "./admin-workflow.js";

vi.mock("../../../infrastructure/supabase/client.js", () => ({ supabase: {} }));

const actor = {
  userId: "10000000-0000-4000-8000-000000000001",
  displayName: "Operations User",
  role: "agent" as const,
  status: "active" as const,
  permissions: ["applications.review" as const],
};

function createTestApp(
  execute: (command: unknown) => Promise<unknown>,
  authorizationReader: StaffAuthorizationReader,
) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.requestId = "request-123";
    req.auth = { userId: actor.userId, roles: [] };
    next();
  });
  app.post(
    "/applications/:applicationId/approve",
    ...createAdminWorkflowRoute({
      operation: "applications.approve",
      permission: "applications.review",
      paramsSchema: z.object({ applicationId: z.uuid() }),
      bodySchema: z.object({ reason: z.string().trim().min(3) }),
      execute,
      authorizationReader,
    }),
  );
  app.use(errorHandler);
  return app;
}

describe("createAdminWorkflowRoute", () => {
  const applicationId = "20000000-0000-4000-8000-000000000001";

  it("passes validated input, the authorized staff actor and request ID to the service", async () => {
    const execute = vi.fn().mockResolvedValue({ applicationId, status: "approved" });
    const authorizationReader = { findByUserId: vi.fn().mockResolvedValue(actor) };

    const response = await request(createTestApp(execute, authorizationReader))
      .post(`/applications/${applicationId}/approve`)
      .send({ reason: "Documents verified" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: { applicationId, status: "approved" },
      meta: { requestId: "request-123" },
    });
    expect(execute).toHaveBeenCalledWith({
      actor,
      auditContext: {
        requestId: "request-123",
        ipAddress: "::ffff:127.0.0.1",
        userAgent: "unknown",
      },
      input: { reason: "Documents verified" },
      params: { applicationId },
      requestId: "request-123",
    });
  });

  it("does not execute when request validation fails", async () => {
    const execute = vi.fn();
    const authorizationReader = { findByUserId: vi.fn().mockResolvedValue(actor) };

    const response = await request(createTestApp(execute, authorizationReader))
      .post(`/applications/${applicationId}/approve`)
      .send({ reason: "" });

    expect(response.status).toBe(400);
    expect((response.body as { error: { code: string } }).error.code).toBe("VALIDATION_ERROR");
    expect(execute).not.toHaveBeenCalled();
  });

  it("does not execute when the staff actor lacks permission", async () => {
    const execute = vi.fn();
    const authorizationReader = {
      findByUserId: vi.fn().mockResolvedValue({ ...actor, permissions: [] }),
    };

    const response = await request(createTestApp(execute, authorizationReader))
      .post(`/applications/${applicationId}/approve`)
      .send({ reason: "Documents verified" });

    expect(response.status).toBe(403);
    expect((response.body as { error: { code: string } }).error.code).toBe("FORBIDDEN");
    expect(execute).not.toHaveBeenCalled();
  });

  it("forwards service failures to the shared error handler", async () => {
    const failure = Object.assign(new Error("The application changed during review."), {
      statusCode: 409,
      code: "CONFLICT",
    });
    const execute = vi.fn().mockRejectedValue(failure);
    const authorizationReader = { findByUserId: vi.fn().mockResolvedValue(actor) };

    const response = await request(createTestApp(execute, authorizationReader))
      .post(`/applications/${applicationId}/approve`)
      .send({ reason: "Documents verified" });

    expect(response.status).toBe(409);
    expect((response.body as { error: unknown }).error).toEqual({
      code: "CONFLICT",
      message: "The application changed during review.",
      requestId: "request-123",
    });
  });
});
