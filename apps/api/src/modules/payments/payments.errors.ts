export class PaymentNotFoundError extends Error {
  readonly statusCode = 404;
  readonly code = "PAYMENT_NOT_FOUND";
}

export class PaymentRejectedError extends Error {
  readonly statusCode = 422;
  readonly code = "PAYMENT_REJECTED";
}

export class PaymentConflictError extends Error {
  readonly statusCode = 409;
  readonly code = "PAYMENT_CONFLICT";
}

export class PaymentProviderUnavailableError extends Error {
  readonly statusCode = 503;
  readonly code = "PAYMENT_PROVIDER_UNAVAILABLE";
}

export class PaymentOperationForbiddenError extends Error {
  readonly statusCode = 403;
  readonly code = "PAYMENT_OPERATION_FORBIDDEN";
}
