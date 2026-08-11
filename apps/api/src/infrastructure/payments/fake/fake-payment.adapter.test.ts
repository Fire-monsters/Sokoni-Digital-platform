import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { FakePaymentAdapter } from "./fake-payment.adapter.js";

const callbackSecret = "fake-callback-secret-for-tests";

function initiationInput() {
  return {
    paymentAttemptId: "90000000-0000-4000-8000-000000000001",
    merchantReference: "EK-P-0000001",
    amount: 33_000,
    currency: "UGX" as const,
    payerPhoneE164: "+256772123456",
    description: "E-Katale checkout EK-2026-000001",
    callbackUrl: "https://api.example.test/v1/payments/callbacks/fake",
    cancellationUrl: "https://api.example.test/v1/payments/returns/fake/cancel",
  };
}

describe("FakePaymentAdapter", () => {
  it("accepts a valid collection asynchronously and safely replays its reference", async () => {
    const adapter = new FakePaymentAdapter({ callbackSecret });

    const first = await adapter.initiatePayment(initiationInput());
    const replay = await adapter.initiatePayment(initiationInput());

    expect(first).toMatchObject({ accepted: true, normalizedStatus: "pending" });
    expect(replay.providerTransactionId).toBe(first.providerTransactionId);
  });

  it("reports deterministic pending and successful statuses", async () => {
    const adapter = new FakePaymentAdapter({ callbackSecret });
    const input = initiationInput();
    await adapter.initiatePayment(input);

    expect(
      await adapter.getPaymentStatus({ merchantReference: input.merchantReference }),
    ).toMatchObject({
      status: "pending",
      amount: 33_000,
      currency: "UGX",
    });

    adapter.resolveCollection(input.merchantReference, "successful");
    expect(
      await adapter.getPaymentStatus({ merchantReference: input.merchantReference }),
    ).toMatchObject({
      status: "successful",
    });
  });

  it("returns unknown rather than guessing when a collection is absent", async () => {
    const adapter = new FakePaymentAdapter({ callbackSecret });

    await expect(adapter.getPaymentStatus({ merchantReference: "missing" })).resolves.toMatchObject(
      {
        status: "unknown",
        reasonCode: "NOT_FOUND",
      },
    );
  });

  it("rejects invalid callback signatures before parsing", async () => {
    const adapter = new FakePaymentAdapter({ callbackSecret });
    const rawBody = Buffer.from("{}", "utf8");

    await expect(
      adapter.verifyCallback({
        rawBody,
        headers: { "content-type": "application/json", "x-fake-signature": "0".repeat(64) },
        receivedAt: new Date(),
      }),
    ).resolves.toEqual({ valid: false, reason: "INVALID_SIGNATURE" });
  });

  it("normalizes an authenticated callback and hashes the exact body", async () => {
    const adapter = new FakePaymentAdapter({ callbackSecret, provider: "pesapal" });
    const rawBody = Buffer.from(
      JSON.stringify({
        eventId: "event-1",
        providerTransactionId: "airtel-transaction-1",
        merchantReference: "EK-P-0000001",
        status: "successful",
        amount: 33_000,
        currency: "UGX",
        occurredAt: "2026-08-10T10:00:00.000Z",
      }),
      "utf8",
    );
    const verified = await adapter.verifyCallback({
      rawBody,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "x-fake-signature": adapter.signCallback(rawBody),
      },
      receivedAt: new Date(),
    });

    expect(verified.valid).toBe(true);
    if (!verified.valid) throw new Error("Expected callback verification to succeed.");
    expect(adapter.parseNotification(verified)).toEqual({
      provider: "pesapal",
      providerTransactionId: "airtel-transaction-1",
      merchantReference: "EK-P-0000001",
      providerEventId: "event-1",
      rawPayloadHash: createHash("sha256").update(rawBody).digest("hex"),
    });
  });

  it("can model a definitive initiation rejection", async () => {
    const adapter = new FakePaymentAdapter({ callbackSecret, rejectInitiation: true });

    await expect(adapter.initiatePayment(initiationInput())).resolves.toMatchObject({
      accepted: false,
      normalizedStatus: "failed",
      providerCode: "FAKE_REJECTED",
    });
  });
});
