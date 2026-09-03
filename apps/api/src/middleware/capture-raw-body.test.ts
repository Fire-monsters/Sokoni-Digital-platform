import type { Request, Response } from "express";
import { describe, expect, it } from "vitest";

import { captureSignedWebhookRawBody } from "./capture-raw-body.js";

describe("captureSignedWebhookRawBody", () => {
  it("retains the exact Pesapal callback bytes before JSON parsing", () => {
    const rawBody = Buffer.from(`{
  "OrderTrackingId": "tracking-1",
  "OrderMerchantReference": "EK-P-1",
  "OrderNotificationType": "IPNCHANGE"
}`);
    const request = {
      originalUrl: "/v1/payments/callbacks/pesapal?source=pesapal",
    } as Request;

    captureSignedWebhookRawBody(request, {} as Response, rawBody);

    expect(request.rawBody).toEqual(rawBody);
    expect(request.rawBody).not.toBe(rawBody);
  });

  it("retains the exact Supabase Send SMS hook bytes", () => {
    const rawBody = Buffer.from('{"sms":{"otp":"123456"}}');
    const request = { originalUrl: "/v1/auth/hooks/send-sms" } as Request;

    captureSignedWebhookRawBody(request, {} as Response, rawBody);

    expect(request.rawBody).toEqual(rawBody);
  });

  it("does not retain bodies for unrelated endpoints", () => {
    const request = { originalUrl: "/v1/checkouts" } as Request;

    captureSignedWebhookRawBody(request, {} as Response, Buffer.from("{}"));

    expect(request.rawBody).toBeUndefined();
  });
});
