import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type { PaymentProvider, ProviderPaymentStatus } from "@sokoni-digital/domain";

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

interface FakeCollection {
  merchantReference: string;
  providerTransactionId: string;
  amount: number;
  currency: "UGX";
  payerPhone: string | undefined;
  status: ProviderPaymentStatus;
  reasonCode: string | undefined;
  message: string | undefined;
}

interface FakeCallbackPayload {
  eventId?: string;
  providerTransactionId: string;
  merchantReference: string;
  status: ProviderPaymentStatus;
  amount: number;
  currency: "UGX";
  payerPhone?: string;
  reasonCode?: string;
  message?: string;
  occurredAt?: string;
}

export interface FakePaymentAdapterOptions {
  provider?: PaymentProvider;
  callbackSecret: string;
  rejectInitiation?: boolean;
}

export class FakePaymentAdapter implements PaymentProviderAdapter {
  readonly provider: PaymentProvider;
  private readonly callbackSecret: string;
  private readonly rejectInitiation: boolean;
  private readonly collections = new Map<string, FakeCollection>();

  constructor(options: FakePaymentAdapterOptions) {
    if (options.callbackSecret.length < 16) {
      throw new Error("Fake payment callback secret must contain at least 16 characters.");
    }
    this.provider = options.provider ?? "pesapal";
    this.callbackSecret = options.callbackSecret;
    this.rejectInitiation = options.rejectInitiation ?? false;
  }

  initiatePayment(input: InitiateCollectionInput): Promise<InitiateCollectionResult> {
    assertInitiationInput(input);

    if (this.rejectInitiation) {
      return Promise.resolve({
        accepted: false,
        normalizedStatus: "failed",
        providerCode: "FAKE_REJECTED",
        providerMessage: "The fake provider rejected the collection request.",
        nextAction: { type: "none" },
        rawResponse: { accepted: false, code: "FAKE_REJECTED" },
      });
    }

    const existing = this.collections.get(input.merchantReference);
    if (existing) return Promise.resolve(toInitiationResult(existing));

    const providerTransactionId = `fake-${input.paymentAttemptId}`;
    const collection: FakeCollection = {
      merchantReference: input.merchantReference,
      providerTransactionId,
      amount: input.amount,
      currency: input.currency,
      payerPhone: input.payerPhoneE164,
      status: "pending",
      reasonCode: undefined,
      message: undefined,
    };
    this.collections.set(input.merchantReference, collection);

    return Promise.resolve(toInitiationResult(collection));
  }

  getPaymentStatus(input: GetCollectionStatusInput): Promise<CollectionStatusResult> {
    const collection = this.collections.get(input.merchantReference);
    if (
      !collection ||
      (input.providerTransactionId !== undefined &&
        input.providerTransactionId !== collection.providerTransactionId)
    ) {
      return Promise.resolve({
        status: "unknown",
        reasonCode: "NOT_FOUND",
        message: "The fake provider could not find the collection.",
        rawResponse: { found: false },
      });
    }

    return Promise.resolve({
      status: collection.status,
      amount: collection.amount,
      currency: collection.currency,
      providerTransactionId: collection.providerTransactionId,
      ...(collection.reasonCode === undefined ? {} : { reasonCode: collection.reasonCode }),
      ...(collection.message === undefined ? {} : { message: collection.message }),
      rawResponse: {
        status: collection.status,
        amount: collection.amount,
        currency: collection.currency,
      },
    });
  }

