import { publicApiOptions } from "@/lib/api";

export interface DeliveryZone {
  id: string;
  name: string;
  deliveryFeeUgx: number;
}
export interface Address {
  id: string;
  label: string;
  summary: string;
  phoneNumber: string;
}
export interface CheckoutView {
  id: string;
  reference: string;
  status: string;
  sellerGroups: Array<{
    sellerOrderId: string;
    status: string;
    seller: { name: string };
    items: Array<{
      orderItemId: string;
      productName: string;
      packageLabel: string;
      quantity: number;
      lineTotal: number;
    }>;
    subtotal: number;
  }>;
  pricing: { itemsSubtotal: number; deliveryFee: number; serviceFee: number; total: number };
  reservation: {
    expiresAt: string | null;
    status: "active" | "committed" | "expired";
    remainingSeconds: number;
  };
  fulfilment: {
    type: "delivery" | "market_pickup";
    pickupMarket: { id: string; name: string | null } | null;
    pickupCodeRequired: boolean;
  };
  payment: {
    paymentAttemptId: string;
    provider: "pesapal" | "market_pickup";
    paymentMethod: string | null;
    status: string;
    amount: number;
    currency: "UGX";
    merchantReference: string;
    paidAt: string | null;
    collectionMethod: "cash" | "mobile_money" | "card" | "other" | null;
    collectedAt: string | null;
    displayStatus: string;
  } | null;
  pickupCode?: string | null;
}

async function authenticatedApi<T>(
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
    error?: { message: string };
  };
  if (!response.ok || !payload.success || !payload.data)
    throw new Error(payload.error?.message ?? "Checkout request failed.");
  return payload.data;
}
export const fetchZones = (marketId: string, token: string) =>
  authenticatedApi<DeliveryZone[]>(
    `/v1/checkouts/delivery-zones?marketId=${encodeURIComponent(marketId)}`,
    token,
  );
export const fetchAddresses = (token: string) =>
  authenticatedApi<Address[]>("/v1/checkouts/addresses", token);
export const createAddress = (token: string, input: Omit<Address, "id">) =>
  authenticatedApi<Address>("/v1/checkouts/addresses", token, {
    method: "POST",
    body: JSON.stringify(input),
  });
export const createCheckout = (token: string, idempotencyKey: string, input: unknown) =>
  authenticatedApi<CheckoutView>("/v1/checkouts", token, {
    method: "POST",
    headers: { "idempotency-key": idempotencyKey },
    body: JSON.stringify(input),
  });
