import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { errorHandler } from "../../../middleware/error-handler.js";
import { hashCanonicalRequest } from "../../idempotency/request-hash.js";
import type { StaffAuthorizationReader } from "../../staff/staff-authorization.repository.js";
import type { AdminOperationCoordinator } from "./admin-operation.redis.js";
import type { AdminOperationRepository } from "./admin-operation.repository.js";
import { createAdminWorkflowRoute } from "./admin-workflow.js";

vi.mock("../../../infrastructure/supabase/client.js", () => ({
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
  operationRepository?: AdminOperationRepository,
  operationCoordinator?: AdminOperationCoordinator,
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
      ...(operationRepository ? { operationRepository } : {}),
      ...(operationCoordinator ? { operationCoordinator } : {}),
    }),
  );
  app.use(errorHandler);
  return app;
}

describe("createAdminWorkflowRoute", () => {
  const applicationId = "20000000-0000-4000-8000-000000000001";
  const operationId = "30000000-0000-4000-8000-000000000001";
  const coordinator = (): AdminOperationCoordinator => ({
    read: vi.fn().mockResolvedValue(null),
    acquire: vi.fn().mockResolvedValue("lock-token"),
    write: vi.fn().mockResolvedValue(undefined),
    release: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  });

  it("passes validated input, the authorized staff actor and request ID to the service", async () => {
    const execute = vi.fn().mockResolvedValue({ applicationId, status: "approved" });
    const authorizationReader = { findByUserId: vi.fn().mockResolvedValue(actor) };

    const response = await request(createTestApp(execute, authorizationReader))
      .post(`/applications/${applicationId}/approve`)
      .send({ reason: "Documents verified", expectedVersion: 4, operationId });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: { applicationId, status: "approved" },
      meta: {
        requestId: "request-123",
        operation: { id: operationId, status: "completed", replayed: false },
      },
    });
    expect(execute).toHaveBeenCalledWith({
      actor,
      auditContext: {
        requestId: "request-123",
        ipAddress: "::ffff:127.0.0.1",
        userAgent: "unknown",
      },
      input: { reason: "Documents verified" },
      metadata: { reason: "Documents verified", expectedVersion: 4, operationId },
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
      .send({ reason: "Documents verified", expectedVersion: 4, operationId });

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
      .send({ reason: "Documents verified", expectedVersion: 4, operationId });

    expect(response.status).toBe(409);
    expect((response.body as { error: unknown }).error).toEqual({
      code: "VERSION_CONFLICT",
      message: "This record changed after it was loaded. Refresh it and reconsider the operation.",
      operationId,
      retryable: false,
      requestId: "request-123",
    });
  });

  it("replays a durable result without executing the mutation again", async () => {
    const execute = vi.fn();
    const authorizationReader = { findByUserId: vi.fn().mockResolvedValue(actor) };
    const operationRepository: AdminOperationRepository = {
      claim: vi.fn().mockResolvedValue({
        action: "replay",
        outcome: "success",
        responseStatus: 200,
        responseBody: { applicationId, status: "approved" },
      }),
      complete: vi.fn(),
      fail: vi.fn(),
    };

    const response = await request(
      createTestApp(execute, authorizationReader, operationRepository, coordinator()),
    )
      .post(`/applications/${applicationId}/approve`)
      .send({ reason: "Documents verified", expectedVersion: 4, operationId });

    expect(response.status).toBe(200);
    expect(response.headers["idempotency-replayed"]).toBe("true");
    const body = response.body as { meta: { operation: unknown } };
    expect(body.meta.operation).toEqual({
      id: operationId,
      status: "completed",
      replayed: true,
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("replays a cached failure without requiring a database round trip", async () => {
    const execute = vi.fn();
    const authorizationReader = { findByUserId: vi.fn().mockResolvedValue(actor) };
    const claim = vi.fn();
    const operationRepository: AdminOperationRepository = {
      claim,
      complete: vi.fn(),
      fail: vi.fn(),
    };
    const operationCoordinator: AdminOperationCoordinator = {
      ...coordinator(),
      read: vi.fn().mockResolvedValue({
        actorStaffId: actor.userId,
        operationType: "applications.approve",
        requestHash: hashCanonicalRequest({
          operation: "applications.approve",
          params: { applicationId },
          body: { reason: "Documents verified" },
          metadata: { reason: "Documents verified", expectedVersion: 4, operationId },
        }),
        outcome: "error",
        responseStatus: 409,
        errorCode: "VERSION_CONFLICT",
        errorMessage: "Refresh before continuing.",
        currentVersion: 5,
      }),
    };

    const response = await request(
      createTestApp(execute, authorizationReader, operationRepository, operationCoordinator),
    )
      .post(`/applications/${applicationId}/approve`)
      .send({ reason: "Documents verified", expectedVersion: 4, operationId });

    expect(response.status).toBe(409);
    expect(response.headers["idempotency-replayed"]).toBe("true");
    expect((response.body as { error: unknown }).error).toMatchObject({
      code: "VERSION_CONFLICT",
      operationId,
      currentVersion: 5,
    });
    expect(claim).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects reuse of an operation ID with another request", async () => {
    const execute = vi.fn();
    const authorizationReader = { findByUserId: vi.fn().mockResolvedValue(actor) };
    const operationRepository: AdminOperationRepository = {
      claim: vi.fn().mockResolvedValue({ action: "conflict" }),
      complete: vi.fn(),
      fail: vi.fn(),
    };

    const response = await request(
      createTestApp(execute, authorizationReader, operationRepository, coordinator()),
    )
      .post(`/applications/${applicationId}/approve`)
      .send({ reason: "Documents verified", expectedVersion: 4, operationId });

    expect(response.status).toBe(409);
    const body = response.body as { error: unknown };
    expect(body.error).toMatchObject({
      code: "IDEMPOTENCY_KEY_REUSED",
      operationId,
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("rejects a concurrent duplicate while the original operation is processing", async () => {
    const execute = vi.fn();
    const authorizationReader = { findByUserId: vi.fn().mockResolvedValue(actor) };
    const operationRepository: AdminOperationRepository = {
      claim: vi.fn().mockResolvedValue({ action: "in_progress" }),
      complete: vi.fn(),
      fail: vi.fn(),
    };

    const response = await request(
      createTestApp(execute, authorizationReader, operationRepository, coordinator()),
    )
      .post(`/applications/${applicationId}/approve`)
      .send({ reason: "Documents verified", expectedVersion: 4, operationId });

    expect(response.status).toBe(409);
    expect((response.body as { error: unknown }).error).toMatchObject({
      code: "OPERATION_IN_PROGRESS",
      operationId,
      retryable: true,
    });
    expect(execute).not.toHaveBeenCalled();
  });
});
