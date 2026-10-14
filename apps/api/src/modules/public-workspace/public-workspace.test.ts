import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../infrastructure/supabase/client.js", () => ({ supabase: { from: vi.fn(), rpc: vi.fn() } }));
import request from "supertest";
import express from "express";
import { requestContext } from "../../middleware/request-context.js";
import {
  createPublicOperationsRouter,
  createPublicWarehouseRouter,
} from "./public-workspace.routes.js";
import {
  InMemoryPublicWorkspaceAuditRecorder,
  PublicWorkspaceAuditService,
} from "./public-workspace-audit.service.js";
import { createBusinessRouter } from "../businesses/business.routes.js";
import { createBusinessAuthRouter } from "../business-auth/business-auth.routes.js";

const OPERATIONS_ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const WAREHOUSE_ACTOR_ID = "22222222-2222-4222-8222-222222222222";
const CONFIGURED_WAREHOUSE_ID = "33333333-3333-4333-8333-333333333333";

function setupApp(envOverrides: Record<string, string> = {}) {
  const app = express();
  app.use(express.json());
  app.use(requestContext);

  const defaultEnv: Record<string, string> = {
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
    PUBLIC_OPERATIONS_ENABLED: "true",
    PUBLIC_WAREHOUSE_ENABLED: "true",
    OPERATIONS_WORKSPACE_ACTOR_ID: OPERATIONS_ACTOR_ID,
    WAREHOUSE_WORKSPACE_ACTOR_ID: WAREHOUSE_ACTOR_ID,
    WAREHOUSE_ID: CONFIGURED_WAREHOUSE_ID,
    ...envOverrides,
  };

  for (const [key, value] of Object.entries(defaultEnv)) {
    vi.stubEnv(key, value);
  }

  const auditRecorder = new InMemoryPublicWorkspaceAuditRecorder();
  const auditService = new PublicWorkspaceAuditService(auditRecorder);

  const mockValidator = {
    validateOperationsActor: async (actorId: string) => actorId === OPERATIONS_ACTOR_ID,
    validateWarehouseScope: async (actorId: string, warehouseId: string) =>
      actorId === WAREHOUSE_ACTOR_ID && warehouseId === CONFIGURED_WAREHOUSE_ID,
  };

  app.use(
    "/v1/public/operations",
    createPublicOperationsRouter({
      auditService,
      validator: mockValidator,
    }),
  );

  app.use(
    "/v1/public/warehouse",
    createPublicWarehouseRouter({
      auditService,
      validator: mockValidator,
    }),
  );

  // Mount existing SME endpoints to test regression protection
  app.use("/v1/business-auth", createBusinessAuthRouter());
  app.use("/v1", createBusinessRouter());

  return { app, auditRecorder, auditService };
}

