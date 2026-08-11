export const paymentStatuses = [
  "created",
  "initiating",
  "pending",
  "successful",
  "failed",
  "cancelled",
  "expired",
  "requires_reconciliation",
] as const;

export type PaymentStatus = (typeof paymentStatuses)[number];

export const providerPaymentStatuses = ["pending", "successful", "failed", "unknown"] as const;

export type ProviderPaymentStatus = (typeof providerPaymentStatuses)[number];

export function isTerminalPaymentStatus(status: PaymentStatus): boolean {
  return ["successful", "failed", "cancelled", "expired"].includes(status);
}