  verifyCallback(input: VerifyCallbackInput): Promise<CallbackVerificationResult> {
    const contentType = singleHeader(input.headers["content-type"]);
    if (!contentType?.toLowerCase().startsWith("application/json")) {
      return Promise.resolve({ valid: false, reason: "INVALID_CONTENT_TYPE" });
    }

    const receivedSignature = singleHeader(input.headers["x-fake-signature"]);
    if (!receivedSignature) return Promise.resolve({ valid: false, reason: "MISSING_SIGNATURE" });

    const expectedSignature = this.signCallback(input.rawBody);
    if (!safeHexEqual(expectedSignature, receivedSignature)) {
      return Promise.resolve({ valid: false, reason: "INVALID_SIGNATURE" });
    }

    try {
      const parsedPayload: unknown = JSON.parse(input.rawBody.toString("utf8"));
      if (!isFakeCallbackPayload(parsedPayload)) {
        return Promise.resolve({ valid: false, reason: "INVALID_PAYLOAD" });
      }
      return Promise.resolve({
        valid: true,
        rawBody: input.rawBody,
        parsedPayload,
        ...(parsedPayload.eventId === undefined ? {} : { providerEventId: parsedPayload.eventId }),
      });
    } catch {
      return Promise.resolve({ valid: false, reason: "INVALID_PAYLOAD" });
    }
  }

  parseNotification(input: VerifiedCallback): ProviderPaymentNotification {
    if (!isFakeCallbackPayload(input.parsedPayload)) {
      throw new Error("Verified fake callback payload has an invalid shape.");
    }

    const payload = input.parsedPayload;
    return {
      provider: this.provider,
      providerTransactionId: payload.providerTransactionId,
      merchantReference: payload.merchantReference,
      ...(payload.eventId === undefined ? {} : { providerEventId: payload.eventId }),
      rawPayloadHash: createHash("sha256").update(input.rawBody).digest("hex"),
    };
  }

  resolveCollection(
    merchantReference: string,
    status: Exclude<ProviderPaymentStatus, "unknown">,
    details: { reasonCode?: string; message?: string } = {},
  ): void {
    const collection = this.collections.get(merchantReference);
    if (!collection) throw new Error(`Fake collection '${merchantReference}' does not exist.`);
    collection.status = status;
    collection.reasonCode = details.reasonCode;
    collection.message = details.message;
  }

  signCallback(rawBody: Buffer): string {
    return createHmac("sha256", this.callbackSecret).update(rawBody).digest("hex");
  }
}

function toInitiationResult(collection: FakeCollection): InitiateCollectionResult {
  return {
    accepted: true,
    providerTransactionId: collection.providerTransactionId,
    providerRequestReference: collection.providerTransactionId,
    normalizedStatus: "pending",
    providerCode: "ACCEPTED",
    providerMessage: "Collection request accepted by the fake provider.",
    nextAction: {
      type: "redirect",
      url: `https://payments.example.test/${collection.providerTransactionId}`,
    },
    rawResponse: { accepted: true, reference: collection.providerTransactionId },
  };
}

function assertInitiationInput(input: InitiateCollectionInput): void {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
    throw new Error("Collection amount must be a positive integer.");
  }
  if (input.payerPhoneE164 !== undefined && !/^\+[1-9][0-9]{7,14}$/.test(input.payerPhoneE164)) {
    throw new Error("Payer phone must use E.164 format.");
  }
  if (!input.payerPhoneE164 && !input.payerEmail) {
    throw new Error("Either payer phone or payer email is required.");
  }
  if (
    !input.paymentAttemptId ||
    !input.merchantReference ||
    !input.callbackUrl ||
    !input.cancellationUrl
  ) {
    throw new Error(
      "Payment attempt, merchant reference, callback, and cancellation URLs are required.",
    );
  }
}

function singleHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function safeHexEqual(expected: string, received: string): boolean {
  if (!/^[0-9a-f]{64}$/i.test(received)) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"));
}

function isFakeCallbackPayload(value: unknown): value is FakeCallbackPayload {
  if (!isRecord(value)) return false;
  return (
    optionalString(value.eventId) &&
    nonEmptyString(value.providerTransactionId) &&
    nonEmptyString(value.merchantReference) &&
    ["pending", "successful", "failed", "unknown"].includes(String(value.status)) &&
    Number.isSafeInteger(value.amount) &&
    Number(value.amount) > 0 &&
    value.currency === "UGX" &&
    optionalString(value.payerPhone) &&
    optionalString(value.reasonCode) &&
    optionalString(value.message) &&
    optionalString(value.occurredAt)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function optionalString(value: unknown): boolean {
  return value === undefined || nonEmptyString(value);
}
