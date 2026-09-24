import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { errorHandler } from "../../middleware/error-handler.js";
import { createOrderInvestigationRouter } from "./order-investigation.routes.js";

const auth = vi.hoisted(() => ({
  permissions: ["orders.read", "orders.support", "notifications.manage"] as string[],
}));
vi.mock("../../infrastructure/supabase/client.js", () => ({ supabase: {} }));
vi.mock("../../middleware/authenticate.js", () => ({
  authenticate: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.requestId = "order-support-test";
    req.auth = { userId: "a3500000-0000-4000-8000-000000000001", roles: [] };
    next();
  },
}));
vi.mock("../staff/staff-authorization.repository.js", () => ({
  StaffAuthorizationRepository: class {
    findByUserId() {
      return Promise.resolve({
        userId: "a3500000-0000-4000-8000-000000000001",
        role: "agent",
        status: "active",
        displayName: "Support",
        permissions: auth.permissions,
      });
    }
  },
}));

describe("order investigation boundary", () => {
  const orderId = "a3500000-0000-4000-8000-000000000002";
  const notificationId = "a3500000-0000-4000-8000-000000000003";
  const operationId = "a3500000-0000-4000-8000-000000000004";
  const repository = { command: vi.fn() };
  const auditContext = {
    requestId: "order-support-test",
    ipAddress: "::ffff:127.0.0.1",
    userAgent: "unknown",
  };
  function app() {
    const server = express();
    server.use(express.json());
    server.use("/v1/admin", createOrderInvestigationRouter(repository));
    server.use(errorHandler);
    return server;
  }
  beforeEach(() => {
    vi.clearAllMocks();
    auth.permissions = ["orders.read", "orders.support", "notifications.manage"];
    repository.command.mockResolvedValue({ orderId, status: "recorded", duplicate: false });
  });
  it("binds support notes to the authenticated staff actor", async () => {
    const result = await request(app())
      .post(`/v1/admin/orders/${orderId}/notes`)
      .send({ operationId, note: "Customer called support." });
    expect(result.status).toBe(200);
    expect(result.headers["cache-control"]).toBe("no-store");
    expect(repository.command).toHaveBeenCalledWith(
      orderId,
      "a3500000-0000-4000-8000-000000000001",
      "notes",
      { operationId, note: "Customer called support." },
      auditContext,
    );
  });
  it.each(["consumer", "rider"])("derives the %s contact target from the URL", async (target) => {
    await request(app())
      .post(`/v1/admin/orders/${orderId}/contact/${target}/reveal`)
      .send({ operationId, reason: "Coordinate this order" });
    expect(repository.command).toHaveBeenCalledWith(
      orderId,
      "a3500000-0000-4000-8000-000000000001",
      "reveal-contact",
      { operationId, reason: "Coordinate this order", target },
      auditContext,
    );
  });
  it("derives the notification from the URL and accepts only a reason", async () => {
    await request(app())
      .post(`/v1/admin/orders/${orderId}/notifications/${notificationId}/resend`)
      .send({ operationId, reason: "Customer requested another update" });
    expect(repository.command).toHaveBeenCalledWith(
      orderId,
      "a3500000-0000-4000-8000-000000000001",
      "resend-notification",
      { operationId, reason: "Customer requested another update", notificationId },
      auditContext,
    );
  });
  it("passes optimistic delivery concurrency into dispatch escalation", async () => {
    await request(app())
      .post(`/v1/admin/orders/${orderId}/escalate-dispatch`)
      .send({ operationId, reason: "Order is delayed", expectedDeliveryVersion: 4 });
    expect(repository.command).toHaveBeenCalledWith(
      orderId,
      "a3500000-0000-4000-8000-000000000001",
      "escalate-dispatch",
      { operationId, reason: "Order is delayed", expectedDeliveryVersion: 4 },
      auditContext,
    );
  });
  it("rejects attempts to inject actor, status, contact target, or notification IDs", async () => {
    const results = await Promise.all([
      request(app())
        .post(`/v1/admin/orders/${orderId}/cancel`)
        .send({ operationId, reason: "Cancel order", status: "cancelled" }),
      request(app())
        .post(`/v1/admin/orders/${orderId}/notes`)
        .send({ operationId, note: "Support note", actorId: "attacker" }),
      request(app())
        .post(`/v1/admin/orders/${orderId}/contact/consumer/reveal`)
        .send({ operationId, reason: "Call customer", target: "rider" }),
      request(app())
        .post(`/v1/admin/orders/${orderId}/notifications/${notificationId}/resend`)
        .send({ operationId, reason: "Resend update", notificationId: orderId }),
    ]);
    expect(results.map((value) => value.status)).toEqual([400, 400, 400, 400]);
    expect(repository.command).not.toHaveBeenCalled();
  });
  it("requires support permission for notes, contact, escalation and cancellation", async () => {
    auth.permissions = ["orders.read", "notifications.manage"];
    const results = await Promise.all([
      request(app())
        .post(`/v1/admin/orders/${orderId}/notes`)
        .send({ operationId, note: "Support note" }),
      request(app())
        .post(`/v1/admin/orders/${orderId}/contact/consumer/reveal`)
        .send({ operationId, reason: "Call customer" }),
      request(app())
        .post(`/v1/admin/orders/${orderId}/escalate-dispatch`)
        .send({ operationId, reason: "Escalate issue", expectedDeliveryVersion: 1 }),
      request(app())
        .post(`/v1/admin/orders/${orderId}/cancel`)
        .send({ operationId, reason: "Cancel order" }),
    ]);
    expect(results.map((value) => value.status)).toEqual([403, 403, 403, 403]);
    expect(repository.command).not.toHaveBeenCalled();
  });
  it("uses the separate notification management permission for resends", async () => {
    auth.permissions = ["orders.read", "orders.support"];
    const result = await request(app())
      .post(`/v1/admin/orders/${orderId}/notifications/${notificationId}/resend`)
      .send({ operationId, reason: "Customer requested another update" });
    expect(result.status).toBe(403);
    expect(repository.command).not.toHaveBeenCalled();
  });
});
