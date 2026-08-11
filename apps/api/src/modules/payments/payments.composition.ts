import { parseServerEnvironment } from "../../config/index.js";
import { FakePaymentAdapter } from "../../infrastructure/payments/fake/index.js";
import {
  PesapalClient,
  PesapalPaymentAdapter,
} from "../../infrastructure/payments/pesapal/index.js";
import type { PaymentProviderAdapter } from "../../infrastructure/payments/shared/index.js";
import { PaymentProviderRegistry } from "./payment-provider.registry.js";
import { PaymentsRepository } from "./payments.repository.js";
import { PaymentsService } from "./payments.service.js";

let sharedService: PaymentsService | undefined;

export function createPaymentsService(): PaymentsService {
  if (sharedService) return sharedService;
  const environment = parseServerEnvironment();
  let adapter: PaymentProviderAdapter;
  if (environment.PAYMENTS_ENV === "fake") {
    adapter = new FakePaymentAdapter({ callbackSecret: "local-fake-payment-callback-secret" });
  } else {
    const consumerKey = requireConfiguration(
      environment.PESAPAL_CONSUMER_KEY,
      "PESAPAL_CONSUMER_KEY",
    );
    const consumerSecret = requireConfiguration(
      environment.PESAPAL_CONSUMER_SECRET,
      "PESAPAL_CONSUMER_SECRET",
    );
    const notificationId = requireConfiguration(environment.PESAPAL_IPN_ID, "PESAPAL_IPN_ID");
    const baseUrl =
      environment.PAYMENTS_ENV === "production"
        ? "https://pay.pesapal.com/v3"
        : "https://cybqa.pesapal.com/pesapalv3";
    adapter = new PesapalPaymentAdapter(
      new PesapalClient({
        baseUrl,
        consumerKey,
        consumerSecret,
        notificationId,
      }),
    );
  }
  sharedService = new PaymentsService(
    new PaymentsRepository(),
    new PaymentProviderRegistry([adapter]),
    environment,
  );
  return sharedService;
}

function requireConfiguration(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name} is required when Pesapal payments are enabled.`);
  return value;
}
