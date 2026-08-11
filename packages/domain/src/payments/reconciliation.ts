import type { PaymentProvider } from "./payment-provider.js";
import type { PaymentStatus, ProviderPaymentStatus } from "./payment-status.js";

export const reconciliationResults = [
  "matched",
  "status_updated",
  "amount_mismatch",
  "reference_mismatch",
  "provider_not_found",
  "manual_review_required",
  "no_change",
] as const;

export type ReconciliationResult = (typeof reconciliationResults)[number];

export interface PaymentReconciliationRun {
  paymentAttemptId: string;
  provider: PaymentProvider;
  previousStatus: PaymentStatus;
  providerStatus?: ProviderPaymentStatus;
  result: ReconciliationResult;
  providerAmount?: number;
  providerCurrency?: string;
  createdAt: string;
}
