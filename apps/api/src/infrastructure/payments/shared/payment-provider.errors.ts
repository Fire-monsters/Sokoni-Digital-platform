import type { PaymentProvider } from "@sokoni-digital/domain";

export class UnsupportedPaymentProviderError extends Error {
  readonly code = "UNSUPPORTED_PAYMENT_PROVIDER";

  constructor(readonly provider: PaymentProvider) {
    super(`Payment provider '${provider}' is not configured.`);
    this.name = "UnsupportedPaymentProviderError";
  }
}
