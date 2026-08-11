import type { Request, Response } from "express";
import { describe, expect, it } from "vitest";

import { capturePaymentCallbackRawBody } from "./capture-raw-body.js";

describe("capturePaymentCallbackRawBody", () => {
  it("retains the exact Pesapal callback bytes before JSON parsing", () => {
    const rawBody = Buffer.from(`{
  "OrderTrackingId": "tracking-1",
  "OrderMerchantReference": "EK-P-1",
  "OrderNotificationType": "IPNCHANGE"
}`);
    const request = {
      originalUrl: "/v1/payments/callbacks/pesapal?source=pesapal",
    } as Request;

    capturePaymentCallbackRawBody(request, {} as Response, rawBody);

    expect(request.rawBody).toEqual(rawBody);
    expect(request.rawBody).not.toBe(rawBody);
  });

  it("does not retain bodies for unrelated endpoints", () => {
    const request = { originalUrl: "/v1/checkouts" } as Request;

    capturePaymentCallbackRawBody(request, {} as Response, Buffer.from("{}"));

    expect(request.rawBody).toBeUndefined();
  });
});
