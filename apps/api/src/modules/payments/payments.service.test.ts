import type { ServerEnvironment } from "@sokoni-digital/config";
import { describe, expect, it, vi } from "vitest";

import type { PaymentProviderAdapter } from "../../infrastructure/payments/shared/index.js";
import type { PaymentProviderRegistry } from "./payment-provider.registry.js";
import type { PaymentAttemptRecord, PaymentsRepository } from "./payments.repository.js";
import { PaymentsService } from "./payments.service.js";

const attempt: PaymentAttemptRecord = {
  id: "b3000000-0000-4000-8000-000000000001",
  checkoutId: "93000000-0000-4000-8000-000000000001",
  consumerId: "03000000-0000-4000-8000-000000000001",
  provider: "pesapal",
  paymentMethod: null,
  status: "pending",
  amount: 33_000,
  currency: "UGX",
  payerPhoneE164: "+256772123456",
  merchantReference: "EK-P-1",
  providerTransactionId: "tracking-1",
  redirectUrl: "https://pay.example.test/tracking-1",
  failureCode: null,
  failureMessage: null,
  expiresAt: "2026-08-10T15:00:00.000Z",
  createdAt: "2026-08-10T14:00:00.000Z",
  updatedAt: "2026-08-10T14:00:00.000Z",
};

