import { publicApiOptions } from "@/lib/api";

export type PaymentStatus =
  | "created"
  | "initiating"
  | "pending"
  | "successful"
  | "failed"
  | "cancelled"
  | "expired"
  | "requires_reconciliation";

export interface PaymentView {
  paymentAttemptId: string;
  checkoutId: string;
  provider: "pesapal" | "market_pickup";
  paymentMethod: string | null;
  status: PaymentStatus;
  amount: number;
  currency: "UGX";
  payerPhoneMasked: string | null;
  merchantReference: string;
  failure: { code: string | null; message: string | null } | null;
  expiresAt: string | null;
  nextAction: { type: "redirect"; url: string } | { type: "none" };
  nextPollAfterSeconds: number;
  createdAt: string;
  updatedAt: string;
}

async function paymentApi<T>(
  path: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${accessToken}`);
  headers.set("content-type", "application/json");
  const response = await fetch(`${publicApiOptions.baseUrl}${path}`, { ...init, headers });
  const payload = (await response.json()) as {
    success: boolean;
    data?: T;
    error?: { code?: string; message?: string };
  };
  if (!response.ok || !payload.success || payload.data === undefined) {
    throw new Error(payload.error?.message ?? "The payment request could not be completed.");
  }
  return payload.data;
}

export function initiatePayment(
  checkoutId: string,
  accessToken: string,
  idempotencyKey: string,
  input:
    | {
        provider: "pesapal";
        payerPhone?: string;
        payerEmail?: string;
        payerFirstName?: string;
        payerLastName?: string;
      }
    | { provider: "market_pickup" },
) {
  return paymentApi<PaymentView>(
    `/v1/checkouts/${encodeURIComponent(checkoutId)}/payments`,
    accessToken,
    {
      method: "POST",
      headers: { "idempotency-key": idempotencyKey },
      body: JSON.stringify(input),
    },
  );
}

export function fetchPayment(paymentAttemptId: string, accessToken: string) {
  return paymentApi<PaymentView>(
    `/v1/payments/${encodeURIComponent(paymentAttemptId)}`,
    accessToken,
  );
}

export function getPaymentPollInterval(payment: PaymentView | undefined): number | false {
  if (!payment) return 5_000;
  if (["successful", "failed", "cancelled", "expired"].includes(payment.status)) return false;
  const ageSeconds = (Date.now() - new Date(payment.createdAt).getTime()) / 1000;
  if (ageSeconds < 20) return 5_000;
  if (ageSeconds < 60) return 10_000;
  if (ageSeconds < 180) return 20_000;
  return 30_000;
}
