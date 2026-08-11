import type { PaymentMethod, PaymentProvider } from "./payment-provider.js";
import type { PaymentStatus } from "./payment-status.js";

export interface PaymentAttempt {
  id: string;
  checkoutId: string;
  consumerId: string;
  provider: PaymentProvider;
  paymentMethod?: PaymentMethod;
  status: PaymentStatus;
  amount: number;
  currency: "UGX";
  payerPhoneE164?: string;
  merchantReference: string;
  providerTransactionId?: string;
  providerRequestReference?: string;
  providerConfirmationCode?: string;
  redirectUrl?: string;
  failureCode?: string;
  failureMessage?: string;
  initiatedAt?: string;
  resolvedAt?: string;
  expiresAt?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}
