import { describe, expect, it, vi } from "vitest";
vi.mock("../../infrastructure/supabase/client.js", () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
import request from "supertest";
import express from "express";
import { checkReadiness } from "./readiness.service.js";
import { createReadinessRouter } from "./readiness.routes.js";
import { parseServerEnvironment } from "../../config/index.js";

const baseServerEnv = {
  NODE_ENV: "test",
  PORT: "4000",
  APP_MODE: "full",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "test-pub-key",
  SUPABASE_SECRET_KEY: "test-secret-key",
  SUPABASE_JWKS_URL: "https://example.supabase.co/auth/v1/.well-known/jwks.json",
  CORS_ORIGINS: "http://localhost:5173",
  LOG_LEVEL: "silent",
  PAYMENTS_ENV: "fake",
};

describe("Readiness Service and GET /ready", () => {
  it("succeeds when public workspaces are disabled and database is ok", async () => {
    const env = parseServerEnvironment({
      ...baseServerEnv,
      PUBLIC_OPERATIONS_ENABLED: "false",
      PUBLIC_WAREHOUSE_ENABLED: "false",
    });

    const result = await checkReadiness({
      env,
      checkDatabase: async () => true,
    });

    expect(result.ready).toBe(true);
    expect(result.status).toBe("ready");
    expect(result.checks).toEqual({
      database: "ok",
      operationsWorkspace: "disabled",
      warehouseWorkspace: "disabled",
    });
  });

  it("fails when database ping fails", async () => {
    const env = parseServerEnvironment({
      ...baseServerEnv,
      PUBLIC_OPERATIONS_ENABLED: "false",
      PUBLIC_WAREHOUSE_ENABLED: "false",
    });

    const result = await checkReadiness({
      env,
      checkDatabase: async () => false,
    });

    expect(result.ready).toBe(false);
    expect(result.status).toBe("not_ready");
    expect(result.checks.database).toBe("failed");
    expect(result.errors).toContain("Database ping failed.");
  });

  it("fails when PUBLIC_WAREHOUSE_ENABLED is true but WAREHOUSE_ID is missing", async () => {
    const env = parseServerEnvironment({
      ...baseServerEnv,
      PUBLIC_WAREHOUSE_ENABLED: "true",
      WAREHOUSE_WORKSPACE_ACTOR_ID: "22222222-2222-4222-8222-222222222222",
      // WAREHOUSE_ID is missing
    });

    const result = await checkReadiness({
      env,
      checkDatabase: async () => true,
    });

    expect(result.ready).toBe(false);
    expect(result.checks.warehouseWorkspace).toBe("failed");
    expect(result.errors?.some((err) => err.includes("WAREHOUSE_ID is missing"))).toBe(true);
  });

  it("fails when warehouse ID does not exist or is not approved", async () => {
    const env = parseServerEnvironment({
      ...baseServerEnv,
      PUBLIC_WAREHOUSE_ENABLED: "true",
      WAREHOUSE_WORKSPACE_ACTOR_ID: "22222222-2222-4222-8222-222222222222",
      WAREHOUSE_ID: "33333333-3333-4333-8333-333333333333",
    });

    const result = await checkReadiness({
      env,
      checkDatabase: async () => true,
      validateWarehouseScope: async () => false, // Warehouse does not exist
    });

    expect(result.ready).toBe(false);
    expect(result.checks.warehouseWorkspace).toBe("failed");
    expect(
      result.errors?.some((err) =>
        err.includes("warehouse actor is not scoped to an approved warehouse"),
      ),
    ).toBe(true);
  });

  it("fails when warehouse actor is not scoped to the configured warehouse", async () => {
    const env = parseServerEnvironment({
      ...baseServerEnv,
      PUBLIC_WAREHOUSE_ENABLED: "true",
      WAREHOUSE_WORKSPACE_ACTOR_ID: "22222222-2222-4222-8222-222222222222",
      WAREHOUSE_ID: "33333333-3333-4333-8333-333333333333",
    });

    const result = await checkReadiness({
      env,
      checkDatabase: async () => true,
      validateWarehouseScope: async (actorId, warehouseId) => {
        // Warehouse exists, but actor is not member of that warehouseId
        return actorId === "22222222-2222-4222-8222-222222222222" && warehouseId === "different-id";
      },
    });

    expect(result.ready).toBe(false);
    expect(result.checks.warehouseWorkspace).toBe("failed");
  });

  it("succeeds when warehouse workspace actor and warehouse scope are valid", async () => {
    const env = parseServerEnvironment({
      ...baseServerEnv,
      PUBLIC_WAREHOUSE_ENABLED: "true",
      WAREHOUSE_WORKSPACE_ACTOR_ID: "22222222-2222-4222-8222-222222222222",
      WAREHOUSE_ID: "33333333-3333-4333-8333-333333333333",
    });

    const result = await checkReadiness({
      env,
      checkDatabase: async () => true,
      validateWarehouseScope: async () => true,
    });

    expect(result.ready).toBe(true);
    expect(result.checks.warehouseWorkspace).toBe("ok");
  });

  it("fails when PUBLIC_OPERATIONS_ENABLED is true but actor is missing or invalid", async () => {
    const envMissing = parseServerEnvironment({
      ...baseServerEnv,
      PUBLIC_OPERATIONS_ENABLED: "true",
      // OPERATIONS_WORKSPACE_ACTOR_ID is missing
    });

    const resultMissing = await checkReadiness({
      env: envMissing,
      checkDatabase: async () => true,
    });
    expect(resultMissing.ready).toBe(false);
    expect(resultMissing.checks.operationsWorkspace).toBe("failed");

    const envWithActor = parseServerEnvironment({
      ...baseServerEnv,
      PUBLIC_OPERATIONS_ENABLED: "true",
      OPERATIONS_WORKSPACE_ACTOR_ID: "11111111-1111-4111-8111-111111111111",
    });

    const resultInactive = await checkReadiness({
      env: envWithActor,
      checkDatabase: async () => true,
      validateOperationsActor: async () => false, // Inactive or not found
    });
    expect(resultInactive.ready).toBe(false);
    expect(resultInactive.checks.operationsWorkspace).toBe("failed");
  });

  it("succeeds when operations workspace actor is valid active staff", async () => {
    const env = parseServerEnvironment({
      ...baseServerEnv,
      PUBLIC_OPERATIONS_ENABLED: "true",
      OPERATIONS_WORKSPACE_ACTOR_ID: "11111111-1111-4111-8111-111111111111",
    });

    const result = await checkReadiness({
      env,
      checkDatabase: async () => true,
      validateOperationsActor: async () => true,
    });

    expect(result.ready).toBe(true);
    expect(result.checks.operationsWorkspace).toBe("ok");
  });

  it("returns HTTP 200 on GET /ready when ready and HTTP 503 when not ready", async () => {
    const readyApp = express();
    readyApp.use(
      createReadinessRouter({
        checkDatabase: async () => true,
        env: parseServerEnvironment({
          ...baseServerEnv,
          PUBLIC_OPERATIONS_ENABLED: "false",
          PUBLIC_WAREHOUSE_ENABLED: "false",
        }),
      }),
    );

    const readyRes = await request(readyApp).get("/ready");
    expect(readyRes.status).toBe(200);
    expect(readyRes.body.status).toBe("ready");
    expect(readyRes.body.checks.database).toBe("ok");

    const unreadyApp = express();
    unreadyApp.use(
      createReadinessRouter({
        checkDatabase: async () => false,
        env: parseServerEnvironment({
          ...baseServerEnv,
          PUBLIC_OPERATIONS_ENABLED: "false",
          PUBLIC_WAREHOUSE_ENABLED: "false",
        }),
      }),
    );

    const unreadyRes = await request(unreadyApp).get("/ready");
    expect(unreadyRes.status).toBe(503);
    expect(unreadyRes.body.status).toBe("not_ready");
    expect(unreadyRes.body.checks.database).toBe("failed");
  });
});
