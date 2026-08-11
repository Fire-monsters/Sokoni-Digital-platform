import type { PaymentProviderAdapter } from "../../infrastructure/payments/shared/index.js";
import { PesapalRequestError } from "../../infrastructure/payments/pesapal/index.js";
import type { ServerEnvironment } from "@sokoni-digital/config";

import type { PaymentProviderRegistry } from "./payment-provider.registry.js";
import type {
  InitiatePaymentInput,
  MarketPickupPaymentInput,
  PesapalNotificationInput,
} from "./payments.schemas.js";
import { PaymentProviderUnavailableError, PaymentRejectedError } from "./payments.errors.js";
import type { PaymentAttemptRecord, PaymentsRepository } from "./payments.repository.js";

type ReconciliationSource =
  "consumer_status_check" | "callback_recovery" | "scheduled_job" | "admin_request";

export class PaymentsService {
  constructor(
    private readonly repository: PaymentsRepository,
    private readonly registry: PaymentProviderRegistry,
    private readonly environment: ServerEnvironment,
  ) {}

  async initiate(consumerId: string, checkoutId: string, input: InitiatePaymentInput) {
    if (input.provider === "market_pickup") {
      return paymentView(await this.repository.createMarketPickupAttempt(consumerId, checkoutId));
    }
    const attempt = await this.repository.createAttempt(
      consumerId,
      checkoutId,
      input.payerPhone,
      this.environment.PAYMENT_MAX_ATTEMPTS,
      this.environment.PAYMENT_PENDING_MAX_MINUTES,
    );
    const adapter = this.registry.get("pesapal");
    const returnUrl = `${this.environment.PAYMENT_CALLBACK_BASE_URL}/returns/pesapal`;
    const cancellationUrl = new URL(`${returnUrl}/cancel`);
    cancellationUrl.searchParams.set("merchantReference", attempt.merchantReference);

    try {
      const result = await adapter.initiatePayment({
        paymentAttemptId: attempt.id,
        merchantReference: attempt.merchantReference,
        amount: attempt.amount,
        currency: "UGX",
        ...(input.payerPhone === undefined ? {} : { payerPhoneE164: input.payerPhone }),
        ...(input.payerEmail === undefined ? {} : { payerEmail: input.payerEmail }),
        ...(input.payerFirstName === undefined ? {} : { payerFirstName: input.payerFirstName }),
        ...(input.payerLastName === undefined ? {} : { payerLastName: input.payerLastName }),
        description: `E-Katale checkout ${attempt.checkoutId}`,
        callbackUrl: returnUrl,
        cancellationUrl: cancellationUrl.toString(),
      });

      if (
        !result.accepted ||
        !result.providerTransactionId ||
        result.nextAction.type !== "redirect"
      ) {
        await this.repository.markInitiationFailed(
          attempt.id,
          result.providerCode ?? "PROVIDER_REJECTED",
          result.providerMessage ?? "Pesapal rejected the payment order.",
        );
        throw new PaymentRejectedError(
          result.providerMessage ?? "Pesapal rejected the payment order.",
        );
      }

      await this.repository.markPending(
        attempt.id,
        result.providerTransactionId,
        result.providerRequestReference,
        result.nextAction.url,
      );
      return paymentView({
        ...attempt,
        status: "pending",
        providerTransactionId: result.providerTransactionId,
        redirectUrl: result.nextAction.url,
      });
    } catch (cause) {
      if (cause instanceof PaymentRejectedError) throw cause;
      const ambiguous = !(cause instanceof PesapalRequestError) || cause.ambiguous;
      if (ambiguous) {
        await this.repository.markUncertain(
          attempt.id,
          "PESAPAL_INITIATION_UNCERTAIN",
          safeProviderMessage(cause),
        );
      } else {
        await this.repository.markInitiationFailed(
          attempt.id,
          "PESAPAL_INITIATION_FAILED",
          safeProviderMessage(cause),
        );
      }
      throw new PaymentProviderUnavailableError(
        ambiguous
          ? "We could not confirm whether Pesapal created the payment. Do not pay again yet; E-Katale will keep checking."
          : "Pesapal could not create the payment. Please try again.",
      );
    }
  }

  async get(consumerId: string, paymentAttemptId: string) {
    return paymentView(await this.repository.getOwned(consumerId, paymentAttemptId));
  }

