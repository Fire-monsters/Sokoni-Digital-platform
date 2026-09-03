import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type {
  StaffAuthorization,
  StaffAuthorizationReader,
} from "../modules/staff/staff-authorization.repository.js";
import { requirePermission } from "./require-permission.js";

vi.mock("../infrastructure/supabase/client.js", () => ({ supabase: {} }));

const activeDispatcher = {
  userId: "staff-user",
  displayName: "Dispatch One",
  role: "dispatcher" as const,
  status: "active" as const,
  permissions: ["deliveries.read", "deliveries.manage"],
} satisfies StaffAuthorization;

function app(repository: StaffAuthorizationReader) {
  const server = express();
  server.use((req, _res, next) => {
    req.auth = { userId: "staff-user", roles: [] };
    next();
  });
  server.get("/payments", requirePermission("payments.read", repository), (_req, res) =>
    res.sendStatus(204),
  );
  server.post("/deliveries", requirePermission("deliveries.manage", repository), (_req, res) =>
    res.sendStatus(204),
  );
  return server;
}

describe("requirePermission", () => {
  it("allows an active staff member with the required permission", async () => {
    const repository = { findByUserId: vi.fn().mockResolvedValue(activeDispatcher) };
    expect((await request(app(repository)).post("/deliveries")).status).toBe(204);
  });

  it("denies a dispatcher manually requesting a payments endpoint", async () => {
    const repository = { findByUserId: vi.fn().mockResolvedValue(activeDispatcher) };
    const response = await request(app(repository)).get("/payments");
    expect(response.status).toBe(403);
    expect((response.body as { error: { code: string } }).error.code).toBe("FORBIDDEN");
  });

  it("denies suspended staff even when the permission is granted", async () => {
    const repository = {
      findByUserId: vi.fn().mockResolvedValue({ ...activeDispatcher, status: "suspended" }),
    };
    const response = await request(app(repository)).post("/deliveries");
    expect(response.status).toBe(403);
    expect((response.body as { error: { code: string } }).error.code).toBe("ACCOUNT_DISABLED");
  });

  it("denies authenticated users without a staff record", async () => {
    const repository = { findByUserId: vi.fn().mockResolvedValue(null) };
    expect((await request(app(repository)).post("/deliveries")).status).toBe(403);
  });
});

describe.each([
  ["admin", ["deliveries.manage", "payments.read"], 204, 204],
  ["agent", ["deliveries.read", "payments.read"], 403, 204],
  ["dispatcher", ["deliveries.manage"], 204, 403],
  ["finance", ["deliveries.read", "payments.read"], 403, 204],
  ["viewer", ["reports.read", "audit.read"], 403, 403],
] as const)("%s API matrix", (role, permissions, deliveryStatus, paymentStatus) => {
  it("enforces delivery and payment permissions", async () => {
    const repository = {
      findByUserId: vi.fn().mockResolvedValue({ ...activeDispatcher, role, permissions }),
    };
    expect((await request(app(repository)).post("/deliveries")).status).toBe(deliveryStatus);
    expect((await request(app(repository)).get("/payments")).status).toBe(paymentStatus);
  });
});
