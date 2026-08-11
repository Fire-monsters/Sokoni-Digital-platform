import { describe, expect, it, vi } from "vitest";

import { PesapalClient } from "./pesapal.client.js";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("PesapalClient", () => {
  it("caches the short-lived token and submits a normalized order", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          token: "token-1",
          expiryDate: new Date(Date.now() + 300_000).toISOString(),
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          order_tracking_id: "tracking-1",
          merchant_reference: "EK-P-1",
          redirect_url: "https://cybqa.pesapal.com/pay/tracking-1",
          error: null,
          status: "200",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          payment_method: "MTN Mobile Money",
          amount: 33000,
          created_date: "2026-08-10T10:00:00Z",
          confirmation_code: "CONFIRM-1",
          payment_status_description: "COMPLETED",
          description: "Completed",
          message: "Processed",
          payment_account: "25677***456",
          merchant_reference: "EK-P-1",
          currency: "UGX",
          error: null,
          status: "200",
        }),
      );
    const client = new PesapalClient({
      baseUrl: "https://cybqa.pesapal.com/pesapalv3",
      consumerKey: "consumer-key",
      consumerSecret: "consumer-secret",
      notificationId: "00000000-0000-4000-8000-000000000001",
      fetchImplementation,
    });

    await client.submitOrder({
      id: "EK-P-1",
      amount: 33000,
      currency: "UGX",
      description: "Checkout",
      callbackUrl: "https://api.example.test/return",
      cancellationUrl: "https://api.example.test/cancel",
      phoneNumber: "+256772123456",
    });
    await client.getTransactionStatus("tracking-1");

    expect(fetchImplementation).toHaveBeenCalledTimes(3);
    const rawSubmitBody = fetchImplementation.mock.calls[1]?.[1]?.body;
    expect(typeof rawSubmitBody).toBe("string");
    const submitBody = JSON.parse(rawSubmitBody as string) as Record<string, unknown>;
    expect(submitBody).toMatchObject({
      id: "EK-P-1",
      amount: 33000,
      currency: "UGX",
      notification_id: "00000000-0000-4000-8000-000000000001",
    });
  });

  it("marks a submit timeout as ambiguous", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          token: "token-1",
          expiryDate: new Date(Date.now() + 300_000).toISOString(),
        }),
      )
      .mockRejectedValueOnce(new DOMException("request timed out", "TimeoutError"));
    const client = new PesapalClient({
      baseUrl: "https://cybqa.pesapal.com/pesapalv3",
      consumerKey: "consumer-key",
      consumerSecret: "consumer-secret",
      notificationId: "00000000-0000-4000-8000-000000000001",
      fetchImplementation,
    });

    await expect(
      client.submitOrder({
        id: "EK-P-1",
        amount: 33000,
        currency: "UGX",
        description: "Checkout",
        callbackUrl: "https://api.example.test/return",
        cancellationUrl: "https://api.example.test/cancel",
        emailAddress: "payer@example.test",
      }),
    ).rejects.toMatchObject({ ambiguous: true });
  });

  it("marks a status-query timeout as non-ambiguous because it cannot create a charge", async () => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          token: "token-1",
          expiryDate: new Date(Date.now() + 300_000).toISOString(),
        }),
      )
      .mockRejectedValueOnce(new DOMException("request timed out", "TimeoutError"));
    const client = new PesapalClient({
      baseUrl: "https://cybqa.pesapal.com/pesapalv3",
      consumerKey: "consumer-key",
      consumerSecret: "consumer-secret",
      notificationId: "00000000-0000-4000-8000-000000000001",
      fetchImplementation,
    });

    await expect(client.getTransactionStatus("tracking-1")).rejects.toMatchObject({
      ambiguous: false,
    });
  });
});
