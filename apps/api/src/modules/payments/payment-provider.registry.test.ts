import { describe, expect, it } from "vitest";

import { FakePaymentAdapter } from "../../infrastructure/payments/fake/index.js";
import { UnsupportedPaymentProviderError } from "../../infrastructure/payments/shared/index.js";
import { PaymentProviderRegistry } from "./payment-provider.registry.js";

const callbackSecret = "fake-callback-secret-for-tests";

describe("PaymentProviderRegistry", () => {
  it("returns the adapter registered for a normalized provider", () => {
    const adapter = new FakePaymentAdapter({ callbackSecret, provider: "pesapal" });
    const registry = new PaymentProviderRegistry([adapter]);

    expect(registry.get("pesapal")).toBe(adapter);
    expect(registry.has("market_pickup")).toBe(false);
  });

  it("fails explicitly for an unconfigured provider", () => {
    const registry = new PaymentProviderRegistry([]);

    expect(() => registry.get("market_pickup")).toThrow(UnsupportedPaymentProviderError);
  });

  it("rejects duplicate registrations during composition", () => {
    const first = new FakePaymentAdapter({ callbackSecret, provider: "pesapal" });
    const second = new FakePaymentAdapter({ callbackSecret, provider: "pesapal" });

    expect(() => new PaymentProviderRegistry([first, second])).toThrow(/more than once/);
  });
});