  async recordMarketPickupPayment(
    actorId: string,
    actorRoles: string[],
    checkoutId: string,
    input: MarketPickupPaymentInput,
  ) {
    return this.repository.recordMarketPickupPayment({
      actorId,
      actorIsOperations: actorRoles.some((role) => role === "admin" || role === "agent"),
      checkoutId,
      ...input,
    });
  }

  async processNotification(
    input: PesapalNotificationInput,
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
    requestId?: string,
  ) {
    const adapter = this.registry.get("pesapal");
    const verification = await adapter.verifyCallback({ rawBody, headers, receivedAt: new Date() });
    if (!verification.valid) throw new PaymentRejectedError("Pesapal IPN payload is invalid.");
    const notification = adapter.parseNotification(verification);
    const event = await this.repository.recordProviderEvent({
      provider: notification.provider,
      ...(notification.providerEventId === undefined
        ? {}
        : { providerEventId: notification.providerEventId }),
      providerTransactionId: notification.providerTransactionId,
      merchantReference: notification.merchantReference,
      payload: input,
      payloadHash: notification.rawPayloadHash,
      ...(requestId === undefined ? {} : { requestId }),
      headersRedacted: redactHeaders(headers),
    });
    if (event.duplicate) {
      return { duplicate: true };
    }

    try {
      await this.resolveWithProvider(
        notification.merchantReference,
        notification.providerTransactionId,
        adapter,
        "callback_recovery",
        event.id,
      );
      await this.repository.finishProviderEvent(event.id, "processed", undefined, true);
      return { duplicate: false };
    } catch (cause) {
      await this.repository.finishProviderEvent(event.id, "failed");
      throw cause;
    }
  }

  async processBrowserReturn(merchantReference: string, providerTransactionId: string) {
    const adapter = this.registry.get("pesapal");
    try {
      return await this.resolveWithProvider(
        merchantReference,
        providerTransactionId,
        adapter,
        "consumer_status_check",
      );
    } catch {
      const attempt = await this.repository.getByMerchantReference(merchantReference);
      return { paymentAttemptId: attempt.id, status: attempt.status };
    }
  }

  async getAttemptByReference(merchantReference: string) {
    return this.repository.getByMerchantReference(merchantReference);
  }

  async getReconciliationOverview(limit: number) {
    return this.repository.getReconciliationOverview(limit);
  }

  async reconcileAttempt(paymentAttemptId: string, requestedBy?: string) {
    const attempt = await this.repository.getById(paymentAttemptId);
    if (["successful", "failed", "cancelled", "expired"].includes(attempt.status)) {
      return { paymentAttemptId: attempt.id, status: attempt.status, unchanged: true };
    }
    if (!attempt.providerTransactionId) {
      await this.repository.recordReconciliation({
        attempt,
        providerStatus: "unknown",
        result: "manual_review_required",
        providerResponse: { error: "Missing Pesapal order tracking ID." },
        runSource: "admin_request",
        ...(requestedBy === undefined ? {} : { requestedBy }),
      });
      return {
        paymentAttemptId: attempt.id,
        status: attempt.status,
        outcome: "manual_review_required" as const,
      };
    }
    try {
      return await this.resolveWithProvider(
        attempt.merchantReference,
        attempt.providerTransactionId,
        this.registry.get("pesapal"),
        "admin_request",
        undefined,
        requestedBy,
      );
    } catch (cause) {
      await this.repository.recordReconciliation({
        attempt,
        providerStatus: "unknown",
        result: "manual_review_required",
        providerResponse: { error: safeProviderMessage(cause) },
        runSource: "admin_request",
        ...(requestedBy === undefined ? {} : { requestedBy }),
      });
      throw cause;
    }
  }

  async reconcilePendingBatch(
    runSource: "scheduled_job" | "admin_request" = "scheduled_job",
    requestedBy?: string,
  ): Promise<{ claimed: number; resolved: number; failed: number }> {
    const attempts = await this.repository.claimReconciliationBatch(
      this.environment.PAYMENT_RECONCILIATION_BATCH_SIZE,
    );
    let resolved = 0;
    let failed = 0;
    const adapter = this.registry.get("pesapal");
    for (const attempt of attempts) {
      try {
        if (!attempt.providerTransactionId) throw new Error("Missing Pesapal order tracking ID.");
        await this.resolveWithProvider(
          attempt.merchantReference,
          attempt.providerTransactionId,
          adapter,
          runSource,
          undefined,
          requestedBy,
        );
        resolved += 1;
        await this.repository.releaseReconciliationClaim(attempt.id, 30);
      } catch (cause) {
        failed += 1;
        await this.repository.recordReconciliation({
          attempt,
          providerStatus: "unknown",
          result: "manual_review_required",
          providerResponse: { error: safeProviderMessage(cause) },
          runSource,
          ...(requestedBy === undefined ? {} : { requestedBy }),
        });
        await this.repository.releaseReconciliationClaim(attempt.id, 60);
      }
    }
    return { claimed: attempts.length, resolved, failed };
  }

