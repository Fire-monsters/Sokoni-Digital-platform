import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { PesapalPaymentAdapter } from "./pesapal.adapter.js";
import type { PesapalClient } from "./pesapal.client.js";

describe("PesapalPaymentAdapter", () => {
  it("returns a redirect next action for accepted orders", async () => {
    const client = {
      submitOrder: vi.fn().mockResolvedValue({
        order_tracking_id: "tracking-1",
        merchant_reference: "EK-P-1",
        redirect_url: "https://pay.pesapal.test/order/1",
      }),
    } as unknown as PesapalClient;
    const adapter = new PesapalPaymentAdapter(client);

    await expect(
      adapter.initiatePayment({
        paymentAttemptId: "attempt-1",
        merchantReference: "EK-P-1",
        amount: 33000,
        currency: "UGX",
        payerPhoneE164: "+256772123456",
        description: "Checkout",
        callbackUrl: "https://api.example.test/return",
        cancellationUrl: "https://api.example.test/cancel",
      }),
    ).resolves.toMatchObject({
      accepted: true,
      normalizedStatus: "pending",
      providerTransactionId: "tracking-1",
      nextAction: { type: "redirect", url: "https://pay.pesapal.test/order/1" },
    });
  });

  it.each([
    ["COMPLETED", "successful", "MTN Mobile Money", "mtn_momo"],
    ["FAILED", "failed", "Airtel Money", "airtel_money"],
    ["PENDING", "pending", "Visa", "visa"],
    ["REVERSED", "unknown", "Mastercard", "mastercard"],
  ])(
    "normalizes Pesapal %s without leaking provider vocabulary",
    async (providerStatus, expected, method, expectedMethod) => {
      const client = {
        getTransactionStatus: vi.fn().mockResolvedValue({
          payment_method: method,
          amount: 33000,
          confirmation_code: "CONFIRM-1",
          payment_status_description: providerStatus,
          description: providerStatus,
          payment_account: "masked",
          merchant_reference: "EK-P-1",
          currency: "UGX",
        }),
      } as unknown as PesapalClient;
      const adapter = new PesapalPaymentAdapter(client);

      await expect(
        adapter.getPaymentStatus({
          providerTransactionId: "tracking-1",
          merchantReference: "EK-P-1",
        }),
      ).resolves.toMatchObject({
        status: expected,
        paymentMethod: expectedMethod,
        amount: 33000,
        currency: "UGX",
      });
    },
  );

  it("accepts only a shaped IPN and converts it to a reference notification", async () => {
    const adapter = new PesapalPaymentAdapter({} as PesapalClient);
    const rawBody = Buffer.from(
      JSON.stringify({
        OrderTrackingId: "tracking-1",
        OrderMerchantReference: "EK-P-1",
        OrderNotificationType: "IPNCHANGE",
      }),
    );
    const verified = await adapter.verifyCallback({ rawBody, headers: {}, receivedAt: new Date() });

    expect(verified.valid).toBe(true);
    if (!verified.valid) throw new Error("Expected valid IPN.");
    expect(adapter.parseNotification(verified)).toEqual({
      provider: "pesapal",
      providerEventId: "IPNCHANGE:tracking-1:EK-P-1",
      providerTransactionId: "tracking-1",
      merchantReference: "EK-P-1",
      rawPayloadHash: createHash("sha256").update(rawBody).digest("hex"),
    });
  });
});
