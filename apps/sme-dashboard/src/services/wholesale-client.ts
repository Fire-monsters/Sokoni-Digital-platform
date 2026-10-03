import { businessAuth } from "./business-auth";

const baseUrl = (import.meta.env.VITE_API_URL ?? "http://localhost:4000").replace(/\/$/, "");

export interface WholesaleItem {
  id: string;
  warehouseBusinessId: string;
  productId: string;
  sku: string;
  name: string;
  grade: string;
  packageUnit: string;
  baseUnit: string;
  unitsPerPackage: number;
  priceUgxPerPackage: number;
  minimumPackages: number;
  availablePackages: number;
}
export interface WholesaleOrder {
  id: string;
  reference: string;
  smeBusinessId: string;
  warehouseBusinessId: string;
  status: "submitted" | "confirmed" | "declined" | "cancelled";
  totalUgx: number;
  notes: string | null;
  createdAt: string;
  lines: Array<{
    id: string;
    name: string;
    grade: string;
    packageUnit: string;
    baseUnit: string;
    unitsPerPackage: number;
    quantityPackages: number;
    unitPriceUgx: number;
    lineTotalUgx: number;
  }>;
  history: Array<{ status: string; at: string; reason: string | null }>;
  invoice: null | {
    id: string;
    reference: string;
    totalUgx: number;
    paidUgx: number;
    balanceUgx: number;
    issuedAt: string;
    documentStatus: string;
  };
}
interface Business {
  id: string;
  kind: string;
  status: string;
  name: string;
}

async function token() {
  await businessAuth.initialize();
  let state = businessAuth.getSnapshot();
  if (state.status !== "authenticated") throw new Error("Sign in to continue.");
  if (state.session.expiresAt && state.session.expiresAt * 1000 < Date.now() + 60_000) {
    await businessAuth.refresh();
    state = businessAuth.getSnapshot();
  }
  if (state.status !== "authenticated") throw new Error("Your session expired. Sign in again.");
  return state.session.accessToken;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${await token()}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || json?.success !== true)
    throw new Error(json?.error?.message ?? `Request failed (${response.status}).`);
  return json.data as T;
}

export async function approvedSme() {
  const businesses = await api<Business[]>("/v1/me/businesses");
  const business = businesses.find((row) => row.kind === "sme" && row.status === "approved");
  if (!business) throw new Error("An approved SME business is required before purchasing.");
  return business;
}

export async function catalogue() {
  const business = await approvedSme();
  return api<WholesaleItem[]>(`/v1/sme/businesses/${business.id}/wholesale/catalogue`);
}
export async function orders() {
  const business = await approvedSme();
  return api<WholesaleOrder[]>(`/v1/sme/businesses/${business.id}/wholesale/orders`);
}
export async function submitOrder(
  lines: Array<{
    catalogueItemId: string;
    quantityPackages: number;
    expectedPriceUgx: number;
  }>,
  notes: string,
  operationId: string,
) {
  const business = await approvedSme();
  return api<WholesaleOrder>(`/v1/sme/businesses/${business.id}/wholesale/orders`, {
    method: "POST",
    body: JSON.stringify({ operationId, lines, notes }),
  });
}
export async function cancelOrder(orderId: string, operationId: string) {
  const business = await approvedSme();
  return api<WholesaleOrder>(
    `/v1/sme/businesses/${business.id}/wholesale/orders/${orderId}/cancel`,
    {
      method: "POST",
      body: JSON.stringify({ operationId }),
    },
  );
}
export async function invoicePdfUrl(invoiceId: string) {
  const value = await api<{ url: string }>(`/v1/wholesale/invoices/${invoiceId}/pdf`);
  return value.url;
}