  private async resolveWithProvider(
    merchantReference: string,
    transactionId: string,
    adapter: PaymentProviderAdapter,
    runSource: ReconciliationSource,
    providerEventId?: string,
    requestedBy?: string,
  ) {
    const attempt = await this.repository.getByMerchantReference(merchantReference);
    if (attempt.providerTransactionId && attempt.providerTransactionId !== transactionId) {
      throw new PaymentRejectedError(
        "Pesapal transaction reference does not match the payment attempt.",
      );
    }
    const providerResult = await adapter.getPaymentStatus({
      providerTransactionId: transactionId,
      merchantReference,
    });
    if (
      providerResult.merchantReference &&
      providerResult.merchantReference !== merchantReference
    ) {
      throw new PaymentRejectedError("Pesapal returned a different merchant reference.");
    }
    if (providerResult.amount === undefined || providerResult.currency === undefined) {
      throw new PaymentProviderUnavailableError("Pesapal returned an incomplete payment status.");
    }

    const mismatch =
      providerResult.amount !== attempt.amount || providerResult.currency !== attempt.currency;
    await this.repository.recordReconciliation({
      attempt,
      providerStatus: providerResult.status,
      result: mismatch
        ? "amount_mismatch"
        : providerResult.status === "pending"
          ? "no_change"
          : "status_updated",
      providerAmount: providerResult.amount,
      providerCurrency: providerResult.currency,
      providerResponse: providerResult.rawResponse,
      runSource,
      ...(requestedBy === undefined ? {} : { requestedBy }),
    });
    return this.repository.processResult({
      provider: "pesapal",
      providerTransactionId: transactionId,
      merchantReference,
      status: providerResult.status,
      amount: providerResult.amount,
      currency: providerResult.currency,
      ...(providerResult.paymentMethod === undefined
        ? {}
        : { paymentMethod: providerResult.paymentMethod }),
      ...(providerEventId === undefined ? {} : { providerEventId }),
      ...(providerResult.confirmationCode === undefined
        ? {}
        : { confirmationCode: providerResult.confirmationCode }),
      ...(providerResult.reasonCode === undefined ? {} : { reasonCode: providerResult.reasonCode }),
      ...(providerResult.message === undefined ? {} : { message: providerResult.message }),
    });
  }
}

function paymentView(attempt: PaymentAttemptRecord) {
  const terminal = ["successful", "failed", "cancelled", "expired"].includes(attempt.status);
  return {
    paymentAttemptId: attempt.id,
    checkoutId: attempt.checkoutId,
    provider: attempt.provider,
    paymentMethod: attempt.paymentMethod,
    status: attempt.status,
    amount: attempt.amount,
    currency: attempt.currency,
    payerPhoneMasked: maskPhone(attempt.payerPhoneE164),
    merchantReference: attempt.merchantReference,
    failure:
      attempt.failureCode || attempt.failureMessage
        ? { code: attempt.failureCode, message: attempt.failureMessage }
        : null,
    expiresAt: attempt.expiresAt,
    nextAction:
      !terminal && attempt.redirectUrl
        ? { type: "redirect", url: attempt.redirectUrl }
        : { type: "none" },
    nextPollAfterSeconds: 5,
    createdAt: attempt.createdAt,
    updatedAt: attempt.updatedAt,
  };
}

function maskPhone(value: string | null): string | null {
  if (!value || value.length < 8) return null;
  return `${value.slice(0, 6)}***${value.slice(-3)}`;
}

function safeProviderMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message.slice(0, 500) : "Unknown Pesapal error";
}

function redactHeaders(headers: Record<string, string | string[] | undefined>) {
  const allowed = ["content-type", "user-agent", "x-request-id"];
  return Object.fromEntries(
    allowed.flatMap((name) => {
      const value = headers[name];
      return value === undefined ? [] : [[name, Array.isArray(value) ? value.join(",") : value]];
    }),
  );
}
