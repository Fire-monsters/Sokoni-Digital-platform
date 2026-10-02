import express from "express";
import request from "supertest";
import { describe, it, expect, vi } from "vitest";
import { createBusinessAuthRouter } from "./business-auth.routes.js";
import { authProviderError, type BusinessAuthProvider } from "./business-auth.provider.js";
import { errorHandler } from "../../middleware/error-handler.js";
vi.mock("../../infrastructure/supabase/client.js", () => ({ supabase: {} }));
const session = {
  accessToken: "access",
  refreshToken: "refresh",
  expiresAt: 123,
  userId: "user",
  phoneVerified: true,
};
function setup() {
  const provider = {
    register: vi.fn().mockResolvedValue(undefined),
    resend: vi.fn().mockResolvedValue(undefined),
    verify: vi.fn().mockResolvedValue(session),
    login: vi.fn().mockResolvedValue(session),
    refresh: vi.fn().mockResolvedValue(session),
    logout: vi.fn().mockResolvedValue(undefined),
  } satisfies BusinessAuthProvider;
  const limit = vi.fn().mockResolvedValue(true);
  const factory = vi.fn(() => provider);
  const app = express()
    .use(express.json())
    .use(createBusinessAuthRouter(factory, limit))
    .use(errorHandler);
  return { app, provider, limit, factory };
}
describe("business authentication", () => {
  it("normalizes phone registration without granting roles or returning a session", async () => {
    const { app, provider } = setup();
    const result = await request(app)
      .post("/register")
      .send({ phoneNumber: "0772 123456", password: "Secret123" });
    expect(result.status).toBe(202);
    expect(provider.register).toHaveBeenCalledWith("+256772123456", "Secret123");
    expect((result.body as { data: unknown }).data).toEqual({ phoneVerificationRequired: true });
    expect(result.headers["cache-control"]).toBe("no-store");
  });
  it("rejects public privilege assignment", async () => {
    const { app, provider } = setup();
    expect(
      (
        await request(app)
          .post("/register")
          .send({ phoneNumber: "0772123456", password: "Secret123", role: "admin" })
      ).status,
    ).toBe(400);
    expect(provider.register).not.toHaveBeenCalled();
  });
  it("does not fabricate successful OTP verification", async () => {
    const { app, provider } = setup();
    provider.verify.mockRejectedValue(authProviderError({ status: 403 }));
    const result = await request(app)
      .post("/verify-otp")
      .send({ phoneNumber: "0772123456", otpCode: "123456" });
    expect(result.status).toBe(401);
    expect((result.body as { success: boolean }).success).toBe(false);
  });
  it("returns provider-issued sessions for login, OTP verification and refresh", async () => {
    const { app, provider } = setup();
    for (const [route, body] of [
      ["login", { phoneNumber: "0772123456", password: "Secret123" }],
      ["verify-otp", { phoneNumber: "0772123456", otpCode: "123456" }],
      ["refresh", { refreshToken: "refresh" }],
    ] as const) {
      expect(
        ((await request(app).post(`/${route}`).send(body)).body as { data: unknown }).data,
      ).toEqual(session);
    }
    expect(provider.refresh).toHaveBeenCalledWith("refresh");
  });
  it("throttles before contacting the provider", async () => {
    const { app, provider, limit } = setup();
    limit.mockResolvedValue(false);
    const result = await request(app).post("/resend-otp").send({ phoneNumber: "0772123456" });
    expect(result.status).toBe(429);
    expect(result.headers["retry-after"]).toBe("60");
    expect(provider.resend).not.toHaveBeenCalled();
  });
  it("fails closed when the rate limiter is unavailable", async () => {
    const { app, provider, limit } = setup();
    limit.mockRejectedValue(Object.assign(new Error("Unavailable"), { statusCode: 503 }));
    expect(
      (await request(app).post("/login").send({ phoneNumber: "0772123456", password: "Secret123" }))
        .status,
    ).toBe(503);
    expect(provider.login).not.toHaveBeenCalled();
  });
  it("revokes the supplied bearer session and rejects unauthenticated logout", async () => {
    const { app, provider } = setup();
    expect((await request(app).post("/logout")).status).toBe(401);
    expect((await request(app).post("/logout").set("Authorization", "Bearer access")).status).toBe(
      200,
    );
    expect(provider.logout).toHaveBeenCalledWith("access");
  });
  it("does not expose provider internals", () => {
    expect(authProviderError({ status: 503 }).message).toBe(
      "Authentication provider unavailable. Please retry later.",
    );
    expect(authProviderError({ status: 429 })).toMatchObject({
      statusCode: 429,
      code: "RATE_LIMITED",
    });
  });
});
