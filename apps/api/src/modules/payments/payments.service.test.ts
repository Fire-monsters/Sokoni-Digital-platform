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
      applyReconciliation: vi.fn().mockResolvedValue({
        paymentAttemptId: attempt.id,
        status: "successful",
        outcome: "status_updated",
      }),
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
      pending: 0,
      needsReview: 0,
      failed: 0,
    });
    expect(repository.applyReconciliation).toHaveBeenCalledWith(
      attempt.id,
      expect.objectContaining({
        transactionId: "tracking-1",
        status: "successful",
      }),
      "admin_request",
      "03000000-0000-4000-8000-000000000009",
      undefined,
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
      getByMerchantReference: vi.fn().mockResolvedValue(uncertainAttempt),
      applyReconciliation: vi.fn().mockResolvedValue({
        paymentAttemptId: attempt.id,
        status: "requires_reconciliation",
        outcome: "manual_review_required",
      }),
    };
    const service = createService(repository, {});

    await expect(service.reconcileAttempt(attempt.id)).resolves.toMatchObject({
      paymentAttemptId: attempt.id,
      status: "requires_reconciliation",
      outcome: "manual_review_required",
    });
    expect(repository.applyReconciliation).toHaveBeenCalledWith(
      attempt.id,
      { errorCode: "MISSING_PROVIDER_REFERENCE" },
      "admin_request",
      undefined,
      undefined,
    );
  });

  it("rechecks terminal payments to expose provider disagreements", async () => {
    const repository = {
      getById: vi.fn().mockResolvedValue({ ...attempt, status: "successful" }),
      getByMerchantReference: vi.fn().mockResolvedValue({ ...attempt, status: "successful" }),
      applyReconciliation: vi
        .fn()
        .mockResolvedValue({ status: "successful", outcome: "manual_review_required" }),
    };
    const adapter = {
      getPaymentStatus: vi
        .fn()
        .mockResolvedValue({ status: "failed", amount: attempt.amount, currency: "UGX" }),
    };
    await createService(repository, adapter).reconcileAttempt(attempt.id, "staff", "operation");
    expect(adapter.getPaymentStatus).toHaveBeenCalled();
    expect(repository.applyReconciliation).toHaveBeenCalledWith(
      attempt.id,
      expect.objectContaining({ status: "failed" }),
      "admin_request",
      "staff",
      "operation",
    );
  });

  it("never sends market-pickup payments to Pesapal", async () => {
    const adapter = { getPaymentStatus: vi.fn() };
    const repository = {
      getById: vi.fn().mockResolvedValue({ ...attempt, provider: "market_pickup" }),
    };
    await expect(createService(repository, adapter).reconcileAttempt(attempt.id)).rejects.toThrow(
      "Market-pickup",
    );
    expect(adapter.getPaymentStatus).not.toHaveBeenCalled();
  });

  it.each([
    [
      { status: "successful", amount: 33000, currency: "UGX", providerTransactionId: "wrong" },
      "REFERENCE_MISMATCH",
    ],
    [
      { status: "successful", amount: 33000, currency: "UGX", merchantReference: "wrong" },
      "REFERENCE_MISMATCH",
    ],
    [{ status: "successful", currency: "UGX" }, "INCOMPLETE_PROVIDER_RESPONSE"],
  ])(
    "records invalid provider evidence without applying a payment transition",
    async (result, errorCode) => {
      const repository = {
        getById: vi.fn().mockResolvedValue(attempt),
        getByMerchantReference: vi.fn().mockResolvedValue(attempt),
        applyReconciliation: vi.fn(),
      };
      await createService(repository, {
        getPaymentStatus: vi.fn().mockResolvedValue(result),
      }).reconcileAttempt(attempt.id);
      expect(repository.applyReconciliation).toHaveBeenCalledWith(
        attempt.id,
        expect.objectContaining({ errorCode }),
        "admin_request",
        undefined,
        undefined,
      );
    },
  );

  it("records provider failures without leaking upstream exception secrets", async () => {
    const repository = {
      getById: vi.fn().mockResolvedValue(attempt),
      getByMerchantReference: vi.fn().mockResolvedValue(attempt),
      applyReconciliation: vi.fn(),
    };
    await createService(repository, {
      getPaymentStatus: vi.fn().mockRejectedValue(new Error("secret-token")),
    }).reconcileAttempt(attempt.id);
    expect(repository.applyReconciliation).toHaveBeenCalledWith(
      attempt.id,
      { errorCode: "PROVIDER_LOOKUP_FAILED" },
      "admin_request",
      undefined,
      undefined,
    );
  });

  it("uses durable batch membership and counts pending separately from resolved", async () => {
    const repository = {
      claimAdminBatch: vi.fn().mockResolvedValue([attempt]),
      getByMerchantReference: vi.fn().mockResolvedValue(attempt),
      applyReconciliation: vi.fn().mockResolvedValue({ status: "pending", outcome: "no_change" }),
      releaseReconciliationClaim: vi.fn(),
    };
    const adapter = {
      getPaymentStatus: vi
        .fn()
        .mockResolvedValue({ status: "pending", amount: attempt.amount, currency: "UGX" }),
    };
    await expect(
      createService(repository, adapter).reconcilePendingBatch(
        "admin_request",
        "staff",
        "operation",
      ),
    ).resolves.toEqual({ claimed: 1, resolved: 0, pending: 1, needsReview: 0, failed: 0 });
    expect(repository.claimAdminBatch).toHaveBeenCalledWith("staff", "operation", 10);
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
