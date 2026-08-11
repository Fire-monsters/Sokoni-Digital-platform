import type { PaymentMethod, PaymentProvider, ProviderPaymentStatus } from "@sokoni-digital/domain";

export interface InitiateCollectionInput {
  paymentAttemptId: string;
  merchantReference: string;
  amount: number;
  currency: "UGX";
  payerPhoneE164?: string;
  payerEmail?: string;
  payerFirstName?: string;
  payerLastName?: string;
  description: string;
  callbackUrl: string;
  cancellationUrl: string;
}

export interface InitiateCollectionResult {
  accepted: boolean;
  providerTransactionId?: string;
  providerRequestReference?: string;
  normalizedStatus: "pending" | "failed";
  providerCode?: string;
  providerMessage?: string;
  nextAction:
    { type: "redirect"; url: string } | { type: "mobile_money_prompt" } | { type: "none" };
  rawResponse: unknown;
}

export interface GetCollectionStatusInput {
  providerTransactionId?: string;
  providerRequestReference?: string;
  merchantReference: string;
}

export interface CollectionStatusResult {
  status: ProviderPaymentStatus;
  amount?: number;
  currency?: string;
  providerTransactionId?: string;
  merchantReference?: string;
  paymentMethod?: PaymentMethod;
  confirmationCode?: string;
  paymentAccountMasked?: string;
  reasonCode?: string;
  message?: string;
  rawResponse: unknown;
}

export interface VerifyCallbackInput {
  rawBody: Buffer;
  headers: Record<string, string | string[] | undefined>;
  receivedAt: Date;
}

export interface VerifiedCallback {
  valid: true;
  rawBody: Buffer;
  parsedPayload: unknown;
  providerEventId?: string;
}

export interface InvalidCallback {
  valid: false;
  reason:
    | "MISSING_SIGNATURE"
    | "INVALID_SIGNATURE"
    | "STALE_TIMESTAMP"
    | "INVALID_CONTENT_TYPE"
    | "INVALID_PAYLOAD";
}

export type CallbackVerificationResult = VerifiedCallback | InvalidCallback;

export interface ProviderPaymentNotification {
  provider: PaymentProvider;
  providerTransactionId: string;
  merchantReference: string;
  providerEventId?: string;
  rawPayloadHash: string;
}

export interface PaymentProviderAdapter {
  readonly provider: PaymentProvider;

  initiatePayment(input: InitiateCollectionInput): Promise<InitiateCollectionResult>;
  getPaymentStatus(input: GetCollectionStatusInput): Promise<CollectionStatusResult>;
  verifyCallback(input: VerifyCallbackInput): Promise<CallbackVerificationResult>;
  parseNotification(input: VerifiedCallback): ProviderPaymentNotification;
}
