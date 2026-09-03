import { createHmac } from "node:crypto";

import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import type { SmsAdapter } from "../../infrastructure/messaging/index.js";
import { captureSignedWebhookRawBody } from "../../middleware/capture-raw-body.js";
import { createAuthHookRouter } from "./send-sms-hook.routes.js";

const secretBytes = Buffer.from("a sufficiently long route test secret", "utf8");
const hookSecret = `v1,whsec_${secretBytes.toString("base64")}`;

function createServer(smsAdapter: SmsAdapter): express.Express {
  const server = express();
  server.use(express.json({ verify: captureSignedWebhookRawBody }));
  server.use("/v1/auth", createAuthHookRouter({ smsAdapter, hookSecret }));
  return server;
}

function signedHeaders(body: string): Record<string, string> {
  const id = "msg_route_test";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", secretBytes)
    .update(Buffer.from(`${id}.${timestamp}.${body}`))
    .digest("base64");
  return {
    "webhook-id": id,
    "webhook-timestamp": timestamp,
    "webhook-signature": `v1,${signature}`,
  };
}

describe("POST /v1/auth/hooks/send-sms", () => {
  it("verifies the hook and sends the Supabase OTP through Yoola", async () => {
    const send = vi.fn<SmsAdapter["send"]>().mockResolvedValue({ providerReference: "YL-1" });
    const body = JSON.stringify({ user: { phone: "+256704487563" }, sms: { otp: "561166" } });

    const response = await request(createServer({ send }))
      .post("/v1/auth/hooks/send-sms")
      .set(signedHeaders(body))
      .set("content-type", "application/json")
      .send(body);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({});
    expect(send).toHaveBeenCalledWith("+256704487563", {
      title: "Sokoni Digital verification code",
      body: "Your Sokoni Digital verification code is 561166.",
      data: { purpose: "authentication" },
    });
  });

  it("rejects an unsigned request without contacting Yoola", async () => {
    const send = vi.fn<SmsAdapter["send"]>();

    const response = await request(createServer({ send }))
      .post("/v1/auth/hooks/send-sms")
      .send({ user: { phone: "+256704487563" }, sms: { otp: "561166" } });

    expect(response.status).toBe(401);
    expect(send).not.toHaveBeenCalled();
  });
});
