import type { PaymentProvider } from "@sokoni-digital/domain";

import type { PaymentProviderAdapter } from "../../infrastructure/payments/shared/index.js";
import { UnsupportedPaymentProviderError } from "../../infrastructure/payments/shared/index.js";

export class PaymentProviderRegistry {
  private readonly adapters: ReadonlyMap<PaymentProvider, PaymentProviderAdapter>;

  constructor(adapters: Iterable<PaymentProviderAdapter>) {
    const configured = new Map<PaymentProvider, PaymentProviderAdapter>();

    for (const adapter of adapters) {
      if (configured.has(adapter.provider)) {
        throw new Error(`Payment provider '${adapter.provider}' was registered more than once.`);
      }
      configured.set(adapter.provider, adapter);
    }

    this.adapters = configured;
  }

  get(provider: PaymentProvider): PaymentProviderAdapter {
    const adapter = this.adapters.get(provider);
    if (!adapter) throw new UnsupportedPaymentProviderError(provider);
    return adapter;
  }

  has(provider: PaymentProvider): boolean {
    return this.adapters.has(provider);
  }
}
