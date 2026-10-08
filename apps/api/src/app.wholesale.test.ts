import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { Express } from "express";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("./infrastructure/supabase/client.js", () => ({ supabase: { rpc } }));
let app: Express;
beforeAll(async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("APP_MODE", "wholesale");
  vi.stubEnv("PAYMENTS_ENV", "disabled");
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "public-test-key");
  vi.stubEnv("SUPABASE_SECRET_KEY", "server-test-key");
  vi.stubEnv(
    "CORS_ORIGINS",
    "https://sme.solgemtradecomp.online,https://warehouse.solgemtradecomp.online",
  );
  const { createApp } = await import("./app.js");
  app = createApp();
});
afterAll(() => vi.unstubAllEnvs());

describe("wholesale production API", () => {
  it("starts without provider credentials and excludes consumer/legacy routes", async () => {
    expect((await request(app).get("/health")).status).toBe(200);
    for (const path of [
      "/v1/checkouts",
      "/v1/auth/send-otp",
      "/v1/vendor/listings",
      "/v1/payments",
    ]) {
      expect((await request(app).post(path).send({})).status).toBe(404);
    }
  });
  it("retains business login and protects business approval", async () => {
    expect((await request(app).post("/v1/business-auth/login").send({})).status).toBe(400);
    expect((await request(app).get("/v1/admin/business-applications")).status).toBe(401);
  });
  it("lets the signed SMS hook handle authentication without a bearer token", async () => {
    const response = await request(app).post("/v1/auth/hooks/send-sms").send({});
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "Invalid webhook signature." });
  });
  it("only allows the configured browser origins", async () => {
    const allowed = await request(app)
      .get("/health")
      .set("Origin", "https://sme.solgemtradecomp.online");
    expect(allowed.headers["access-control-allow-origin"]).toBe(
      "https://sme.solgemtradecomp.online",
    );
    const denied = await request(app).get("/health").set("Origin", "https://unrelated.example");
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
  });
  it("reports database readiness without exposing provider errors", async () => {
    rpc.mockReturnValue({ abortSignal: () => Promise.resolve({ error: null }) });
    expect((await request(app).get("/readyz")).status).toBe(200);
    rpc.mockReturnValue({
      abortSignal: () => Promise.resolve({ error: { message: "private detail" } }),
    });
    const failed = await request(app).get("/readyz");
    expect(failed.status).toBe(503);
    expect(failed.body).toEqual({ ready: false });
  });
});
