export const paymentInvestigationReasons = [
  "provider_mismatch",
  "duplicate_provider_event",
  "unmatched_provider_reference",
  "incorrect_amount",
  "callback_missing",
  "suspected_duplicate_payment",
] as const;
export const refundRequestReasons = [
  "cancellation",
  "vendor_rejection",
  "missing_products",
  "poor_quality",
  "failed_delivery",
  "duplicate_payment",
  "incorrect_payment",
  "partial_fulfilment",
  "other",
] as const;
export interface PaymentFinanceInput {
  operationId: string;
  expectedVersion: number;
  reason: string;
  reasonCode: string;
  amount?: number;
}
export interface PaymentRecheckResult {
  paymentAttemptId: string;
  status: string;
  outcome: string;
  reconciliationId: string;
  duplicate: boolean;
}
export interface PaymentFinanceResult {
  id: string;
  paymentAttemptId: string;
  status: string;
  duplicate: boolean;
  version: number;
}
export interface PaymentBatchResult {
  claimed: number;
  resolved: number;
  pending: number;
  needsReview: number;
  failed: number;
}
export interface PaymentFinanceDetail {
  id: string;
  version: number;
  checkoutId: string;
  reference: string;
  provider: string;
  status: string;
  amount: number;
  currency: string;
  merchantReference: string;
  providerReference: string | null;
  createdAt: string;
  reconciliations: {
    id: string;
    previous_status: string;
    local_status_after: string | null;
    provider_status: string | null;
    result: string;
    error_code: string | null;
    requested_by: string | null;
    run_source: string;
    request_reference: string | null;
    provider_amount_ugx: number | null;
    provider_currency: string | null;
    created_at: string;
  }[];
  providerEvents: {
    id: string;
    provider_transaction_id: string | null;
    processing_status: string;
    received_at: string;
    processed_at: string | null;
    verification_method: string | null;
  }[];
  investigations: {
    id: string;
    reason_code: string;
    reason: string;
    status: string;
    created_by: string;
    created_at: string;
  }[];
  refunds: {
    id: string;
    reason: string;
    requested_amount_ugx: number;
    status: string;
    approval_state: string;
    created_at: string;
  }[];
}
export interface PaymentFinanceQueue {
  data: {
    paymentId: string;
    orderReference: string;
    provider: string;
    amount: number;
    currency: string;
    status: string;
    reconciliation: { status: string; attemptCount: number; lastAttemptAt: string | null };
    flags: string[];
  }[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}
