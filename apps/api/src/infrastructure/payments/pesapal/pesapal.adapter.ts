import { createHash } from "node:crypto";

import type { PaymentMethod, ProviderPaymentStatus } from "@sokoni-digital/domain";

import type {
  CallbackVerificationResult,
  CollectionStatusResult,
  GetCollectionStatusInput,
  InitiateCollectionInput,
  InitiateCollectionResult,
  PaymentProviderAdapter,
  ProviderPaymentNotification,
  VerifiedCallback,
  VerifyCallbackInput,
} from "../shared/index.js";
import type { PesapalClient } from "./pesapal.client.js";
import { ipnPayloadSchema } from "./pesapal.schemas.js";

export class PesapalPaymentAdapter implements PaymentProviderAdapter {
  readonly provider = "pesapal" as const;

  constructor(private readonly client: PesapalClient) {}

  async initiatePayment(input: InitiateCollectionInput): Promise<InitiateCollectionResult> {
    if (!input.payerPhoneE164 && !input.payerEmail) {
      throw new Error("Pesapal requires a payer phone number or email address.");
    }
    const result = await this.client.submitOrder({
      id: input.merchantReference,
      amount: input.amount,
      currency: input.currency,
      description: input.description,
      callbackUrl: input.callbackUrl,
      cancellationUrl: input.cancellationUrl,
      ...(input.payerPhoneE164 === undefined ? {} : { phoneNumber: input.payerPhoneE164 }),
      ...(input.payerEmail === undefined ? {} : { emailAddress: input.payerEmail }),
      ...(input.payerFirstName === undefined ? {} : { firstName: input.payerFirstName }),
      ...(input.payerLastName === undefined ? {} : { lastName: input.payerLastName }),
    });
    return {
      accepted: true,
      providerTransactionId: result.order_tracking_id,
      providerRequestReference: result.merchant_reference,
      normalizedStatus: "pending",
      providerCode: "ORDER_CREATED",
      providerMessage: "Pesapal payment order created.",
      nextAction: { type: "redirect", url: result.redirect_url },
      rawResponse: result,
    };
  }

  async getPaymentStatus(input: GetCollectionStatusInput): Promise<CollectionStatusResult> {
    if (!input.providerTransactionId) {
      return {
        status: "unknown",
        reasonCode: "MISSING_ORDER_TRACKING_ID",
        message: "Pesapal order tracking ID is unavailable.",
        rawResponse: null,
      };
    }
    const result = await this.client.getTransactionStatus(input.providerTransactionId);
    const normalized = normalizeStatus(result.payment_status_description);
    const method = normalizeMethod(result.payment_method);
    return {
      status: normalized.status,
      amount: result.amount,
      currency: result.currency,
      providerTransactionId: input.providerTransactionId,
      merchantReference: result.merchant_reference,
      paymentMethod: method,
      ...(result.confirmation_code ? { confirmationCode: result.confirmation_code } : {}),
      ...(result.payment_account ? { paymentAccountMasked: result.payment_account } : {}),
      ...(normalized.reasonCode ? { reasonCode: normalized.reasonCode } : {}),
      ...(result.description ? { message: result.description } : {}),
      rawResponse: result,
    };
  }

  verifyCallback(input: VerifyCallbackInput): Promise<CallbackVerificationResult> {
    try {
      const parsed: unknown = JSON.parse(input.rawBody.toString("utf8"));
      const result = ipnPayloadSchema.safeParse(parsed);
      if (!result.success) return Promise.resolve({ valid: false, reason: "INVALID_PAYLOAD" });
      return Promise.resolve({ valid: true, rawBody: input.rawBody, parsedPayload: result.data });
    } catch {
      return Promise.resolve({ valid: false, reason: "INVALID_PAYLOAD" });
    }
  }

  parseNotification(input: VerifiedCallback): ProviderPaymentNotification {
    const payload = ipnPayloadSchema.parse(input.parsedPayload);
    return {
      provider: this.provider,
      providerEventId: `${payload.OrderNotificationType}:${payload.OrderTrackingId}:${payload.OrderMerchantReference}`,
      providerTransactionId: payload.OrderTrackingId,
      merchantReference: payload.OrderMerchantReference,
      rawPayloadHash: createHash("sha256").update(input.rawBody).digest("hex"),
    };
  }
}

function normalizeStatus(value: string): { status: ProviderPaymentStatus; reasonCode?: string } {
  switch (value.trim().toUpperCase()) {
    case "COMPLETED":
      return { status: "successful" };
    case "FAILED":
      return { status: "failed" };
    case "PENDING":
      return { status: "pending" };
    case "INVALID":
      return { status: "unknown", reasonCode: "PESAPAL_INVALID" };
    case "REVERSED":
      return { status: "unknown", reasonCode: "PESAPAL_REVERSED" };
    default:
      return { status: "unknown", reasonCode: "PESAPAL_UNRECOGNIZED_STATUS" };
  }
}

function normalizeMethod(value: string | null | undefined): PaymentMethod {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (normalized.includes("mtn")) return "mtn_momo";
  if (normalized.includes("airtel")) return "airtel_money";
  if (normalized.includes("visa")) return "visa";
  if (normalized.includes("mastercard") || normalized.includes("master card")) return "mastercard";
  if (normalized.includes("card")) return "card";
  if (normalized.includes("bank")) return "bank";
  return "unknown";
}