describe("PaymentsService reconciliation", () => {
  it("creates pay-at-pickup without calling a digital provider", async () => {
    const pickupAttempt = {
      ...attempt,
      provider: "market_pickup" as const,
      paymentMethod: "market_pickup" as const,
      providerTransactionId: null,
      redirectUrl: null,
    };
    const repository = {
      createMarketPickupAttempt: vi.fn().mockResolvedValue(pickupAttempt),
    };
    const adapter = { initiatePayment: vi.fn() };
    const service = createService(repository, adapter);

    await expect(
      service.initiate(attempt.consumerId, attempt.checkoutId, { provider: "market_pickup" }),
    ).resolves.toMatchObject({
      provider: "market_pickup",
      paymentMethod: "market_pickup",
      status: "pending",
      nextAction: { type: "none" },
    });
    expect(adapter.initiatePayment).not.toHaveBeenCalled();
  });

  it("passes operational actor scope and the idempotent collection contract to PostgreSQL", async () => {
    const repository = {
      recordMarketPickupPayment: vi.fn().mockResolvedValue({
        paymentAttemptId: attempt.id,
        checkoutId: attempt.checkoutId,
        status: "successful",
        duplicate: false,
      }),
    };
    const service = createService(repository, {});

    await service.recordMarketPickupPayment(
      "05000000-0000-4000-8000-000000000009",
      ["agent"],
      attempt.checkoutId,
      {
        amountReceived: 33_000,
        currency: "UGX",
        paymentMethod: "cash",
        pickupCode: "483921",
        operationId: "f5000000-0000-4000-8000-000000000009",
      },
    );

    expect(repository.recordMarketPickupPayment).toHaveBeenCalledWith({
      actorId: "05000000-0000-4000-8000-000000000009",
      actorIsOperations: true,
      checkoutId: attempt.checkoutId,
      amountReceived: 33_000,
      currency: "UGX",
      paymentMethod: "cash",
      pickupCode: "483921",
      operationId: "f5000000-0000-4000-8000-000000000009",
    });
  });

  it("uses the normalized provider-result pipeline for an admin batch", async () => {
    const repository = {
      claimReconciliationBatch: vi.fn().mockResolvedValue([attempt]),
      getByMerchantReference: vi.fn().mockResolvedValue(attempt),
      recordReconciliation: vi.fn().mockResolvedValue(undefined),
      processResult: vi
        .fn()
        .mockResolvedValue({ paymentAttemptId: attempt.id, status: "successful" }),
      releaseReconciliationClaim: vi.fn().mockResolvedValue(undefined),
    };
    const adapter = {
      getPaymentStatus: vi.fn().mockResolvedValue({
        status: "successful",
        amount: 33_000,
        currency: "UGX",
        merchantReference: "EK-P-1",
        paymentMethod: "mtn_momo",
        rawResponse: { payment_status_description: "COMPLETED" },
      }),
    };
    const service = createService(repository, adapter);

    await expect(
      service.reconcilePendingBatch("admin_request", "03000000-0000-4000-8000-000000000009"),
    ).resolves.toEqual({
      claimed: 1,
      resolved: 1,
      failed: 0,
    });
    expect(repository.recordReconciliation).toHaveBeenCalledWith(
      expect.objectContaining({
        runSource: "admin_request",
        requestedBy: "03000000-0000-4000-8000-000000000009",
        result: "status_updated",
      }),
    );
    expect(repository.processResult).toHaveBeenCalledWith(
      expect.objectContaining({
        merchantReference: "EK-P-1",
        providerTransactionId: "tracking-1",
        status: "successful",
      }),
    );
    expect(repository.releaseReconciliationClaim).toHaveBeenCalledWith(attempt.id, 30);
  });

  it("acknowledges a semantic duplicate callback without querying or applying it again", async () => {
    const rawBody = Buffer.from(
      JSON.stringify({
        OrderTrackingId: "tracking-1",
        OrderMerchantReference: "EK-P-1",
        OrderNotificationType: "IPNCHANGE",
      }),
    );
    const repository = {
      recordProviderEvent: vi.fn().mockResolvedValue({ id: "event-1", duplicate: true }),
      finishProviderEvent: vi.fn(),
    };
    const adapter = {
      verifyCallback: vi.fn().mockResolvedValue({
        valid: true,
        rawBody,
        parsedPayload: {},
      }),
      parseNotification: vi.fn().mockReturnValue({
        provider: "pesapal",
        providerEventId: "IPNCHANGE:tracking-1:EK-P-1",
        providerTransactionId: "tracking-1",
        merchantReference: "EK-P-1",
        rawPayloadHash: "a".repeat(64),
      }),
      getPaymentStatus: vi.fn(),
    };
    const service = createService(repository, adapter);

    await expect(
      service.processNotification(
        {
          OrderTrackingId: "tracking-1",
          OrderMerchantReference: "EK-P-1",
          OrderNotificationType: "IPNCHANGE",
        },
        rawBody,
        { "content-type": "application/json" },
      ),
    ).resolves.toEqual({ duplicate: true });
    expect(adapter.getPaymentStatus).not.toHaveBeenCalled();
    expect(repository.finishProviderEvent).not.toHaveBeenCalled();
  });

  it("records manual review when an ambiguous initiation has no tracking ID", async () => {
    const uncertainAttempt = {
      ...attempt,
      status: "requires_reconciliation" as const,
      providerTransactionId: null,
    };
    const repository = {
      getById: vi.fn().mockResolvedValue(uncertainAttempt),
      recordReconciliation: vi.fn().mockResolvedValue(undefined),
    };
    const service = createService(repository, {});

    await expect(service.reconcileAttempt(attempt.id)).resolves.toMatchObject({
      paymentAttemptId: attempt.id,
      status: "requires_reconciliation",
      outcome: "manual_review_required",
    });
    expect(repository.recordReconciliation).toHaveBeenCalledWith(
      expect.objectContaining({
        providerStatus: "unknown",
        result: "manual_review_required",
        runSource: "admin_request",
      }),
    );
  });
});

function createService(repository: object, adapter: object): PaymentsService {
  const registry = { get: () => adapter as PaymentProviderAdapter };
  const environment = { PAYMENT_RECONCILIATION_BATCH_SIZE: 10 };
  return new PaymentsService(
    repository as PaymentsRepository,
    registry as unknown as PaymentProviderRegistry,
    environment as unknown as ServerEnvironment,
  );
}
