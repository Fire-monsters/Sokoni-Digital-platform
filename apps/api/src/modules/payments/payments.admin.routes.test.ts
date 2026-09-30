import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPaymentAdminRouter } from "./payments.admin.routes.js";
import { errorHandler } from "../../middleware/error-handler.js";

const auth = vi.hoisted(() => ({
  permissions: ["payments.read", "payments.reconcile", "refunds.manage"] as string[],
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
    req.requestId = "finance-test";
    req.auth = { userId: "a3400000-0000-4000-8000-000000000001", roles: [] };
    next();
  },
}));
vi.mock("../staff/staff-authorization.repository.js", () => ({
  StaffAuthorizationRepository: class {
    findByUserId() {
      return Promise.resolve({
        userId: "a3400000-0000-4000-8000-000000000001",
        role: "finance",
        status: "active",
        displayName: "Finance",
        permissions: auth.permissions,
      });
    }
  },
}));
describe("payment finance boundary", () => {
  const id = "a3400000-0000-4000-8000-000000000002";
  const operationId = "a3400000-0000-4000-8000-000000000003";
  const service = {
    getFinanceDetail: vi.fn(),
    commandFinance: vi.fn(),
    reconcileAttempt: vi.fn(),
    reconcilePendingBatch: vi.fn(),
  };
  function app() {
    const server = express();
    server.use(express.json());
    server.use("/v1/admin", createPaymentAdminRouter(service));
    server.use(errorHandler);
    return server;
  }
  beforeEach(() => {
    vi.clearAllMocks();
    auth.permissions = ["payments.read", "payments.reconcile", "refunds.manage"];
  });
  it("loads private payment detail without caching", async () => {
    service.getFinanceDetail.mockResolvedValue({ id });
    const result = await request(app()).get(`/v1/admin/payments/${id}`);
    expect(result.status).toBe(200);
    expect(result.headers["cache-control"]).toBe("no-store");
    expect(service.getFinanceDetail).toHaveBeenCalledWith(id);
  });
  it("binds reconciliation to authenticated staff and the retry key", async () => {
    const response = await request(app())
      .post(`/v1/admin/payments/${id}/reconcile`)
      .send({ operationId, expectedVersion: 3, reason: "Recheck provider payment status" });
    expect(response.status).toBe(200);
    expect(service.reconcileAttempt).toHaveBeenCalledWith(
      id,
      "a3400000-0000-4000-8000-000000000001",
      operationId,
      {
        requestId: "finance-test",
        ipAddress: "::ffff:127.0.0.1",
        userAgent: "unknown",
      },
    );
  });
  it.each([{ status: "paid" }, { actorId: "someone" }, { amount: 5000 }])(
    "rejects browser payment overrides",
    async (input) => {
      expect(
        (
          await request(app())
            .post(`/v1/admin/payments/${id}/reconcile`)
            .send({ operationId, ...input })
        ).status,
      ).toBe(400);
      expect(service.reconcileAttempt).not.toHaveBeenCalled();
    },
  );
  it("executes bounded pending reconciliation on the server", async () => {
    expect(
      (
        await request(app()).post("/v1/admin/payments/reconciliation/run").send({
          operationId,
          scope: "pending",
          expectedVersion: 0,
          reason: "Recheck pending provider payments",
        })
      ).status,
    ).toBe(200);
    expect(service.reconcilePendingBatch).toHaveBeenCalledWith(
      "admin_request",
      "a3400000-0000-4000-8000-000000000001",
      operationId,
      {
        requestId: "finance-test",
        ipAddress: "::ffff:127.0.0.1",
        userAgent: "unknown",
      },
    );
  });
  it("rejects caller-selected batch scope and size", async () => {
    expect(
      (
        await request(app())
          .post("/v1/admin/payments/reconciliation/run")
          .send({ operationId, scope: "all", limit: 500 })
      ).status,
    ).toBe(400);
    expect(service.reconcilePendingBatch).not.toHaveBeenCalled();
  });
  it.each(["reconcile", "flag-investigation", "request-refund"])(
    "requires permission for %s",
    async (action) => {
      auth.permissions = ["payments.read"];
      expect(
        (await request(app()).post(`/v1/admin/payments/${id}/${action}`).send({ operationId }))
          .status,
      ).toBe(403);
      expect(service.commandFinance).not.toHaveBeenCalled();
      expect(service.reconcileAttempt).not.toHaveBeenCalled();
    },
  );
  it("requires a structured investigation reason", async () => {
    expect(
      (
        await request(app()).post(`/v1/admin/payments/${id}/flag-investigation`).send({
          operationId,
          expectedVersion: 3,
          reasonCode: "incorrect_amount",
          reason: "Amount differs",
        })
      ).status,
    ).toBe(200);
    expect(service.commandFinance).toHaveBeenCalledWith(
      "a3400000-0000-4000-8000-000000000001",
      id,
      "flag-investigation",
      {
        operationId,
        expectedVersion: 3,
        reasonCode: "incorrect_amount",
        reason: "Amount differs",
      },
      {
        requestId: "finance-test",
        ipAddress: "::ffff:127.0.0.1",
        userAgent: "unknown",
      },
    );
  });
  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid refund amounts",
    async (amount) => {
      expect(
        (
          await request(app()).post(`/v1/admin/payments/${id}/request-refund`).send({
            operationId,
            expectedVersion: 3,
            reasonCode: "duplicate_payment",
            reason: "Duplicate payment",
            amount,
          })
        ).status,
      ).toBe(400);
      expect(service.commandFinance).not.toHaveBeenCalled();
    },
  );
  it("requests a refund rather than directly approving or executing one", async () => {
    service.commandFinance.mockResolvedValue({ id, status: "awaiting_approval" });
    const input = {
      operationId,
      expectedVersion: 3,
      reasonCode: "duplicate_payment",
      reason: "Duplicate payment",
      amount: 1000,
    };
    expect(
      (await request(app()).post(`/v1/admin/payments/${id}/request-refund`).send(input)).status,
    ).toBe(200);
    expect(service.commandFinance).toHaveBeenCalledWith(
      "a3400000-0000-4000-8000-000000000001",
      id,
      "request-refund",
      input,
      {
        requestId: "finance-test",
        ipAddress: "::ffff:127.0.0.1",
        userAgent: "unknown",
      },
    );
  });
});
