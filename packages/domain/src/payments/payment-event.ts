import type { PaymentMethod, PaymentProvider } from "./payment-provider.js";
import type { ProviderPaymentStatus } from "./payment-status.js";

export interface ProviderPaymentEvent {
  provider: PaymentProvider;
  paymentMethod?: PaymentMethod;
  providerTransactionId: string;
  merchantReference: string;
  status: ProviderPaymentStatus;
  amount: number;
  currency: "UGX";
  payerPhone?: string;
  providerReasonCode?: string;
  providerMessage?: string;
  occurredAt?: string;
  rawPayloadHash: string;
}
