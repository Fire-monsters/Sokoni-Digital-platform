export type ApiErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "ACCOUNT_DISABLED"
  | "NOT_FOUND"
  | "CONFLICT"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "OFFER_EXPIRED"
  | "OFFER_UNAVAILABLE"
  | "DELIVERY_ALREADY_ASSIGNED"
  | "VERSION_CONFLICT"
  | "IDEMPOTENCY_KEY_REUSED"
  | "OPERATION_IN_PROGRESS"
  | "INVALID_STATE_TRANSITION"
  | "OPERATION_RESULT_PERSISTENCE_FAILED"
  | "INTERNAL_ERROR";

export interface ApiErrorDetail {
  field?: string;
  issue: string;
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: ApiErrorCode;
    message: string;
    details?: ApiErrorDetail[];
    operationId?: string;
    currentVersion?: number;
    retryable?: boolean;
    requestId: string;
  };
}