describe("Public Workspace Security Boundary", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  describe("Feature flags", () => {
    it("rejects public operations mutations when PUBLIC_OPERATIONS_ENABLED=false", async () => {
      const { app } = setupApp({ PUBLIC_OPERATIONS_ENABLED: "false" });

      const res = await request(app)
        .post("/v1/public/operations/applications/55555555-5555-4555-8555-555555555555/review")
        .send({ reason: "Review application" });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("PUBLIC_WORKSPACE_DISABLED");
    });

    it("rejects public warehouse mutations when PUBLIC_WAREHOUSE_ENABLED=false", async () => {
      const { app } = setupApp({ PUBLIC_WAREHOUSE_ENABLED: "false" });

      const res = await request(app)
        .post("/v1/public/warehouse/stock/adjust")
        .send({ sku: "MAIZE-01", quantityDelta: 10, reason: "Stock count" });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("PUBLIC_WORKSPACE_DISABLED");
    });
  });

  describe("Identity injection and anti-spoofing", () => {
    it("rejects client attempts to supply actorId, warehouseId, or businessId", async () => {
      const { app } = setupApp();

      const maliciousPayloads = [
        { actorId: "attacker-admin-id", reason: "Attempting actor override" },
        { warehouseId: "other-warehouse-id", reason: "Attempting warehouse override" },
        { businessId: "target-business-id", reason: "Attempting business override" },
        { role: "admin", reason: "Attempting role override" },
      ];

      for (const payload of maliciousPayloads) {
        const res = await request(app)
          .post("/v1/public/operations/applications/55555555-5555-4555-8555-555555555555/review")
          .send(payload);

        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe("VALIDATION_ERROR");
        expect(res.body.error.message).toContain("cannot specify actor, warehouse, or role overrides");
      }
    });

    it("rejects client attempts to supply forbidden fields via query parameters", async () => {
      const { app } = setupApp();

      const res = await request(app)
        .post("/v1/public/warehouse/stock/adjust?actorId=malicious-id")
        .send({ sku: "MAIZE-01", quantityDelta: 5, reason: "Adjustment" });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("Explicit action allowlist", () => {
    it("blocks provider execution and unsupported delivery actions before domain routing", async () => {
      const { app } = setupApp();
      const delivery = "55555555-5555-4555-8555-555555555555";
      const external = await request(app).post("/v1/public/operations/payments/reconciliation/run").send({});
      expect(external.status).toBe(503);
      expect(external.body.error.code).toBe("UNAVAILABLE");
      const unsupported = await request(app).post(`/v1/public/operations/deliveries/${delivery}/actions`).send({ action: "RETURN_TO_MARKET" });
      expect(unsupported.status).toBe(403);
      expect(unsupported.body.error.code).toBe("ACTION_NOT_AVAILABLE");
    });
    it("permits allowlisted operations action (application.review)", async () => {
      const { app } = setupApp();

      const checkRes = await request(app)
        .post("/v1/public/operations/actions/check")
        .send({ action: "application.review" });

      expect(checkRes.status).toBe(200);
      expect(checkRes.body.data.allowed).toBe(true);
    });

    it("rejects non-allowlisted operations action (admin.deleteUser)", async () => {
      const { app } = setupApp();

      const checkRes = await request(app)
        .post("/v1/public/operations/actions/check")
        .send({ action: "admin.deleteUser" });

      expect(checkRes.status).toBe(403);
      expect(checkRes.body.error.code).toBe("ACTION_NOT_AVAILABLE");
    });

    it("permits allowlisted warehouse action (stock.adjust)", async () => {
      const { app } = setupApp();

      const checkRes = await request(app)
        .post("/v1/public/warehouse/actions/check")
        .send({ action: "stock.adjust" });

      expect(checkRes.status).toBe(200);
      expect(checkRes.body.data.allowed).toBe(true);
    });

    it("rejects non-allowlisted warehouse action (warehouse.changeScope)", async () => {
      const { app } = setupApp();

      const checkRes = await request(app)
        .post("/v1/public/warehouse/actions/check")
        .send({ action: "warehouse.changeScope" });

      expect(checkRes.status).toBe(403);
      expect(checkRes.body.error.code).toBe("ACTION_NOT_AVAILABLE");
    });

    it("fails closed on wildcards or unknown actions", async () => {
      const { app } = setupApp();

      for (const action of ["*", "operations.*", "warehouse.*", "admin", ""]) {
        const res = await request(app)
          .post("/v1/public/operations/actions/check")
          .send({ action });

        expect(res.status).toBe(action ? 403 : 400);
        expect(res.body.error.code).toBe(action ? "ACTION_NOT_AVAILABLE" : "VALIDATION_ERROR");
      }
    });
  });

  describe("Audit trail", () => {
    it("does not let the removed prototype review endpoint claim a successful mutation", async () => {
      const { app, auditRecorder } = setupApp();

      const appId = "66666666-6666-4666-8666-666666666666";
      const customRequestId = "test-correlation-id-123";

      const res = await request(app)
        .post(`/v1/public/operations/applications/${appId}/review`)
        .set("x-request-id", customRequestId)
        .send({ reason: "Document verification passed", notes: "Verified national ID" });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("ACTION_NOT_AVAILABLE");
      expect(auditRecorder.getRecordedEvents()).toHaveLength(0);
    });

    it("records configured warehouse workspace actor and warehouse ID on successful mutation", async () => {
      const { app, auditRecorder } = setupApp();

      const res = await request(app)
        .post("/v1/public/warehouse/stock/adjust")
        .set("x-request-id", "corr-warehouse-456")
        .send({ sku: "BEANS-K132", quantityDelta: -10, reason: "Physical inventory reconciliation" });

      expect(res.status).toBe(200);
      expect(res.body.data.actorId).toBe(WAREHOUSE_ACTOR_ID);
      expect(res.body.data.warehouseId).toBe(CONFIGURED_WAREHOUSE_ID);

      const events = auditRecorder.getRecordedEvents();
      expect(events.length).toBe(1);

      const event = events[0]!;
      expect(event.actorId).toBe(WAREHOUSE_ACTOR_ID);
      expect(event.actorType).toBe("public-workspace");
      expect(event.workspace).toBe("warehouse");
      expect(event.action).toBe("stock.adjust");
      expect(event.resourceType).toBe("inventory_lot");
      expect(event.warehouseId).toBe(CONFIGURED_WAREHOUSE_ID);
      expect(event.correlationId).toBe("corr-warehouse-456");
      expect(event.reason).toBe("Physical inventory reconciliation");
    });
  });

  describe("SME authentication regression protection", () => {
    it("existing authenticated SME route still requires authentication", async () => {
      const { app } = setupApp();

      // Calling SME protected endpoint without auth token must return 401
      const res = await request(app).get("/v1/me/businesses");
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHENTICATED");
    });

    it("existing SME login route contract is unaffected", async () => {
      const { app } = setupApp();

      // Empty login attempt fails with validation 400, proving route exists and schema runs
      const res = await request(app).post("/v1/business-auth/login").send({});
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("public workspace requests do not satisfy SME authentication", async () => {
      const { app } = setupApp();

      // Public workspace path does not gain access to /v1/me/businesses
      const res = await request(app).get("/v1/me/businesses");
      expect(res.status).toBe(401);
    });
  });
});
